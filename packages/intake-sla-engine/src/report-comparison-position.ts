import { selectCurrentCandidateMatch } from './candidate-match.js';
import type { FreshnessClinicalQuality } from './freshness-source-types.js';
import {
  comparisonAuthorization,
  comparisonDisplayPayer,
  comparisonVob,
  comparisonVobComplete,
} from './report-comparison-authorization.js';
import type { ReportComparisonInput } from './report-comparison-types.js';
import {
  reportClean,
  reportOperationalText,
  reportPreferred,
  reportShortDate,
  reportText,
  reportTimestamp,
  reportTruncate,
} from './report-display-values.js';

export function comparisonClinicalQuality(
  records: readonly FreshnessClinicalQuality[],
  modified = false
): FreshnessClinicalQuality {
  return (
    [...records].sort(
      (a, b) =>
        reportTimestamp(modified ? reportText(b.LastModifiedDate, b.CreatedDate) : b.CreatedDate) -
        reportTimestamp(modified ? reportText(a.LastModifiedDate, a.CreatedDate) : a.CreatedDate)
    )[0] ?? {}
  );
}
function unresolvedPosition(input: ReportComparisonInput): string {
  const gate = input.authorizationGate;
  const phase = gate.phase === 'treatment' ? 'Treatment authorization' : 'Initial authorization';
  const payer =
    gate.payer && !/^(primary|secondary|tertiary|other)$/i.test(gate.payer)
      ? ` with ${comparisonDisplayPayer(gate.payer)}`
      : '';
  const prefix = comparisonVobComplete(comparisonVob(input.vobs))
    ? 'VOB is complete and eligibility is active. '
    : '';
  return `${prefix}${phase} is ${reportText(gate.determination, gate.authStatus, 'pending').toLowerCase()}${payer}.`;
}
function assessmentPosition(input: ReportComparisonInput, stage: string): string | null {
  if (/IA Approved|IC Completed|IC Scheduled|IA Scheduled/.test(stage))
    return 'Initial authorization is approved; the initial assessment is not confirmed as completed and the Opportunity remains in scheduling.';
  if (/97151|Treatment Plan/.test(stage)) {
    const cq = comparisonClinicalQuality(input.clinicalQuality, true);
    const status = reportText(
      cq.Treatment_Plan_Status__c,
      input.opp.Current_Treatment_Plan_Status__c
    );
    return status
      ? `The initial assessment phase is complete or underway; the treatment plan is ${status.toLowerCase()}.`
      : 'The initial assessment phase is complete or underway; treatment authorization cannot proceed until the treatment plan is completed.';
  }
  return null;
}
function treatmentPosition(input: ReportComparisonInput): string {
  const match = selectCurrentCandidateMatch(input.ticketMatches);
  const candidate = match?.Candidate__r?.Name;
  return candidate
    ? `Treatment authorization is approved; ${candidate} is ${reportText(match.Ticket_Match_Status__c, match.Candidate__r.Applicant_Status__c).toLowerCase()}, but the first 97153 date is not confirmed.`
    : 'Treatment authorization is approved; staffing or the first 97153 date is not confirmed.';
}
export function comparisonProcessPosition(input: ReportComparisonInput, blocker: string): string {
  const { opp, authorizationGate } = input;
  const stage = reportText(opp.StageName, opp.Current_SLA__r?.Stage__c, 'Current stage');
  if (authorizationGate.required && !authorizationGate.satisfied) return unresolvedPosition(input);
  if (/family declined services/i.test(blocker))
    return 'The family has declined treatment, but the Opportunity remains open in the intake workflow.';
  if (/care-plan feasibility/i.test(blocker))
    return 'The initial assessment phase is complete, but the provider and family have not confirmed a workable, consistent care plan.';
  if (
    /document|coverage correction/i.test(blocker) &&
    /IA Approved|IC Completed|IC Scheduled|IA Scheduled/.test(stage)
  )
    return 'Initial authorization is approved, but a required intake document or coverage correction remains incomplete before scheduling.';
  if (stage === 'Insurance Verification') {
    return comparisonVobComplete(comparisonVob(input.vobs))
      ? 'VOB is complete and eligibility is active; the Opportunity has not advanced to IA Requested.'
      : 'Insurance verification is not complete, so the IA authorization path has not started.';
  }
  if (['IA Requested', 'TA Requested'].includes(stage)) {
    const auth = comparisonAuthorization(input.auths, stage);
    const type = stage.startsWith('TA') ? 'Treatment authorization' : 'Initial authorization';
    return `${type} has been submitted and is ${reportText(auth.Insurance_Determination__c, auth.Auth_Status__c, 'pending').toLowerCase()}.`;
  }
  const assessment = assessmentPosition(input, stage);
  if (assessment !== null) return assessment;
  if (/TA Approved|97153|First Day/.test(stage)) return treatmentPosition(input);
  return `The Opportunity remains in ${stage}.`;
}
export function comparisonGateSummary(
  input: Pick<ReportComparisonInput, 'authorizationGate' | 'vobs' | 'freshness'>
): string {
  const { authorizationGate: gate, freshness } = input;
  const phase = gate.phase === 'treatment' ? 'treatment authorization' : 'initial authorization';
  const payer =
    gate.payer && !/^(primary|secondary|tertiary|other)$/i.test(gate.payer)
      ? ` with ${comparisonDisplayPayer(gate.payer)}`
      : '';
  const date = reportShortDate(reportPreferred(freshness.latestUpdateAt, gate.eventDate));
  const prefix =
    gate.phase === 'initial' && comparisonVobComplete(comparisonVob(input.vobs))
      ? 'VOB is complete and eligibility is active. '
      : '';
  const state = reportText(gate.determination, gate.authStatus, 'pending').toLowerCase();
  const nextGate =
    gate.phase === 'treatment'
      ? 'Treatment cannot start until the payer requirement is resolved.'
      : 'The IA cannot begin until the payer requirement is resolved.';
  const synthesized = reportOperationalText(freshness.latestUpdateFact);
  const latestDetail = /stage-relevant operational update was recorded/i.test(synthesized)
    ? reportOperationalText(freshness.latestUpdateSummary)
    : reportText(synthesized, reportOperationalText(freshness.latestUpdateSummary));
  if (
    /signature|psychological report|diagnostic (?:evaluation|report)|required (?:document|information)/i.test(
      latestDetail
    )
  ) {
    const requirement = /signature/i.test(latestDetail)
      ? 'the payer will not accept the current signature on the psychological report; a secure, verifiable signature is still required'
      : 'the payer still requires corrected clinical documentation';
    return reportTruncate(
      `${prefix}${date ? `As of ${date}, ` : ''}${requirement}. ${nextGate}`,
      245
    );
  }
  return reportTruncate(
    `${prefix}${date ? `As of ${date}, ` : ''}the ${phase} is ${state}${payer}. ${nextGate}`,
    245
  );
}
export function comparisonIndependentDiscussion(input: ReportComparisonInput['freshness']): string {
  const source = input.latestUpdateSource;
  if (
    !/Fireflies|Portal chat|SMS|Aircall transcript|Aircall call summary|Salesforce task|Task update|Task Chatter/i.test(
      source
    )
  )
    return '';
  if (input.updateFreshness !== 'Current' && source !== 'Fireflies') return '';
  let detail = reportClean(input.latestUpdateSummary);
  if (source === 'Fireflies') detail = reportText(detail.split(';')[1], detail);
  return detail
    ? reportTruncate(
        `${reportShortDate(input.latestUpdateAt)}: ${reportOperationalText(detail)}`,
        245
      )
    : '';
}
