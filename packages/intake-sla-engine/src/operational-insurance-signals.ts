import { normalizeOperationalText as normalize } from './conversation-text.js';
import { extractDenialReason } from './denial-reason.js';
import { hasOperationalText as has } from './operational-fact-context.js';
import type { OperationalFactContext } from './operational-fact-context.js';
import { extractRequestedInformation } from './requested-information.js';
export interface InsuranceSignals {
  readonly normalizedInsuranceText: string;
  readonly extractedDenialReason: string | null;
  readonly denialReason: string | null;
  readonly requestedInformation: string | null;
  readonly payerFeedbackFamilyFollowUp: boolean;
  readonly deniedAfterReview: boolean;
  readonly deniedReviewKind: string;
  readonly reconsiderationOnlyAvailable: boolean;
  readonly activePeerReview: boolean;
  readonly activeReconsideration: boolean;
  readonly activeAppeal: boolean;
  readonly appealKind: string | null;
  readonly treatmentPlanCorrectionDenial: boolean;
  readonly newAuthorizationRequired: boolean;
  readonly overlappingAuthorization: boolean;
  readonly preventiveDenialLanguage: boolean;
  readonly explicitNewDenial: boolean;
  readonly returningToCareContext: boolean;
  readonly returningAfterHistoricalDenial: boolean;
  readonly historicalDenialReference: boolean;
  readonly hypotheticalDenial: boolean;
  readonly priorServiceTermination: boolean;
  readonly correctionsCompleteResubmissionUnconfirmed: boolean;
  readonly resubmissionNotConfirmed: boolean;
  readonly overlapReportedCleared: boolean;
  readonly terminationProofMissing: boolean;
  readonly resubmittedAfterDenial: boolean;
  readonly signaturesBeforeResubmission: boolean;
  readonly denialEditsInProgress: boolean;
  readonly resubmittedAfterDenialWithoutDisposition: boolean;
  readonly secondaryPendingAfterDenial: boolean;
}
function denialEvidence(
  context: OperationalFactContext
): Pick<
  InsuranceSignals,
  | 'normalizedInsuranceText'
  | 'extractedDenialReason'
  | 'denialReason'
  | 'requestedInformation'
  | 'payerFeedbackFamilyFollowUp'
> {
  const { text, value, currentSlaNote } = context;
  const sourceContext = context.context;
  const normalizedInsuranceText = normalize(value);
  const extractedDenialReason = extractDenialReason(text);
  const denialReason =
    sourceContext.opportunityName &&
    normalize(extractedDenialReason) === normalize(sourceContext.opportunityName)
      ? null
      : extractedDenialReason;
  const requestedInformation = extractRequestedInformation(text);
  const payerFeedbackFamilyFollowUp =
    currentSlaNote &&
    has(
      value,
      /\b(?:payer|insurance|ins|ia)\b.{0,55}\b(?:feedback|response|follow[- ]?up|request)\b/
    ) &&
    has(
      value,
      /\b(?:speak(?:ing)?|talk(?:ing)?|contact(?:ing|ed)?|follow(?:ing)? up)\b.{0,50}\b(?:family|parent|caregiver)\b/
    ) &&
    !has(value, /\b(?:approved|denied|resubmitted|appeal|reconsideration|peer review)\b/);
  return {
    normalizedInsuranceText,
    extractedDenialReason,
    denialReason,
    requestedInformation,
    payerFeedbackFamilyFollowUp,
  };
}
function appealSignals(
  context: OperationalFactContext
): Pick<
  InsuranceSignals,
  | 'deniedAfterReview'
  | 'deniedReviewKind'
  | 'reconsiderationOnlyAvailable'
  | 'activePeerReview'
  | 'activeReconsideration'
  | 'activeAppeal'
  | 'appealKind'
