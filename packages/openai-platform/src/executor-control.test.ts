import { EventEmitter } from 'node:events';
import { connect, Socket } from 'node:net';
import type * as Net from 'node:net';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:net', async (original) => ({
  ...(await original<typeof Net>()),
  connect: vi.fn(),
}));

describe('private executor control bootstrap', () => {
  let stdin: EventEmitter;
  let sockets: Socket[];
  let writes: unknown[];
  const output = vi.fn<(data: unknown) => boolean>(() => true);
  let previousExitCode: typeof process.exitCode;
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    previousExitCode = process.exitCode;
    process.exitCode = undefined;
    stdin = new EventEmitter();
    sockets = [];
    writes = [];
    output.mockClear();
    vi.spyOn(process.stdin, 'setEncoding').mockReturnValue(process.stdin);
    vi.spyOn(process.stdin, 'on').mockImplementation((event, listener) => {
      stdin.on(event, listener);
      return process.stdin;
    });
    vi.spyOn(process.stdin, 'once').mockImplementation((event, listener) => {
      stdin.once(event, listener);
      return process.stdin;
    });
    vi.spyOn(process.stdout, 'write').mockImplementation(output);
    vi.mocked(connect).mockImplementation(() => {
      const socket = new Socket();
      vi.spyOn(socket, 'write').mockImplementation((data) => {
        writes.push(data);
        return true;
      });
      vi.spyOn(socket, 'destroy').mockImplementation(() => {
        socket.emit('close');
        return socket;
      });
      sockets.push(socket);
      return socket;
    });
    await import('./executor-control.js');
    stdin.emit('data', '{"synthetic":"bootstrap"}');
    stdin.emit('end');
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.mocked(connect).mockReset();
    vi.useRealTimers();
    process.exitCode = previousExitCode;
  });
  const current = (): Socket => {
    const socket = sockets.at(-1);
    if (!socket) throw new Error('Expected control socket');
    return socket;
  };
  const fail = (code: string): void => {
    const socket = current();
    socket.emit('error', Object.assign(new Error('invented socket failure'), { code }));
    socket.emit('close');
  };
  it('waits through startup-only failures and transmits bootstrap exactly once after connection', () => {
    fail('ENOENT');
    vi.advanceTimersByTime(100);
    fail('ECONNREFUSED');
    vi.advanceTimersByTime(100);
    expect(sockets).toHaveLength(3);
    current().emit('connect');
    current().emit('data', 'ready');
    current().emit('end');
    expect(writes).toEqual(['{"synthetic":"bootstrap"}\n']);
    expect(output).toHaveBeenCalledWith('ready');
    expect(process.exitCode).toBeUndefined();
    vi.advanceTimersByTime(20_000);
    expect(sockets).toHaveLength(3);
    expect(process.exitCode).toBeUndefined();
  });
  it('bounds repeated startup failures by the original ten-second deadline', () => {
    for (let index = 0; index < 100; index += 1) {
      fail('ENOENT');
      vi.advanceTimersByTime(100);
    }
    expect(process.exitCode).toBe(1);
    expect(sockets).toHaveLength(100);
    vi.advanceTimersByTime(20_000);
    expect(sockets).toHaveLength(100);
    expect(writes).toHaveLength(0);
  });
  it('times out a stalled socket without retrying or transmitting data', () => {
    vi.advanceTimersByTime(10_000);
    expect(process.exitCode).toBe(1);
    expect(sockets).toHaveLength(1);
    expect(writes).toHaveLength(0);
  });
  it('does not retry a non-startup error', () => {
    fail('EACCES');
    vi.advanceTimersByTime(20_000);
    expect(process.exitCode).toBe(1);
    expect(sockets).toHaveLength(1);
  });
  it('never reconnects or replays bootstrap after a connected socket fails', () => {
    current().emit('connect');
    fail('ECONNREFUSED');
    vi.advanceTimersByTime(20_000);
    expect(process.exitCode).toBe(1);
    expect(sockets).toHaveLength(1);
    expect(writes).toHaveLength(1);
  });
  it.each(['unavailable', ''])(
    'does not claim ready for a refused or empty response: %s',
    (data) => {
      current().emit('connect');
      if (data) {
        current().emit('data', data);
        current().emit('end');
      } else current().emit('close');
      expect(process.exitCode).toBe(1);
      expect(output).not.toHaveBeenCalledWith('ready');
      expect(sockets).toHaveLength(1);
    }
  );
  it('ignores late events from a failed startup socket after its replacement connects', () => {
    const old = current();
    fail('ENOENT');
    vi.advanceTimersByTime(100);
    old.emit('connect');
    old.emit('close');
    expect(writes).toHaveLength(0);
    current().emit('connect');
    current().emit('data', 'ready');
    current().emit('end');
    expect(writes).toHaveLength(1);
    expect(process.exitCode).toBeUndefined();
  });
  it('accepts a fragmented ready response only after complete acknowledgment', () => {
    current().emit('connect');
    current().emit('data', 're');
    expect(output).not.toHaveBeenCalledWith('ready');
    expect(process.exitCode).toBeUndefined();
    current().emit('data', 'ady');
    expect(output).not.toHaveBeenCalledWith('ready');
    current().emit('end');
    expect(output).toHaveBeenCalledWith('ready');
    expect(process.exitCode).toBeUndefined();
    expect(writes).toHaveLength(1);
    expect(sockets).toHaveLength(1);
  });
  it.each(['rea', 'ready followed by extra data'])(
    'rejects incomplete or oversized acknowledgments without replay: %s',
    (reply) => {
      current().emit('connect');
      current().emit('data', reply);
      current().emit('end');
      vi.advanceTimersByTime(20_000);
      expect(output).not.toHaveBeenCalledWith('ready');
      expect(process.exitCode).toBe(1);
      expect(writes).toHaveLength(1);
      expect(sockets).toHaveLength(1);
    }
  );
});
