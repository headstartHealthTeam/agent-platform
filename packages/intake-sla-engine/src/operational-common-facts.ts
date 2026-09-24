import type { CommonOperationalSignals } from './operational-common-signals.js';
import { hasOperationalText as has } from './operational-fact-context.js';
import type { OperationalFactContext } from './operational-fact-context.js';
function addProviderContinuity(
  context: OperationalFactContext,
  signals: CommonOperationalSignals
): void {
  const { add, category } = context;
  const { providerContinuityRisk } = signals;
  if (providerContinuityRisk) {
    add({
      type: 'provider-viability',
      summary:
        category === 'rbt'
          ? 'The client is ready for direct-care scheduling, but the provider has not confirmed continuing with Headstart; the first 97153 plan remains unconfirmed.'
          : 'The provider has not confirmed continuing with Headstart, so the current clinical milestone and submission timing cannot be completed as planned.',
      gateImpact: 'Provider participation must be confirmed before the next clinical milestone',
      owner: 'CSM',
      actionType: PROVIDER_OUTREACH,
      action:
        'CSM to confirm whether the provider will continue with Headstart and document either the committed next milestone or the reassignment/closure path.',
      relevance: 12,
    });
  }
}
function addProviderReassignment(
  context: OperationalFactContext,
  signals: CommonOperationalSignals
): void {
  const { value, add } = context;
  const { providerContinuityRisk, providerReassignmentDecision } = signals;
  if (providerReassignmentDecision && !providerContinuityRisk) {
    add({
      type: 'provider-viability',
      summary: has(value, /\boutside (?:(?:their|the|her|his|our|my) )?scope\b/)
        ? 'The provider reported that the case is outside their scope; the transfer or closure path remains unresolved.'
        : 'The provider declined or rejected the case, so provider reassignment is required before the next clinical milestone can proceed.',
      gateImpact: 'Provider reassignment or a documented closure decision is required',
      owner: 'CSM',
      actionType: PROVIDER_OUTREACH,
      action:
        'CSM to confirm the reassignment, transfer, or closure decision and document the next committed milestone.',
      relevance: 12,
    });
  }
}
function addServiceContinuation(
  context: OperationalFactContext,
  signals: CommonOperationalSignals
): void {
  const { add, category } = context;
  const { contactClosureRisk, serviceContinuationDecision } = signals;
  if (serviceContinuationDecision) {
    const owner = category === 'treatmentPlan' ? 'CSM' : 'Intake';
    add({
      type: 'intake-continuation-decision',
      summary: contactClosureRisk
        ? 'Contact with the family remains difficult and possible case closure is being considered; no final closure decision is documented.'
        : 'Continued services are uncertain while the family or case worker decides whether intake should move forward; no restart or closure decision is documented.',
      gateImpact: 'Family or case-worker decision is required before intake can continue',
      owner,
      actionType: FAMILY_OUTREACH,
      action: `${owner} to confirm the family or case worker's decision and document whether the case should resume, remain on hold, or close.`,
      relevance: 12,
    });
  }
}
function addProviderFollowUps(
  context: OperationalFactContext,
  signals: CommonOperationalSignals
): void {
  const { add } = context;
  const { providerMissedFollowUps } = signals;
  if (providerMissedFollowUps) {
    add({
      type: 'provider-unresponsive',
      summary:
        'The provider missed repeated CSM follow-ups, so the current clinical milestone and committed next date remain unconfirmed.',
      gateImpact: 'Provider response is required to confirm the next milestone',
      owner: 'CSM',
      actionType: PROVIDER_OUTREACH,
      action:
        'CSM to escalate provider outreach and document the current milestone, blocker, and committed next date.',
      relevance: 12,
    });
  }
}
function addCredentialing(
  context: OperationalFactContext,
  signals: CommonOperationalSignals
): void {
  const { add } = context;
  const { credentialingPending } = signals;
  if (credentialingPending) {
    add({
      type: 'rbt-credentialing',
      summary:
        'RBT credentialing remains in progress; client assignment and the first 97153 date cannot be confirmed until the credentialing path is cleared.',
      gateImpact: 'RBT credentialing must clear before treatment can start',
      owner: 'RBT Team',
      actionType: 'RBT Follow-Up',
      action:
        'RBT Team to confirm the credentialing status, remaining requirement, and expected clearance date, then document the client assignment and first 97153 plan.',
      relevance: 12,
    });
  }
}
function addPartialApproval(
  context: OperationalFactContext,
  signals: CommonOperationalSignals
): void {
  const { add } = context;
  const { partialApprovalUnderReview } = signals;
  if (partialApprovalUnderReview) {
    add({
      type: 'auth-partial-approval',
      summary:
        'The payer partially approved treatment hours, and reconsideration for additional hours is being submitted; the reconsideration outcome is not recorded.',
      gateImpact:
        'Partial approval is active while the additional-hours reconsideration remains unresolved',
      owner: 'Insurance Ops',
      actionType: 'Insurance Follow-Up',
      action:
        'Insurance Ops to confirm the approved hours, reconsideration submission date, and next payer decision date.',
      relevance: 13,
    });
  }
}
function addFamilySignature(
  context: OperationalFactContext,
  signals: CommonOperationalSignals
): void {
  const { add } = context;
  const { familySignaturePending } = signals;
  if (familySignaturePending) {
    add({
      type: 'family-signature-pending',
      summary:
        'A required family signature remains outstanding before the current authorization or treatment-plan step can advance.',
      gateImpact: 'Family signature is required before the next payer milestone',
      owner: 'Intake',
      actionType: FAMILY_OUTREACH,
      action:
        'Intake to obtain the required family signature, document the signed date, and route the completed item to the current owner.',
      relevance: 12,
    });
  }
}
function addFamilyRequirement(
  context: OperationalFactContext,
  signals: CommonOperationalSignals
): void {
  const { add } = context;
  const { selfPacedFamilyRequirement } = signals;
  if (selfPacedFamilyRequirement) {
    add({
      type: 'family-prerequisite-in-progress',
      summary:
        'The family and provider report that the outstanding intake requirement is in progress without urgency, but the exact item and completion date are not documented.',
      gateImpact: 'Family prerequisite is in progress without a committed completion date',
      owner: 'Intake',
      actionType: FAMILY_OUTREACH,
      action:
        'Intake to identify the outstanding requirement and document the expected completion date or confirmed reason no immediate follow-up is needed.',
      relevance: 9,
      specificityMissing: true,
    });
  }
}
function addHearing(context: OperationalFactContext, signals: CommonOperationalSignals): void {
  const { value, add } = context;
  const { stateFairHearing } = signals;
  if (stateFairHearing) {
    const paired = has(
      value,
      /\b(?:both|those|these|them|their|kids|children|clients|cases|siblings)\b/
    );
    const alternateCoverage = has(
      value,
      /\b(?:traditional medicaid|switch(?:ing)? (?:to )?medicaid|alternate coverage|other coverage)\b/
    );
    add({
      type: 'auth-state-fair-hearing',
      summary: paired
        ? `After the out-of-network denial and appeal, the provider-parent requested a state fair hearing for both linked siblings${alternateCoverage ? ' and is also exploring traditional Medicaid' : ''}; both remain on hold pending a viable coverage path.`
        : `After the payer denial and appeal, the family or provider requested a state fair hearing${alternateCoverage ? ' and is also exploring alternate Medicaid coverage' : ''}; the case remains on hold pending a viable coverage path.`,
      gateImpact:
        'State fair hearing or alternate coverage outcome is pending after the appeal denial',
      owner: 'CSM',
      actionType: PROVIDER_OUTREACH,
      action:
        'CSM to confirm the state fair hearing and alternate-coverage outcome, then document the viable authorization path and restart condition.',
      relevance: 13,
    });
  }
}
function addMedicalReschedule(
  context: OperationalFactContext,
  signals: CommonOperationalSignals
): void {
  const { add } = context;
  const { medicalReschedule } = signals;
  if (medicalReschedule) {
    add({
      type: 'ia-medical-reschedule',
      summary:
        'The IA was scheduled, but a family medical issue required rescheduling; no replacement assessment date is confirmed.',
      gateImpact: 'IA rescheduling is pending after a family medical issue',
      owner: 'CSM',
      actionType: FAMILY_OUTREACH,
      action:
        "CSM to confirm the family's readiness and document the replacement IA date with the provider.",
      relevance: 10,
    });
  }
}
function addPartialAssessment(
  context: OperationalFactContext,
  signals: CommonOperationalSignals
): void {
  const { add } = context;
  const { partialAssessment } = signals;
  if (partialAssessment) {
    add({
      type: 'ia-partial',
      summary:
        'The parent portion of the initial assessment is complete, but the client-facing assessment portion remains pending.',
      gateImpact: 'Initial assessment is only partially complete',
      owner: 'CSM',
      actionType: PROVIDER_OUTREACH,
      action:
        'CSM to confirm when the remaining client-facing assessment portion will occur and verify the completed 97151 date in Salesforce or linked billing.',
      relevance: 11,
    });
  }
}
function addProviderCapacity(context: OperationalFactContext): void {
  const { value, add } = context;
  if (
    has(value, /\b(can t intake|cannot intake|not able to intake)\b/) ||
    (has(value, /\b(provider|bcba|practice)\b/) &&
      has(
        value,
        /\b(at capacity|capacity|overwhelmed|workload|resign(?:ed|ation)|left the practice)\b/
      ))
  ) {
    add({
      type: 'provider-capacity',
      summary:
        'The provider reported they cannot take the client now because of provider capacity or staffing constraints; no replacement intake plan is confirmed.',
      gateImpact: 'Provider capacity prevents the next intake milestone',
      owner: 'CSM',
      actionType: PROVIDER_OUTREACH,
      action:
        'CSM to confirm whether the provider can resume intake, identify an alternate provider if needed, and document a committed next milestone.',
      relevance: 10,
    });
  }
}
function addRenderingProvider(context: OperationalFactContext): void {
  const { value, add } = context;
  if (
    has(value, /\b(rendering provider|ia provider|ta provider|bcba)\b/) &&
    has(
      value,
      /\b(missing|not assigned|needs? to be assigned|incorrect|wrong provider|needs? to be added to aloha)\b/
    )
  ) {
    add({
      type: 'rendering-provider-missing',
      summary:
        'The required rendering provider is missing or incorrect, preventing the case from advancing to the next clinical or payer milestone.',
      gateImpact: 'Required rendering provider assignment is incomplete',
      owner: 'CSM',
      actionType: SALESFORCE_UPDATE,
      action:
        'CSM to confirm the correct rendering provider and update the Opportunity before the next clinical or authorization step.',
      relevance: 10,
    });
  }
}
function addHold(context: OperationalFactContext, signals: CommonOperationalSignals): void {
  const { value, add } = context;
  const { operationalHold, stateFairHearing } = signals;
  if (
    !stateFairHearing &&
    operationalHold &&
    has(value, /\b(sibling|brother|sister|together|pair|paired)\b/)
  ) {
    add({
      type: 'paired-hold',
      summary:
        'The provider requested a hold so this client can progress with a paired sibling; the restart condition and timing are not confirmed.',
      gateImpact: 'Provider hold request and paired-client dependency',
      owner: 'CSM',
      actionType: PROVIDER_OUTREACH,
      action:
        'CSM to confirm the paired-client restart condition and committed restart date with the provider.',
      relevance: 10,
    });
  } else if (!stateFairHearing && operationalHold) {
    add({
      type: 'provider-hold',
      summary:
        'The provider or family requested that intake pause; the restart condition and timing are not confirmed.',
      gateImpact: 'Hold request with no confirmed restart condition',
      owner: 'CSM',
      actionType: PROVIDER_OUTREACH,
      action:
        'CSM to confirm why the Opportunity remains on hold and document the restart condition and target date.',
      relevance: 9,
    });
  }
}
function addServiceSetting(
  context: OperationalFactContext,
  signals: CommonOperationalSignals
): void {
  const { add } = context;
  const { rbtServiceSettingConstraint } = signals;
  if (rbtServiceSettingConstraint) {
    add({
      type: 'rbt-service-setting-constraint',
      summary:
        "The current service setting cannot accommodate an RBT, so the provider's direct-care plan and first 97153 date remain unconfirmed.",
      gateImpact: 'A workable direct-care setting and first 97153 plan must be confirmed',
      owner: 'CSM',
      actionType: PROVIDER_OUTREACH,
      action:
        'CSM to confirm the workable service model and setting with the provider and family, then document the first 97153 plan or the appropriate stage path.',
      relevance: 12,
    });
  }
}
function addFamilyAvailability(
  context: OperationalFactContext,
  signals: CommonOperationalSignals
): void {
  const { add, category } = context;
  const {
    strongFamilyConstraint,
    treatmentPlanFamilyConstraint,
    downstreamStaffingSchedule,
    gateSpecificAvailability,
    rbtServiceSettingConstraint,
  } = signals;
  if (
    (['intakeScheduling', 'rbt'].includes(category) ||
      (category === 'treatmentPlan' &&
        treatmentPlanFamilyConstraint &&
        !downstreamStaffingSchedule)) &&
    (strongFamilyConstraint || gateSpecificAvailability) &&
    !rbtServiceSettingConstraint
  ) {
    add({
      type: 'family-availability',
      summary:
        'Family availability or custody constraints are preventing the provider from confirming whether services can proceed on a consistent schedule.',
      gateImpact: 'Family availability or care-plan feasibility remains unresolved',
      owner: 'CSM',
      actionType: FAMILY_OUTREACH,
      action:
        'CSM to align the provider and family on a workable schedule and document whether services can proceed.',
      relevance: 10,
    });
  }
}
function addInterpreter(context: OperationalFactContext): void {
  const { value, add, category } = context;
  if (
    ['insurance', 'intakeScheduling', 'treatmentPlan'].includes(category) &&
    has(value, /\b(interpreter|translation|translator|language support)\b/)
  ) {
    add({
      type: 'interpreter',
      summary:
        'Interpreter or translation support is required before the next intake milestone can be scheduled or completed.',
      gateImpact: 'Interpreter or translation support is required',
      owner: 'CSM',
      actionType: PROVIDER_OUTREACH,
      action:
        'CSM to confirm interpreter coverage and a committed date for the next intake milestone.',
      relevance: 10,
    });
  }
}
function addAuthorizationClosure(
  context: OperationalFactContext,
  signals: CommonOperationalSignals
): void {
  const { add } = context;
  const { familyAuthorizationClosurePending } = signals;
  if (familyAuthorizationClosurePending) {
    add({
      type: 'auth-overlap-closure-pending',
      summary:
        'The family is working to close another authorization; closure has not been confirmed.',
      gateImpact: 'Closure of the other authorization remains unconfirmed',
      owner: 'Intake',
      actionType: FAMILY_OUTREACH,
      action:
        "Intake to confirm the other authorization's closure with the family and provide the verified end date to Insurance Ops.",
      relevance: 11,
    });
  }
}
function addOutreach(context: OperationalFactContext, signals: CommonOperationalSignals): void {
  const { value, add } = context;
  const {
    familyNonresponse,
    inactiveCoverage,
    overlappingAuthorizationOutreach,
    nonBlockingAssessmentAuthorization,
  } = signals;
  if (overlappingAuthorizationOutreach && !nonBlockingAssessmentAuthorization) {
    add({
      type: 'auth-overlap-family-outreach',
      summary:
        'The authorization remains blocked by an overlapping prior-provider authorization; Intake outreach to the family is ongoing, but closure has not been confirmed.',
      gateImpact: 'Prior-provider authorization overlap remains unresolved despite family outreach',
      owner: 'Intake',
      actionType: FAMILY_OUTREACH,
      action:
        'Intake to continue family outreach, confirm the prior provider terminated or end-dated its authorization, and document the termination date for Insurance Ops to request reprocessing.',
      relevance: 11,
      issueKey: has(value, /\b(?:ia|initial assessment|assessment authorization)\b/)
        ? 'initial-authorization'
        : null,
    });
  } else if (familyNonresponse) {
    add({
      type: 'family-unresponsive',
      summary: inactiveCoverage
        ? 'The family remains unresponsive and insurance coverage is inactive, so continued intake and the next clinical milestone cannot be confirmed.'
        : 'The family has not responded to outreach needed to confirm the next intake milestone.',
      gateImpact: inactiveCoverage
        ? 'Family response and active coverage are required before intake can continue'
        : 'Family response is required before the next milestone can be scheduled',
      owner: 'Intake',
      actionType: FAMILY_OUTREACH,
      action: inactiveCoverage
        ? 'Intake to contact the family, confirm continued interest and active coverage, and document whether intake can resume.'
        : 'Intake to contact the family, confirm continued interest, and document the next committed milestone.',
      relevance: inactiveCoverage ? 11 : 8,
    });
  } else if (inactiveCoverage) {
    add({
      type: 'insurance-eligibility-inactive',
      summary:
        'Insurance coverage is inactive; eligibility must be restored or alternate coverage confirmed before the case can advance.',
      gateImpact: 'Active insurance coverage is not confirmed',
      owner: 'Intake',
      actionType: FAMILY_OUTREACH,
      action:
        'Intake to confirm current coverage with the family and document the active payer or coverage-resolution plan.',
      relevance: 10,
    });
  }
}
function addFamilyAssessments(
  context: OperationalFactContext,
  signals: CommonOperationalSignals
): void {
  const { add } = context;
  const { familyAssessmentsCompleted } = signals;
  if (familyAssessmentsCompleted) {
    add({
      type: 'family-document-completed',
      summary:
        'The family confirmed completing the Vineland after the BASC was already complete; both parent assessments are now complete, and treatment-plan work can proceed.',
      gateImpact: 'Parent assessments are complete; treatment-plan drafting and submission remain',
      owner: 'CSM',
      actionType: PROVIDER_OUTREACH,
      action:
        'CSM to confirm the provider has both parent assessments, document the treatment-plan status, and obtain the committed submission date.',
      relevance: 12,
      requestedInformation: 'the Vineland assessment and the BASC assessment',
    });
  }
}
function addDocumentProgress(
  context: OperationalFactContext,
  signals: CommonOperationalSignals
): void {
  const { value, add } = context;
  const {
    inboundFamilyMessage,
    requestedInformation,
    familyAssessmentsCompleted,
    evaluationAppointmentProgress,
    familyPursuingDiagnosticEvaluation,
  } = signals;
  if (
    !familyAssessmentsCompleted &&
    (inboundFamilyMessage || familyPursuingDiagnosticEvaluation) &&
    requestedInformation &&
    (familyPursuingDiagnosticEvaluation ||
      has(
        value,
        /\b(sent|submitted|uploaded|completed|finished|signed|requested|will send|will complete|working on|waiting for|almost done|in progress|plan(?:ning)? to (?:get|obtain|pursue)|pursu(?:e|ing))\b/
      ))
  ) {
    add({
      type: 'family-document-update',
      summary: evaluationAppointmentProgress
        ? 'The psychiatrist has the latest IEP and is arranging the diagnostic-evaluation appointment; the updated report has not been received.'
        : familyPursuingDiagnosticEvaluation
          ? 'The family plans to obtain a new diagnostic evaluation; the updated report has not been received.'
          : `The family reported progress on ${requestedInformation}; completion and receipt still must be verified.`,
      gateImpact: `${requestedInformation} remains pending verification`,
      owner: 'Intake',
      actionType: FAMILY_OUTREACH,
      action: evaluationAppointmentProgress
        ? 'Intake to confirm the diagnostic-evaluation appointment date with the family and document receipt of the completed report.'
        : familyPursuingDiagnosticEvaluation
          ? 'Intake to follow up with the family on the new diagnostic evaluation and document receipt of the updated report.'
          : `Intake to verify receipt of ${requestedInformation} and document whether the next milestone can proceed.`,
      relevance: 10,
      requestedInformation,
    });
  }
}
function addFutureDocument(
  context: OperationalFactContext,
  signals: CommonOperationalSignals
): void {
  const { add, category } = context;
  const { futureDiagnosticRequirement } = signals;
  if (category === 'insurance' && futureDiagnosticRequirement) {
    add({
      type: 'future-diagnostic-requirement',
      summary:
        'The family is pursuing an updated diagnostic evaluation for a future authorization cycle; the current treatment authorization remains a separate payer determination.',
      owner: 'CSM',
      actionType: 'Monitor',
      action:
        'CSM to monitor the updated diagnostic evaluation for the next authorization cycle without treating it as the current payer gate.',
      relevance: 7,
    });
  }
}
function addSignatureDocument(
  context: OperationalFactContext,
  signals: CommonOperationalSignals
): void {
  const { add, category } = context;
  const { futureDiagnosticRequirement, signatureDocumentationRequirement } = signals;
  if (
    category === 'insurance' &&
    signatureDocumentationRequirement &&
    !futureDiagnosticRequirement
  ) {
    add({
      type: 'auth-signature-documentation',
      summary:
        'Medicaid requires verifiable signature documentation for the psychological evaluation; the corrected evaluation has not been received.',
      gateImpact:
        'Psychological evaluation requires verifiable signature documentation for authorization reconsideration',
      owner: 'Intake Ops',
      actionType: FAMILY_OUTREACH,
      action:
        'Intake Ops to obtain the corrected psychological evaluation with verifiable signature documentation and send it to Insurance Ops for reconsideration.',
      relevance: 12,
      denialReason: 'the psychological evaluation lacks verifiable signature documentation',
    });
  }
}
function addRequiredDocument(
  context: OperationalFactContext,
  signals: CommonOperationalSignals
): void {
  if (!requiredDocumentApplies(context, signals)) return;
  const { add } = context;
  const { requestedInformation } = signals;
  const pluralRequirement = Boolean(requestedInformation && /\band\b/i.test(requestedInformation));
  add({
    type: 'required-document',
    summary: requestedInformation
      ? `${capitalizeRequestedItem(requestedInformation)} ${pluralRequirement ? 'remain' : 'remains'} outstanding and ${pluralRequirement ? 'are' : 'is'} preventing the next milestone.`
      : 'A required intake or payer document remains outstanding, but the source does not identify the missing item.',
    gateImpact: requestedInformation
      ? `${requestedInformation} ${pluralRequirement ? 'remain' : 'remains'} incomplete`
      : 'Required intake or payer documentation remains incomplete',
    owner: 'Intake',
    actionType: FAMILY_OUTREACH,
    action: requestedInformation
      ? `Intake to obtain ${requestedInformation}, validate it, and document when the next milestone can proceed.`
      : 'Intake to identify the exact missing document, obtain it, and document when the next milestone can proceed.',
    relevance: 10,
    requestedInformation,
    specificityMissing: !requestedInformation,
  });
}
function requiredDocumentApplies(
  context: OperationalFactContext,
  signals: CommonOperationalSignals
): boolean {
  const { value, category } = context;
  const {
    diagnosticDocument,
    intakeOrPayerDocument,
    familyAssessmentsCompleted,
    futureDiagnosticRequirement,
    signatureDocumentationRequirement,
  } = signals;
  return (
    ((['insurance', 'intakeScheduling'].includes(category) &&
      intakeOrPayerDocument &&
      !futureDiagnosticRequirement &&
      !familyAssessmentsCompleted &&
      !signatureDocumentationRequirement) ||
      (category === 'treatmentPlan' && diagnosticDocument)) &&
    has(
      value,
      /\b(need|needs|needing|require(?:d|s)?|missing|waiting|awaiting|complete|send|provide|sign|get|obtain|pursu(?:e|ing))\b/
    )
  );
}
function addSplitAssessment(
  context: OperationalFactContext,
  signals: CommonOperationalSignals
): void {
  const { add } = context;
  const { splitIaReportedComplete } = signals;
  if (splitIaReportedComplete) {
    add({
      type: 'ia-completed',
      summary:
        'The provider reports that both parent- and child-focused initial-assessment appointments occurred, but the structured IA completion date still requires verification.',
      gateImpact: 'Provider-reported two-part IA completion requires structured verification',
      owner: 'CSM',
      actionType: SALESFORCE_UPDATE,
      action:
        'CSM to verify the two-part IA occurrence dates and record the controlling completion date in Salesforce or linked billing.',
      relevance: 12,
      kind: 'IA_REPORTED_COMPLETED',
      issueKey: 'initial-assessment',
    });
  }
}
function addCrossAssessment(
  context: OperationalFactContext,
  signals: CommonOperationalSignals
): void {
  const { date, add } = context;
  const { crossGateIaCompletion } = signals;
  if (crossGateIaCompletion) {
    add({
      type: 'ia-completed',
      summary: date
        ? `The current SLA note reports that the initial assessment occurred on ${date}, but Salesforce or linked billing must confirm the lifecycle update.`
        : 'The current SLA note reports that the initial assessment occurred, but Salesforce or linked billing must confirm the completion date.',
      gateImpact: 'Reported IA completion requires structured lifecycle reconciliation',
      owner: 'CSM',
      actionType: SALESFORCE_UPDATE,
      action:
        'CSM to verify the IA occurrence against linked billing and correct the stale Salesforce stage or completion milestone.',
      relevance: 12,
      kind: 'IA_REPORTED_COMPLETED',
      milestoneDate: date,
      issueKey: 'initial-assessment',
    });
  }
}
export function addCommonOperationalFacts(
  context: OperationalFactContext,
  signals: CommonOperationalSignals
): void {
  for (const rule of [
    addProviderContinuity,
    addProviderReassignment,
    addServiceContinuation,
    addProviderFollowUps,
    addCredentialing,
    addPartialApproval,
    addFamilySignature,
    addFamilyRequirement,
    addHearing,
    addMedicalReschedule,
    addPartialAssessment,
    addProviderCapacity,
    addRenderingProvider,
    addHold,
    addServiceSetting,
    addFamilyAvailability,
    addInterpreter,
    addAuthorizationClosure,
    addOutreach,
    addFamilyAssessments,
    addDocumentProgress,
    addFutureDocument,
    addSignatureDocument,
    addRequiredDocument,
    addSplitAssessment,
    addCrossAssessment,
  ])
    rule(context, signals);
}
function capitalizeRequestedItem(value = ''): string {
  const cleaned = value.trim();
  const first = cleaned[0];
  return first === undefined ? 'The required item' : first.toUpperCase() + cleaned.slice(1);
}
export function addReportedInsuranceFact(context: OperationalFactContext): void {
  const { text, value, currentSlaNote, add } = context;
  const reportedPendingInsuranceApproval =
    currentSlaNote &&
    /\b(?:pending|awaiting|waiting for) (?:ins|insurance|payer) approval\b/.test(value) &&
    !/\?|\b(?:not|no longer|if|whether|might|may)\b/i.test(text);
  if (reportedPendingInsuranceApproval) {
    const authorizationIdentified = /\b(?:(?:initial|treatment) authorization|ia|ta)\b/.test(value);
    add({
      type: 'auth-pending',
      category: 'insurance',
      summary: authorizationIdentified
        ? 'The current SLA note reports pending insurance approval; the controlling payer status requires verification against linked records.'
        : 'The current SLA note reports pending insurance approval; the authorization it refers to is not specified.',
      gateImpact:
        'Reported pending insurance approval requires confirmation against the linked authorization',
      owner: 'Insurance Ops',
      actionType: 'Insurance Follow-Up',
      action:
        'Insurance Ops to identify the authorization referenced by the SLA note and reconcile its reported pending approval with the current linked records.',
      specificityMissing: !authorizationIdentified,
      relevance: 9,
    });
  }
}
const FAMILY_OUTREACH = 'Family Outreach';
const PROVIDER_OUTREACH = 'Provider Outreach';
const SALESFORCE_UPDATE = 'Salesforce Update';
