import { splitStageCalls } from './google-publication-stages.js';
import type {
  GooglePublicationPlan,
  GooglePublicationPayload,
  ReviewerPreservationProof,
} from './google-publication-types.js';
import { publicationPlanHash } from './publication-plan.js';
import type {
  PublicationAssertion,
  PublicationManifest,
  PublicationStage,
} from './publication-readback-types.js';

export interface PreparedPublicationStage extends PublicationStage {
  readonly dependsOn: string | null;
  readonly terminal: boolean;
  readonly alreadySatisfied: boolean;
  readonly file: string;
  readonly payloadHash: string;
  readonly requestCount: number;
  readonly calls: readonly { readonly file: string; readonly payloadHash: string }[];
  readonly assertions: readonly PublicationAssertion[];
}
export interface PreparedPublicationManifest extends PublicationManifest {
  readonly schemaVersion: 1;
  readonly preparedAt: string;
  readonly runHistoryLast: boolean;
  readonly applyStatus: 'Not applied - awaiting explicit publication approval';
  readonly finalAssertions: readonly PublicationAssertion[];
  readonly stages: readonly PreparedPublicationStage[];
}
export interface PreparedReviewerProof extends ReviewerPreservationProof {
  readonly runId: string;
  readonly spreadsheetId: string;
  readonly planHash: string;
}
export interface PreparedPublicationArtifacts {
  readonly manifest: PreparedPublicationManifest;
  readonly payloads: ReadonlyMap<string, GooglePublicationPayload>;
  readonly reviewerProof: PreparedReviewerProof;
  readonly summary: {
    readonly runId: string;
    readonly spreadsheetId: string;
    readonly planHash: string;
    readonly stages: readonly {
      readonly id: string;
      readonly requests: number;
      readonly calls: number;
      readonly alreadySatisfied: boolean;
    }[];
    readonly runHistoryLast: boolean;
    readonly reviewerPreservation: ReviewerPreservationProof['counts'];
  };
}
/** Prepare exact filenames and hashes only; persistence, gate evaluation and writes are separate. */
export function prepareGooglePublicationArtifacts(
  plan: GooglePublicationPlan,
  preparedAt = new Date().toISOString()
): PreparedPublicationArtifacts {
  const payloads = new Map<string, GooglePublicationPayload>();
  const stages: PreparedPublicationStage[] = [];
  for (const stage of plan.stages) {
    const calls = splitStageCalls(stage, plan.maxRequestBytes);
    const file = `google_batch_stage_${stage.id}.json`;
    payloads.set(file, stage.payload);
    const callEntries = calls.map((call) => {
      const callFile = `google_batch_stage_${stage.id}-call-${String(call.call).padStart(2, '0')}.json`;
      payloads.set(callFile, call.payload);
      return { file: callFile, payloadHash: call.payloadHash };
    });
    stages.push({
      id: stage.id,
      dependsOn: stage.dependsOn,
      terminal: stage.terminal,
      alreadySatisfied: stage.alreadySatisfied,
      file,
      payloadHash: stage.payloadHash,
      requestCount: stage.payload.requests.length,
      calls: callEntries,
      assertions: stage.assertions,
    });
  }
  const manifest: PreparedPublicationManifest = {
    schemaVersion: plan.schemaVersion,
    preparedAt,
    spreadsheetId: plan.spreadsheetId,
    runId: plan.runId,
    planHash: publicationPlanHash(stages, plan.finalAssertions),
    runHistoryLast: plan.stages.at(-1)?.id === '09-run-history',
    applyStatus: 'Not applied - awaiting explicit publication approval',
    finalAssertions: plan.finalAssertions,
    stages,
  };
  const reviewerProof: PreparedReviewerProof = {
    ...plan.reviewerPreservation,
    runId: manifest.runId,
    spreadsheetId: manifest.spreadsheetId,
    planHash: manifest.planHash,
  };
  return {
    manifest,
    payloads,
    reviewerProof,
    summary: {
      runId: plan.runId,
      spreadsheetId: plan.spreadsheetId,
      planHash: manifest.planHash,
      stages: stages.map((stage) => ({
        id: stage.id,
        requests: stage.requestCount,
        calls: stage.calls.length,
        alreadySatisfied: stage.alreadySatisfied,
      })),
      runHistoryLast: manifest.runHistoryLast,
      reviewerPreservation: plan.reviewerPreservation.counts,
    },
  };
}
