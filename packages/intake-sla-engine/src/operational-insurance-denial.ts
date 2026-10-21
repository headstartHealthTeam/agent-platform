import type { OperationalFact } from './operational-fact-context.js';
import type { InsuranceSignals } from './operational-insurance-signals.js';

function nextRoute(signals: InsuranceSignals): string {
  if (signals.newAuthorizationRequired)
    return '; any further request requires a new prior authorization';
  if (signals.resubmissionNotConfirmed)
    return '; a new authorization submission remains unconfirmed';
  return '; the next payer route is not yet documented';
}
function denialSummary(signals: InsuranceSignals, reversedApproval: boolean): string {
  const { denialReason, deniedAfterReview, deniedReviewKind, appealKind } = signals;
  if (denialReason) {
    if (deniedAfterReview)
      return `The payer denied the authorization again after ${deniedReviewKind} because ${denialReason}${nextRoute(signals)}.`;
    const pending = appealKind
      ? `; ${appealKind} is now pending`
      : '; the next payer action is not yet documented';
    return `The payer denied the authorization because ${denialReason}${pending}.`;
  }
  if (reversedApproval)
    return 'The payer reversed a prior authorization approval; the reason and next payer action are not yet documented.';
  if (deniedAfterReview)
    return `The payer denied the authorization again after ${deniedReviewKind}${nextRoute(signals)}.`;
  const pending = appealKind
    ? ` and ${appealKind} is now pending`
    : '; the denial basis and next payer action are not yet documented';
  return `The payer denied the authorization${pending}.`;
}
function denialGate(signals: InsuranceSignals, reversedApproval: boolean): string {
  if (reversedApproval) return 'Reversed authorization approval requires payer resolution';
  if (signals.overlappingAuthorization)
    return 'Prior-provider authorization overlap must be resolved with the family';
  if (signals.deniedAfterReview) return 'Authorization remains denied after reconsideration';
  if (signals.appealKind)
    return `Authorization denial remains unresolved while ${signals.appealKind} is pending`;
  return 'Authorization denial requires payer resolution';
}
function denialOwner(signals: InsuranceSignals): Pick<OperationalFact, 'owner' | 'actionType'> {
  if (signals.overlappingAuthorization) return { owner: 'Intake', actionType: 'Family Outreach' };
  if (signals.treatmentPlanCorrectionDenial)
    return { owner: 'CSM', actionType: 'Provider Outreach' };
  return { owner: 'Insurance Ops', actionType: 'Insurance Follow-Up' };
}
function denialAction(signals: InsuranceSignals): string {
  const {
    overlappingAuthorization,
    treatmentPlanCorrectionDenial,
    deniedAfterReview,
    newAuthorizationRequired,
    resubmissionNotConfirmed,
    requestedInformation,
    appealKind,
  } = signals;
  if (overlappingAuthorization)
    return 'Intake to contact the family, confirm the prior provider has terminated or end-dated its authorization, and document the termination date for Insurance Ops to request reprocessing.';
  if (treatmentPlanCorrectionDenial) {
    if (deniedAfterReview && newAuthorizationRequired)
      return 'CSM to have the provider address the remaining payer-requested treatment-plan revisions and route the corrected plan to Insurance Ops for a new prior authorization.';
    return 'CSM to have the provider complete the payer-requested treatment-plan revisions and route the corrected plan to Insurance Ops for resubmission.';
  }
  if (deniedAfterReview && resubmissionNotConfirmed)
    return 'Insurance Ops to confirm whether a new authorization request was submitted after the second denial and document the current payer status and next follow-up date.';
  if (requestedInformation)
    return `Insurance Ops to obtain and submit ${requestedInformation} and document the payer response and next follow-up date.`;
  if (appealKind)
    return `Insurance Ops to confirm the ${appealKind} status, required next step, and payer decision date.`;
  return 'Insurance Ops to confirm the denial basis and document the specific next payer action and follow-up date.';
}
export function deniedInsuranceFact(value: string, signals: InsuranceSignals): OperationalFact {
  const reversedApproval = /\b(?:did not mean to approve|reversed approval)\b/.test(value);
  return {
    type: signals.denialReason ? 'auth-denial-reason' : 'auth-denied',
    summary: denialSummary(signals, reversedApproval),
    gateImpact: denialGate(signals, reversedApproval),
    ...denialOwner(signals),
    action: denialAction(signals),
    relevance: 10,
    denialReason: signals.denialReason,
    appealKind: signals.appealKind,
    requestedInformation: signals.requestedInformation,
  };
}
