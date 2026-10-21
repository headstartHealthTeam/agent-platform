import fs from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { requireContract as check } from './connector-checkpoint.js';
import {
  loadCommandStagePayload,
  loadPublicationCommandBinding,
  loadPublicationCommandObservations,
  readPublicationJson,
} from './publication-command-storage.js';
import type { PublicationActual, PublicationReadback } from './publication-readback-types.js';
import {
  evaluatePublicationReadback,
  recordPublicationStageReadback,
  verifyFinalPublicationActual,
} from './publication-readback.js';

function assertActual(value: unknown): asserts value is PublicationActual {
  // Keep all raw assertion fields and metadata for the evidence hash. Individual verifiers own
  // narrowing values, formats, coordinates and pixels only when that assertion consumes them.
  check(
    z.object({ assertions: z.array(z.object({ id: z.string() })).nullish() }).safeParse(value)
      .success,
    'Invalid actual publication capture'
  );
}
export interface RecordedPublicationReadback {
  readonly recorded: string;
  readonly verifiedAssertions: number;
  readonly nextStage: string | null;
}
/** Record supplied live evidence without authorizing or dispatching any provider write. */
export async function capturePreparedStageReadback({
  runDirectory,
  stageId,
  actualFile,
}: {
  readonly runDirectory: string;
  readonly stageId: string;
  readonly actualFile: string;
}): Promise<RecordedPublicationReadback> {
  const directory = path.resolve(runDirectory);
  const { manifest } = await loadPublicationCommandBinding(directory);
  const stage = manifest.stages.find((candidate) => candidate.id === stageId);
  check(stage !== undefined, `Unknown publication stage: ${stageId}`);
  await fs.access(path.resolve(actualFile));
  const appliedPayload = await loadCommandStagePayload(directory, stage);
  const observations = await loadPublicationCommandObservations(directory, manifest);
  const actual = await readPublicationJson(path.resolve(actualFile));
  assertActual(actual);
  const updated = recordPublicationStageReadback({
    manifest,
    observations,
    stageId: stage.id,
    appliedPayload,
    actual,
  });
  const observationsPath = path.join(directory, 'publication_stage_readbacks.json');
  const temporary = `${observationsPath}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(updated, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporary, observationsPath);
  const assertions = updated.stages.at(-1)?.assertions;
  check(Array.isArray(assertions), 'Missing recorded assertion result');
  return {
    recorded: stage.id,
    verifiedAssertions: assertions.length,
    nextStage:
      manifest.stages.find((candidate) => {
        const satisfied = Boolean(candidate.alreadySatisfied);
        return !satisfied && !updated.stages.some((item) => item.id === candidate.id);
      })?.id ?? null,
  };
}
export type VerifiedPreparedPublication =
  | {
      readonly exitCode: 2;
      readonly result: PublicationReadback;
    }
  | {
      readonly exitCode: 0;
      readonly result: PublicationReadback & {
        readonly finalReadback: ReturnType<typeof verifyFinalPublicationActual>;
      };
    };
/** The manual captured-readback path retains the approved single supplied final sample contract. */
export async function verifyPreparedPublication({
  runDirectory,
  actualFile,
}: {
  readonly runDirectory: string;
  readonly actualFile: string;
}): Promise<VerifiedPreparedPublication> {
  const directory = path.resolve(runDirectory);
  await fs.access(path.join(directory, 'publication_stages_manifest.json'));
  await fs.access(path.join(directory, 'publication_stage_readbacks.json'));
  await fs.access(path.resolve(actualFile));
  const { manifest } = await loadPublicationCommandBinding(directory);
  for (const stage of manifest.stages) await loadCommandStagePayload(directory, stage);
  const observations = await loadPublicationCommandObservations(directory, manifest, false);
  const result = evaluatePublicationReadback(manifest, observations);
  if (!result.complete) return { exitCode: 2, result };
  const actual = await readPublicationJson(path.resolve(actualFile));
  assertActual(actual);
  const finalReadback = verifyFinalPublicationActual(manifest, actual);
  await fs.writeFile(
    path.join(directory, 'publication-readback.json'),
    `${JSON.stringify({ ...result, verifiedAt: new Date().toISOString(), finalReadback }, null, 2)}\n`,
    { mode: 0o600 }
  );
  return { exitCode: 0, result: { ...result, finalReadback } };
}
