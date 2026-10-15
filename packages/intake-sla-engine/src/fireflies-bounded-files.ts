import fs from 'node:fs/promises';
import path from 'node:path';

import type { CompleteFirefliesTranscript } from '@headstart-health/fireflies-data';
import { z } from 'zod';

import { FIREFLIES_BOUNDED_VERSION, requireBounded } from './fireflies-bounded-contract.js';
import type { BoundedInputs, FirefliesCandidateManifest } from './fireflies-bounded-contract.js';
import { buildFirefliesCandidateManifest } from './fireflies-bounded.js';
import { readFirefliesDiscovery } from './fireflies-cache-storage.js';
import { validateCandidateBody } from './fireflies-candidate-body.js';
import { buildRunLevelFirefliesCollectionPlan } from './fireflies-collection.js';
import { parseFirefliesProfiles } from './fireflies-profile.js';
import { sha256Json } from './json-fingerprint.js';
import {
  filesystemCode,
  optionalPrivateJson,
  privateDirectory,
  readPrivateJson,
  requireMutableRun,
  withRunCheckpointLock,
} from './private-run-storage.js';

export const BOUNDED_MANIFEST_FILE = 'fireflies_candidate_fetch_manifest.json';
export const BOUNDED_PROOF_FILE = 'fireflies_bounded_proof.json';
export const BOUNDED_INVENTORY_FILE = 'fireflies_transcript_inventory.jsonl';
export const BODY_CHECKPOINT_DIRECTORY = 'fireflies-body-checkpoints';
export function bodyItemName(id: string): string {
  return `${sha256Json(id)}.json`;
}
export function rawBodyCaptureName(index: number): string {
  return `fireflies_body_raw_${String(index)}.json`;
}
export async function boundedInputs(runDirectory: string): Promise<BoundedInputs> {
  const rawPlan = await readPrivateJson(path.join(runDirectory, 'fireflies_run_inventory.json'));
  const window = z
    .looseObject({ fromDate: z.string().nullable(), toDate: z.string().nullable() })
    .parse(rawPlan);
  const discovery = await readFirefliesDiscovery(runDirectory, window);
  const { asOf } = z.object({ asOf: z.string() }).parse(discovery);
  const profiles = parseFirefliesProfiles(
    await readPrivateJson(path.join(runDirectory, 'identity_profile_rows.json'))
  );
  const collectionPlan = buildRunLevelFirefliesCollectionPlan(
    profiles.map((profile) => ({ ...profile, asOf }))
  );
  requireBounded(
    sha256Json(rawPlan) === sha256Json(collectionPlan),
    'Collection plan does not match current identities'
  );
  return {
    collectionPlan,
    discovery,
    profiles,
    searchExecution: await readPrivateJson(
      path.join(runDirectory, 'fireflies_search_execution.json')
    ),
  };
}
export async function currentCandidateManifest(
  runDirectory: string
): Promise<{ manifest: FirefliesCandidateManifest; inputs: BoundedInputs }> {
  const inputs = await boundedInputs(runDirectory);
  const manifest = buildFirefliesCandidateManifest(inputs);
  const saved = await readPrivateJson(path.join(runDirectory, BOUNDED_MANIFEST_FILE));
  requireBounded(
    sha256Json(saved) === sha256Json(manifest),
    'Candidate manifest changed or its inputs no longer match'
  );
  const mode = z
    .object({
      version: z.literal(FIREFLIES_BOUNDED_VERSION),
      mode: z.literal('bounded-fresh'),
      runId: z.string(),
      asOf: z.string(),
      cacheReuse: z.literal(false),
      wholeInventoryBodies: z.literal(false),
    })
    .safeParse(await readPrivateJson(path.join(runDirectory, 'fireflies_collection_mode.json')));
  requireBounded(
    mode.success && mode.data.runId === manifest.runId && mode.data.asOf === manifest.asOf,
    'Bounded collection mode binding changed'
  );
  requireBounded(
    (await optionalPrivateJson(path.join(runDirectory, 'fireflies_cache_plan.json'))) === undefined,
    'Bounded and cache collection plans cannot coexist'
  );
  return { manifest, inputs };
}
export async function savedCandidateBodies(
  runDirectory: string,
  manifest: FirefliesCandidateManifest
): Promise<CompleteFirefliesTranscript[]> {
  const directory = path.join(runDirectory, BODY_CHECKPOINT_DIRECTORY);
  const stat = await fs.lstat(directory).catch((error: unknown) => {
    if (filesystemCode(error, 'ENOENT')) return null;
    throw error;
  });
  if (stat === null) return [];
  requireBounded(
    stat.isDirectory() &&
      !stat.isSymbolicLink() &&
      (process.platform === 'win32' || (stat.mode & 0o077) === 0),
    'Body checkpoints must be a private directory'
  );
  const expected = new Map(
    manifest.meetings.map((meeting) => [bodyItemName(meeting.transcriptId), meeting.transcriptId])
  );
  const records: CompleteFirefliesTranscript[] = [];
  for (const entry of await fs.readdir(directory)) {
    if (entry.endsWith('.tmp')) continue;
    requireBounded(expected.has(entry), 'Unexpected body checkpoint');
    const item = z
      .object({
        version: z.literal(FIREFLIES_BOUNDED_VERSION),
        manifestHash: z.string(),
        recordHash: z.string(),
        record: z.unknown(),
      })
      .safeParse(await readPrivateJson(path.join(directory, entry)));
    const identity = z.object({ transcriptId: z.string() }).safeParse(item.data?.record);
    requireBounded(
      item.success &&
        identity.success &&
        item.data.manifestHash === manifest.manifestHash &&
        identity.data.transcriptId === expected.get(entry) &&
        item.data.recordHash === sha256Json(item.data.record),
      'Body checkpoint is corrupt or belongs to a different manifest'
    );
    records.push(validateCandidateBody(manifest, item.data.record));
  }
  return records.sort((a, b) => a.transcriptId.localeCompare(b.transcriptId));
}
export async function withMutableBoundedRun<T>(
  runDirectory: string,
  operation: (directory: string) => Promise<T>
): Promise<T> {
  const directory = await privateDirectory(runDirectory);
  return withRunCheckpointLock(directory, async () => {
    await requireMutableRun(directory);
    return operation(directory);
  });
}
