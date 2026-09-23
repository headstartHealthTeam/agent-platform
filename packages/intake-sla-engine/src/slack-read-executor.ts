import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { slackReadFailureMetadata } from '@headstart-health/slack-data';
import { z } from 'zod';

import {
  checkpointPlan,
  connectorCheckpoint,
  requireContract as check,
} from './connector-checkpoint.js';
import type { CheckpointPlan, CheckpointProgress } from './connector-checkpoint.js';
import { privateDirectory, requireMutableRun, withCacheLock } from './private-run-storage.js';

export class SlackReadError extends Error {
  readonly status: number | null;
  readonly attempts: number;
  constructor(status: number | null, attempts: number) {
    super('Slack read failed; completed checkpoints retained and response content not logged');
    this.name = 'SlackReadError';
    this.status = status;
    this.attempts = attempts;
  }
}
export interface SlackNativeReadRequest {
  readonly requestKey: string;
  readonly operation: 'search' | 'thread';
  readonly arguments: unknown;
}
type NativeReader = (arguments_: unknown) => Promise<unknown>;
type NativeValidator = (response: unknown, request: SlackNativeReadRequest) => unknown;
export interface SlackReadOptions {
  readonly runDir: string;
  readonly plan: unknown;
  readonly readers?: Partial<Record<'search' | 'thread', NativeReader>> | undefined;
  readonly validators?: Partial<Record<'search' | 'thread', NativeValidator>> | undefined;
  readonly sleep?: (milliseconds: number) => Promise<unknown>;
  readonly now?: () => number;
  readonly random?: () => number;
  readonly onProgress?: (progress: {
    completed: number;
    required: number;
    attempts: number;
  }) => void;
}
interface NativeRequest {
  readonly item: SlackNativeReadRequest;
  readonly read: NativeReader;
  readonly validate: NativeValidator;
}
interface Failure {
  readonly status: number | null;
  readonly retryMs: number;
}
interface ExecutorContext {
  readonly runDirectory: string;
  readonly plan: CheckpointPlan;
  readonly requests: ReadonlyMap<string, NativeRequest>;
  readonly sleep: (milliseconds: number) => Promise<unknown>;
  readonly now: () => number;
  readonly random: () => number;
  readonly onProgress: SlackReadOptions['onProgress'];
}
const requestSchema = z.looseObject({
  requestKey: z.string(),
  operation: z.enum(['search', 'thread']),
  arguments: z.unknown().refine(Boolean),
});
const CAPABILITIES_REQUIRED = 'Explicit plan-bound native Slack readers and validators required';
function nativeRequests(
  plan: CheckpointPlan,
  options: SlackReadOptions
): ReadonlyMap<string, NativeRequest> {
  const requests = new Map<string, NativeRequest>();
  for (const item of plan.requests) {
    const parsed = requestSchema.safeParse(item);
    check(parsed.success, CAPABILITIES_REQUIRED);
    const operation = parsed.data.operation;
    const read = operation === 'search' ? options.readers?.search : options.readers?.thread;
    const validate =
      operation === 'search' ? options.validators?.search : options.validators?.thread;
    check(typeof read === 'function' && typeof validate === 'function', CAPABILITIES_REQUIRED);
    requests.set(item.requestKey, { item: parsed.data, read, validate });
  }
  return requests;
}
async function readAttempt(
  request: NativeRequest,
  now: () => number
): Promise<{ response: unknown; failure: Failure | null }> {
  let response: unknown;
  let failure: Failure | null = null;
  try {
    response = await request.read(structuredClone(request.item.arguments));
    const metadata = slackReadFailureMetadata(response, now());
    if (metadata.failed || metadata.status !== null) failure = metadata;
  } catch (error) {
    failure = slackReadFailureMetadata(error, now());
  }
  if (failure === null) {
    try {
      await request.validate(response, structuredClone(request.item));
    } catch {
      failure = { status: null, retryMs: 0 };
    }
  }
  return { response, failure };
}
async function saveCheckpoint(
  context: ExecutorContext,
  request: NativeRequest,
  completed: number,
  status: 'Complete' | 'Blocked',
  output: unknown
): Promise<void> {
  await connectorCheckpoint({
    runDir: context.runDirectory,
    action: 'accept',
    plan: context.plan,
    capture: {
      version: 1,
      runId: context.plan.runId,
      planHash: context.plan.planHash,
      batchId: `${status === 'Complete' ? 'read' : 'failed'}-${String(completed + 1)}`,
      expectedRequestCount: 1,
      complete: true,
      results: [{ requestKey: request.item.requestKey, status, output }],
    },
  });
}
function retryWait(failure: Failure, attempt: number, random: () => number): number | null {
  const waitMs = Math.max(
    failure.retryMs,
    1000 * 2 ** (attempt - 1) + Math.floor(Math.max(0, Math.min(1, random())) * 250)
  );
  return attempt < 3 &&
    (failure.status === 429 ||
      (failure.status !== null && failure.status >= 500 && failure.status <= 599)) &&
    waitMs <= 60_000
    ? waitMs
    : null;
}
async function executeRequest(
  context: ExecutorContext,
  request: NativeRequest,
  completed: number
): Promise<number> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await requireMutableRun(context.runDirectory);
    const { response, failure } = await readAttempt(request, context.now);
    if (failure === null) {
      await saveCheckpoint(context, request, completed, 'Complete', response);
      context.onProgress?.({
        completed: completed + 1,
        required: context.plan.requests.length,
        attempts: attempt,
      });
      return completed + 1;
    }
    const wait = retryWait(failure, attempt, context.random);
    if (wait !== null) {
      await context.sleep(wait);
      continue;
    }
    await saveCheckpoint(context, request, completed, 'Blocked', {
      code: 'SLACK_READ_FAILED',
      status: failure.status,
      attempts: attempt,
    });
    throw new SlackReadError(failure.status, attempt);
  }
  return completed;
}
async function executePending(
  context: ExecutorContext
): Promise<Omit<CheckpointProgress, 'pendingRequests'>> {
  const state = await connectorCheckpoint({
    runDir: context.runDirectory,
    action: 'status',
    plan: context.plan,
  });
  check(
    state.blocked === 0,
    'Slack has terminal failed checkpoints; explicit source recovery required'
  );
  let completed = state.saved;
  for (const item of state.pendingRequests) {
    const request = context.requests.get(item.requestKey);
    check(request !== undefined, CAPABILITIES_REQUIRED);
    completed = await executeRequest(context, request, completed);
    if (completed < context.plan.requests.length) await context.sleep(1100);
  }
  const result = await connectorCheckpoint({
    runDir: context.runDirectory,
    action: 'finalize',
    plan: context.plan,
  });
  return {
    planHash: result.planHash,
    expected: result.expected,
    saved: result.saved,
    pending: result.pending,
    blocked: result.blocked,
  };
}
/** Only injected native reads; Intake owns existing retry limits, pacing and recoverable checkpoints. */
export async function executeSlackReads(
  options: SlackReadOptions
): Promise<Omit<CheckpointProgress, 'pendingRequests'>> {
  const plan = checkpointPlan(options.plan);
  const suppliedHash = z.object({ planHash: z.unknown() }).parse(options.plan).planHash;
  check(suppliedHash === plan.planHash && plan.source === 'slack', CAPABILITIES_REQUIRED);
  const requests = nativeRequests(plan, options);
  const runDirectory = await privateDirectory(options.runDir);
  await requireMutableRun(runDirectory);
  const lease = await privateDirectory(path.join(runDirectory, 'slack-read-session'));
  return withCacheLock(lease, () =>
    executePending({
      runDirectory,
      plan,
      requests,
      sleep: options.sleep ?? delay,
      now: options.now ?? Date.now,
      random: options.random ?? Math.random,
      onProgress: options.onProgress,
    })
  );
}
