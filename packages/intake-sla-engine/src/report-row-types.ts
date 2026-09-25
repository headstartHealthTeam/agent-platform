import type { FirefliesReportCoverage } from './fireflies-report-coverage.js';
import type { FreshnessAnalysis } from './freshness-analysis.js';
import type { GenerationLedgerRow, SlaNoteClassification } from './generation-ledger.js';
import type { PublicationQualityResult } from './publication-quality-types.js';
import type { ReviewerSnapshotRow } from './publication-state.js';
import type { FactPacket, RecommendationAction } from './recommendation-types.js';
import type { ReportQueueEntry } from './report-assembly.js';
import type { ReportOutstandingTasks } from './report-display-types.js';
import type { ReportHoldRecord } from './report-display-values.js';
import type { ReportProviderOpportunity, ReportSlaComparison } from './report-row-labels.js';
import type { ReportEvidenceStatus, ReportExpandedReview } from './report-row-review.js';
import type {
  SourceAuthorizationGate,
  SourceAuthorizationNotRequired,
  SourceAuthorizationRecord,
} from './source-authorization-types.js';
import type { SourceOutcome } from './source-outcome.js';

export interface ReportRowOpportunity extends ReportProviderOpportunity, ReportHoldRecord {
  readonly Id: string;
  readonly Name: string;
  readonly Current_SLA__c?: string | null | undefined;
  readonly Headstart_Practice__r?: { readonly Name?: string | null | undefined } | null | undefined;
  readonly CSM__c?: string | null | undefined;
  readonly SL_Due__c?: number | string | null | undefined;
  readonly On_Hold__c?: boolean | null | undefined;
  readonly On_Hold_Start_Date__c?: string | null | undefined;
  readonly On_Hold_Reason__c?: string | null | undefined;
  readonly Last_On_Hold_Reason__c?: string | null | undefined;
  readonly On_Hold_Notes__c?: string | null | undefined;
  readonly Off_Hold_Reason__c?: string | null | undefined;
}
export interface ReportRowExpanded extends ReportExpandedReview {
  readonly action: string;
  readonly bestSource: string;
  readonly confidence?: string | null | undefined;
}
export type ReportRowAuthorizationGate =
  | Pick<
      SourceAuthorizationGate<SourceAuthorizationRecord>,
      'required' | 'phase' | 'status' | 'determination' | 'authStatus' | 'payer' | 'recordId'
    >
  | Pick<SourceAuthorizationNotRequired, 'required'>;
export interface ReportRowActionModel {
  readonly actionType: RecommendationAction['type'];
  readonly actionOwner: RecommendationAction['owner'];
  readonly followUpDate: RecommendationAction['date'];
  readonly followUpDateBasis: RecommendationAction['basis'];
}
export interface ReportRowInput<Evidence = unknown> {
  readonly runAt: Date;
  readonly runId: string;
  readonly engineVersion: string;
  readonly sfBaseUrl: string;
  readonly opp: ReportRowOpportunity;
  readonly sla: ReportSlaComparison & { readonly Due__c?: number | string | null | undefined };
  readonly expanded: ReportRowExpanded;
  readonly freshness: Pick<
    FreshnessAnalysis,
    | 'latestUpdateAt'
    | 'latestUpdateSource'
    | 'latestUpdateFact'
    | 'latestUpdateSummary'
    | 'needsFireflies'
    | 'firefliesReason'
  > & { readonly updateFreshness: string };
  readonly story: Pick<
    FactPacket['story'],
    'storyStartDate' | 'storyWindowBasis' | 'activeIssues' | 'resolvedIssues' | 'timeline'
  >;
  readonly actionModel: ReportRowActionModel;
  readonly inDepthSummary: string;
  readonly outstandingTasks: ReportOutstandingTasks;
  readonly provider: string;
  readonly milestone: string;
  readonly gap: string;
  readonly identityMatchReview: string;
  readonly aiInterpretationGap: string;
  readonly aiInterpretationStatus: string;
  readonly conversationMatchAudit: string;
  readonly qualityReview: PublicationQualityResult;
  readonly finalEvidenceStatus: ReportEvidenceStatus;
  readonly finalReadyToCopy: 'Yes' | 'Review' | 'Blocked';
  readonly reviewerState: ReviewerSnapshotRow;
  readonly slaNoteClassification: Pick<SlaNoteClassification, 'provenance' | 'admittedText'>;
  readonly authorizationGate: ReportRowAuthorizationGate;
  readonly firefliesCoverage: Pick<FirefliesReportCoverage, 'identityComplete'>;
  readonly blockingSources: readonly Pick<SourceOutcome, 'source'>[];
  readonly unavailableEnrichmentSources: readonly Pick<SourceOutcome, 'source'>[];
  readonly sourceOutcomes: readonly Pick<SourceOutcome, 'source' | 'status'>[];
  readonly summaries: Readonly<
    Record<'auth' | 'authReview' | 'vob' | 'cq' | 'rbt' | 'candidates' | 'comms', string>
  >;
  readonly portal: { readonly gap: string; readonly result: string };
  readonly firefliesWasSearched: boolean;
  readonly firefliesResult: string;
  readonly alohaClaimsResult: string;
  readonly combinedEvidence: readonly Evidence[];
}
export interface ReportRowProjection<Evidence = unknown> {
  readonly entry: ReportQueueEntry<Evidence>;
  readonly generationLedgerRow: GenerationLedgerRow;
  readonly finalGap: string;
  readonly gaps: string;
}
