import {
  firefliesReportCoverage,
  type FirefliesReportCoverage,
} from './fireflies-report-coverage.js';
import type { PortalReportSummary } from './portal-report-types.js';
import { noPortalData, parsePortalChats } from './portal-report.js';
import type { ReportBillingRow } from './report-billing.js';
import type { ReportOpportunityContext } from './report-opportunity-context.js';
import {
  decodeSavedFirefliesEvidence,
  type SavedFirefliesEvidence,
} from './saved-fireflies-evidence.js';
import { decodeSavedPortalEvidence } from './saved-portal-evidence.js';
import { decodeSavedPortalReport, type SavedPortalReport } from './saved-portal-report.js';
import {
  decodeSavedPortalRequestInventory,
  decodeSavedPortalRequests,
} from './saved-portal-requests.js';
import {
  decodeSavedSlackEvidence,
  decodeSavedSlackExecution,
  type SavedSlackEvidence,
} from './saved-slack-evidence.js';
import type { SavedReportSources } from './saved-source-context.js';
import {
  decodeSavedSupplementalEvidence,
  type SavedSupplementalEvidence,
} from './saved-supplemental-evidence.js';
import { slackSweepCoverage, type SlackSweepCoverage } from './slack-coverage.js';

export interface ReportSavedEvidence {
  readonly portal: SavedPortalReport;
  readonly portalSummary: PortalReportSummary;
  readonly authoritativePortal: ReturnType<typeof decodeSavedPortalEvidence>;
  readonly portalRequests: ReturnType<typeof decodeSavedPortalRequests>;
  readonly portalRequestInventory: ReturnType<typeof decodeSavedPortalRequestInventory>;
  readonly fireflies: SavedFirefliesEvidence | undefined;
  readonly firefliesCoverage: FirefliesReportCoverage;
  readonly slack: SavedSlackEvidence | undefined;
  readonly slackCoverage: SlackSweepCoverage;
  readonly gmail: SavedSupplementalEvidence;
  readonly files: SavedSupplementalEvidence;
  readonly billing: ReportBillingRow | undefined;
}
/** Select retained rows exactly once per Opportunity. No refresh or interpretation is performed. */
export function prepareReportSavedEvidence(
  context: ReportOpportunityContext,
  sources: SavedReportSources,
  billing: ReadonlyMap<string, ReportBillingRow>,
  cohortCount: number
): ReportSavedEvidence {
  const { opp, identity, sla } = context;
  const portalRaw =
    sources.portal.byOpportunity.get(opp.Id) ?? sources.portal.byOpportunity.get(opp.Name);
  const portal = decodeSavedPortalReport(portalRaw);
  const fireflies = decodeSavedFirefliesEvidence(
    sources.fireflies.byOpportunity.get(opp.Id) ?? sources.fireflies.byOpportunity.get(opp.Name)
  );
  const slack = decodeSavedSlackEvidence(sources.slack.byOpportunity.get(opp.Id));
  const hasPortalInput = Boolean(portal.rawInput);
  return {
    portal,
    portalSummary: hasPortalInput
      ? parsePortalChats({ opportunity: opp, sla, responses: portal.input })
      : noPortalData(),
    authoritativePortal: decodeSavedPortalEvidence(portalRaw),
    portalRequests: decodeSavedPortalRequests(
      sources.portalRequests.collection.byOpportunity.get(opp.Id) ?? []
    ),
    portalRequestInventory: decodeSavedPortalRequestInventory(sources.portalRequests.inventory),
    fireflies,
    firefliesCoverage: firefliesReportCoverage({
      opportunityId: opp.Id,
      identity,
      boundedCoverage: sources.transcriptHealth.boundedCoverage,
      row: fireflies,
    }),
    slack,
    slackCoverage: slackSweepCoverage({
      execution: decodeSavedSlackExecution(sources.slackSweepExecution),
      row: slack?.row ?? null,
      expectedOpportunities: cohortCount,
      denialContext: sources.denialByOpportunity.get(opp.Id) ?? null,
    }),
    gmail: decodeSavedSupplementalEvidence(
      sources.gmail.byOpportunity.get(opp.Id) ?? sources.gmail.byOpportunity.get(opp.Name),
      'messages'
    ),
    files: decodeSavedSupplementalEvidence(
      sources.files.byOpportunity.get(opp.Id) ?? sources.files.byOpportunity.get(opp.Name),
      'files'
    ),
    billing: billing.get(opp.Id),
  };
}
