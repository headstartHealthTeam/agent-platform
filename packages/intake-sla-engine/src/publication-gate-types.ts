import type { PublicationPlanHashStage } from './publication-plan.js';
import type {
  PublicationCaptureFreshness,
  PublicationMarkerArtifact,
  ReviewerSnapshot,
} from './publication-state.js';

export interface PublicationRunManifest {
  readonly runId: string;
  readonly startedAt?: string | undefined;
  readonly expectedRows?: number | undefined;
  readonly processedRows?: number | undefined;
}
export interface PublicationFinalIdentity {
  readonly id: string;
}
export interface PublicationGatePlan {
  readonly runId: string;
  readonly spreadsheetId: string;
  readonly planHash: string;
  readonly runHistoryLast?: unknown;
  readonly stages: readonly PublicationPlanHashStage[];
  readonly finalAssertions?: readonly PublicationFinalIdentity[] | undefined;
}
export interface PublicationPostCutoffDisposition {
  readonly schemaVersion?: unknown;
  readonly disposition?: unknown;
  readonly runCutoff?: string | undefined;
  readonly salesforceReadOnly?: unknown;
  readonly nextRunRequired?: unknown;
  readonly records?:
    | readonly {
        readonly opportunityId: string;
        readonly observedModifiedAt?: string | null | undefined;
      }[]
    | null
    | undefined;
}
type MaterialChange = string | { readonly id?: string | null | undefined } | null | undefined;
export interface PublicationCohortChanges {
  readonly added?: readonly MaterialChange[] | null | undefined;
  readonly removed?: readonly MaterialChange[] | null | undefined;
  readonly stage?: readonly MaterialChange[] | null | undefined;
  readonly onHold?: readonly MaterialChange[] | null | undefined;
  readonly currentSla?: readonly MaterialChange[] | null | undefined;
}
export interface PublicationCohortRefresh {
  readonly queriedAt?: string | null | undefined;
  readonly organizationId?: string | null | undefined;
  readonly isSandbox?: unknown;
  readonly material?: unknown;
  readonly liveCount?: number | undefined;
  readonly changes?: PublicationCohortChanges | undefined;
  readonly postCutoffDisposition?: PublicationPostCutoffDisposition | null | undefined;
}
export interface PublicationGateInputs {
  readonly now?: string;
  readonly maxAgeMs?: number;
  readonly expectedSpreadsheetId: string;
  readonly runManifest: PublicationRunManifest;
  readonly qualityAudit: {
    readonly passed?: unknown;
    readonly auditedAt?: string | null | undefined;
  };
  readonly workbookVerification: {
    readonly passed?: unknown;
    readonly verifiedAt?: string | null | undefined;
  };
  readonly productionDrift: {
    readonly result?:
      | {
          readonly publishable?: unknown;
          readonly checkedAt?: string | null | undefined;
        }
      | null
      | undefined;
  };
  readonly metadata: PublicationCaptureFreshness & {
    readonly captureHash?: string | null | undefined;
  };
  readonly publicationState: PublicationCaptureFreshness;
  readonly baselineMarker: PublicationMarkerArtifact;
  readonly currentMarker: PublicationMarkerArtifact;
  readonly baselineReviewerState: ReviewerSnapshot;
  readonly currentReviewerState: ReviewerSnapshot;
  readonly cohortRefresh: PublicationCohortRefresh;
  readonly competingRunState: {
    readonly checkedAt?: string | null | undefined;
    readonly conflict?: unknown;
    readonly currentRunId?: string | null | undefined;
  };
  readonly publicationPlan: PublicationGatePlan;
}
export type PublicationGateCheck = (
  name: string,
  condition: boolean,
  failure: string
) => asserts condition;
export interface PublicationCohortDisposition {
  readonly mode: 'stable-live-cohort' | 'frozen-snapshot-with-post-cutoff-delta';
  readonly sourceCutoff: string | undefined;
  readonly liveCount: number | undefined;
  readonly deferredChangeCount: number;
}
export interface PublicationGateResult {
  readonly schemaVersion: 1;
  readonly evaluatedAt: string;
  readonly runId: string;
  readonly spreadsheetId: string;
  readonly passed: true;
  readonly planHash: string;
  readonly cohortDisposition: PublicationCohortDisposition;
  readonly checks: string[];
}
