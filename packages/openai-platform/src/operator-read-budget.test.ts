import { afterEach, describe, expect, it, vi } from 'vitest';

import { operatorReadBudget } from './operator-read-budget.js';
import type { OpenAIPlatform } from './platform.js';

afterEach(() => vi.useRealTimers());

describe('complete operator read lifetime', () => {
  it('permits a healthy observation beyond ten seconds without dropping its result', async () => {
    vi.useFakeTimers();
    const platform = {
      read: vi.fn<OpenAIPlatform['read']>(async () => {
        await new Promise((resolve) => setTimeout(resolve, 12_000));
        return { data: 'complete', fingerprint: 'synthetic' };
      }),
      openOperatorObservation: vi.fn<OpenAIPlatform['openOperatorObservation']>(),
    };
    const pending = operatorReadBudget(platform, (reader) => reader.read({}));
    await vi.advanceTimersByTimeAsync(12_000);
    await expect(pending).resolves.toMatchObject({ data: 'complete' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts every parallel request and waits for actual settlement before releasing ownership', async () => {
    vi.useFakeTimers();
    let aborted = 0;
    let settled = 0;
    const platform = {
      read: vi.fn<OpenAIPlatform['read']>(
        (_input, signal) =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener(
              'abort',
              () => {
                aborted++;
                setTimeout(() => {
                  settled++;
                  reject(new Error('PRIVATE PROVIDER PAYLOAD'));
                }, 50);
              },
              { once: true }
            );
          })
      ),
      openOperatorObservation: vi.fn<OpenAIPlatform['openOperatorObservation']>(),
    };
    let finished = false;
    const pending = operatorReadBudget(platform, (reader) =>
      Promise.all([reader.read({}), reader.read({})])
    );
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'operator-observation-timeout',
      message: 'Operator observation timed out',
    });
    const completion = pending.then(
      () => {
        finished = true;
        return undefined;
      },
      () => {
        finished = true;
        return undefined;
      }
    );
    await vi.advanceTimersByTimeAsync(45_000);
    expect(aborted).toBe(2);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    await completion;
    expect(settled).toBe(2);
    expect(finished).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not give sequential pages a fresh timeout or start another page after expiry', async () => {
    vi.useFakeTimers();
    const platform = {
      read: vi.fn<OpenAIPlatform['read']>(
        (_input, signal) =>
          new Promise((resolve, reject) => {
            const complete = (): void => {
              signal?.removeEventListener('abort', abort);
              resolve({ data: [], fingerprint: 'synthetic' });
            };
            const timer = setTimeout(complete, 25_000);
            const abort = (): void => {
              clearTimeout(timer);
              reject(new Error('Aborted'));
            };
            signal?.addEventListener('abort', abort, { once: true });
          })
      ),
      openOperatorObservation: vi.fn<OpenAIPlatform['openOperatorObservation']>(),
    };
    const pending = operatorReadBudget(platform, async (reader) => {
      await reader.read({});
      await reader.read({});
      await reader.read({});
    });
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'operator-observation-timeout',
    });
    await vi.advanceTimersByTimeAsync(45_000);
    await assertion;
    expect(platform.read).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
