import path from 'node:path';

import { requireContract as check } from './connector-checkpoint.js';
import { optionalPrivateJson } from './private-run-storage.js';
import {
  loadCommandStagePayload,
  loadPublicationCommandState,
} from './publication-command-storage.js';
import { assertPublicationGateFreshness } from './publication-freshness.js';
import type { PublicationStage } from './publication-readback-types.js';
import { nextPublicationStage } from './publication-readback.js';
import { remainingPublicationCalls } from './publication-replan.js';

export type NextPreparedPublicationStage =
  | { readonly complete: true }
  | {
      readonly complete: false;
      readonly stageId: string;
      readonly file: unknown;
      readonly calls: PublicationStage['calls'];
      readonly payloadHash: unknown;
    };
/** Saved-run inspection only. Expired write leases remain inspectable when no write stage remains. */
export async function readNextPublicationStage(
  runDirectory: string
): Promise<NextPreparedPublicationStage> {
  const directory = path.resolve(runDirectory);
  const { manifest, gate, observations } = await loadPublicationCommandState(directory);
  const next = nextPublicationStage(manifest, observations);
  const resume = await optionalPrivateJson(path.join(directory, 'publication_stage_resume.json'));
  if (next.complete) return { complete: true };
  check(next.stage !== undefined, 'Publication next stage is missing');
  assertPublicationGateFreshness(gate);
  await loadCommandStagePayload(directory, next.stage);
  assertPublicationGateFreshness(gate);
  return {
    complete: false,
    stageId: next.stage.id,
    file: next.stage.file,
    calls: remainingPublicationCalls(manifest, next.stage, resume),
    payloadHash: next.stage.payloadHash,
  };
}
