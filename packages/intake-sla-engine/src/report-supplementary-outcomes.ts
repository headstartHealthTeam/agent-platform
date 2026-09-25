import type { EvidenceEvent } from './evidence.js';
import { reportClean } from './report-display-values.js';
import type {
  ReportSourceOutcomesInput,
  ReportSourceSnapshot,
} from './report-source-outcome-types.js';
import { reportEvidenceSelector } from './report-structured-outcomes.js';
import { sourceOutcome, type SourceOutcome } from './source-outcome.js';

export function reportSupplementaryOutcomes(
  input: ReportSourceOutcomesInput,
  combined: readonly EvidenceEvent[]
): SourceOutcome[] {
  const evidenceFrom = reportEvidenceSelector(combined);
  const asOf = input.runAt.toISOString();
  const portalInventory = input.portalRequests.inventory;
  const outcome = (
    source: string,
    snapshot: ReportSourceSnapshot,
    required = true
  ): SourceOutcome =>
    sourceOutcome({
      row: snapshot.row,
      items: evidenceFrom(source),
      source,
      recordsRetrieved: snapshot.count,
      required,
      asOf,
    });
  return [
    sourceOutcome({
      source: 'Portal Auth Requests',
      row: portalInventory
        ? {
            searchedAt: portalInventory.collectedAt,
            blocked: portalInventory.complete !== true,
            error:
              portalInventory.complete === true
                ? null
                : 'Portal Auth Request inventory did not confirm a complete current-run page or API read.',
          }
        : {
            blocked: true,
            error:
              'Portal Auth Requests were not collected in the current run. The 97151 handoff cannot be verified from Salesforce alone.',
          },
      items: evidenceFrom('Portal Auth Request'),
      required: /^97151 started\b/i.test(reportClean(input.context.opp.StageName)),
      recordsRetrieved: input.portalRequests.count,
      asOf,
    }),
    outcome('Portal', input.portal),
    sourceOutcome({
      row: input.fireflies.row,
      items: evidenceFrom('Fireflies'),
      source: 'Fireflies',
      recordsRetrieved: input.fireflies.count,
      coverageStatus: input.fireflies.coverage.coverageStatus,
      coverageDetail: input.fireflies.coverage.coverageDetail,
      asOf,
    }),
    outcome('Linked Billing / Claims', {
      row: input.billing,
      count: input.billing?.records.length ?? 0,
    }),
    sourceOutcome({
      row: input.slack.row,
      items: evidenceFrom('Slack'),
      source: 'Slack',
      required: true,
      recordsRetrieved: Math.max(
        input.slack.count,
        input.slack.eventCount,
        input.slack.interpretedCount
      ),
      coverageStatus: input.slack.coverage.status,
      coverageDetail: input.slack.coverage.detail,
      asOf,
    }),
    outcome('Gmail', input.gmail, false),
    outcome('Linked Files', input.files, false),
  ];
}
