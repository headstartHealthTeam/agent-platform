import fs from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { requireContract as check } from './connector-checkpoint.js';
import type { CorrectionBaseManifest } from './correction-run.js';
import { prepareCorrection } from './correction-run.js';
import { normalizePortalAuthCapture } from './portal-auth-capture.js';
import { postCutoffDisposition } from './post-cutoff-disposition.js';
import {
  localArtifactPath,
  privateDirectory,
  readPrivateJson,
  requireMutableRun,
  withCacheLock,
  withRunCheckpointLock,
  writeIdenticalOrNew,
  writePrivateJson,
} from './private-run-storage.js';
import {
  assertCommandGate,
  assertCommandManifest,
  assertCommandObservations,
  assertCommandPayload,
} from './publication-command-storage.js';
import { assertPublicationStagePayload } from './publication-payload.js';
import type { PublicationLoadedCall, PublicationStageInput } from './publication-readback-types.js';
import {
  STRUCTURED_CORRECTION_ARTIFACTS,
  structuredCorrectionDelta,
} from './structured-correction.js';
import type {
  StructuredCorrectionRecord,
  StructuredCorrectionSnapshot,
} from './structured-correction.js';

const INITIALIZATION = 'correction_initialization.json';
const LEDGER = 'generation_ledger_state.json';