> {
  const { value } = context;
  const deniedAfterReview = has(
    value,
    /\b(?:denied again|reconsideration (?:was |is )?denied|appeal (?:was |is )?denied|peer review (?:was |is )?denied)\b/
  );
  const deniedReviewKind = has(value, /\bappeal(?:ed)?\b/)
    ? 'appeal'
    : has(value, /\bpeer review|peer to peer\b/)
      ? 'peer review'
      : 'reconsideration';
  const reconsiderationOnlyAvailable = has(
    value,
    /\b(?:one|a|any|additional) reconsideration request can be submitted\b|\breconsideration (?:is )?(?:available|allowed)\b/
  );
  const activePeerReview = has(
    value,
    /\b(?:authorization|request|case)\b.{0,25}\b(?:is |remains )?(?:in |under )peer review\b|\b(?:peer review|peer to peer)\b.{0,45}\b(?:pending|requested|scheduled|submitted|sent|underway|in progress)\b|\b(?:pending|requested|scheduled|submitted|sent|underway|in progress)\b.{0,45}\b(?:peer review|peer to peer)\b/
  );
  const activeReconsideration = has(
    value,
    /\breconsideration\b.{0,45}\b(?:pending|submitted|sent|requested|under review|in progress)\b|\b(?:pending|submitted|sent|requested|under review|in progress)\b.{0,45}\breconsideration\b/
  );
  const activeAppeal = has(
    value,
    /\bappeal\b.{0,45}\b(?:pending|submitted|sent|filed|requested|under review|in progress)\b|\b(?:pending|submitted|sent|filed|requested|under review|in progress)\b.{0,45}\bappeal\b/
  );
  const appealKind =
    deniedAfterReview || reconsiderationOnlyAvailable
      ? null
      : activePeerReview
        ? 'peer review'
        : activeReconsideration
          ? 'reconsideration'
          : activeAppeal
            ? 'appeal'
            : null;
  return {
    deniedAfterReview,
    deniedReviewKind,
    reconsiderationOnlyAvailable,
    activePeerReview,
    activeReconsideration,
    activeAppeal,
    appealKind,
  };
}
function denialDetail(
  context: OperationalFactContext,
  signals: Pick<InsuranceSignals, 'denialReason'>
): Pick<
  InsuranceSignals,
  'treatmentPlanCorrectionDenial' | 'newAuthorizationRequired' | 'overlappingAuthorization'
> {
  const { value } = context;
  const { denialReason } = signals;
  const treatmentPlanCorrectionDenial = Boolean(
    denialReason &&
    /\b(?:treatment plan|behavior plan|bip|replacement behaviors?|skill acquisition|clinical goal|goals?|transition plan|assessment results?)\b/i.test(
      denialReason
    )
  );
  const newAuthorizationRequired = has(
    value,
    /\b(?:additional|further|next) requests? (?:will |would )?require(?:s|d)? a new prior authorization\b|\bnew prior authorization (?:is |will be )?required\b/
  );
  const overlappingAuthorization = Boolean(
    denialReason && /overlapping or duplicate services/i.test(denialReason)
  );
  return { treatmentPlanCorrectionDenial, newAuthorizationRequired, overlappingAuthorization };
}
function historicalSignals(
  context: OperationalFactContext
): Pick<
  InsuranceSignals,
  | 'preventiveDenialLanguage'
  | 'explicitNewDenial'
  | 'returningToCareContext'
  | 'returningAfterHistoricalDenial'
  | 'historicalDenialReference'
  | 'hypotheticalDenial'
