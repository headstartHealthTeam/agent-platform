import path from 'node:path';

import { z } from 'zod';

import { FIREFLIES_BOUNDED_VERSION, requireBounded } from './fireflies-bounded-contract.js';
import type { BoundedInputs, FirefliesCandidateManifest } from './fireflies-bounded-contract.js';
import { resolveBoundedCoverage } from './fireflies-bounded-coverage.js';
import type { BoundedCoverage } from './fireflies-bounded-coverage.js';
import {
  BOUNDED_MANIFEST_FILE,
  BOUNDED_PROOF_FILE,
  currentCandidateManifest,
} from './fireflies-bounded-files.js';
import type { CacheReplayVerification } from './fireflies-cache-replay-proof.js';
import { verifyCandidateInventory } from './fireflies-candidate-body.js';
import { sha256Json } from './json-fingerprint.js';
import { optionalPrivateJson, readPrivateJson } from './private-run-storage.js';

const proofSchema = z.looseObject({
  status: z.literal('Complete'),
  version: z.literal(FIREFLIES_BOUNDED_VERSION),
  runId: z.string(),
  asOf: z.string(),
  manifestHash: z.string(),
  inventoryHash: z.string(),
});
export interface BoundedRunProof {
  manifest: FirefliesCandidateManifest;
  proof: z.infer<typeof proofSchema>;
  coverage: BoundedCoverage;
}
async function checkExecution(
  runDirectory: string,
  manifest: FirefliesCandidateManifest,
  count: number
): Promise<void> {
  const execution = z
    .object({
      candidateManifestHash: z.string(),
      searchBlocked: z.number(),
      transcripts: z.object({ requested: z.number(), complete: z.number(), blocked: z.literal(0) }),
    })
    .safeParse(
      await readPrivateJson(path.join(runDirectory, 'fireflies_inventory_execution.json'))
    );
  requireBounded(
    execution.success &&
      execution.data.candidateManifestHash === manifest.manifestHash &&
      execution.data.searchBlocked === manifest.counts.incompleteSearches &&
      execution.data.transcripts.requested === count &&
      execution.data.transcripts.complete === count,
    'Candidate execution receipt is inconsistent'
  );
}
async function checkReplay(
  runDirectory: string,
  manifest: FirefliesCandidateManifest,
  records: readonly unknown[],
  coverage: BoundedCoverage,
  options: CacheReplayVerification
): Promise<void> {
  const receipt = z
    .object({
      manifestHash: z.string(),
      inventoryHash: z.string(),
      runAt: z.string(),
      profilesHash: z.string(),
      rowsHash: z.string(),
      coverageHash: z.unknown().optional(),
    })
    .safeParse(await readPrivateJson(path.join(runDirectory, 'fireflies_bounded_replay.json')));
  const ids = z.array(z.object({ opportunityId: z.string() }));
  const profiles = ids.safeParse(options.profiles);
  const rows = ids.safeParse(options.rows);
  requireBounded(
    receipt.success &&
      profiles.success &&
      rows.success &&
      rows.data.length === profiles.data.length &&
      new Set(rows.data.map((row) => row.opportunityId)).size === profiles.data.length &&
      profiles.data.every((profile) =>
        rows.data.some((row) => row.opportunityId === profile.opportunityId)
      ) &&
      receipt.data.manifestHash === manifest.manifestHash &&
      receipt.data.inventoryHash === sha256Json(records) &&
      receipt.data.runAt === manifest.asOf &&
      receipt.data.profilesHash === sha256Json(options.profiles) &&
      receipt.data.rowsHash === sha256Json(options.rows),
    'Bounded replay is not bound to the exact consumed evidence, identities, and rows'
  );
  requireBounded(
    (coverage.resolutions.length === 0 && receipt.data.coverageHash === undefined) ||
      receipt.data.coverageHash === sha256Json(coverage),
    'Bounded replay conditional coverage changed'
  );
}
function matchingProfiles(options: CacheReplayVerification, inputs: BoundedInputs): void {
  if (options.profiles !== undefined && options.profiles !== null)
    requireBounded(
      sha256Json(options.profiles) === sha256Json(inputs.profiles),
      'Consumed identities do not match candidate planning'
    );
}
export async function readBoundedRunProof(
  runDirectory: string,
  records: readonly unknown[],
  runAt: string | Date,
  options: CacheReplayVerification = {}
): Promise<BoundedRunProof | null> {
  const saved = await optionalPrivateJson(path.join(runDirectory, BOUNDED_MANIFEST_FILE));
  const rawProof = await optionalPrivateJson(path.join(runDirectory, BOUNDED_PROOF_FILE));
  const mode = z
    .object({ mode: z.unknown().optional() })
    .safeParse(
      await optionalPrivateJson(path.join(runDirectory, 'fireflies_collection_mode.json'))
    );
  if (saved === undefined && rawProof === undefined && mode.data?.mode !== 'bounded-fresh')
    return null;
  const { manifest, inputs } = await currentCandidateManifest(runDirectory);
  const proof = proofSchema.safeParse(rawProof);
  requireBounded(
    proof.success &&
      proof.data.runId === manifest.runId &&
      proof.data.asOf === manifest.asOf &&
      manifest.asOf === (runAt instanceof Date ? runAt.toISOString() : runAt) &&
      proof.data.manifestHash === manifest.manifestHash &&
      proof.data.inventoryHash === sha256Json(records),
    'Bounded inventory finalization is missing, pending, or mismatched'
  );
  verifyCandidateInventory(manifest, records);
  const coverage = resolveBoundedCoverage(manifest, inputs, records);
  await checkExecution(runDirectory, manifest, records.length);
  matchingProfiles(options, inputs);
  if (options.requireReplay === true)
    await checkReplay(runDirectory, manifest, records, coverage, options);
  return { manifest, proof: proof.data, coverage };
}
