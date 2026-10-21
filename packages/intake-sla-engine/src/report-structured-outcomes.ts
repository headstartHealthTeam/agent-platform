import { canonicalEvidenceSource } from './evidence-assembly.js';
import type { EvidenceEvent } from './evidence.js';
import type { ReportCommunicationEvidence } from './report-communication-evidence.js';
import { reportClean, reportText } from './report-display-values.js';
import type { ReportSourceOutcomesInput } from './report-source-outcome-types.js';
import { isUsableStageEvidence, type SourceOutcome, type StageEvidence } from './source-outcome.js';

export function structuredReportOutcome(
  source: string,
  records: readonly unknown[],
  evidence: readonly StageEvidence[] = [],
  detail = ''
): SourceOutcome {
  const relevant = evidence.filter(isUsableStageEvidence);
  return {
    source,
    status: relevant.length ? 'Found' : 'Searched - Not Found',
    found: relevant.length,
    recordsRetrieved: records.length,
    required: true,
    detail: reportText(
      detail,
      relevant.length
        ? `${String(relevant.length)} Direct or Likely substantive event${relevant.length === 1 ? '' : 's'} matched the current gate.`
        : records.length
          ? `Retrieved ${String(records.length)} linked record${records.length === 1 ? '' : 's'}, but none supplied substantive evidence for the current gate.`
          : 'Salesforce query completed without linked records.'
    ),
  };
}
export function reportEvidenceSelector(
  events: readonly EvidenceEvent[]
): (source: string) => EvidenceEvent[] {
  return (source) =>
    events.filter(
      (event) => canonicalEvidenceSource(event.source) === canonicalEvidenceSource(source)
    );
}
function recordEvidence(
  events: readonly EvidenceEvent[],
  source: string,
  records: ReportCommunicationEvidence['tasks']
): EvidenceEvent[] {
  const ids = new Set(
    records.map((record) => ('Id' in record ? record.Id : undefined)).filter(Boolean)
  );
  return reportEvidenceSelector(events)(source).filter((event) => ids.has(event.sourceRecordId));
}
export function reportStructuredOutcomes(
  input: ReportSourceOutcomesInput,
  combined: readonly EvidenceEvent[]
): SourceOutcome[] {
  const { context, communications, freshness } = input;
  const { opp } = context;
  const evidenceFrom = reportEvidenceSelector(combined);
  const state = (
    sourceRecordId: string | undefined
  ): StageEvidence & { sourceRecordId: string | undefined } => ({
    substantive: true,
    matchQuality: 'Direct',
    processGateRelevance: 'Relevant',
    sourceRecordId,
  });
  const history = context.history
    .filter(
      (record) =>
        record.Field === 'StageName' && reportClean(record.NewValue) === reportClean(opp.StageName)
    )
    .map((record) => state(record.Id));
  const talent =
    freshness.stageFamily === 'rbt'
      ? context.talent
          .filter((record) =>
            [
              record.Applicant_Status__c,
              record.Earliest_Start_Date__c,
              record.Notes__c,
              record.Provider_Rejection_Reason__c,
              record.HDS_Rejection_Reason__c,
            ].some((value) => reportClean(value))
          )
          .map((record) => state(record.Id))
      : [];
  return [
    structuredReportOutcome('Salesforce Opportunity / SLA', [opp], [state(opp.Id)]),
    structuredReportOutcome('Salesforce Stage History', context.history, history),
    structuredReportOutcome(
      'SLA / Intake / On-Hold Notes',
      communications.noteRecords,
      evidenceFrom('SLA / Intake / On-Hold Notes')
    ),
    structuredReportOutcome('Authorization', context.auths, evidenceFrom('Authorization')),
    structuredReportOutcome(
      'Authorization Review',
      context.authReviews,
      evidenceFrom('Authorization Review')
    ),
    structuredReportOutcome('VOB', context.vobs, evidenceFrom('VOB')),
    structuredReportOutcome(
      'Clinical Quality',
      context.clinicalQuality,
      evidenceFrom('Clinical Quality')
    ),
    structuredReportOutcome('RBT Request', context.rbts, evidenceFrom('RBT Request')),
    structuredReportOutcome('Ticket Match', context.ticketMatches, evidenceFrom('Ticket Match')),
    structuredReportOutcome('Talent Acquisition', context.talent, talent),
    structuredReportOutcome(
      'RBT First Interview',
      context.firstInterviews,
      evidenceFrom('RBT First Interview')
    ),
    structuredReportOutcome('Staffing', context.staffing, evidenceFrom('Staffing')),
    structuredReportOutcome(
      'Tasks / Task Chatter',
      communications.tasks,
      recordEvidence(combined, 'Tasks / Task Chatter', communications.tasks)
    ),
    structuredReportOutcome(
      'Salesforce Emails',
      communications.emails,
      recordEvidence(combined, 'Salesforce Emails', communications.emails)
    ),
    structuredReportOutcome('Calls / Texts', communications.calls, evidenceFrom('Calls / Texts')),
  ];
}
