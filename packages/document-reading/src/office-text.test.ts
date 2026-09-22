import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DocumentReadBusyError } from './document-read-error.js';
import { readOfficeText } from './office-text.js';

const state = vi.hoisted(() => ({ create: vi.fn<(...args: unknown[]) => object>() }));
vi.mock('node:worker_threads', () => ({
  Worker: vi.fn(function createWorker(...args: unknown[]): object {
    return state.create(...args);
  }),
}));

class FakeWorker extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  postMessage = vi.fn();
  terminate = vi.fn(async () => 0);
}
const request = { bytes: Buffer.from('synthetic'), format: 'xlsx', offset: 0 } as const;
const page = { text: 'complete', offset: 0, nextOffset: null, totalCharacters: 8, warnings: [] };

describe('bounded Office worker lifecycle', () => {
  let worker: FakeWorker;
  beforeEach(() => {
    worker = new FakeWorker();
    state.create.mockReset().mockReturnValue(worker);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses a fixed worker with no inherited environment/options and discards parser diagnostics', async () => {
    const result = readOfficeText(request);
    expect(state.create).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        env: {},
        execArgv: [],
        stdout: true,
        stderr: true,
        resourceLimits: {
          maxOldGenerationSizeMb: 256,
          maxYoungGenerationSizeMb: 32,
          stackSizeMb: 4,
        },
      })
    );
    expect(worker.postMessage).toHaveBeenCalledWith(request);
    expect(worker.stdout.readableFlowing).toBe(true);
    expect(worker.stderr.readableFlowing).toBe(true);
    worker.emit('message', { ok: true, page });
    await expect(result).resolves.toEqual(page);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('terminates a stalled worker at the deadline while the calling event loop remains available', async () => {
    const result = readOfficeText(request);
    const assertion = expect(result).rejects.toThrow('30-second deadline');
    await vi.advanceTimersByTimeAsync(29_999);
    expect(worker.terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('rejects concurrent parsing without a byte-retaining queue and releases after termination', async () => {
    let finishTermination = (_exit: number): void => {
      throw new Error('Termination not started');
    };
    worker.terminate.mockReturnValueOnce(
      new Promise<number>((resolve) => {
        finishTermination = resolve;
      })
    );
    const first = readOfficeText(request);
    await expect(readOfficeText(request)).rejects.toBeInstanceOf(DocumentReadBusyError);
    expect(state.create).toHaveBeenCalledOnce();
    worker.emit('message', { ok: true, page });
    await Promise.resolve();
    await expect(readOfficeText(request)).rejects.toThrow('Retry');
    finishTermination(0);
    await expect(first).resolves.toEqual(page);
    const next = readOfficeText(request);
    worker.emit('message', { ok: true, page });
    await expect(next).resolves.toEqual(page);
    expect(state.create).toHaveBeenCalledTimes(2);
  });

  it.each(['capacity', 'offset', 'parse'] as const)(
    'rejects %s without claiming a complete page',
    async (reason) => {
      const result = readOfficeText(request);
      worker.emit('message', { ok: false, reason });
      await expect(result).rejects.toThrow(
        reason === 'offset' ? 'past the end' : 'Original mode remains available'
      );
      expect(worker.terminate).toHaveBeenCalledOnce();
    }
  );

  it.each(['error', 'exit'])('sanitizes %s and always terminates the worker', async (event) => {
    const result = readOfficeText(request);
    worker.emit(event, new Error('PRIVATE PARSER DATA'));
    await expect(result).rejects.toThrow('Original mode remains available');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('sanitizes start, message delivery and termination failures', async () => {
    state.create.mockImplementationOnce(() => {
      throw new Error('PRIVATE START DATA');
    });
    await expect(readOfficeText(request)).rejects.toThrow('Original mode remains available');
    worker.postMessage.mockImplementationOnce(() => {
      throw new Error('PRIVATE DELIVERY DATA');
    });
    await expect(readOfficeText(request)).rejects.toThrow('Original mode remains available');
    expect(worker.terminate).toHaveBeenCalledOnce();
    worker.terminate.mockRejectedValueOnce(new Error('PRIVATE TERMINATION DATA'));
    const result = readOfficeText(request);
    worker.emit('message', { ok: true, page });
    await expect(result).rejects.toThrow('Original mode remains available');
  });
});