> {
  const { value } = context;
  const preventiveDenialLanguage = has(
    value,
    /\b(don t|do not|won t|will not|avoid|prevent|without|risk of)\b.{0,80}\b(denial|denied)\b|\b(may|might|could|would)\b.{0,55}\b(?:be )?denied\b|\b(?:will|would|can|may|might|could)\b.{0,55}\b(?:cause|trigger|lead to|result in|issue)\b.{0,35}\bdenial\b/
  );
  const explicitNewDenial = has(
    value,
    /\b(?:current|latest|new|recent)\b.{0,45}\b(?:denial|denied)\b|\b(?:just|today|yesterday)\b.{0,45}\bdenied\b|\bdenied\b.{0,45}\b(?:today|yesterday|this (?:morning|afternoon|week))\b/
  );
  const returningToCareContext = has(
    value,
    /\b(?:client )?returning to care\b|\b(?:returning|get back|back) (?:in|into|to) care\b|\brestart care\b|\bre[- ]run vob\b|\bstart the intake process again\b/
  );
  const returningAfterHistoricalDenial =
    returningToCareContext && has(value, /\b(?:denied|denial)\b/) && !explicitNewDenial;
  const historicalDenialReference =
    (has(
      value,
      /\b(?:prior|previous|original|earlier|past|previously)\b.{0,100}\b(?:denial|denied)\b|\b(?:denied|denial)\b.{0,45}\b(?:on file|at that time|outside (?:of )?the appeals? window)\b/
    ) ||
      returningAfterHistoricalDenial) &&
    !explicitNewDenial;
  const hypotheticalDenial = preventiveDenialLanguage || historicalDenialReference;
  return {
    preventiveDenialLanguage,
    explicitNewDenial,
    returningToCareContext,
    returningAfterHistoricalDenial,
    historicalDenialReference,
    hypotheticalDenial,
  };
}
function remediationSignals(
  context: OperationalFactContext,
  signals: Pick<InsuranceSignals, 'normalizedInsuranceText'>
): Pick<
  InsuranceSignals,
  | 'priorServiceTermination'
  | 'correctionsCompleteResubmissionUnconfirmed'
  | 'resubmissionNotConfirmed'
  | 'overlapReportedCleared'
  | 'terminationProofMissing'
> {
  const { text, value } = context;
  const { normalizedInsuranceText } = signals;
  const priorServiceTermination =
    has(
      value,
      /\b(?:end|ended|ending|terminate|terminated|terminating|withdraw|withdrew|withdrawn|withdrawing|pull|pulled|discharge|discharged)\b.{0,80}\b(?:current|prior|existing|other)\b.{0,35}\b(?:aba|provider|services|authorization)\b|\b(?:current|prior|existing|other)\b.{0,35}\b(?:aba|provider|services|authorization)\b.{0,80}\b(?:end|ended|ending|terminate|terminated|terminating|withdraw|withdrew|withdrawn|withdrawing|pull|pulled|discharge|discharged)\b/
    ) && has(value, /\b(?:double billing|overlap|authorization|insurance)\b/);
  const correctionsCompleteResubmissionUnconfirmed =
    has(value, /\bablls(?:r|[- ]r)?\b.{0,100}\b(?:grid|graph)\b/) &&
    has(value, /\b(?:added|complete|completed|corrected|updated|on aloha)\b/) &&
    (has(value, /\b(?:submit asap|resubmit(?:ted|ting)?|send again)\b/) ||
      /\b(?:is|was|has)\b.{0,100}\b(?:plan|authorization|pa|ta)\b.{0,30}\bresubmitted\b\s*\?/i.test(
        text
      ));
  const resubmissionNotConfirmed = has(
    normalizedInsuranceText,
    /\b(?:have we|has (?:it|this|the (?:pa|ta|authorization))|was (?:it|this|the (?:pa|ta|authorization))|checking(?: in)?(?: to see)? (?:whether|if)|if we)\b.{0,100}\bresubmit(?:ted|ting)?\b|\b(?:doesn t appear|does not appear|not yet|hasn t|has not|wasn t|was not|isn t|is not)\b.{0,45}\bresubmit(?:ted|ting)?\b|\bnot (?:yet )?(?:been )?resubmitted\b/
  );
  const overlapReportedCleared =
    has(
      normalizedInsuranceText,
      /\b(?:overlap(?:ping|ped)?|duplicate services?|prior (?:aba )?(?:authorization|provider))\b/
    ) &&
    has(
      normalizedInsuranceText,
      /\b(?:cleared|resolved|terminated|ended|good to submit|ready to submit)\b/
    );
  const terminationProofMissing =
    has(
      normalizedInsuranceText,
      /\b(?:closure|termination|discharge|end date) (?:letter|proof|documentation)|\bproof\b.{0,30}\b(?:termination|closure|ended)\b|\bletter\b.{0,45}\b(?:termination|closure|ended|overlap)|\brequested\b.{0,35}\b(?:the )?letter\b/
    ) &&
    has(
      normalizedInsuranceText,
      /\b(?:not received|hasn t (?:been )?received|has not (?:been )?received|missing|awaiting|waiting|pending)\b/
    );
  return {
    priorServiceTermination,
    correctionsCompleteResubmissionUnconfirmed,
    resubmissionNotConfirmed,
    overlapReportedCleared,
    terminationProofMissing,
  };
}
function resubmissionSignals(
  context: OperationalFactContext,
  signals: Pick<InsuranceSignals, 'resubmissionNotConfirmed'>
): Pick<
  InsuranceSignals,
  | 'resubmittedAfterDenial'
  | 'signaturesBeforeResubmission'
  | 'denialEditsInProgress'
  | 'resubmittedAfterDenialWithoutDisposition'
  | 'secondaryPendingAfterDenial'
