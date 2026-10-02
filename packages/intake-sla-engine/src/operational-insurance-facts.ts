import { nextBusinessDay } from './dates.js';
import { hasOperationalText as has } from './operational-fact-context.js';
import type { OperationalFactContext } from './operational-fact-context.js';
import { deniedInsuranceFact } from './operational-insurance-denial.js';
import { insuranceSignals } from './operational-insurance-signals.js';
import type { InsuranceSignals } from './operational-insurance-signals.js';
function addPayerFeedback(context: OperationalFactContext, signals: InsuranceSignals): boolean {
  const { add } = context;
  const { payerFeedbackFamilyFollowUp } = signals;
  if (!payerFeedbackFamilyFollowUp) return false;
  add({
    type: 'auth-additional-info',
    summary:
      'The payer provided follow-up that requires coordination with the family, but the exact requested item is not documented.',
    gateImpact: 'Payer follow-up remains unresolved pending family coordination',
    owner: 'CSM',
    actionType: FAMILY_OUTREACH,
    action:
      "CSM to confirm the payer's exact request with the family, document the required item, and route the result to Insurance Ops.",
    relevance: 11,
    specificityMissing: true,
  });
  return true;
}
function addCorrectionsComplete(
  context: OperationalFactContext,
  signals: InsuranceSignals
): boolean {
  const { add } = context;
  const { correctionsCompleteResubmissionUnconfirmed } = signals;
  if (!correctionsCompleteResubmissionUnconfirmed) return false;
  add({
    type: 'auth-corrections-complete',
    summary:
      'The provider reports the ABLLS-R grid was added to the corrected treatment plan, but payer resubmission remains unconfirmed.',
    gateImpact: 'Treatment-plan corrections are complete; payer resubmission remains unconfirmed',
    owner: 'CSM',
    actionType: PROVIDER_OUTREACH,
    action:
      'CSM to confirm the corrected treatment plan was resubmitted and route the submission date to Insurance Ops for payer follow-up.',
    relevance: 13,
  });
  return true;
}
function addOverlapRemediation(
  context: OperationalFactContext,
  signals: InsuranceSignals
): boolean {
  const { value, add } = context;
  const {
    denialReason,
    resubmissionNotConfirmed,
    overlapReportedCleared,
    terminationProofMissing,
  } = signals;
  if (!(
    resubmissionNotConfirmed &&
    (overlapReportedCleared || terminationProofMissing) &&
    has(value, /\b(?:overlap|duplicate services?|denied|denial)\b/)
  ))
    return false;
  add({
    type: 'auth-overlap-remediation',
    summary: terminationProofMissing
      ? 'The prior authorization was reportedly cleared, but termination documentation has not been received and treatment-authorization resubmission is not confirmed.'
      : 'The prior authorization overlap was reportedly resolved, but treatment-authorization resubmission is not confirmed.',
    gateImpact: terminationProofMissing
      ? 'Prior authorization termination documentation is required before treatment-authorization resubmission'
      : 'Treatment-authorization resubmission remains unconfirmed after the prior authorization overlap was resolved',
    owner: 'Intake',
    actionType: FAMILY_OUTREACH,
    action: terminationProofMissing
      ? 'Intake to obtain documentation confirming the prior authorization ended and route it to Insurance Ops for treatment-authorization resubmission.'
      : 'Intake to confirm the prior authorization end date and route the resolution to Insurance Ops for treatment-authorization resubmission.',
    relevance: 13,
    denialReason:
      denialReason === null || denialReason === ''
        ? 'overlapping or duplicate services with another provider'
        : denialReason,
  });
  return true;
}
function addSecondaryPending(context: OperationalFactContext, signals: InsuranceSignals): boolean {
  const { add } = context;
  const { secondaryPendingAfterDenial } = signals;
  if (!secondaryPendingAfterDenial) return false;
  add({
    type: RESUBMITTED_PENDING,
    summary:
      'Following a prior denial, the treatment authorization remains pending with the secondary payer; no final determination is recorded.',
    gateImpact: 'Secondary treatment authorization determination remains pending after denial',
    owner: INSURANCE_OPS,
    actionType: INSURANCE_FOLLOW_UP,
    action:
      'Insurance Ops to confirm the secondary payer determination and document the response and next follow-up date.',
    relevance: 12,
  });
  return true;
}
function addSignature(context: OperationalFactContext, signals: InsuranceSignals): boolean {
  const { asOf, add } = context;
  const { signaturesBeforeResubmission } = signals;
  if (!signaturesBeforeResubmission) return false;
  add({
    type: 'auth-resubmission-signature',
    summary:
      'Parent signatures remain outstanding before the corrected authorization package can be resubmitted to the payer.',
    gateImpact: 'Parent signatures are required before authorization resubmission',
    owner: 'CSM',
    actionType: FAMILY_OUTREACH,
    action:
      'CSM to obtain the required parent signatures, confirm the corrected package is resubmitted, and document the payer follow-up date.',
    milestoneDate: null,
    followUpDate: nextBusinessDay(asOf),
    relevance: 12,
  });
  return true;
}
function addDenialEdits(context: OperationalFactContext, signals: InsuranceSignals): boolean {
  const { asOf, add } = context;
  const { denialReason, denialEditsInProgress } = signals;
  if (!denialEditsInProgress) return false;
  add({
    type: 'auth-denial-corrections',
    summary:
      'Treatment-plan edits are underway after the payer denial, but corrected resubmission is not yet confirmed.',
    gateImpact: 'Denial corrections are in progress; payer resubmission remains unconfirmed',
    owner: 'CSM',
    actionType: PROVIDER_OUTREACH,
    action:
      'CSM to confirm completion of the denial-related treatment-plan edits and document when the corrected package is resubmitted to the payer.',
    milestoneDate: null,
    followUpDate: nextBusinessDay(asOf),
    relevance: 12,
    denialReason,
  });
  return true;
}
function addResubmittedUnconfirmed(
  context: OperationalFactContext,
  signals: InsuranceSignals
): boolean {
  const { asOf, add } = context;
  const { denialReason, resubmittedAfterDenial, resubmittedAfterDenialWithoutDisposition } =
    signals;
  if (!(resubmittedAfterDenialWithoutDisposition && !resubmittedAfterDenial)) return false;
  add({
    type: RESUBMITTED_PENDING,
    summary:
      'After the payer denial, the corrected authorization package was resubmitted; a new payer determination is not yet confirmed.',
    gateImpact: 'Corrected authorization was resubmitted; payer determination remains pending',
    owner: INSURANCE_OPS,
    actionType: INSURANCE_FOLLOW_UP,
    action:
      'Insurance Ops to confirm receipt of the corrected authorization package and document the new payer determination and follow-up date.',
    milestoneDate: null,
    followUpDate: nextBusinessDay(asOf),
    relevance: 12,
    denialReason,
  });
  return true;
}
function addPriorTermination(context: OperationalFactContext, signals: InsuranceSignals): boolean {
  const { add } = context;
  const sourceContext = context.context;
  const { priorServiceTermination } = signals;
  if (!priorServiceTermination) return false;
  const phase = /treatment/i.test(sourceContext.processPosition ?? '')
    ? 'treatment authorization'
    : 'initial authorization';
  add({
    type: 'auth-prior-service-termination',
    summary: `The family plans to end the other ABA authorization so the current ${phase} can proceed; termination is not yet confirmed.`,
    gateImpact: `The other ABA authorization must end before the current ${phase} can proceed`,
    owner: 'Intake',
    actionType: FAMILY_OUTREACH,
    action:
      'Intake to verify the prior ABA authorization end date with the family and document it for Insurance Ops.',
    relevance: 11,
  });
  return true;
}
function addResubmittedPending(
  context: OperationalFactContext,
  signals: InsuranceSignals
): boolean {
  const { add } = context;
  const { resubmittedAfterDenial } = signals;
  if (!resubmittedAfterDenial) return false;
  add({
    type: RESUBMITTED_PENDING,
    summary:
      'After the prior denial, a corrected treatment authorization was resubmitted and remains pending with the payer.',
    gateImpact: 'Current treatment authorization determination remains pending after resubmission',
    owner: INSURANCE_OPS,
    actionType: INSURANCE_FOLLOW_UP,
    action:
      'Insurance Ops to confirm the resubmitted treatment authorization determination and document the payer response and next follow-up date.',
    relevance: 11,
  });
  return true;
}
function addOverturned(context: OperationalFactContext): boolean {
  const { value, add } = context;
  if (!(
    has(value, /\bdenial\b.{0,80}\b(overturned|reversed)\b/) ||
    has(value, /\b(overturned|reversed)\b.{0,80}\bdenial\b/)
  ))
    return false;
  add({
    type: 'auth-denial-overturned',
    summary:
      'The payer reports the denial was overturned, but the written approval and structured authorization determination are not yet confirmed.',
    gateImpact: 'Payer reports denial overturned; written approval remains unconfirmed',
    owner: INSURANCE_OPS,
    actionType: INSURANCE_FOLLOW_UP,
    action:
      'Insurance Ops to obtain the approval letter and update the current authorization determination and effective dates.',
    relevance: 10,
  });
  return true;
}
function addDenied(context: OperationalFactContext, signals: InsuranceSignals): boolean {
  if (
    signals.hypotheticalDenial ||
    !has(context.value, /\b(denied|denial|did not mean to approve|reversed approval)\b/)
  )
    return false;
  context.add(deniedInsuranceFact(context.value, signals));
  return true;
}
function addAdditionalInfo(context: OperationalFactContext, signals: InsuranceSignals): boolean {
  const { value, add } = context;
  const { requestedInformation } = signals;
  if (
    !has(
      value,
      /\b(additional (?:info|information|details)|provider action required|more documentation|request(?:ed)? records)\b/
    )
  )
    return false;
  add({
    type: 'auth-additional-info',
    summary: requestedInformation
      ? `The payer requested ${requestedInformation} before it will issue an authorization determination.`
      : 'The payer requested additional information, but the available evidence does not identify the requested item.',
    gateImpact: requestedInformation
      ? `Payer request for ${requestedInformation} remains unresolved`
      : 'Payer additional-information request remains unresolved',
    owner: INSURANCE_OPS,
    actionType: INSURANCE_FOLLOW_UP,
    action: requestedInformation
      ? `Insurance Ops to obtain and submit ${requestedInformation} and document the next payer follow-up date.`
      : 'Insurance Ops to retrieve the payer request, document the exact requested item, and assign its completion and follow-up date.',
    relevance: 10,
    requestedInformation,
    specificityMissing: !requestedInformation,
  });
  return true;
}
function addAppeal(context: OperationalFactContext, signals: InsuranceSignals): boolean {
  const { add } = context;
  const { appealKind } = signals;
  if (!appealKind) return false;
  const peerReview = appealKind === 'peer review';
  const reconsideration = appealKind === 'reconsideration';
  add({
    type: 'auth-appeal',
    summary: peerReview
      ? 'The authorization is in payer peer review; a final determination is still pending.'
      : reconsideration
        ? 'The authorization reconsideration remains pending with the payer.'
        : 'The authorization appeal remains pending with the payer.',
    gateImpact: peerReview
      ? 'Authorization peer review is pending'
      : reconsideration
        ? 'Authorization reconsideration is pending'
        : 'Authorization appeal is pending',
    owner: INSURANCE_OPS,
    actionType: INSURANCE_FOLLOW_UP,
    action: peerReview
      ? 'Insurance Ops to confirm the peer-review status and next payer decision date.'
      : reconsideration
        ? 'Insurance Ops to confirm the reconsideration status and next payer decision date.'
        : 'Insurance Ops to confirm the appeal status and next payer decision date.',
    relevance: 10,
  });
  return true;
}
function addPending(
  context: OperationalFactContext,
  signals: InsuranceSignals,
  futureDiagnosticRequirement: boolean
): boolean {
  const { value, add } = context;
  const { hypotheticalDenial } = signals;
  if (!(
    !futureDiagnosticRequirement &&
    !hypotheticalDenial &&
    has(
      value,
      /\b(pending|waiting|awaiting|still with insurance|under review|submitted|processing)\b|\bslow\b.{0,45}\bprocessing\b/
    ) &&
    has(value, /\b(auth|authorization|payer|insurance|\bia\b|\bta\b)\b/)
  ))
    return false;
  add({
    type: 'auth-pending',
    summary:
      'The authorization remains pending with the payer; no final determination is recorded.',
    gateImpact: 'Current authorization determination remains pending',
    owner: INSURANCE_OPS,
    actionType: INSURANCE_FOLLOW_UP,
    action:
      'Insurance Ops to confirm the pending payer determination and document the response and next follow-up date.',
    relevance: 9,
  });
  return true;
}
function addDateCorrection(context: OperationalFactContext): void {
  const { value, add } = context;
  if (
    has(value, /\b(auth|authorization|approval)\b/) &&
    has(value, /\b(start date|effective date|date range)\b/) &&
    has(value, /\b(correct|correction|change|update|wrong|incorrect|move)\b/)
  ) {
    add({
      type: 'auth-date-correction',
      summary:
        'The authorization is approved, but its effective or start date must be corrected before the planned service date can be used.',
      gateImpact: 'Authorization effective-date correction is required',
      owner: INSURANCE_OPS,
      actionType: INSURANCE_FOLLOW_UP,
      action:
        'Insurance Ops to obtain the corrected authorization effective dates and update the structured authorization record.',
      relevance: 11,
    });
  }
}
export function addInsuranceOperationalFacts(
  context: OperationalFactContext,
  futureDiagnosticRequirement: boolean
): void {
  if (context.category !== 'insurance') return;
  const signals = insuranceSignals(context);
  for (const rule of [
    addPayerFeedback,
    addCorrectionsComplete,
    addOverlapRemediation,
    addSecondaryPending,
    addSignature,
    addDenialEdits,
    addResubmittedUnconfirmed,
    addPriorTermination,
    addResubmittedPending,
    addOverturned,
    addDenied,
    addAdditionalInfo,
    addAppeal,
    addPending,
  ]) {
    if (rule(context, signals, futureDiagnosticRequirement)) break;
  }
  addDateCorrection(context);
}

const FAMILY_OUTREACH = 'Family Outreach';

const PROVIDER_OUTREACH = 'Provider Outreach';

const INSURANCE_OPS = 'Insurance Ops';

const INSURANCE_FOLLOW_UP = 'Insurance Follow-Up';

const RESUBMITTED_PENDING = 'auth-resubmitted-pending';
