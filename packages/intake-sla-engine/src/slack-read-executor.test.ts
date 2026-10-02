import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { checkpointPlan, connectorCheckpoint } from './connector-checkpoint.js';
import { writePrivateJson } from './private-run-storage.js';
import { executeSlackReads, SlackReadError } from './slack-read-executor.js';
import type { SlackReadOptions } from './slack-read-executor.js';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await fs.rm(directory, { recursive: true, force: true });
});
async function fixture(): Promise<{
  runDir: string;
  plan: ReturnType<typeof checkpointPlan>;
  validators: SlackReadOptions['validators'];
}> {
  const runDirectory = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'synthetic-slack-reader-'))
  );
  directories.push(runDirectory);
  return {
    runDir: runDirectory,
    plan: checkpointPlan({
      version: 1,
      source: 'slack',
      runId: 'synthetic',
      asOf: '2026-01-01',
      inputHash: 'a'.repeat(64),
      requests: ['one', 'two'].map((requestKey) => ({
        requestKey,
        operation: 'search',
        arguments: { query: requestKey },
      })),
    }),
    validators: {
      search: (result, item): void => {
        const parsed = z.object({ complete: z.literal(true), query: z.string() }).parse(result);
        expect(parsed.query).toBe(z.object({ query: z.string() }).parse(item.arguments).query);
      },
    },
  };
}
describe('bounded native Slack read execution', () => {
  it('retries transient failures, paces sequential success, checkpoints and never repeats saved work', async () => {
    const f = await fixture();
    const calls: string[] = [];
    const waits: number[] = [];
    const progress: unknown[] = [];
    let active = 0;
    const readers = {
      search: async (input: unknown): Promise<unknown> => {
        const { query } = z.object({ query: z.string() }).parse(input);
        expect(active++).toBe(0);
        calls.push(query);
        active--;
        if (calls.length === 1) return { isError: true, status: 429, retryAfter: '2' };
        if (calls.length === 2)
          throw Object.assign(new Error('synthetic private body'), { status: 503 });
        return { query, complete: true };
      },
    };
    const options = {
      ...f,
      readers,
      random: (): number => 0,
      sleep: async (milliseconds: number): Promise<void> => {
        waits.push(milliseconds);
      },
      onProgress: (event: unknown): void => {
        progress.push(event);
      },
    };
    expect((await executeSlackReads(options)).saved).toBe(2);
    expect(calls).toEqual(['one', 'one', 'one', 'two']);
    expect(waits).toEqual([2000, 2000, 1100]);
    expect(progress).toEqual([
      { completed: 1, required: 2, attempts: 3 },
      { completed: 2, required: 2, attempts: 1 },
    ]);
    await executeSlackReads(options);
    expect(calls).toHaveLength(4);
  }, 30_000);
  it('stops access, validation, exhausted and long-delay failures with sanitized durable receipts', async () => {
    for (const scenario of ['forbidden', 'invalid', 'exhaust', 'long-delay']) {
      const f = await fixture();
      let attempts = 0;
      const waits: number[] = [];
      const options = {
        ...f,
        now: (): number => Date.parse('2026-01-01'),
        random: (): number => 0,
        sleep: async (milliseconds: number): Promise<void> => {
          waits.push(milliseconds);
        },
        readers: {
          search: async (): Promise<unknown> => {
            attempts++;
            if (scenario === 'invalid') return { complete: true, query: 'wrong' };
            return {
              isError: true,
              status: scenario === 'forbidden' ? 403 : 429,
              retryAfter: new Date(
                Date.parse('2026-01-01') + (scenario === 'long-delay' ? 61_000 : 3000)
              ).toUTCString(),
              privateContent: 'SYNTHETIC_PRIVATE_MARKER',
            };
          },
        },
      };
      await expect(executeSlackReads(options)).rejects.toBeInstanceOf(SlackReadError);
      expect(attempts).toBe(scenario === 'exhaust' ? 3 : 1);
      expect(waits.every((milliseconds) => milliseconds <= 60_000)).toBe(true);
      const status = await connectorCheckpoint({ ...f, action: 'status' });
      expect(status).toMatchObject({ blocked: 1, pending: 1 });
      await expect(executeSlackReads(options)).rejects.toThrow('terminal failed');
      expect(attempts).toBe(scenario === 'exhaust' ? 3 : 1);
      const files = await fs.readdir(path.join(f.runDir, 'slack-checkpoints'));
      const bodies = await Promise.all(
        files.map((name) => fs.readFile(path.join(f.runDir, 'slack-checkpoints', name), 'utf8'))
      );
      expect(bodies.join('')).not.toContain('SYNTHETIC_PRIVATE_MARKER');
    }
  }, 30_000);
  it('rejects changed plans, non-read operations, absent callbacks and published runs before a read', async () => {
    const f = await fixture();
    let calls = 0;
    const readers = {
      search: async (): Promise<unknown> => {
        calls++;
        return {};
      },
    };
    const sendPlan = checkpointPlan({
      ...f.plan,
      requests: [{ requestKey: 'send', operation: 'send', arguments: {} }],
    });
    await expect(executeSlackReads({ ...f, plan: sendPlan, readers })).rejects.toThrow('readers');
    await expect(executeSlackReads({ ...f, readers: {} })).rejects.toThrow('readers');
    await expect(executeSlackReads({ ...f, readers, validators: {} })).rejects.toThrow('readers');
    await expect(
      executeSlackReads({ ...f, readers, plan: { ...f.plan, planHash: 'wrong' } })
    ).rejects.toThrow('readers');
    await writePrivateJson(path.join(f.runDir, 'publication-readback.json'), {});
    await expect(executeSlackReads({ ...f, readers })).rejects.toThrow('immutable');
    expect(calls).toBe(0);
  }, 30_000);
  it('retains original callback arguments and supports separately injected thread requests', async () => {
    const f = await fixture();
    const plan = checkpointPlan({
      ...f.plan,
      requests: [
        {
          requestKey: 'thread',
          operation: 'thread',
          arguments: { channel: 'C123', ts: '1.1' },
          audit: { retained: true },
        },
      ],
    });
    const before = structuredClone(plan);
    const readers = {
      thread: async (input: unknown): Promise<unknown> => {
        const args = z.object({ channel: z.string(), ts: z.string() }).parse(input);
        return { channel: args.channel, ts: args.ts };
      },
    };
    const validators = {
      thread: (result: unknown, item: unknown): void => {
        expect(result).toEqual({ channel: 'C123', ts: '1.1' });
        expect(item).toEqual(before.requests[0]);
      },
    };
    expect((await executeSlackReads({ ...f, plan, readers, validators })).pending).toBe(0);
    expect(plan).toEqual(before);
  }, 30_000);
  it('prevents concurrent duplicate reads with a separate lease and rechecks publication between requests', async () => {
    const f = await fixture();
    let release: (() => void) | undefined;
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started: (() => void) | undefined;
    const startedRead = new Promise<void>((resolve) => {
      started = resolve;
    });
    let calls = 0;
    const options = {
      ...f,
      sleep: async (): Promise<void> => {
        /* Synthetic pacing has no wall-clock delay. */
      },
      readers: {
        search: async (input: unknown): Promise<unknown> => {
          calls++;
          started?.();
          await paused;
          return { ...z.object({ query: z.string() }).parse(input), complete: true };
        },
      },
    };
    const running = executeSlackReads(options);
    await startedRead;
    await expect(executeSlackReads(options)).rejects.toThrow('locked');
    release?.();
    await running;
    expect(calls).toBe(2);
    const second = await fixture();
    const stopAfterFirst = {
      ...second,
      readers: {
        search: async (input: unknown): Promise<unknown> => ({
          ...z.object({ query: z.string() }).parse(input),
          complete: true,
        }),
      },
      sleep: async (): Promise<void> => {
        await writePrivateJson(path.join(second.runDir, 'publication-readback.json'), {});
      },
    };
    await expect(executeSlackReads(stopAfterFirst)).rejects.toThrow('immutable');
  }, 30_000);
});