export async function savePortalAuthCapture(
  runDirectory: string,
  inputFile: string
): Promise<{
  readonly complete: true;
  readonly total: number;
  readonly active: number;
  readonly inactive: number;
}> {
  const directory = await privateDirectory(runDirectory);
  const capture = await readPrivateJson(inputFile);
  const inventory = normalizePortalAuthCapture(capture);
  await withRunCheckpointLock(directory, async () => {
    await requireMutableRun(directory);
    await writeIdenticalOrNew(path.join(directory, 'portal_auth_request_capture.json'), capture);
    await writeIdenticalOrNew(
      path.join(directory, 'portal_auth_request_inventory.json'),
      inventory
    );
  });
  return { complete: true, ...inventory.counts };
}
async function verifyStageFiles(directory: string, stage: PublicationStageInput): Promise<void> {
  const payload = await readPrivateJson(localArtifactPath(directory, stage.file));
  assertCommandPayload(payload);
  const calls: PublicationLoadedCall[] = [];
  for (const call of stage.calls ?? []) {
    const value = await readPrivateJson(localArtifactPath(directory, call.file));
    assertCommandPayload(value);
    calls.push({ file: call.file, payload: value });
  }
  assertPublicationStagePayload(stage, payload, calls);
}
const baseSchema = z.object({
  runId: z.string(),
  startedAt: z.string(),
  expectedRows: z.number(),
  processedRows: z.number(),
});
function assertBase(value: unknown): asserts value is CorrectionBaseManifest {
  check(baseSchema.safeParse(value).success, 'Invalid base run manifest');
}
export async function initializeSavedCorrection(input: {
  readonly baseDirectory: string;
  readonly runDirectory: string;
  readonly runId: string;
  readonly asOf: string;
}): Promise<{
  readonly initialized: true;
  readonly ledgerRows: number;
  readonly sourceRowsReused: 0;
}> {
  const baseDirectory = await fs.realpath(input.baseDirectory);
  const directory = await privateDirectory(input.runDirectory);
  check(
    directory !== baseDirectory && !directory.startsWith(baseDirectory + path.sep),
    'Base run is immutable'
  );
  const read = (name: string): Promise<unknown> => readPrivateJson(path.join(baseDirectory, name));
  const stageManifest = await read('publication_stages_manifest.json');
  assertCommandManifest(stageManifest);
  for (const stage of stageManifest.stages) await verifyStageFiles(baseDirectory, stage);
  const baseManifest = await read('run_manifest.json');
  assertBase(baseManifest);
  const gate = await read('publication-gate.json');
  assertCommandGate(gate);
  const observations = await read('publication_stage_readbacks.json');
  assertCommandObservations(observations);
  const result = prepareCorrection({
    baseManifest,
    stageManifest,
    gate,
    observations,
    finalReceipt: await read('publication-readback.json'),
    ledger: await read(LEDGER),
    runId: input.runId,
    asOf: input.asOf,
  });
  await withCacheLock(directory, async () => {
    await requireMutableRun(directory);
    const allowed = new Set(['.writer-lock', 'correction_provenance.json', LEDGER, INITIALIZATION]);
    check(
      !(await fs.readdir(directory)).some((name) => !allowed.has(name) && !name.endsWith('.tmp')),
      'Correction directory is not new'
    );
    await writeIdenticalOrNew(
      path.join(directory, 'correction_provenance.json'),
      result.provenance
    );
    await writeIdenticalOrNew(path.join(directory, LEDGER), result.ledgerState);
    await writeIdenticalOrNew(path.join(directory, INITIALIZATION), {
      ...result.provenance,
      complete: true,
    });
  });
  return { initialized: true, ledgerRows: result.ledgerState.length, sourceRowsReused: 0 };
}
const structuredRowsSchema = z.array(
  z.looseObject({ Id: z.string().nullish(), opportunityId: z.string().nullish() })
);
async function readStructured(directory: string): Promise<StructuredCorrectionSnapshot> {
  const entries = await Promise.all(
    STRUCTURED_CORRECTION_ARTIFACTS.map(
      async (name): Promise<[string, StructuredCorrectionRecord[]]> => {
        const parsed = structuredRowsSchema.safeParse(
          await readPrivateJson(path.join(directory, name))
        );
        check(parsed.success, 'Invalid structured correction artifact');
        return [name, parsed.data];
      }
    )
  );
  return Object.fromEntries(entries);
}
export async function saveStructuredCorrectionDelta(
  baseDirectory: string,
  runDirectory: string
): Promise<{
  readonly changedRecords: number;
  readonly affected: number;
  readonly removed: number;
  readonly unchanged: number;
}> {
  const directory = await privateDirectory(runDirectory);
  const result = structuredCorrectionDelta({
    before: await readStructured(baseDirectory),
    after: await readStructured(directory),
  });
  await withCacheLock(directory, async () => {
    await requireMutableRun(directory);
    await writePrivateJson(path.join(directory, 'structured_correction_delta.json'), result);
  });
  return {
    changedRecords: result.changes.length,
    affected: result.affected.length,
    removed: result.removed.length,
    unchanged: result.unchanged.length,
  };
}
const change = z.union([z.string(), z.looseObject({ id: z.string().nullish() }), z.null()]);
const changes = z.looseObject({
  added: z.array(change).nullish(),
  removed: z.array(change).nullish(),
  stage: z.array(change).nullish(),
  onHold: z.array(change).nullish(),
  currentSla: z.array(change).nullish(),
});
const refreshSchema = z.looseObject({
  organizationId: z.string().nullish(),
  isSandbox: z.unknown().optional(),
  queriedAt: z.string(),
  changes,
});
const postCaptureSchema = z.looseObject({
  organizationId: z.string().nullish(),
  isSandbox: z.unknown().optional(),
  checkedAt: z.string(),
  salesforceReadOnly: z.unknown().optional(),
  records: z.array(
    z.looseObject({
      Id: z.string(),
      LastModifiedDate: z.string(),
      StageName: z.string().nullish(),
      On_Hold__c: z.boolean().nullish(),
    })
  ),
});
export async function savePostCutoffCapture(
  runDirectory: string,
  inputFile: string
): Promise<{
  readonly deferredRecords: number;
  readonly salesforceWrites: 0;
}> {
  const directory = await privateDirectory(runDirectory);
  return withCacheLock(directory, async () => {
    await requireMutableRun(directory);
    const manifest = z
      .object({ startedAt: z.string() })
      .safeParse(await readPrivateJson(path.join(directory, 'run_manifest.json')));
    const refresh = refreshSchema.safeParse(
      await readPrivateJson(path.join(directory, 'salesforce_cohort_refresh.json'))
    );
    const capture = postCaptureSchema.safeParse(await readPrivateJson(inputFile));
    check(
      manifest.success && refresh.success && capture.success,
      'Invalid post-cutoff capture artifacts'
    );
    check(
      capture.data.organizationId === refresh.data.organizationId &&
        capture.data.isSandbox === false &&
        refresh.data.isSandbox === false &&
        Boolean(refresh.data.organizationId) &&
        capture.data.checkedAt === refresh.data.queriedAt,
      'Production identity or capture time mismatch'
    );
    const disposition = postCutoffDisposition({
      runCutoff: manifest.data.startedAt,
      changes: refresh.data.changes,
      records: capture.data.records,
      checkedAt: capture.data.checkedAt,
      salesforceReadOnly: capture.data.salesforceReadOnly,
    });
    await writePrivateJson(path.join(directory, 'salesforce_cohort_refresh.json'), {
      ...refresh.data,
      postCutoffDisposition: disposition,
    });
    return { deferredRecords: disposition.records.length, salesforceWrites: 0 };
  });
}
