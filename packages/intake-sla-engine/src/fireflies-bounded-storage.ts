import fs from 'node:fs/promises';
import path from 'node:path';

import { normalizeFirefliesConnectorBody } from '@headstart-health/fireflies-data';
import type { CompleteFirefliesTranscript } from '@headstart-health/fireflies-data';
import { z } from 'zod';

import { FIREFLIES_BOUNDED_VERSION, requireBounded } from './fireflies-bounded-contract.js';
import type { CandidateMeeting, FirefliesCandidateManifest } from './fireflies-bounded-contract.js';
import {
  BODY_CHECKPOINT_DIRECTORY,
  BOUNDED_INVENTORY_FILE,
  BOUNDED_MANIFEST_FILE,
  BOUNDED_PROOF_FILE,
  bodyItemName,
  boundedInputs,
  currentCandidateManifest,
  rawBodyCaptureName,
  savedCandidateBodies,
  withMutableBoundedRun,
} from './fireflies-bounded-files.js';
import { readBoundedRunProof } from './fireflies-bounded-proof.js';
import { buildFirefliesCandidateManifest } from './fireflies-bounded.js';
import { validateCandidateBody, verifyCandidateInventory } from './fireflies-candidate-body.js';
import { selectFirefliesCollectionMode } from './fireflies-collection-mode.js';
import { sha256Json } from './json-fingerprint.js';
import {
  atomicPrivateWrite,
  filesystemCode,
  optionalPrivateJson,
  privateDirectory,
  writeIdenticalOrNew,
  writePrivateJson,
} from './private-run-storage.js';

