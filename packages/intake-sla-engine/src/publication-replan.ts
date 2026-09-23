import { requireContract as check } from './connector-checkpoint.js';
import { sha256Json } from './json-fingerprint.js';
import { publicationPlanHash } from './publication-plan.js';
import type {
  PublicationManifest,
  PublicationObservations,
  PublicationStage,
  PublicationStageObservation,
} from './publication-readback-types.js';
import { evaluatePublicationReadback } from './publication-readback.js';
import type {
  PublicationAcknowledgedCall,
  PublicationCallBinding,
  PublicationRejection,
  PublicationResume,
} from './publication-replan-types.js';

const CAPACITY_FAILURE =
  'Capacity-only replan requires unchanged verified capacity and a pre-dispatch size rejection';
const CELL_FAILURE =
  'Rejected-cell replan requires exact completed stages/calls and a definitive atomic Google validation rejection';
function list<T>(value: readonly T[] | null | undefined): value is readonly T[] {
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
function calls(stage: PublicationStage): readonly PublicationCallBinding[] {
  if (stage.calls === null || stage.calls === undefined)
    throw new TypeError('Missing publication calls');
  return stage.calls;
}
function sameTargetAndValidPlan(previous: PublicationManifest, next: PublicationManifest): boolean {
  return (
    previous.runId === next.runId &&
    previous.spreadsheetId === next.spreadsheetId &&
    next.planHash === publicationPlanHash(next.stages, next.finalAssertions)
  );
}
/** Only the exact verified capacity stage survives a definitive pre-dispatch size rejection. */
export function retainCapacityOnlyReadback<T extends PublicationObservations>(
  previous: PublicationManifest,
  next: PublicationManifest,
  observations: T,
  rejection: PublicationRejection | null | undefined
): T & {
  planHash: string;
  capacityReplan: {
    priorPlanHash: string;
    rejectionHash: string;
    capacityEvidenceHash: string | null | undefined;
  };
} {
  evaluatePublicationReadback(previous, observations);
  check(
    sameTargetAndValidPlan(previous, next) &&
      stages(observations).length === 1 &&
      stages(observations)[0]?.id === '01-capacity' &&
      sha256Json(previous.stages[0]) === sha256Json(next.stages[0]) &&
      rejection?.priorPlanHash === previous.planHash &&
      rejection.stageId === '02-review-queue' &&
      rejection.callIndex === 0 &&
      rejection.response?.isError === true &&
      Boolean(
        rejection.response.content?.some(
          (block) =>
            block.type === 'text' &&
            String(block.text).includes(
              'Automatic approval review failed: Guardian action exceeds the 200000-byte review limit'
            )
        )
      ),
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
function definitiveCellRejection(
  rejection: PublicationRejection | null | undefined,
  previous: PublicationManifest,
  nextStage: string | null
): boolean {
  return (
    rejection?.priorPlanHash === previous.planHash &&
    rejection.stageId === nextStage &&
    nextStage === '04-evidence-detail' &&
    rejection.response?.isError === true &&
    rejection.response.structuredContent?.error_code === 'INVALID_ARGUMENT' &&
    text(rejection.response.structuredContent.error ?? '').includes(
      'maximum of 50000 characters in a single cell'
    )
  );
}
function exactAcknowledgedPrefix(
  applied: readonly PublicationAcknowledgedCall[],
  oldStage: PublicationStage,
  newStage: PublicationStage,
  spreadsheetId: string
): boolean {
  return applied.every(
    (call, index) =>
      call.file === calls(oldStage).at(index)?.file &&
      call.payloadHash === calls(oldStage).at(index)?.payloadHash &&
      sha256Json(calls(oldStage).at(index)) === sha256Json(calls(newStage).at(index)) &&
      call.response?.isError === false &&
      call.response.structuredContent?.spreadsheetId === spreadsheetId
  );
}
export function retainRejectedCellReadback<T extends PublicationObservations>(
  previous: PublicationManifest,
  next: PublicationManifest,
  observations: T,
  rejection: PublicationRejection | null | undefined
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
  const applied = rejection?.appliedCalls;
  check(
    sameTargetAndValidPlan(previous, next) &&
      definitiveCellRejection(rejection, previous, status.nextStage) &&
      list(applied) &&
      applied.length === rejection?.callIndex &&
      oldStage !== undefined &&
      newStage !== undefined &&
      rejection.callIndex < calls(oldStage).length &&
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
      appliedCalls: applied.map(({ file, payloadHash }) => ({ file, payloadHash })),
      rejectionHash: sha256Json(rejection),
    },
  };
}
export function remainingPublicationCalls<T extends PublicationCallBinding>(
  manifest: Pick<PublicationManifest, 'runId' | 'spreadsheetId' | 'planHash'>,
  stage: { readonly id: string; readonly calls: readonly T[] },
  resume?: PublicationResume | null
): readonly T[] {
  if (resume?.stageId !== stage.id) return stage.calls;
  check(
    resume.runId === manifest.runId &&
      resume.spreadsheetId === manifest.spreadsheetId &&
      resume.planHash === manifest.planHash &&
      /^[a-f0-9]{64}$/.test(resume.rejectionHash ?? '') &&
      list(resume.appliedCalls) &&
      resume.appliedCalls.every(
        (call, index) => sha256Json(call) === sha256Json(stage.calls.at(index))
      ),
    'Publication resume prefix differs from the verified replan'
  );
  return stage.calls.slice(resume.appliedCalls.length);
}
