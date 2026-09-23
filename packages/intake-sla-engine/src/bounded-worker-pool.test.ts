import { setTimeout as delay } from 'node:timers/promises';

import { describe, expect, it, vi } from 'vitest';

import { runBoundedWorkers, type WorkerProgress } from './bounded-worker-pool.js';

function providerError(status: number, retryAfterMs = 0): Error {
  return Object.assign(new Error('Synthetic provider failure'), { status, retryAfterMs });
}

describe('bounded interpretation workers', () => {
  it('returns input order and serializes durable writes across out-of-order completions', async () => {
    let writing = false;
    const persisted: number[] = [];
    const progress: WorkerProgress[] = [];
    const results = await runBoundedWorkers({
      items: [3, 2, 1],
      concurrency: 3,
      work: async (item, context) => {
        expect(context.attempt).toBe(1);
        expect(context.signal).toBeUndefined();
        await delay(item * 5);
        return item * 2;
      },
      persist: async (item, result) => {
        expect(writing).toBe(false);
        writing = true;
        await delay(1);
        expect(result).toBe(item * 2);
        persisted.push(item);
        writing = false;
      },
      onProgress: (value) => {
        progress.push(value);
      },
    });
    expect(results).toEqual([6, 4, 2]);
    expect(persisted).toEqual([1, 2, 3]);
    expect(progress.map((item) => item.completed)).toEqual([1, 2, 3]);
    expect(progress.at(-1)).toMatchObject({ required: 3, retries: 0, concurrencyLimit: 3 });
  });

  it('retries transient errors with jitter and provider delay, reducing concurrency after 429', async () => {
    const waits: number[] = [];
    const progress: WorkerProgress[] = [];
    const result = await runBoundedWorkers({
      items: [1],
      concurrency: 2,
      work: async (item, { attempt }) => {
        if (attempt === 1) throw providerError(429, 500);
        if (attempt === 2) throw providerError(503);
        return item;
      },
      persist: async () => undefined,
      sleep: async (ms) => {
        waits.push(ms);
      },
      random: () => 0.5,
      onProgress: (value) => {
        progress.push(value);
      },
    });
    expect(result).toEqual([1]);
    expect(waits).toEqual([500, 625]);
    expect(progress[0]).toMatchObject({ retries: 2, concurrencyLimit: 1 });
  });

  it('stops dispatch on terminal errors but preserves successful in-flight checkpoints', async () => {
    const saved: number[] = [];
    const started: number[] = [];
    const failure = providerError(401);
    await expect(
      runBoundedWorkers({
        items: [1, 2, 3, 4],
        concurrency: 2,
        work: async (item) => {
          started.push(item);
          if (item === 1) throw failure;
          await delay(5);
          return item;
        },
        persist: async (item) => {
          saved.push(item);
        },
      })
    ).rejects.toBe(failure);
    expect(started).toEqual([1, 2]);
    expect(saved).toEqual([2]);
  });

  it('honors the attempt cap and rejects an excessive retry window without sleeping', async () => {
    const work = vi.fn(async () => {
      throw providerError(500);
    });
    const sleep = vi.fn(async () => undefined);
    await expect(
      runBoundedWorkers({ items: [1], work, persist: sleep, sleep, maxAttempts: 2 })
    ).rejects.toThrow('Synthetic provider failure');
    expect(work).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    sleep.mockClear();
    const failure = providerError(429, 60001);
    await expect(
      runBoundedWorkers({
        items: [1],
        work: async () => {
          throw failure;
        },
        persist: sleep,
        sleep,
      })
    ).rejects.toMatchObject({
      message: 'Provider retry window exceeds bounded execution; resume later',
      cause: failure,
    });
    expect(sleep).not.toHaveBeenCalled();
  });

  it('handles backpressure after a concurrency reduction without concurrent persistence', async () => {
    const work = vi.fn(async (item: number, { attempt }: { attempt: number }) => {
      if (item === 1 && attempt === 1) throw providerError(429);
      await delay(2);
      return item;
    });
    const waits: number[] = [];
    const result = await runBoundedWorkers({
      items: [1, 2, 3, 4],
      concurrency: 2,
      work,
      persist: async () => undefined,
      sleep: async (ms) => {
        waits.push(ms);
        await delay(1);
      },
    });
    expect(result).toEqual([1, 2, 3, 4]);
    expect(waits).toContain(10);
  });

  it('retains completed writes before reporting cancellation and does not retry after abort', async () => {
    const controller = new AbortController();
    const persist = vi.fn(async () => undefined);
    await expect(
      runBoundedWorkers({
        items: [1, 2],
        concurrency: 1,
        signal: controller.signal,
        work: async (item, { signal }) => {
          expect(signal).toBe(controller.signal);
          controller.abort();
          return item;
        },
        persist,
      })
    ).rejects.toThrow('Interpretation cancelled; completed checkpoints retained');
    expect(persist).toHaveBeenCalledTimes(1);
    const work = vi.fn(async () => 1);
    await expect(
      runBoundedWorkers({ items: [1], work, persist, signal: controller.signal })
    ).rejects.toThrow('Interpretation cancelled');
    expect(work).not.toHaveBeenCalled();
    const other = new AbortController();
    const failure = providerError(503);
    await expect(
      runBoundedWorkers({
        items: [1],
        signal: other.signal,
        work: async () => {
          other.abort();
          throw failure;
        },
        persist,
      })
    ).rejects.toBe(failure);
  });

  it('propagates persistence, progress and sleep failures while retaining their cause', async () => {
    const failure = new Error('Synthetic checkpoint failure');
    await expect(
      runBoundedWorkers({
        items: [1, 2],
        work: async (item) => item,
        persist: async () => {
          throw failure;
        },
      })
    ).rejects.toBe(failure);
    await expect(
      runBoundedWorkers({
        items: [1],
        work: async (item) => item,
        persist: async () => undefined,
        onProgress: () => {
          throw failure;
        },
      })
    ).rejects.toBe(failure);
    await expect(
      runBoundedWorkers({
        items: [1],
        work: async () => {
          throw providerError(503);
        },
        persist: async () => undefined,
        sleep: async () => {
          throw failure;
        },
      })
    ).rejects.toBe(failure);
    const malformed: unknown = { status: 401 };
    await expect(
      runBoundedWorkers({
        items: [1],
        work: vi.fn<() => Promise<number>>().mockRejectedValue(malformed),
        persist: async () => undefined,
      })
    ).rejects.toMatchObject({ message: 'Bounded worker failed', cause: malformed });
  });

  it('validates worker limits and accepts an empty queue', async () => {
    for (const concurrency of [0, 5, 1.5]) {
      await expect(
        runBoundedWorkers({
          items: [],
          concurrency,
          work: async () => 1,
          persist: async () => undefined,
        })
      ).rejects.toThrow('Invalid bounded worker limits');
    }
    for (const maxAttempts of [0, 4, 1.5]) {
      await expect(
        runBoundedWorkers({
          items: [],
          maxAttempts,
          work: async () => 1,
          persist: async () => undefined,
        })
      ).rejects.toThrow('Invalid bounded worker limits');
    }
    expect(
      await runBoundedWorkers({ items: [], work: async () => 1, persist: async () => undefined })
    ).toEqual([]);
  });
});