export async function planBoundedCollection(
  runDirectory: string
): Promise<FirefliesCandidateManifest['counts'] & { status: 'Planned'; mode: 'bounded-fresh' }> {
  return withMutableBoundedRun(runDirectory, async (directory) => {
    const manifest = buildFirefliesCandidateManifest(await boundedInputs(directory));
    await selectFirefliesCollectionMode(directory, manifest);
    await writeIdenticalOrNew(path.join(directory, BOUNDED_MANIFEST_FILE), manifest);
    return { status: 'Planned', mode: manifest.mode, ...manifest.counts };
  });
}
function bodyItem(
  manifest: FirefliesCandidateManifest,
  record: CompleteFirefliesTranscript
): object {
  return {
    version: FIREFLIES_BOUNDED_VERSION,
    manifestHash: manifest.manifestHash,
    recordHash: sha256Json(record),
    record,
  };
}
interface PreparedFile {
  file: string;
  value: unknown;
}
async function checkPrepared(items: readonly PreparedFile[], message: string): Promise<void> {
  for (const item of items) {
    const previous = await optionalPrivateJson(item.file);
    requireBounded(
      previous === undefined || sha256Json(previous) === sha256Json(item.value),
      message
    );
  }
}
export async function acceptCandidateBodies(
  runDirectory: string,
  capture: unknown
): Promise<{ status: 'Checkpointed'; accepted: number }> {
  return withMutableBoundedRun(runDirectory, async (directory) => {
    const { manifest } = await currentCandidateManifest(directory);
    const parsed = z
      .object({
        version: z.literal(FIREFLIES_BOUNDED_VERSION),
        runId: z.string(),
        manifestHash: z.string(),
        records: z.array(z.unknown()).min(1),
      })
      .safeParse(capture);
    requireBounded(
      parsed.success &&
        parsed.data.runId === manifest.runId &&
        parsed.data.manifestHash === manifest.manifestHash,
      'Capture is not bound to this candidate manifest'
    );
    const records = parsed.data.records.map((record) => validateCandidateBody(manifest, record));
    requireBounded(
      new Set(records.map((record) => record.transcriptId)).size === records.length,
      'Duplicate bodies in capture'
    );
    const itemsDirectory = await privateDirectory(path.join(directory, BODY_CHECKPOINT_DIRECTORY));
    const items = records.map((record) => ({
      file: path.join(itemsDirectory, bodyItemName(record.transcriptId)),
      value: bodyItem(manifest, record),
    }));
    await checkPrepared(items, 'Accepted body checkpoint differs');
    for (const item of items) await writeIdenticalOrNew(item.file, item.value);
    return { status: 'Checkpointed', accepted: items.length };
  });
}
export async function captureCandidateResponse(
  runDirectory: string,
  {
    index,
    capture: input,
  }: {
    readonly index: number;
    readonly capture?: unknown;
  }
): Promise<{ status: 'Checkpointed'; accepted: 1 }> {
  return withMutableBoundedRun(runDirectory, async (directory) => {
    const { manifest } = await currentCandidateManifest(directory);
    const expected = manifest.meetings.at(index);
    requireBounded(
      Number.isSafeInteger(index) && index >= 0 && expected !== undefined,
      'Invalid candidate index'
    );
    const rawFile = path.join(directory, rawBodyCaptureName(index));
    const retained = await optionalPrivateJson(rawFile);
    const capture = input === undefined ? retained : input;
    requireBounded(
      capture !== undefined &&
        (retained === undefined || sha256Json(retained) === sha256Json(capture)),
      'Raw capture differs; retain the first response and do not refetch completed work'
    );
    const { record, provenance } = normalizeFirefliesConnectorBody({ expected, capture });
    validateCandidateBody(manifest, record);
    const receiptFile = path.join(directory, `fireflies_body_normalization_${String(index)}.json`);
    const receipt = {
      version: 1,
      rawCaptureHash: sha256Json(capture),
      ...provenance,
      runId: manifest.runId,
      manifestHash: manifest.manifestHash,
    };
    const itemsDirectory = await privateDirectory(path.join(directory, BODY_CHECKPOINT_DIRECTORY));
    const file = path.join(itemsDirectory, bodyItemName(record.transcriptId));
    const item = bodyItem(manifest, record);
    await checkPrepared(
      [
        { file, value: item },
        { file: receiptFile, value: receipt },
      ],
      'Accepted body or normalization receipt differs'
    );
    await writeIdenticalOrNew(rawFile, capture);
    await writeIdenticalOrNew(receiptFile, receipt);
    await writeIdenticalOrNew(file, item);
    return { status: 'Checkpointed', accepted: 1 };
  });
}
export interface PendingCandidate extends CandidateMeeting {
  index: number;
  captureFile: string;
  action: 'Fetch' | 'Resume capture';
}
export interface BoundedCollectionStatus {
  status: 'Pending' | 'Ready to finalize';
  saved: number;
  pending: number;
  blockedRows: number;
}
export async function boundedCollectionStatus(
  runDirectory: string
): Promise<BoundedCollectionStatus> {
  return withMutableBoundedRun(runDirectory, async (directory) => {
    const { manifest } = await currentCandidateManifest(directory);
    const records = await savedCandidateBodies(directory, manifest);
    const saved = new Set(records.map((record) => record.transcriptId));
    const pending: PendingCandidate[] = [];
    for (const [index, meeting] of manifest.meetings.entries()) {
      if (saved.has(meeting.transcriptId)) continue;
      const captureFile = rawBodyCaptureName(index);
      const retained = await optionalPrivateJson(path.join(directory, captureFile));
      pending.push({
        ...meeting,
        index,
        captureFile,
        action: retained === undefined ? 'Fetch' : 'Resume capture',
      });
    }
    await writePrivateJson(path.join(directory, 'fireflies_pending_fetches.json'), {
      version: FIREFLIES_BOUNDED_VERSION,
      runId: manifest.runId,
      manifestHash: manifest.manifestHash,
      meetings: pending,
      retrieval: {
        primaryTool: 'fireflies_fetch',
        fallbackTool: 'fireflies_get_transcript',
        maxAttemptsPerTool: 2,
      },
    });
    return {
      status: pending.length > 0 ? 'Pending' : 'Ready to finalize',
      saved: records.length,
      pending: pending.length,
      blockedRows: manifest.counts.blockedRows,
    };
  });
}
async function completedInventory(directory: string): Promise<unknown[]> {
  return (await fs.readFile(path.join(directory, BOUNDED_INVENTORY_FILE), 'utf8'))
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line): unknown => JSON.parse(line));
}
async function checkPriorFinalization(
  directory: string,
  manifest: FirefliesCandidateManifest,
  records: readonly CompleteFirefliesTranscript[]
): Promise<boolean> {
  const prior = await optionalPrivateJson(path.join(directory, BOUNDED_PROOF_FILE));
  const state = z
    .object({ status: z.unknown().optional(), manifestHash: z.unknown().optional() })
    .safeParse(prior);
  if (state.data?.status === 'Complete') {
    const current = await completedInventory(directory);
    await readBoundedRunProof(directory, current, manifest.asOf);
    requireBounded(
      sha256Json(current) === sha256Json(records),
      'Final inventory differs from accepted checkpoints'
    );
    return true;
  }
  const present = Boolean(prior);
  if (!present) {
    const existing = await fs
      .lstat(path.join(directory, BOUNDED_INVENTORY_FILE))
      .catch((error: unknown) => {
        if (filesystemCode(error, 'ENOENT')) return null;
        throw error;
      });
    requireBounded(
      existing === null,
      'Refusing to replace an inventory not owned by this bounded collection'
    );
  } else
    requireBounded(
      state.data?.manifestHash === manifest.manifestHash,
      'Existing finalization belongs to a different manifest'
    );
  return false;
}
export async function finalizeBoundedCollection(
  runDirectory: string
): Promise<{ status: 'Finalized'; transcripts: number; blockedRows: number }> {
  return withMutableBoundedRun(runDirectory, async (directory) => {
    const { manifest } = await currentCandidateManifest(directory);
    const records = await savedCandidateBodies(directory, manifest);
    verifyCandidateInventory(manifest, records);
    const result = {
      status: 'Finalized' as const,
      transcripts: records.length,
      blockedRows: manifest.counts.blockedRows,
    };
    if (await checkPriorFinalization(directory, manifest, records)) return result;
    const proof = {
      version: FIREFLIES_BOUNDED_VERSION,
      status: 'Complete',
      runId: manifest.runId,
      asOf: manifest.asOf,
      manifestHash: manifest.manifestHash,
      inventoryHash: sha256Json(records),
      counts: manifest.counts,
    };
    await writePrivateJson(path.join(directory, BOUNDED_PROOF_FILE), {
      ...proof,
      status: 'Pending',
    });
    await atomicPrivateWrite(
      path.join(directory, BOUNDED_INVENTORY_FILE),
      `${records.map((record) => JSON.stringify(record)).join('\n')}\n`
    );
    await writePrivateJson(path.join(directory, 'fireflies_inventory_execution.json'), {
      candidateManifestHash: manifest.manifestHash,
      searchBlocked: manifest.counts.incompleteSearches,
      transcripts: { requested: records.length, complete: records.length, blocked: 0 },
    });
    await writePrivateJson(path.join(directory, BOUNDED_PROOF_FILE), proof);
    return result;
  });
}
