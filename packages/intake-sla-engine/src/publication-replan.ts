import { requireContract as check } from './connector-checkpoint.js';
import { captureProperty } from './google-capture-property.js';
import { sha256Json } from './json-fingerprint.js';
import { publicationPlanHash } from './publication-plan.js';
import type {
  PublicationManifest,
  PublicationManifestInput,
  PublicationObservations,
  PublicationStageInput,
  PublicationStageObservation,
} from './publication-readback-types.js';
import { evaluatePublicationReadback } from './publication-readback.js';
import type { PublicationCallBinding } from './publication-replan-types.js';

const CAPACITY_FAILURE =
  'Capacity-only replan requires unchanged verified capacity and a pre-dispatch size rejection';
const CELL_FAILURE =
  'Rejected-cell replan requires exact completed stages/calls and a definitive atomic Google validation rejection';
function list(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}
function text(value: unknown): string {
  return String(value);
}
function stages(observations: PublicationObservations): readonly PublicationStageObservation[] {
  if (observations.stages === null || observations.stages === undefined)
    throw new TypeError('Missing observed stages');
  return observations.stages;
}
function calls(stage: PublicationStageInput): readonly PublicationCallBinding[] {
  if (stage.calls === null || stage.calls === undefined)
    throw new TypeError('Missing publication calls');
  return stage.calls;
}
function sameTargetAndValidPlan(
  previous: PublicationManifestInput,
  next: PublicationManifestInput
): boolean {
  return (
    previous.runId === next.runId &&
    previous.spreadsheetId === next.spreadsheetId &&
    next.planHash === publicationPlanHash(next.stages, next.finalAssertions)
  );
}
/** Only the exact verified capacity stage survives a definitive pre-dispatch size rejection. */
export function retainCapacityOnlyReadback<T extends PublicationObservations>(
  previous: PublicationManifestInput,
  next: PublicationManifestInput,
  observations: T,
  rejection: unknown
): T & {
  planHash: string;
  capacityReplan: {
    priorPlanHash: string;
    rejectionHash: string;
    capacityEvidenceHash: unknown;
  };
} {
  evaluatePublicationReadback(previous, observations);
  check(
    sameTargetAndValidPlan(previous, next) &&
      stages(observations).length === 1 &&
      stages(observations)[0]?.id === '01-capacity' &&
      sha256Json(previous.stages[0]) === sha256Json(next.stages[0]) &&
      captureProperty(rejection, 'priorPlanHash') === previous.planHash &&
      captureProperty(rejection, 'stageId') === '02-review-queue' &&
      captureProperty(rejection, 'callIndex') === 0 &&
      capacityRejectionResponse(captureProperty(rejection, 'response')),
    CAPACITY_FAILURE
  );
  const retained = {
    ...observations,
    planHash: next.planHash,
    capacityReplan: {
      priorPlanHash: previous.planHash,
      rejectionHash: sha256Json(rejection),
      capacityEvidenceHash: stages(observations)[0]?.evidenceHash,
    },
  };
  evaluatePublicationReadback(next, retained);
  return retained;
}
function capacityRejectionResponse(response: unknown): boolean {
  if (captureProperty(response, 'isError') !== true) return false;
  const content = captureProperty(response, 'content');
  if (content === null || content === undefined) return false;
  if (!list(content)) throw new TypeError('Invalid rejection content');
  return content.some((block) => {
    if (block === null || block === undefined)
      throw new TypeError('Missing rejection content block');
    return (
      captureProperty(block, 'type') === 'text' &&
      text(captureProperty(block, 'text')).includes(
        'Automatic approval review failed: Guardian action exceeds the 200000-byte review limit'
      )
    );
  });
}
function definitiveCellRejection(
  rejection: unknown,
  previous: PublicationManifestInput,
  nextStage: string | null
): boolean {
  const response = captureProperty(rejection, 'response');
  const structured = captureProperty(response, 'structuredContent');
  return (
    captureProperty(rejection, 'priorPlanHash') === previous.planHash &&
    captureProperty(rejection, 'stageId') === nextStage &&
    nextStage === '04-evidence-detail' &&
    captureProperty(response, 'isError') === true &&
    captureProperty(structured, 'error_code') === 'INVALID_ARGUMENT' &&
    text(captureProperty(structured, 'error') ?? '').includes(
      'maximum of 50000 characters in a single cell'
    )
  );
}
function exactAcknowledgedPrefix(
  applied: readonly unknown[],
  oldStage: PublicationStageInput,
  newStage: PublicationStageInput,
  spreadsheetId: string
): boolean {
  return applied.every(
    (call, index) =>
      captureProperty(call, 'file') === calls(oldStage).at(index)?.file &&
      captureProperty(call, 'payloadHash') === calls(oldStage).at(index)?.payloadHash &&
      sha256Json(calls(oldStage).at(index)) === sha256Json(calls(newStage).at(index)) &&
      captureProperty(captureProperty(call, 'response'), 'isError') === false &&
      captureProperty(
        captureProperty(captureProperty(call, 'response'), 'structuredContent'),
        'spreadsheetId'
      ) === spreadsheetId
  );
}
export function retainRejectedCellReadback<T extends PublicationObservations>(
  previous: PublicationManifestInput,
  next: PublicationManifestInput,
  observations: T,
  rejection: unknown
): {
  observations: T & {
    planHash: string;
    rejectedCellReplan: { priorPlanHash: string; rejectionHash: string };
  };
  resume: {
    version: 1;
    runId: string;
    spreadsheetId: string;
    planHash: string;
    stageId: string;
    appliedCalls: { file: unknown; payloadHash: unknown }[];
    rejectionHash: string;
  };
} {
  const status = evaluatePublicationReadback(previous, observations);
  const oldStage = previous.stages.find((stage) => stage.id === status.nextStage);
  const newStage = next.stages.find((stage) => stage.id === status.nextStage);
  const applied = captureProperty(rejection, 'appliedCalls');
  const callIndex = captureProperty(rejection, 'callIndex');
  check(
    sameTargetAndValidPlan(previous, next) &&
      definitiveCellRejection(rejection, previous, status.nextStage) &&
      list(applied) &&
      applied.length === callIndex &&
      oldStage !== undefined &&
      newStage !== undefined &&
      callIndex < calls(oldStage).length &&
      exactAcknowledgedPrefix(applied, oldStage, newStage, previous.spreadsheetId) &&
      stages(observations).every(
        (observed) =>
          sha256Json(previous.stages.find((stage) => stage.id === observed.id)) ===
          sha256Json(next.stages.find((stage) => stage.id === observed.id))
      ),
    CELL_FAILURE
  );
  const retained = {
    ...observations,
    planHash: next.planHash,
    rejectedCellReplan: { priorPlanHash: previous.planHash, rejectionHash: sha256Json(rejection) },
  };
  evaluatePublicationReadback(next, retained);
  return {
    observations: retained,
    resume: {
      version: 1,
      runId: next.runId,
      spreadsheetId: next.spreadsheetId,
      planHash: next.planHash,
      stageId: newStage.id,
      appliedCalls: applied.map((call) => ({
        file: captureProperty(call, 'file'),
        payloadHash: captureProperty(call, 'payloadHash'),
      })),
      rejectionHash: sha256Json(rejection),
    },
  };
}
export function remainingPublicationCalls<T extends PublicationCallBinding>(
  manifest: Pick<PublicationManifest, 'runId' | 'spreadsheetId' | 'planHash'>,
  stage: { readonly id: string; readonly calls: readonly T[] },
  resume?: unknown
): readonly T[];
export function remainingPublicationCalls<T extends PublicationCallBinding>(
  manifest: Pick<PublicationManifest, 'runId' | 'spreadsheetId' | 'planHash'>,
  stage: { readonly id: string; readonly calls?: readonly T[] | null },
  resume?: unknown
): readonly T[] | null | undefined;
export function remainingPublicationCalls<T extends PublicationCallBinding>(
  manifest: Pick<PublicationManifest, 'runId' | 'spreadsheetId' | 'planHash'>,
  stage: { readonly id: string; readonly calls?: readonly T[] | null },
  resume?: unknown
): readonly T[] | null | undefined {
  if (captureProperty(resume, 'stageId') !== stage.id) return stage.calls;
  const applied = captureProperty(resume, 'appliedCalls');
  const isArray = (value: unknown): value is readonly unknown[] => Array.isArray(value);
  check(
    captureProperty(resume, 'runId') === manifest.runId &&
      captureProperty(resume, 'spreadsheetId') === manifest.spreadsheetId &&
      captureProperty(resume, 'planHash') === manifest.planHash &&
      /^[a-f0-9]{64}$/.test(text(captureProperty(resume, 'rejectionHash') ?? '')) &&
      isArray(applied) &&
      applied.every((call, index) => sha256Json(call) === sha256Json(stage.calls?.at(index))),
    'Publication resume prefix differs from the verified replan'
  );
  if (stage.calls === undefined || stage.calls === null)
    throw new TypeError('Missing publication calls');
  return stage.calls.slice(applied.length);
}