> {
  const { value } = context;
  const { resubmissionNotConfirmed } = signals;
  const resubmittedAfterDenial =
    !resubmissionNotConfirmed &&
    has(value, /\b(?:resubmit|resubmitted|new (?:pa|ta|authorization)|sent again)\b/) &&
    has(value, /\b(?:denied|denial)\b/) &&
    has(value, /\b(?:pending|awaiting|under review|no final determination)\b/);
  const signaturesBeforeResubmission =
    has(
      value,
      /\b(?:parent|family|caregiver)\b.{0,45}\b(?:signature|signatures|sign(?:ed|ing)?)\b|\b(?:signature|signatures|sign(?:ed|ing)?)\b.{0,45}\b(?:parent|family|caregiver)\b/
    ) &&
    has(value, /\b(?:awaiting|waiting|need|needs|missing|pending)\b/) &&
    has(value, /\b(?:resubmit(?:ted|ting)?|resubmission|submit again|send again)\b/);
  const denialEditsInProgress =
    has(value, /\b(?:denied|denial)\b/) &&
    has(value, /\b(?:edit|edits|revision|revisions|correction|corrections)\b/) &&
    has(value, /\b(?:working|completing|making|addressing|will work)\b/);
  const resubmittedAfterDenialWithoutDisposition =
    !resubmissionNotConfirmed &&
    has(value, /\b(?:denied|denial)\b/) &&
    has(value, /\b(?:resubmitted|submitted again|sent again)\b/) &&
    !has(value, /\b(?:approved|denied again|final determination)\b/);
  const secondaryPendingAfterDenial =
    has(value, /\b(?:pending|awaiting|under review)\b/) &&
    has(value, /\bsecondary\b/) &&
    has(
      value,
      /\b(?:following|after|prior)\b.{0,35}\bdenial\b|\bdenial\b.{0,35}\b(?:following|after|prior)\b/
    );
  return {
    resubmittedAfterDenial,
    signaturesBeforeResubmission,
    denialEditsInProgress,
    resubmittedAfterDenialWithoutDisposition,
    secondaryPendingAfterDenial,
  };
}
export function insuranceSignals(context: OperationalFactContext): InsuranceSignals {
  const evidence = denialEvidence(context);
  const appeal = appealSignals(context);
  const detail = denialDetail(context, evidence);
  const historical = historicalSignals(context);
  const remediation = remediationSignals(context, evidence);
  return {
    ...evidence,
    ...appeal,
    ...detail,
    ...historical,
    ...remediation,
    ...resubmissionSignals(context, remediation),
  };
}
