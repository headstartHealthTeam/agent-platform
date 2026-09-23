import fs from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { sha256Json } from './json-fingerprint.js';
import {
  privateDirectory,
  readPrivateJson,
  requireMutableRun,
  withRunCheckpointLock,
  writeIdenticalOrNew,
  writePrivateJson,
} from './private-run-storage.js';

const requestSchema = z.looseObject({ requestKey: z.string().min(1) });
const planSchema = z.looseObject({
  version: z.literal(1),
  runId: z.string().min(1),
  source: z.string().regex(/^[a-z][a-z-]+$/),
  asOf: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  requests: z.array(requestSchema),
  planHash: z.unknown().optional(),
});
export type CheckpointRequest = z.infer<typeof requestSchema>;
export type CheckpointPlan = z.infer<typeof planSchema> & { planHash: string };
const resultSchema = z.looseObject({
  requestKey: z.string(),
  status: z.enum(['Complete', 'Blocked', 'Timed Out', 'Unsupported']),
  output: z.unknown().refine((value) => value !== undefined),
});
const captureSchema = z.object({
  version: z.literal(1),
  runId: z.string(),
  planHash: z.string(),
  batchId: z.string().min(1),
  results: z.array(resultSchema).min(1),
  expectedRequestCount: z.number(),
  complete: z.literal(true),
});
const storedItemSchema = z.looseObject({
  planHash: z.string(),
  requestKey: z.string(),
  outputHash: z.string(),
  status: z.unknown().optional(),
  output: z.unknown(),
});
type StoredItem = z.infer<typeof storedItemSchema>;
interface NewItem extends StoredItem {
  version: 1;
  batchId: string;
  status: z.infer<typeof resultSchema>['status'];
}
export interface CheckpointProgress {
  readonly planHash: string;
  readonly expected: number;
  readonly saved: number;
  readonly pending: number;
  readonly blocked: number;
  readonly pendingRequests: readonly CheckpointRequest[];
}
export function requireContract(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function planBody({
  planHash: _old,
  ...body
}: z.infer<typeof planSchema>): z.infer<typeof planSchema> {
  return body;
}
export function checkpointPlan(input: unknown): CheckpointPlan {
  const parsed = planSchema.safeParse(input);
  requireContract(parsed.success, 'Invalid connector checkpoint plan');
  const keys = parsed.data.requests.map((item) => item.requestKey);
  requireContract(
    new Set(keys).size === keys.length,
    'Duplicate or invalid planned request identity'
  );
  const body = planBody(parsed.data);
  return { ...body, planHash: sha256Json(body) };
}
async function readItems(
  directory: string,
  allowed: ReadonlyMap<string, CheckpointRequest>,
  planHash: string
): Promise<Map<string, StoredItem>> {
  const items = new Map<string, StoredItem>();
  for (const name of await fs.readdir(directory)) {
    if (name === 'plan.json' || name.endsWith('.tmp')) continue;
    const key = name.replace(/\.json$/, '');
    const request = allowed.get(key);
    requireContract(
      request !== undefined && name === `${key}.json`,
      'Unexpected connector checkpoint'
    );
    const parsed = storedItemSchema.safeParse(await readPrivateJson(path.join(directory, name)));
    requireContract(
      parsed.success &&
        parsed.data.planHash === planHash &&
        parsed.data.requestKey === request.requestKey &&
        parsed.data.outputHash === sha256Json(parsed.data.output),
      'Connector checkpoint binding changed'
    );
    items.set(parsed.data.requestKey, parsed.data);
  }
  return items;
}
function batchItems(
  input: unknown,
  plan: CheckpointPlan,
  allowed: ReadonlyMap<string, CheckpointRequest>
): NewItem[] {
  const parsed = captureSchema.safeParse(input);
  requireContract(
    parsed.success &&
      parsed.data.runId === plan.runId &&
      parsed.data.planHash === plan.planHash &&
      parsed.data.expectedRequestCount === parsed.data.results.length,
    'Incomplete or mismatched connector batch'
  );
  const capture = parsed.data;
  const keys = new Set<string>();
  return capture.results.map((result): NewItem => {
    requireContract(
      allowed.has(sha256Json(result.requestKey)) && !keys.has(result.requestKey),
      'Unknown, duplicate, or unfinished connector result'
    );
    keys.add(result.requestKey);
    return {
      version: 1,
      planHash: plan.planHash,
      batchId: capture.batchId,
      requestKey: result.requestKey,
      status: result.status,
      outputHash: sha256Json(result.output),
      output: result.output,
    };
  });
}
async function acceptBatch(
  directory: string,
  capture: unknown,
  plan: CheckpointPlan,
  allowed: ReadonlyMap<string, CheckpointRequest>
): Promise<void> {
  const items = batchItems(capture, plan, allowed);
  const saved = await readItems(directory, allowed, plan.planHash);
  for (const item of items) {
    const old = saved.get(item.requestKey);
    requireContract(
      old === undefined || (old.outputHash === item.outputHash && old.status === item.status),
      'Conflicting checkpoint retry; preserve the original capture'
    );
  }
  for (const item of items) {
    if (!saved.has(item.requestKey))
      await writeIdenticalOrNew(path.join(directory, `${sha256Json(item.requestKey)}.json`), item);
  }
}
async function finalizeInventory(
  runDirectory: string,
  plan: CheckpointPlan,
  items: ReadonlyMap<string, StoredItem>,
  blocked: number,
  pending: readonly CheckpointRequest[]
): Promise<void> {
  requireContract(pending.length === 0, 'Connector checkpoint is incomplete');
  const results = plan.requests.map((request) => items.get(request.requestKey));
  await writeIdenticalOrNew(path.join(runDirectory, `${plan.source}_checkpoint_inventory.json`), {
    version: 1,
    runId: plan.runId,
    asOf: plan.asOf,
    planHash: plan.planHash,
    resultsHash: sha256Json(results),
    results,
    accounted: results.length,
    blocked,
  });
}
export async function connectorCheckpoint({
  runDir: inputDirectory,
  action,
  plan: input,
  capture,
}: {
  readonly runDir: string;
  readonly action: string;
  readonly plan: unknown;
  readonly capture?: unknown;
}): Promise<CheckpointProgress> {
  const runDirectory = await privateDirectory(inputDirectory);
  return withRunCheckpointLock(runDirectory, async () => {
    await requireMutableRun(runDirectory);
    const plan = checkpointPlan(input);
    const original = planSchema.parse(input);
    const hasOriginalHash = Boolean(original.planHash);
    requireContract(
      !hasOriginalHash || original.planHash === plan.planHash,
      'Checkpoint plan hash changed'
    );
    const directory = await privateDirectory(path.join(runDirectory, `${plan.source}-checkpoints`));
    await writeIdenticalOrNew(path.join(directory, 'plan.json'), plan);
    const allowed = new Map(plan.requests.map((item) => [sha256Json(item.requestKey), item]));
    if (action === 'accept') await acceptBatch(directory, capture, plan, allowed);
    else
      requireContract(
        ['plan', 'status', 'finalize'].includes(action),
        'Unsupported checkpoint action'
      );
    const items = await readItems(directory, allowed, plan.planHash);
    const pending = plan.requests.filter((request) => !items.has(request.requestKey));
    const blocked = [...items.values()].filter((item) => item.status !== 'Complete').length;
    if (action === 'finalize') await finalizeInventory(runDirectory, plan, items, blocked, pending);
    await writePrivateJson(path.join(runDirectory, `${plan.source}_pending_requests.json`), {
      runId: plan.runId,
      planHash: plan.planHash,
      requests: pending,
    });
    return {
      planHash: plan.planHash,
      expected: plan.requests.length,
      saved: items.size,
      pending: pending.length,
      blocked,
      pendingRequests: pending,
    };
  });
}
