import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { firefliesReadFailure, FirefliesReadError } from '@headstart-health/fireflies-data';
import { z } from 'zod';

import { requireContract } from './connector-checkpoint.js';
import { boundedCollectionStatus, captureCandidateResponse } from './fireflies-bounded-storage.js';
import type { BoundedCollectionStatus } from './fireflies-bounded-storage.js';
import {
  checkFirefliesPause,
  readFirefliesState,
  transientFirefliesStatus,
} from './fireflies-read-state.js';
import type { FirefliesReadState } from './fireflies-read-state.js';
import {
  optionalPrivateJson,
  privateDirectory,
  readPrivateJson,
  requireMutableRun,
  withCacheLock,
  writePrivateJson,
} from './private-run-storage.js';

export interface FirefliesReadOptions {
  readonly runDir: string;
  readonly read: (request: { transcriptId: string }) => Promise<unknown>;
  readonly retrievalEndpoint?: 'fireflies_fetch' | 'fireflies_get_transcript';
  readonly sleep?: (milliseconds: number) => Promise<unknown>;
  readonly now?: () => number;
  readonly onProgress?: (progress: { saved: number; required: number }) => void;
}
interface ReadContext {
  readonly directory: string;
  readonly statePath: string;
  readonly state: FirefliesReadState;
  readonly read: FirefliesReadOptions['read'];
  readonly retrievalEndpoint: 'fireflies_fetch' | 'fireflies_get_transcript';
  readonly now: () => number;
  readonly sleep: (milliseconds: number) => Promise<unknown>;
}
async function recordFailure(error: unknown, index: number, context: ReadContext): Promise<never> {
  const { state, statePath, now } = context;
  const failure =
    error instanceof FirefliesReadError
      ? error
      : (firefliesReadFailure(error, now()) ??
        new FirefliesReadError({ code: 'FIREFLIES_BODY_CAPTURE_FAILED' }));
  const cooldown = Math.max(failure.retryAfterMs, failure.status === 429 ? 60_000 : 1100);
  state.failure = { code: failure.code, status: failure.status, retryAt: now() + cooldown, index };
  if (transientFirefliesStatus(failure.status))
    state.providerPause = {
      code: failure.code,
      status: failure.status,
      retryAt: state.failure.retryAt,
    };
  await writePrivateJson(statePath, state);
  throw new FirefliesReadError({
    code: failure.code,
    status: failure.status,
    retryAfterMs: cooldown,
  });
}
async function dispatch(
  item: { index: number; transcriptId: string },
  context: ReadContext
): Promise<void> {
  const { state, statePath, now, sleep, directory, retrievalEndpoint, read } = context;
  checkFirefliesPause(state, now());
  const key = `${retrievalEndpoint}:${String(item.index)}`;
  const attempts = new Map(Object.entries(state.attempts));
  const previous = attempts.get(key) ?? 0;
  requireContract(
    previous < 2,
    'Fireflies per-tool attempt budget exhausted; explicit source recovery required'
  );
  const wait = Math.max(0, state.nextReadAt - now());
  if (wait > 0) await sleep(wait);
  await requireMutableRun(directory);
  attempts.set(key, previous + 1);
  state.attempts = Object.fromEntries(attempts);
  await writePrivateJson(statePath, state);
  try {
    const response = await read({ transcriptId: item.transcriptId });
    const failure = firefliesReadFailure(response, now());
    if (failure !== null) throw failure;
    await captureCandidateResponse(directory, {
      index: item.index,
      capture: { retrievalEndpoint, retrievedAt: new Date(now()).toISOString(), response },
    });
  } catch (error) {
    await recordFailure(error, item.index, context);
  }
  state.failure = null;
  state.providerPause = null;
  state.nextReadAt = now() + 1100;
  await writePrivateJson(statePath, state);
}
async function resumeCapture(index: number, context: ReadContext): Promise<void> {
  await captureCandidateResponse(context.directory, { index });
  if (context.state.failure?.index === index) {
    context.state.failure = null;
    await writePrivateJson(context.statePath, context.state);
  }
}
/** The host supplies authorized reads; Intake owns serial dispatch, durable budgets and checkpoint admission. */
export async function executeFirefliesReads(
  options: FirefliesReadOptions
): Promise<BoundedCollectionStatus> {
  const {
    runDir: runDirectory,
    read,
    retrievalEndpoint = 'fireflies_fetch',
    sleep = delay,
    now = Date.now,
    onProgress,
  } = options;
  requireContract(
    typeof read === 'function' &&
      ['fireflies_fetch', 'fireflies_get_transcript'].includes(retrievalEndpoint),
    'An approved Fireflies body reader is required'
  );
  const directory = await privateDirectory(runDirectory);
  await requireMutableRun(directory);
  const lease = await privateDirectory(path.join(directory, 'fireflies-read-session'));
  return withCacheLock(lease, async () => {
    const status = await boundedCollectionStatus(directory);
    const pending = z
      .object({
        manifestHash: z.string(),
        meetings: z.array(
          z.object({
            index: z.number().int().nonnegative(),
            transcriptId: z.string(),
            action: z.string(),
          })
        ),
      })
      .parse(await readPrivateJson(path.join(directory, 'fireflies_pending_fetches.json')));
    const statePath = path.join(lease, 'state.json');
    const state = readFirefliesState(await optionalPrivateJson(statePath), pending.manifestHash);
    if (
      state.failure !== null &&
      !pending.meetings.some((item) => item.index === state.failure?.index)
    ) {
      state.failure = null;
      await writePrivateJson(statePath, state);
    }
    const context: ReadContext = {
      directory,
      statePath,
      state,
      read,
      retrievalEndpoint,
      now,
      sleep,
    };
    let saved = status.saved;
    for (const item of pending.meetings) {
      if (item.action === 'Resume capture') {
        await resumeCapture(item.index, context);
        saved++;
        continue;
      }
      requireContract(item.action === 'Fetch', 'Unknown Fireflies body action');
      await dispatch(item, context);
      saved++;
      onProgress?.({ saved, required: status.saved + status.pending });
    }
    return boundedCollectionStatus(directory);
  });
}
