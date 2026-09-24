import fs from 'node:fs/promises';
import path from 'node:path';

import { captureProperty } from './google-capture-property.js';
import { prepareGooglePublicationArtifacts } from './google-publication-artifacts.js';
import type { PreparedPublicationArtifacts } from './google-publication-artifacts.js';
import { readSavedGooglePublicationInputs } from './google-publication-inputs.js';
import { buildGooglePublicationPlan } from './google-publication.js';
import { optionalPrivateJson, requireMutableRun } from './private-run-storage.js';
import {
  assertCommandManifest,
  assertCommandObservations,
  assertCommandPayload,
  commandArtifactPath,
  readPublicationJson,
} from './publication-command-storage.js';
import { assertPublicationStagePayload } from './publication-payload.js';
import type {
  PublicationManifestInput,
  PublicationLoadedCall,
} from './publication-readback-types.js';
import { retainCapacityOnlyReadback, retainRejectedCellReadback } from './publication-replan.js';

const MANIFEST_FILE = 'publication_stages_manifest.json';
const OBSERVATIONS_FILE = 'publication_stage_readbacks.json';

async function writeFiles(directory: string, files: ReadonlyMap<string, unknown>): Promise<void> {
  for (const [name, value] of files)
    await fs.writeFile(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, {
      mode: 0o600,
    });
}
async function archiveStagePayloads(
  runDirectory: string,
  manifest: PublicationManifestInput,
  archive: Map<string, unknown>
): Promise<void> {
  for (const stage of manifest.stages) {
    const payload = await readPublicationJson(commandArtifactPath(runDirectory, stage.file));
    assertCommandPayload(payload);
    if (stage.calls === null || stage.calls === undefined)
      throw new TypeError('Missing publication calls');
    const calls: PublicationLoadedCall[] = await Promise.all(
      stage.calls.map(async (call) => {
        const value = await readPublicationJson(commandArtifactPath(runDirectory, call.file));
        assertCommandPayload(value);
        return { file: call.file, payload: value };
      })
    );
    assertPublicationStagePayload(stage, payload, calls);
    if (typeof stage.file !== 'string') throw new TypeError('Missing stage filename');
    archive.set(stage.file, payload);
    for (const call of calls) {
      if (typeof call.file !== 'string') throw new TypeError('Missing call filename');
      archive.set(call.file, call.payload);
    }
  }
}
async function retainPriorPublication(
  runDirectory: string,
  priorManifest: unknown,
  priorObservations: unknown,
  prepared: PreparedPublicationArtifacts,
  files: Map<string, unknown>,
  rejectionFile?: string
): Promise<void> {
  const priorStages = captureProperty(priorObservations, 'stages');
  const hasStages = Boolean(
    typeof priorStages === 'string' ? priorStages.length : captureProperty(priorStages, 'length')
  );
  if (!hasStages || captureProperty(priorManifest, 'planHash') === prepared.manifest.planHash)
    return;
  if (!rejectionFile)
    throw new Error(
      'Started publication cannot be replanned without a verified capacity-only rejection receipt'
    );
  const rejection = await readPublicationJson(rejectionFile);
  assertCommandManifest(priorManifest);
  assertCommandObservations(priorObservations);
  const recovery =
    captureProperty(rejection, 'stageId') === '04-evidence-detail'
      ? retainRejectedCellReadback(priorManifest, prepared.manifest, priorObservations, rejection)
      : null;
  const retained =
    recovery?.observations ??
    retainCapacityOnlyReadback(priorManifest, prepared.manifest, priorObservations, rejection);
  if (recovery !== null) files.set('publication_stage_resume.json', recovery.resume);
  const archive = new Map<string, unknown>([
    [MANIFEST_FILE, priorManifest],
    [OBSERVATIONS_FILE, priorObservations],
    [
      'publication-gate.json',
      await readPublicationJson(path.join(runDirectory, 'publication-gate.json')),
    ],
    ['rejection.json', rejection],
  ]);
  await archiveStagePayloads(runDirectory, priorManifest, archive);
  const archiveDirectory = path.join(
    runDirectory,
    `publication-superseded-${priorManifest.planHash}`
  );
  await fs.mkdir(archiveDirectory, { mode: 0o700, recursive: true });
  await writeFiles(archiveDirectory, archive);
  files.set(OBSERVATIONS_FILE, retained);
}
/** Prepare local saved payloads only. Archive verified rejected plans; commit the new manifest last. */
export async function prepareSavedGooglePublication({
  runDirectory,
  rejectionFile,
}: {
  readonly runDirectory: string;
  readonly rejectionFile?: string;
}): Promise<PreparedPublicationArtifacts['summary']> {
  await requireMutableRun(runDirectory);
  const priorManifest = await optionalPrivateJson(path.join(runDirectory, MANIFEST_FILE));
  const priorObservations = await optionalPrivateJson(path.join(runDirectory, OBSERVATIONS_FILE));
  const plan = buildGooglePublicationPlan(await readSavedGooglePublicationInputs(runDirectory));
  await fs.rm(path.join(runDirectory, 'google_batch_request.json'), { force: true });
  const prepared = prepareGooglePublicationArtifacts(plan);
  const files = new Map<string, unknown>(prepared.payloads);
  files.set('reviewer_payload_preservation_proof.json', prepared.reviewerProof);
  await retainPriorPublication(
    runDirectory,
    priorManifest,
    priorObservations,
    prepared,
    files,
    rejectionFile
  );
  await writeFiles(runDirectory, files);
  await writeFiles(runDirectory, new Map([[MANIFEST_FILE, prepared.manifest]]));
  return prepared.summary;
}
