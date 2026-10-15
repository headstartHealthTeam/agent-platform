import { readableConversationList as readableList } from './conversation-sentences.js';
import { treatmentPlanRevisionTopics } from './conversation-text.js';
import { nextBusinessDay } from './dates.js';
import { hasOperationalText as has } from './operational-fact-context.js';
import type { OperationalFactContext } from './operational-fact-context.js';
import { treatmentPlanSignals } from './operational-treatment-plan-signals.js';
import type { TreatmentPlanSignals } from './operational-treatment-plan-signals.js';
function addPayerSubmission(
  context: OperationalFactContext,
  signals: TreatmentPlanSignals
): boolean {
  const { add } = context;
  const { pendingPayerSubmission } = signals;
  if (!pendingPayerSubmission) return false;
  add({
    type: 'payer-submission-pending',
    summary:
      'The treatment plan is awaiting submission to the payer; the payer-submission date is not recorded.',
    gateImpact: 'Treatment-plan payer submission remains unconfirmed',
    owner: 'Insurance Ops',
    actionType: 'Insurance Follow-Up',
    action:
      'Insurance Ops to confirm the treatment plan was submitted to the payer and document the submission date.',
    relevance: 12,
    issueKey: 'payer-submission',
  });
  return true;
}
function addHeadstartReview(
  context: OperationalFactContext,
  signals: TreatmentPlanSignals
): boolean {
  const { add } = context;
  const { submittedForHeadstartReview } = signals;
  if (!submittedForHeadstartReview) return false;
  add({
    type: 'tp-clinical-review',
    summary:
      'The provider reports that the treatment plan was submitted for Headstart or Clinical Quality review; the internal review disposition is not recorded.',
    gateImpact: 'Treatment plan remains in Headstart or Clinical Quality review',
    owner: 'CSM',
    actionType: PROVIDER_OUTREACH,
    action:
      'CSM to confirm the Clinical Quality review disposition and document any required edits or next submission step.',
    relevance: 12,
    issueKey: CLINICAL_REVIEW,
  });
  return true;
}
function addFamilySignature(
  context: OperationalFactContext,
  signals: TreatmentPlanSignals
): boolean {
  const { add } = context;
  const { familySignatureBeforeSubmission } = signals;
  if (!familySignatureBeforeSubmission) return false;
  add({
    type: 'tp-signature',
    summary:
      'Required family signatures remain outstanding before the treatment plan can be submitted.',
    gateImpact: 'Family signatures are required before treatment-plan submission',
    owner: 'CSM',
    actionType: FAMILY_OUTREACH,
    action:
      'CSM to obtain the required family signatures and document when the treatment plan is submitted for Clinical Quality review.',
    relevance: 12,
  });
  return true;
}
function addSecondaryReview(
  context: OperationalFactContext,
  signals: TreatmentPlanSignals
): boolean {
  const { add } = context;
  const { secondaryReviewAfterEdits } = signals;
  if (!secondaryReviewAfterEdits) return false;
  add({
    type: 'tp-clinical-review',
    summary:
      'The corrected treatment plan is awaiting secondary Clinical Quality review; the final disposition is not recorded.',
    gateImpact: 'Corrected treatment plan remains in secondary Clinical Quality review',
    owner: 'CSM',
    actionType: PROVIDER_OUTREACH,
    action:
      'CSM to confirm the secondary Clinical Quality disposition and document any remaining edits or submission step.',
    relevance: 12,
    issueKey: CLINICAL_REVIEW,
  });
  return true;
}
function addFamilyAssessment(
  context: OperationalFactContext,
  signals: TreatmentPlanSignals
): boolean {
  const { add } = context;
  const { familyAssessmentPending } = signals;
  if (!familyAssessmentPending) return false;
  add({
    type: 'tp-family-assessment-pending',
    summary:
      'A required family-completed assessment remains outstanding, preventing the provider from completing the treatment plan.',
    gateImpact: 'Family assessment is required before treatment-plan completion',
    owner: 'Intake',
    actionType: FAMILY_OUTREACH,
    action:
      'Intake to help the family complete the outstanding assessment, confirm receipt, and notify the provider that treatment-plan work can continue.',
    relevance: 12,
  });
  return true;
}
function addAssessmentValidity(
  context: OperationalFactContext,
  signals: TreatmentPlanSignals
): boolean {
  const { add } = context;
  const { agedAssessmentClarification } = signals;
  if (!agedAssessmentClarification) return false;
  add({
    type: 'tp-assessment-validity',
    summary:
      'The provider reports the treatment plan is otherwise ready, but needs confirmation whether the Vineland must be repeated because it is more than 90 days old.',
    gateImpact:
      'Clinical Quality must confirm whether an updated Vineland is required before treatment-plan submission',
    owner: 'CSM',
    actionType: PROVIDER_OUTREACH,
    action:
      'CSM to obtain Clinical Quality guidance on the aged Vineland, then confirm the provider either updates the assessment or submits the treatment plan for review.',
    relevance: 12,
    requestedInformation: 'Clinical Quality guidance on whether the Vineland must be repeated',
  });
  return true;
}
function addReadyUnsubmitted(
  context: OperationalFactContext,
  signals: TreatmentPlanSignals
): boolean {
  const { add } = context;
  const { completedButNotSubmitted } = signals;
  if (!completedButNotSubmitted) return false;
  add({
    type: 'tp-ready',
    summary:
      'The provider reports the treatment plan is complete, but it has not been submitted for Headstart or Clinical Quality review.',
    gateImpact: 'Treatment plan is complete but submission for review is not confirmed',
    owner: 'CSM',
    actionType: PROVIDER_OUTREACH,
    action:
      'CSM to confirm the completed treatment plan is submitted for review and document the Clinical Quality disposition.',
    relevance: 12,
  });
  return true;
}
function addSubmitted(context: OperationalFactContext, signals: TreatmentPlanSignals): boolean {
  const { date, asOf, add } = context;
  const sourceContext = context.context;
  const { contextualTreatmentAuthorizationSubmission, submittedForReview } = signals;
  if (!submittedForReview) return false;
  const reportedSubmissionDate = contextualTreatmentAuthorizationSubmission
    ? (date ?? sourceContext.reportedOccurrenceDate ?? null)
    : null;
  add({
    type: 'tp-submitted',
    summary: reportedSubmissionDate
      ? `The provider reports the treatment-plan request was submitted for clinical review on ${reportedSubmissionDate}; the Clinical Quality disposition must be confirmed in the structured record.`
      : 'The provider reports the treatment plan was submitted for clinical review; the Clinical Quality disposition must be confirmed in the structured record.',
    gateImpact:
      'Treatment plan was reported submitted; Clinical Quality disposition controls the next step',
    owner: 'CSM',
    actionType: PROVIDER_OUTREACH,
    action:
      'CSM to confirm the submitted treatment plan is in Clinical Quality review and document any requested edits or signatures.',
    milestoneDate: reportedSubmissionDate,
    followUpDate: nextBusinessDay(asOf),
    relevance: 10,
  });
  return true;
}
function addPlannedSubmission(
  context: OperationalFactContext,
  signals: TreatmentPlanSignals
): boolean {
  const { date, datePassed, asOf, add } = context;
  const dateLabel = String(date);
  const { submissionCommitment } = signals;
  if (!submissionCommitment) return false;
  add({
    type: 'tp-submission-planned',
    summary: datePassed
      ? `The provider planned to submit the treatment plan on ${dateLabel}, but no Clinical Quality or submission record confirms it occurred.`
      : date
        ? `The provider plans to submit the treatment plan on ${dateLabel}; Clinical Quality receipt is not yet confirmed.`
        : 'The provider is working toward treatment-plan submission; no exact submission date or Clinical Quality receipt is confirmed.',
    gateImpact: datePassed
      ? 'Planned submission to Clinical Quality passed without confirmation'
      : 'Submission to Clinical Quality is planned but not confirmed',
    owner: 'CSM',
    actionType: datePassed || !date ? PROVIDER_OUTREACH : 'Monitor',
    action: datePassed
      ? 'CSM to confirm whether the treatment plan was submitted, identify its Clinical Quality status, and document any required edits or signatures.'
      : date
        ? 'CSM to monitor the planned treatment-plan submission and confirm the Clinical Quality disposition.'
        : "CSM to confirm the provider's target submission date and any remaining work, then verify Clinical Quality receipt.",
    milestoneDate: date,
    followUpDate: datePassed || !date ? nextBusinessDay(asOf) : date,
    relevance: 11,
  });
  return true;
}
function addPlannedCompletion(
  context: OperationalFactContext,
  signals: TreatmentPlanSignals
): boolean {
  const { date, datePassed, asOf, add } = context;
  const dateLabel = String(date);
  const { futureCompletionCommitment } = signals;
  if (!futureCompletionCommitment) return false;
  add({
    type: 'tp-completion-planned',
    summary: datePassed
      ? `The provider's ${dateLabel} treatment-plan completion target passed without a confirmed submission or Clinical Quality record.`
      : `The provider expects to complete the treatment plan on ${date === null || date === '' ? 'the stated target date' : date}; submission and Clinical Quality receipt remain unconfirmed.`,
    gateImpact: datePassed
      ? 'Treatment-plan completion target passed without confirmation'
      : 'Treatment-plan completion is planned but not yet confirmed',
    owner: 'CSM',
    actionType: datePassed ? PROVIDER_OUTREACH : 'Monitor',
    action: datePassed
      ? 'CSM to confirm whether the treatment plan was completed and submitted and document the current Clinical Quality status.'
      : 'CSM to monitor the treatment-plan completion target and verify submission and Clinical Quality receipt.',
    milestoneDate: date,
    followUpDate: datePassed ? nextBusinessDay(asOf) : date,
    relevance: 11,
  });
  return true;
}
function addNotStarted(context: OperationalFactContext, signals: TreatmentPlanSignals): boolean {
  const { add } = context;
  const { planNotStarted, schoolScheduleDependency } = signals;
  if (!planNotStarted) return false;
  add({
    type: 'tp-not-started',
    summary: schoolScheduleDependency
      ? "The provider has not started the treatment plan and is waiting for the family's school schedule before finalizing treatment hours."
      : 'The provider has not started the treatment plan; drafting and submission timing are not yet established.',
    gateImpact: schoolScheduleDependency
      ? "Treatment-plan work is waiting on the family's school schedule"
      : 'Treatment-plan drafting has not started',
    owner: 'CSM',
    actionType: PROVIDER_OUTREACH,
    action: schoolScheduleDependency
      ? "CSM to confirm the family's school schedule with the provider so treatment hours and treatment-plan drafting can be finalized."
      : 'CSM to confirm when the provider will begin the treatment plan and obtain a committed submission date.',
    relevance: 11,
  });
  return true;
}
function addReady(context: OperationalFactContext, signals: TreatmentPlanSignals): boolean {
  const { add } = context;
  const { planReady } = signals;
  if (!planReady) return false;
  add({
    type: 'tp-ready',
    summary:
      'The provider reports the treatment plan is complete and awaiting submission; Clinical Quality status, required signatures, and payer-submission readiness must still be confirmed.',
    gateImpact:
      'Treatment plan is complete; Clinical Quality disposition and submission readiness remain unconfirmed',
    owner: 'CSM',
    actionType: PROVIDER_OUTREACH,
    action:
      'CSM to confirm the Clinical Quality disposition and resolve any required edits or signatures before payer submission.',
    relevance: 10,
  });
  return true;
}
function addRevisions(context: OperationalFactContext): boolean {
  const { text, value, add } = context;
  if (!(
    has(value, /\b(corrections?|revisions?|edits?|sent back|changes requested)\b/) &&
    has(value, /\b(treatment plan|\btp\b|plan|signature)\b/)
  ))
    return false;
  const revisionTopics = treatmentPlanRevisionTopics(text);
  add({
    type: 'tp-revisions',
    summary: revisionTopics.length
      ? `Clinical Quality requested treatment-plan edits to ${readableList(revisionTopics)}; provider resubmission is not recorded.`
      : 'Treatment-plan revisions are in progress following requested corrections; resubmission is not yet confirmed.',
    gateImpact: 'Treatment-plan corrections must be completed and resubmitted',
    owner: 'CSM',
    actionType: PROVIDER_OUTREACH,
    action:
      'CSM to confirm completion of the requested treatment-plan edits and the resubmission date.',
    relevance: revisionTopics.length ? 11 : 10,
    issueKey: CLINICAL_REVIEW,
  });
  return true;
}
function addDrafting(context: OperationalFactContext, signals: TreatmentPlanSignals): boolean {
  const { value, add } = context;
  const { planMention, futurePlanWork, staffingDependentDraft, homeDisruption } = signals;
  if (!(
    futurePlanWork ||
    (has(value, /\b(draft|drafting|working on|complete treatment plan|finish treatment plan)\b/) &&
      has(value, planMention))
  ))
    return false;
  add({
    type: 'tp-drafting',
    summary: staffingDependentDraft
      ? 'The provider is drafting the treatment plan but has delayed submission while awaiting RBT staffing; a committed submission date is not confirmed.'
      : homeDisruption
        ? 'The provider is drafting the treatment plan, with home renovations reported as a contributing delay; a committed submission date is not confirmed.'
        : 'The provider is still drafting the treatment plan; a completion and submission date is not confirmed.',
    gateImpact: staffingDependentDraft
      ? 'Treatment-plan submission is delayed while RBT staffing remains unresolved'
      : homeDisruption
        ? 'Treatment-plan drafting is delayed by a reported home disruption'
        : 'Treatment plan drafting remains incomplete',
    owner: 'CSM',
    actionType: PROVIDER_OUTREACH,
    action: staffingDependentDraft
      ? 'CSM to confirm whether the provider will submit the treatment plan before staffing is complete and obtain a committed submission date.'
      : homeDisruption
        ? "CSM to confirm the provider's current drafting status after the home disruption and obtain a committed submission date."
        : 'CSM to obtain the treatment-plan completion status and committed submission date.',
    // A date in a drafting note commonly means "follow up Wednesday",
    // not that treatment or plan submission is scheduled for that date.
    milestoneDate: null,
    relevance: staffingDependentDraft || homeDisruption ? 10 : 9,
  });
  return true;
}
function addUnavailable(context: OperationalFactContext): boolean {
  const { value, add } = context;
  if (!(
    has(value, /\b(provider|bcba)\b/) &&
    has(value, /\b(out for|out of office|unavailable|family emergency|medical leave|vacation)\b/)
  ))
    return false;
  add({
    type: 'tp-provider-unavailable',
    summary:
      'Provider availability delayed treatment-plan work; the current completion and submission timing is not confirmed.',
    gateImpact: 'Provider availability delayed treatment-plan completion',
    owner: 'CSM',
    actionType: PROVIDER_OUTREACH,
    action:
      "CSM to confirm the provider's current treatment-plan status and committed submission date.",
    relevance: 9,
  });
  return true;
}
function addSignature(context: OperationalFactContext, signals: TreatmentPlanSignals): void {
  const { value, add } = context;
  const { typedNameSignature } = signals;
  if (typedNameSignature) {
    add({
      type: 'tp-signature-format',
      summary:
        'The family must re-sign the treatment plan using the required typed-name format before submission can proceed.',
      gateImpact: 'Treatment plan requires a corrected family signature',
      owner: 'CSM',
      actionType: FAMILY_OUTREACH,
      action:
        'CSM to have the family re-sign the treatment plan using the required typed-name format and confirm the corrected signature is recorded.',
      relevance: 11,
    });
  } else if (
    !has(
      value,
      /\bno (?:additional )?(?:parent|guardian|provider)? ?signatures? (?:are )?(?:needed|required|missing|outstanding)\b|\bsignatures? (?:are )?(?:complete|completed|received|not needed)\b/
    ) &&
    has(
      value,
      /\b(waiting on|waiting for|need(?:s|ed)?|missing|pending|not signed|hasn t signed|has not signed).{0,35}\b(parent|guardian|provider)? ?(signature|sign)\b|\b(parent|guardian|provider)? ?(signature|sign).{0,35}\b(waiting|needed|missing|pending|not signed)\b/
    )
  ) {
    add({
      type: 'tp-signature',
      summary:
        'A required treatment-plan signature remains outstanding before submission can proceed.',
      gateImpact: 'Required treatment-plan signature is missing',
      owner: 'CSM',
      actionType: PROVIDER_OUTREACH,
      action:
        'CSM to obtain the missing treatment-plan signature and document when submission can proceed.',
      relevance: 10,
    });
  }
}
export function addTreatmentPlanOperationalFacts(context: OperationalFactContext): void {
  if (!(
    context.category === 'treatmentPlan' ||
    (context.currentSlaNote && has(context.value, /\b(?:treatment plan|tp)\b/))
  ))
    return;
  const signals = treatmentPlanSignals(context);
  const rules = [
    addPayerSubmission,
    addHeadstartReview,
    addFamilySignature,
    addSecondaryReview,
    addFamilyAssessment,
    addAssessmentValidity,
    addReadyUnsubmitted,
    addSubmitted,
    addPlannedSubmission,
    addPlannedCompletion,
    addNotStarted,
    addReady,
    addRevisions,
    addDrafting,
    addUnavailable,
  ];
  for (const rule of rules) {
    if (rule(context, signals)) break;
  }
  addSignature(context, signals);
}
const PROVIDER_OUTREACH = 'Provider Outreach';
const FAMILY_OUTREACH = 'Family Outreach';
const CLINICAL_REVIEW = 'clinical-review';
