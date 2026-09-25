import { adaptAuthorizationReviews, adaptVob } from './authorization-review-evidence.js';
import { adaptAuthorizations } from './authorization-source-evidence.js';
import { adaptBillingClaims } from './billing-evidence.js';
import { adaptCallsAndTexts } from './call-text-evidence.js';
import { adaptTalentAcquisition, adaptRbtFirstInterviews } from './candidate-evidence.js';
import { adaptClinicalQuality } from './clinical-quality-evidence.js';
import { getStageContract } from './contracts.js';
import { dedupeEvidenceEvents } from './evidence-assembly.js';
import type { EvidenceEvent } from './evidence.js';
import type { GateContext } from './gate-context.js';
import { adaptOpportunityMilestones } from './opportunity-milestones.js';
import { adaptOpportunityNotes } from './opportunity-note-evidence.js';
import {
  adaptPortalTreatmentAuthorizationRequests,
  type PortalAuthorizationEvidenceRecord,
} from './portal-authorization-evidence.js';
import type { PortalRows } from './portal-evidence-types.js';
import { adaptPortal } from './portal-evidence.js';
import { adaptRbtRequests } from './rbt-request-evidence.js';
import type { ReportBillingRow } from './report-billing.js';
import type { ReportComparisonResult } from './report-comparison-types.js';
import { reportPreferred, reportText } from './report-display-values.js';
import type { ReportOpportunityContext } from './report-opportunity-context.js';
import { adaptStaffing } from './staffing-evidence.js';
import { adaptStageHistory } from './stage-history-evidence.js';
import { adaptTasks } from './task-evidence.js';
import { adaptTicketMatches } from './ticket-match-evidence.js';

export function reportGateCategory(family: string): string {
  if (family === 'insurance') return 'insurance';
  if (family === 'treatmentPlan') return 'treatmentPlan';
  if (family === 'rbt') return 'rbt';
  return 'intakeScheduling';
}
export type ReportAdapterGate = GateContext & {
  readonly authorization: ReportOpportunityContext['authorizationGate'] | null;
};
export function reportAdapterGate(
  context: ReportOpportunityContext,
  stageFamily: string,
  comparison: ReportComparisonResult
): ReportAdapterGate {
  const { opp, authorizationGate } = context;
  // The approved stage lookup accepts absence, but not an explicit null stage.
  if (opp.StageName === null) throw new TypeError('Opportunity stage cannot be null');
  const contract = getStageContract(opp.StageName);
  const unresolved = authorizationGate.required && !authorizationGate.satisfied;
  return {
    ...contract,
    processPosition: unresolved
      ? authorizationGate.phase === 'initial'
        ? 'Initial authorization'
        : 'Treatment authorization'
      : reportPreferred(contract?.position, opp.StageName),
    unresolvedGate: unresolved
      ? authorizationGate.blocker
      : reportText(contract?.unresolvedGate, comparison.blocker),
    gateCategory: unresolved ? 'insurance' : reportGateCategory(stageFamily),
    authorization: authorizationGate.required ? authorizationGate : null,
  };
}
export interface ReportAuthoritativeInput {
  readonly context: ReportOpportunityContext;
  readonly runAt: Date;
  readonly gate: GateContext;
  readonly reviewedNoteIds: ReadonlySet<string>;
  readonly interpretedNoteEvents: readonly EvidenceEvent[];
  readonly portalRequests: readonly PortalAuthorizationEvidenceRecord[];
  readonly billing: ReportBillingRow | undefined;
  readonly portal: PortalRows;
  readonly firefliesEvents: readonly EvidenceEvent[];
  readonly slackEvents: readonly EvidenceEvent[];
}
/** Fixed adapter order and original current-run interpretations; no source reads or inference. */
export function assembleReportAuthoritativeEvidence(
  input: ReportAuthoritativeInput
): EvidenceEvent[] {
  const { context, gate, runAt } = input;
  const { opp, identity, evidenceOpp } = context;
  const common = { profile: identity, gate, asOf: runAt };
  const requestToOpportunity = new Map(context.rbts.map((record) => [record.Id, opp.Id]));
  const candidateToOpportunity = new Map(
    context.ticketMatches.flatMap((record) =>
      record.Candidate__c ? [[record.Candidate__c, opp.Id] as const] : []
    )
  );
  return dedupeEvidenceEvents([
    ...adaptOpportunityMilestones({
      ...common,
      opportunity: { ...evidenceOpp, stageEntryDate: identity.stageEntryDate },
    }),
    ...(input.reviewedNoteIds.size
      ? input.interpretedNoteEvents
      : adaptOpportunityNotes({ ...common, opportunity: evidenceOpp })),
    ...adaptStageHistory({
      ...common,
      records: context.history,
      profile: { ...identity, stage: opp.StageName },
    }),
    ...adaptAuthorizations({ ...common, records: context.auths }),
    ...adaptAuthorizationReviews({ ...common, records: context.authReviews }),
    ...adaptPortalTreatmentAuthorizationRequests({
      ...common,
      records: input.portalRequests,
      salesforceAuthorizationRecords: context.auths,
      clinicalQualityRecords: context.clinicalQuality,
      profile: { ...identity, stage: opp.StageName },
    }),
    ...adaptVob({ ...common, records: context.vobs }),
    ...adaptBillingClaims({
      ...common,
      records: input.billing?.records ?? [],
      opportunity: evidenceOpp,
      coverageComplete: true,
    }),
    ...adaptPortal({ ...common, row: input.portal }),
    ...adaptCallsAndTexts({ ...common, records: context.aircalls }),
    ...adaptRbtRequests({ ...common, records: context.rbts }),
    ...adaptStaffing({ ...common, records: context.staffing }),
    ...adaptTalentAcquisition({ ...common, records: context.talent, candidateToOpportunity }),
    ...adaptRbtFirstInterviews({
      ...common,
      records: context.firstInterviews,
      candidateToOpportunity,
    }),
    ...adaptClinicalQuality({ ...common, records: context.clinicalQuality }),
    ...adaptTicketMatches({
      ...common,
      records: context.ticketMatches,
      requestToOpportunity,
      firstInterviews: context.firstInterviews,
    }),
    ...adaptTasks({ ...common, records: [...context.tasks, ...context.taskUpdates] }),
    ...input.firefliesEvents,
    ...input.slackEvents,
  ]);
}
