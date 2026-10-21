import type { DateValue } from './dates.js';
import type { FreshnessAnalysis } from './freshness-analysis.js';
import type {
  FreshnessAuthorization,
  FreshnessClinicalQuality,
  FreshnessInterview,
  FreshnessRbt,
  FreshnessStaffing,
  FreshnessVob,
} from './freshness-source-types.js';
import type { ReportCandidateMatch, ReportSourceSummary } from './report-display-types.js';
import type {
  SourceAuthorizationGate,
  SourceAuthorizationRecord,
} from './source-authorization-types.js';
import type { StructuredCollection } from './structured-collection.js';

export type ReportComparisonGate = Partial<
  Pick<
    SourceAuthorizationGate<SourceAuthorizationRecord>,
    | 'required'
    | 'satisfied'
    | 'phase'
    | 'blocker'
    | 'payer'
    | 'determination'
    | 'authStatus'
    | 'conflict'
    | 'eventDate'
  >
>;
export type ReportComparisonFreshness = Omit<FreshnessAnalysis, 'latestUpdateAt'> & {
  readonly latestUpdateAt: DateValue;
};
/** Compatibility context still used by source requirements; final recommendations use fact packets. */
export interface ReportComparisonInput {
  readonly opp: StructuredCollection['opportunities'][number];
  readonly sla: NonNullable<StructuredCollection['opportunities'][number]['Current_SLA__r']>;
  readonly auths: readonly FreshnessAuthorization[];
  readonly authReviews: readonly FreshnessAuthorization[];
  readonly vobs: readonly FreshnessVob[];
  readonly clinicalQuality: readonly FreshnessClinicalQuality[];
  readonly rbts: readonly FreshnessRbt[];
  readonly staffing: readonly FreshnessStaffing[];
  readonly ticketMatches: readonly ReportCandidateMatch[];
  readonly interviews: readonly FreshnessInterview[];
  readonly commsText: string;
  readonly freshness: ReportComparisonFreshness;
  readonly authorizationGate: ReportComparisonGate;
  readonly runAt: Date;
}
export interface ReportComparisonResult {
  blocker: string;
  action: string;
  confidence: 'High' | 'Medium' | 'Low';
  bestSource: string;
  sourceQuality: string;
  summary: string;
  evidenceConflict: boolean;
}
export interface ReportComparisonSummaries {
  readonly auth: ReportSourceSummary;
  readonly authReview: ReportSourceSummary;
  readonly vob: ReportSourceSummary;
  readonly cq: ReportSourceSummary;
  readonly rbt: ReportSourceSummary;
  readonly candidates: ReportSourceSummary;
}
