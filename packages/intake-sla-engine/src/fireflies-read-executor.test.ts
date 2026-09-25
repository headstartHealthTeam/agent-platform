import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { FirefliesReadError } from '@headstart-health/fireflies-data';
import { afterEach, describe, expect, it } from 'vitest';

import { boundedFixture, first } from './fireflies-bounded-fixture.test-support.js';
import {
  boundedCollectionStatus,
  captureCandidateResponse,
  planBoundedCollection,
} from './fireflies-bounded-storage.js';
import { executeFirefliesReads } from './fireflies-read-executor.js';
import { checkFirefliesPause, readFirefliesState } from './fireflies-read-state.js';
import { writePrivateJson } from './private-run-storage.js';

const roots: string[] = [];
const ID_ONE = 'synthetic-candidate';
const ID_TWO = 'synthetic-second';
interface Harness {
  runDir: string;
  now: () => number;
  advance: (milliseconds: number) => void;
  waits: number[];
  sleep: (milliseconds: number) => Promise<void>;
  response: (id: string) => object;
}
async function harness(): Promise<Harness> {
  const runDirectory = await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), 'intake-read-executor-test-')
  );
  roots.push(runDirectory);
  const input = boundedFixture();
  const meeting = first(first(input.discovery.pages).meetings);
  first(input.discovery.pages).meetings.push({ ...meeting, transcriptId: ID_TWO });
  first(input.searchExecution.attempts).meetingIds.push(ID_TWO);
  for (const [name, value] of new Map<string, unknown>([
    ['fireflies_discovery', input.discovery],
    ['fireflies_run_inventory', input.collectionPlan],
    ['identity_profile_rows', input.profiles],
    ['fireflies_search_execution', input.searchExecution],
  ]))
    await writePrivateJson(path.join(runDirectory, `${name}.json`), value);
  await planBoundedCollection(runDirectory);
  let time = Date.parse(first(input.fetched).retrievedAt);
  const waits: number[] = [];
  return {
    runDir: runDirectory,
    now: () => time,
    advance: (milliseconds): void => {
      time += milliseconds;
    },
    waits,
    sleep: (milliseconds): Promise<void> => {
      waits.push(milliseconds);
      time += milliseconds;
      return Promise.resolve();
    },
    response: (id): object => ({
      content: [
        {
          type: 'text',
          text: `Id: ${id}\nDateString: ${meeting.date}\nSentences: Synthetic rate limit discussion.\nTitle: ${meeting.title}\nOrganizer Email: ${meeting.organizerEmail}\nParticipants: ${meeting.participants.join(', ')}\nMeeting Attendees: No meeting attendees\nIs Live: false`,
        },
      ],
    }),
  };
}
afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
describe('durable serial Fireflies read execution', () => {
  it('paces successful reads, checkpoints them and never refetches on resume', async () => {
    const h = await harness();
    const calls: string[] = [];
    const progress: { saved: number; required: number }[] = [];
    const read = ({ transcriptId }: { transcriptId: string }): Promise<unknown> => {
      calls.push(transcriptId);
      return Promise.resolve(h.response(transcriptId));
    };
    expect(
      await executeFirefliesReads({
        ...h,
        read,
        onProgress: (value): void => {
          progress.push(value);
        },
      })
    ).toMatchObject({ saved: 2, pending: 0 });
    expect(h.waits).toEqual([1100]);
    expect(calls).toEqual([ID_ONE, ID_TWO]);
    expect(progress).toEqual([
      { saved: 1, required: 2 },
      { saved: 2, required: 2 },
    ]);
    await executeFirefliesReads({ ...h, read });
    expect(calls).toHaveLength(2);
  }, 30_000);
  it.each([
    { recovery: 'accepted', status: 429 },
    { recovery: 'accepted', status: 503 },
    { recovery: 'raw', status: 429 },
    { recovery: 'raw', status: 503 },
  ])(
    'retains provider cooldown across $recovery recovery and endpoint changes for $status',
    async ({ recovery, status }) => {
      const h = await harness();
      let calls = 0;
      await expect(
        executeFirefliesReads({
          ...h,
          read: (): Promise<unknown> =>
            Promise.resolve({ isError: true, status, retryAfter: '120' }),
        })
      ).rejects.toMatchObject({ retryAfterMs: 120000 });
      const capture = {
        response: h.response(ID_ONE),
        retrievedAt: new Date(h.now()).toISOString(),
        retrievalEndpoint: 'fireflies_fetch',
      };
      if (recovery === 'accepted') await captureCandidateResponse(h.runDir, { index: 0, capture });
      else await writePrivateJson(path.join(h.runDir, 'fireflies_body_raw_0.json'), capture);
      const read = ({ transcriptId }: { transcriptId: string }): Promise<unknown> => {
        calls++;
        return Promise.resolve(h.response(transcriptId));
      };
      const options = { ...h, read, retrievalEndpoint: 'fireflies_get_transcript' as const };
      await expect(executeFirefliesReads(options)).rejects.toMatchObject({
        status,
        retryAfterMs: 120000,
      });
      expect(calls).toBe(0);
      expect((await boundedCollectionStatus(h.runDir)).saved).toBe(1);
      h.advance(119999);
      await expect(executeFirefliesReads(options)).rejects.toMatchObject({ retryAfterMs: 1 });
      h.advance(1);
      expect((await executeFirefliesReads(options)).saved).toBe(2);
      expect(calls).toBe(1);
    },
    30_000
  );
  it('preserves earlier successes and enforces the original per-tool attempt budget across invocations', async () => {
    const h = await harness();
    const calls: string[] = [];
    const read = ({ transcriptId }: { transcriptId: string }): Promise<unknown> => {
      calls.push(transcriptId);
      return Promise.resolve(
        transcriptId === ID_ONE ? h.response(transcriptId) : { isError: true, status: 503 }
      );
    };
    await expect(executeFirefliesReads({ ...h, read })).rejects.toThrow('READ_FAILED');
    expect((await boundedCollectionStatus(h.runDir)).saved).toBe(1);
    h.advance(1100);
    await expect(executeFirefliesReads({ ...h, read })).rejects.toThrow('READ_FAILED');
    h.advance(1100);
    await expect(executeFirefliesReads({ ...h, read })).rejects.toThrow('budget exhausted');
    expect(calls).toEqual([ID_ONE, ID_TWO, ID_TWO]);
  }, 30_000);
  it('does not admit invalid bodies or access failures and does not expose provider diagnostics', async () => {
    for (const response of [
      { isError: true, status: 403, message: 'synthetic private marker' },
      { content: [{ type: 'text', text: 'synthetic private marker' }] },
    ]) {
      const h = await harness();
      let calls = 0;
      const read = (): Promise<unknown> => {
        calls++;
        return Promise.resolve(response);
      };
      await expect(executeFirefliesReads({ ...h, read })).rejects.toBeInstanceOf(
        FirefliesReadError
      );
      h.advance(120000);
      await expect(executeFirefliesReads({ ...h, read })).rejects.not.toThrow(
        'synthetic private marker'
      );
      expect(calls).toBe(1);
      expect((await boundedCollectionStatus(h.runDir)).saved).toBe(0);
    }
  }, 30_000);
  it('rejects invalid durable state and keeps terminal/pending failure decisions intact', () => {
    const state = readFirefliesState(undefined, 'manifest');
    expect(readFirefliesState(state, 'manifest')).toEqual(state);
    for (const patch of [
      { version: 2 },
      { manifestHash: 'other' },
      { attempts: { 'bad:0': 1 } },
      { attempts: { 'fireflies_fetch:0': 3 } },
      { nextReadAt: Infinity },
      { providerPause: { code: 'FIREFLIES_READ_FAILED', status: 403, retryAt: 0 } },
      { failure: {} },
    ])
      expect(() => readFirefliesState({ ...state, ...patch }, 'manifest')).toThrow(
        'Invalid Fireflies'
      );
    state.failure = { code: 'FIREFLIES_READ_FAILED', status: 503, retryAt: 100, index: 0 };
    expect(() => {
      checkFirefliesPause(state, 99);
    }).toThrow('READ_FAILED');
    expect(() => {
      checkFirefliesPause(state, 100);
    }).not.toThrow();
    state.failure = { ...state.failure, status: null };
    expect(() => {
      checkFirefliesPause(state, 1000);
    }).toThrow('READ_FAILED');
  });
  it('does not dispatch from competing collectors or a published run', async () => {
    const h = await harness();
    let start: (() => void) | undefined;
    let release: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      start = resolve;
    });
    const block = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const read = async ({ transcriptId }: { transcriptId: string }): Promise<unknown> => {
      calls++;
      start?.();
      await block;
      return h.response(transcriptId);
    };
    const active = executeFirefliesReads({ ...h, read });
    await ready;
    await expect(executeFirefliesReads({ ...h, read })).rejects.toThrow('locked');
    release?.();
    await active;
    expect(calls).toBe(2);
    await writePrivateJson(path.join(h.runDir, 'publication-readback.json'), {});
    await expect(executeFirefliesReads({ ...h, read })).rejects.toThrow('immutable');
    expect(calls).toBe(2);
  }, 30_000);
});
