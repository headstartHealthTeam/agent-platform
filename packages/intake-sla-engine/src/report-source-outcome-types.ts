import type { EvidenceEvent } from './evidence.js';
import type { FirefliesReportCoverage } from './fireflies-report-coverage.js';
import type { FreshnessAnalysis } from './freshness-analysis.js';
import type { NoteAdjudicator } from './note-adjudication-types.js';
import type { ReportBillingRow } from './report-billing.js';
import type { ReportCommunicationEvidence } from './report-communication-evidence.js';
import type { PreparedReportComparison } from './report-comparison-context.js';
import type { ReportOpportunityContext } from './report-opportunity-context.js';
import type { ReportRecommendationSource } from './report-recommendation.js';
import type { SlackSweepCoverage } from './slack-coverage.js';
import type { SourceCheck } from './source-outcome.js';

export interface ReportSourceSnapshot {
  readonly row: SourceCheck | null | undefined;
  readonly count: number;
}
export interface ReportSourceOutcomesInput {
  readonly context: ReportOpportunityContext;
  readonly comparison: PreparedReportComparison;
  readonly freshness: FreshnessAnalysis;
  readonly communications: ReportCommunicationEvidence;
  readonly events: readonly EvidenceEvent[];
  readonly billing: ReportBillingRow | undefined;
  readonly portal: ReportSourceSnapshot;
  readonly fireflies: ReportSourceSnapshot & { readonly coverage: FirefliesReportCoverage };
  readonly slack: ReportSourceSnapshot & {
    readonly coverage: SlackSweepCoverage;
    readonly eventCount: number;
    readonly interpretedCount: number;
  };
  readonly gmail: ReportSourceSnapshot;
  readonly files: ReportSourceSnapshot;
  readonly portalRequests: {
    readonly inventory: {
      readonly collectedAt?: string | null | undefined;
      readonly complete?: unknown;
    } | null;
    readonly count: number;
  };
  readonly health: Readonly<
    Record<'portal' | 'fireflies', { readonly status: string; readonly reason: string | null }>
  >;
  readonly interpretation: {
    readonly mode: string;
    readonly unrecoveredFailures: readonly string[];
    readonly searchResult:
      | {
          readonly status: string;
          readonly source: string;
          readonly failures: readonly unknown[];
          readonly segmentsScanned: number;
        }
      | undefined;
  };
  readonly noteAdjudicator: Pick<NoteAdjudicator, 'administrativeNote'>;
  readonly reviewedSlaId: string;
  readonly runAt: Date;
}
export type ReportRowSourceOutcome = ReportRecommendationSource & {
  readonly requirementBasis: string;
};
export interface ReportSourceOutcomes {
  readonly combinedEvidence: EvidenceEvent[];
  readonly outcomes: readonly ReportRowSourceOutcome[];
  readonly admittedSlaNoteEventCount: number;
  readonly unparsedAdmittedSlaNote: boolean;
}
