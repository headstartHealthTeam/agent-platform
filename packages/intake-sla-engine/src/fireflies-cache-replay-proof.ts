import fs from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { readFirefliesDiscovery } from './fireflies-cache-storage.js';
import { verifyFirefliesCacheRun } from './fireflies-cache-verify.js';
import { buildRunLevelFirefliesCollectionPlan } from './fireflies-collection.js';
import { parseFirefliesProfiles } from './fireflies-profile.js';
import { sha256Json } from './json-fingerprint.js';
import { filesystemCode, optionalPrivateJson, readPrivateJson } from './private-run-storage.js';

const proofSchema = z.looseObject({
  discovery: z.unknown(),
  plan: z.looseObject({ planHash: z.string() }),
  report: z.looseObject({ inventoryHash: z.string() }),
});
export type FirefliesCacheRunProof = z.infer<typeof proofSchema>;
export interface CacheReplayVerification {
  readonly requireReplay?: boolean;
  readonly profiles?: readonly unknown[] | null;
  readonly rows?: readonly unknown[] | null;
}
async function optionalProof(runDirectory: string): Promise<FirefliesCacheRunProof | null> {
  const proof = await optionalPrivateJson(path.join(runDirectory, 'fireflies_cache_proof.json'));
  if (proof !== undefined) return proofSchema.parse(proof);
  const planned = await fs
    .lstat(path.join(runDirectory, 'fireflies_cache_plan.json'))
    .catch((failure: unknown) => {
      if (filesystemCode(failure, 'ENOENT')) return null;
      throw failure;
    });
  if (planned !== null) throw new Error('Cache materialization has not completed');
  return null;
}
async function verifyReplay(
  runDirectory: string,
  proof: FirefliesCacheRunProof,
  runAt: string,
  options: CacheReplayVerification
): Promise<void> {
  if (!Array.isArray(options.rows) || !Array.isArray(options.profiles))
    throw new Error(
      'Replay verification requires the exact rows and profiles consumed by the builder'
    );
  const receipt = z
    .object({
      runAt: z.string(),
      cachePlanHash: z.string(),
      inventoryHash: z.string(),
      profilesHash: z.string(),
      rowsHash: z.string(),
    })
    .parse(await readPrivateJson(path.join(runDirectory, 'fireflies_cache_replay.json')));
  const rows = z.array(z.object({ opportunityId: z.string() })).parse(options.rows);
  const profiles = parseFirefliesProfiles(options.profiles);
  const bindings = [
    receipt.runAt === runAt,
    receipt.cachePlanHash === proof.plan.planHash,
    receipt.inventoryHash === proof.report.inventoryHash,
    receipt.profilesHash === sha256Json(options.profiles),
    receipt.rowsHash === sha256Json(options.rows),
    rows.length === profiles.length,
    new Set(rows.map((row) => row.opportunityId)).size === profiles.length,
    profiles.every((profile) => rows.some((row) => row.opportunityId === profile.opportunityId)),
  ];
  if (!bindings.every(Boolean))
    throw new Error('Fireflies replay rows are not bound to current evidence and identities');
}
/** Verify the exact consumer snapshots, never replace them with a later disk read. */
export async function readCacheRunProof(
  runDirectory: string,
  records: readonly unknown[],
  runInput: string | Date,
  options: CacheReplayVerification = {}
): Promise<FirefliesCacheRunProof | null> {
  const runAt = runInput instanceof Date ? runInput.toISOString() : runInput;
  const proof = await optionalProof(runDirectory);
  if (proof === null) return null;
  const collectionPlan = z
    .looseObject({ fromDate: z.string().nullable(), toDate: z.string().nullable() })
    .parse(await readPrivateJson(path.join(runDirectory, 'fireflies_run_inventory.json')));
  const discovery = await readFirefliesDiscovery(runDirectory, collectionPlan);
  if (sha256Json(discovery) !== sha256Json(proof.discovery))
    throw new Error('Fireflies discovery changed after materialization');
  const cachePlan = await readPrivateJson(path.join(runDirectory, 'fireflies_cache_plan.json'));
  if (sha256Json(cachePlan) !== sha256Json(proof.plan))
    throw new Error('Cache plan changed after materialization');
  const diskProfiles = await readPrivateJson(path.join(runDirectory, 'identity_profile_rows.json'));
  const profiles = options.profiles ?? diskProfiles;
  if (sha256Json(profiles) !== sha256Json(diskProfiles))
    throw new Error('Consumer identity profiles changed during verification');
  const currentPlan = buildRunLevelFirefliesCollectionPlan(
    parseFirefliesProfiles(profiles).map((profile) => ({ ...profile, asOf: runAt }))
  );
  if (sha256Json(currentPlan) !== sha256Json(collectionPlan))
    throw new Error('Identity/cohort inputs changed; regenerate discovery and the cache plan');
  verifyFirefliesCacheRun({ records, proof, runAt, collectionPlan });
  if (options.requireReplay === true) await verifyReplay(runDirectory, proof, runAt, options);
  return proof;
}
