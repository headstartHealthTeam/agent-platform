import { normalizeOperationalText as normalize } from './conversation-text.js';
import { hasOperationalText as has } from './operational-fact-context.js';
import type { OperationalFactContext } from './operational-fact-context.js';
import { extractRequestedInformation } from './requested-information.js';
export interface CommonOperationalSignals {
  readonly direction: string;
  readonly line: string;
  readonly inboundFamilyMessage: boolean;
  readonly providerContinuityRisk: boolean;
  readonly providerReassignmentDecision: boolean;
  readonly contactClosureRisk: boolean;
  readonly serviceContinuationDecision: boolean;
  readonly providerMissedFollowUps: boolean;
  readonly credentialingPending: boolean;
  readonly partialApprovalUnderReview: boolean;
  readonly familySignaturePending: boolean;
  readonly selfPacedFamilyRequirement: boolean;
  readonly medicalReschedule: boolean;
  readonly operationalHold: boolean;
  readonly stateFairHearing: boolean;
  readonly parentAssessmentDone: boolean;
  readonly clientAssessmentPending: boolean;
  readonly partialAssessment: boolean;
  readonly custodyConstraint: boolean;
  readonly feasibilityConstraint: boolean;
  readonly strongFamilyConstraint: boolean;
  readonly treatmentPlanFamilyConstraint: boolean;
  readonly downstreamStaffingSchedule: boolean;
  readonly gateSpecificAvailability: boolean;
  readonly rbtServiceSettingConstraint: boolean;
  readonly familyReportsThirdPartyNonresponse: boolean;
  readonly familyNonresponse: boolean;
  readonly inactiveCoverage: boolean;
  readonly overlappingAuthorizationOutreach: boolean;
  readonly familyAuthorizationClosurePending: boolean;
  readonly nonBlockingAssessmentAuthorization: boolean;
  readonly diagnosticDocument: boolean;
  readonly intakeOrPayerDocument: boolean;
  readonly requestedInformation: string | null;
  readonly familyAssessmentsCompleted: boolean;
  readonly evaluationAppointmentProgress: boolean;
  readonly familyPursuingDiagnosticEvaluation: boolean;
  readonly futureDiagnosticRequirement: boolean;
  readonly signatureDocumentationRequirement: boolean;
  readonly splitIaReportedComplete: boolean;
  readonly crossGateIaIncomplete: boolean;
  readonly crossGateIaCompletion: boolean;
}
function sourceSignals(
  context: OperationalFactContext
): Pick<CommonOperationalSignals, 'direction' | 'line' | 'inboundFamilyMessage'> {
  const sourceContext = context.context;
  const direction = normalize(sourceContext.direction ?? '');
  const line = normalize(sourceContext.line ?? '');
  const inboundFamilyMessage = direction.includes('inbound') && line.includes('intake');
  return { direction, line, inboundFamilyMessage };
}
function continuitySignals(
  context: OperationalFactContext
): Pick<CommonOperationalSignals, 'providerContinuityRisk' | 'providerReassignmentDecision'> {
  const { value, currentSlaNote } = context;
  const providerContinuityRisk =
    has(value, /\b(provider|bcba|practice)\b/) &&
    (has(
      value,
      /\b(?:not|isn t|is not|may not|might not)\b.{0,35}\b(?:moving forward|continue|continuing|renew|renewing|stay|staying|working with headstart)\b/
    ) ||
      has(
        value,
        /\b(?:moving forward|continue|renew|stay)\b.{0,35}\b(?:with )?headstart\b.{0,35}\b(?:unclear|unknown|confirm|decide|whether)\b/
      ) ||
      has(value, /\bsee if\b.{0,35}\bprovider\b.{0,35}\bmoving forward\b/));
  const providerReassignmentDecision =
    currentSlaNote &&
    has(value, /\b(?:provider|bcba)\b/) &&
    (has(
      value,
      /\b(?:reject(?:ed|s)?|declin(?:e|ed|es)|outside (?:(?:their|the|her|his|our|my) )?scope)\b/
    ) ||
      has(
        value,
        /\b(?:cannot|can t|unable to)\b.{0,35}\b(?:take|accept|continue|serve)\b.{0,25}\b(?:case|client|services?)\b/
      )) &&
    has(
      value,
      /\b(?:reassign|restaff|transfer|clos(?:e|ed|ing)|new provider|replacement provider)\b/
    );
  return { providerContinuityRisk, providerReassignmentDecision };
}
function continuationSignals(
  context: OperationalFactContext
): Pick<CommonOperationalSignals, 'contactClosureRisk' | 'serviceContinuationDecision'> {
  const { value, currentSlaNote } = context;
  const contactClosureRisk =
    currentSlaNote &&
    has(value, /\b(?:family|parent|caregiver)\b/) &&
    has(value, /\b(?:comms|communication|contact|reach|outreach)\b/) &&
    has(value, /\b(?:likely|may|might|possibly)\b.{0,25}\b(?:discharge|close|closure)\b/);
  const serviceContinuationDecision =
    currentSlaNote &&
    (contactClosureRisk ||
      has(value, /\b(?:may|might|will) not need services\b/) ||
      has(
        value,
        /\b(?:family|case worker|caseworker)\b.{0,70}\b(?:move forward|continue services|continue with services)\b/
      ) ||
      has(value, /\b(?:rehome|rehoming|placement change)\b/) ||
      (has(
        value,
        /\b(?:family|parent|caregiver)\b.{0,80}(?:\b(?:availability|schedule)\b.{0,45}\b(?:changed|change|different|limited)\b|\b(?:changed|change|different|limited)\b.{0,45}\b(?:availability|schedule)\b)/
      ) &&
        has(
          value,
          /\b(?:may|might|could|possibly|possible)\b.{0,35}\b(?:discharg(?:e|ed|ing)|clos(?:e|ed|ing)|end services?)\b/
        )));
  return { contactClosureRisk, serviceContinuationDecision };
}
function providerSignals(
  context: OperationalFactContext
): Pick<CommonOperationalSignals, 'providerMissedFollowUps' | 'credentialingPending'> {
  const { value, currentSlaNote } = context;
  const providerMissedFollowUps =
    currentSlaNote &&
    has(value, /\bprovider\b/) &&
    (has(value, /\bno[ -]?show(?:ed)?\b.{0,35}\b(?:meeting|meetings|call|calls)\b/) ||
      has(value, /\bmissed\b.{0,35}\b(?:meeting|meetings|call|calls)\b/));
  const credentialingPending =
    currentSlaNote &&
    has(value, /\b(?:rbt|tricare|candidate|staff)\b/) &&
    has(value, /\b(?:cred|credential|credentialing|background check|bg check)\b/) &&
    !has(
      value,
      /\b(?:credentialing|credentials?)\b.{0,25}\b(?:complete|completed|cleared|approved)\b/
    );
  return { providerMissedFollowUps, credentialingPending };
}
function prerequisiteSignals(
  context: OperationalFactContext
): Pick<
  CommonOperationalSignals,
  'partialApprovalUnderReview' | 'familySignaturePending' | 'selfPacedFamilyRequirement'
> {
  const { value, currentSlaNote } = context;
  const partialApprovalUnderReview =
    currentSlaNote &&
    has(
      value,
      /\b(?:partial denial|partial approval|(?:\d+\.\d+|\d+) ?(?:hours?|hrs?) (?:a week )?approved)\b/
    ) &&
    has(value, /\b(?:reconsider|reconsideration|more hours|additional hours)\b/);
  const familySignaturePending =
    currentSlaNote &&
    has(
      value,
      /\b(?:family|parent|caregiver)\b.{0,35}\b(?:still )?(?:needs? to sign|signature remains|signature pending|has not signed)\b/
    );
  const selfPacedFamilyRequirement =
    currentSlaNote &&
    has(value, /\bfamily\b/) &&
    has(value, /\bprovider\b/) &&
    has(value, /\b(?:working on|working through|obtaining|gathering)\b/) &&
    has(value, /\b(?:not in a hurry|no urgency|low urgency)\b/);
  return { partialApprovalUnderReview, familySignaturePending, selfPacedFamilyRequirement };
}
function holdSignals(
  context: OperationalFactContext
): Pick<CommonOperationalSignals, 'medicalReschedule' | 'operationalHold' | 'stateFairHearing'> {
  const { value } = context;
  const medicalReschedule =
    has(
      value,
      /\b(medical emergency|sick|ill|hospital|not feeling well|respiratory|injur(?:y|ed)|brok(?:e|en)|fracture|recover(?:y|ing))\b/
    ) &&
    has(value, /\b(assessment|\bia\b|97151|appointment|scheduled)\b/) &&
    has(
      value,
      /\b(reschedul(?:e|ed|ing)|cancel(?:led|ed)?|removed|reach back out|feeling better|discharg(?:e|ed))\b/
    );
  const operationalHold =
    !medicalReschedule &&
    !has(value, /\bhold off on (sending|emailing|submitting|sharing)\b/) &&
    (has(
      value,
      /\b(client|opportunity|intake|case|services?|family|provider)\b.{0,50}\b(on hold|pause|paused|hold off)\b/
    ) ||
      has(
        value,
        /\b(placed|put|keep|remain|requested|asked|wants?|wanted)\b.{0,35}\b(on hold|pause|paused|hold off)\b/
      ) ||
      has(
        value,
        /\b(?:requested|asked for|wants?|wanted) (?:the |a )?(?:client|case|opportunity|intake)? ?(?:to be )?(?:on )?hold\b/
      ) ||
      has(value, /\b(on hold|paused)\b.{0,45}\b(intake|case|services?|client|opportunity)\b/));
  const stateFairHearing =
    has(value, /\bstate fair hearing\b/) &&
    has(value, /\b(request(?:ed|ing)?|filed|submitted|pending|await(?:ing)?|hear back)\b/);
  return { medicalReschedule, operationalHold, stateFairHearing };
}
function assessmentSignals(
  context: OperationalFactContext
): Pick<
  CommonOperationalSignals,
  'parentAssessmentDone' | 'clientAssessmentPending' | 'partialAssessment'
> {
  const { value } = context;
  const parentAssessmentDone =
    has(
      value,
      /\b(parent|caregiver|family)\b.{0,35}\b(portion|part|side|assessment)\b.{0,40}\b(complete|completed|finished|done)\b/
    ) ||
    has(
      value,
      /\b(only able to do|completed|finished|done|did)\b.{0,35}\b(parent|caregiver|family)\b.{0,20}\b(portion|part|side|assessment)\b/
    );
  const clientAssessmentPending =
    has(
      value,
      /\b(client|child|actual|remaining)\b.{0,30}\b(portion|part|assessment|session)\b.{0,60}\b(pending|remain|still|waiting|plan|schedule|not complete|incomplete)\b/
    ) ||
    has(
      value,
      /\b(waiting|still need|supposed|plan|schedule|reschedule|not done)\b.{0,60}\b(client|child|actual)\b.{0,25}\b(portion|part|assessment|session)\b/
    );
  const partialAssessment = parentAssessmentDone && clientAssessmentPending;
  return { parentAssessmentDone, clientAssessmentPending, partialAssessment };
}
function familyConstraintSignals(
  context: OperationalFactContext
): Pick<
  CommonOperationalSignals,
  | 'custodyConstraint'
  | 'feasibilityConstraint'
  | 'strongFamilyConstraint'
  | 'treatmentPlanFamilyConstraint'
> {
  const { value } = context;
  const custodyConstraint = has(value, /\b(divorc|split custody|custody|every other weekend)\b/);
  const feasibilityConstraint = has(
    value,
    /\b(workable schedule|consistent (?:care )?schedule|might not work out|may not work out|services? can(?:not|'t) proceed|availability|available)\b/
  );
  const strongFamilyConstraint =
    feasibilityConstraint ||
    (custodyConstraint && has(value, /\b(schedule|availability|consistent|services?|care plan)\b/));
  const treatmentPlanFamilyConstraint =
    custodyConstraint ||
    (has(value, /\b(family|parent|caregiver|client)\b/) &&
      has(value, /\b(availability|available|schedule|care plan)\b/) &&
      has(
        value,
        /\b(cannot|can t|not workable|inconsistent|conflict|barrier|prevent(?:s|ed|ing)?|blocking|delay(?:s|ed|ing)?)\b/
      ));
  return {
    custodyConstraint,
    feasibilityConstraint,
    strongFamilyConstraint,
    treatmentPlanFamilyConstraint,
  };
}
function settingSignals(
  context: OperationalFactContext
): Pick<
  CommonOperationalSignals,
  'downstreamStaffingSchedule' | 'gateSpecificAvailability' | 'rbtServiceSettingConstraint'
> {
  const { value, category } = context;
  const downstreamStaffingSchedule =
    has(value, /\b(rbt|candidate|recruit(?:ing|ment)?|job boards?|candidate pool|staffing)\b/) &&
    has(value, /\b(availability|available|schedule|hours?|flexibility)\b/) &&
    !has(
      value,
      /\b(family|parent|caregiver)\b.{0,80}\b(cannot|can t|unavailable|conflict|custody|not responding|unresponsive|declined)\b/
    );
  const gateSpecificAvailability =
    ['intakeScheduling', 'rbt'].includes(category) &&
    has(value, /\b(availability|only available|schedule does not work)\b/);
  const rbtServiceSettingConstraint =
    category === 'rbt' &&
    has(value, /\b(daycare|preschool|school|care setting|service setting|site|location)\b/) &&
    has(
      value,
      /\b(?:unable to|cannot|can t|does not|doesn t|will not|won t)\b.{0,60}\b(?:accommodat\w*|allow|support|host)\b.{0,40}\b(?:rbt|direct care|97153)\b/
    );
  return { downstreamStaffingSchedule, gateSpecificAvailability, rbtServiceSettingConstraint };
}
function contactSignals(
  context: OperationalFactContext,
  signals: Pick<CommonOperationalSignals, 'inboundFamilyMessage'>
): Pick<
  CommonOperationalSignals,
  | 'familyReportsThirdPartyNonresponse'
  | 'familyNonresponse'
  | 'inactiveCoverage'
  | 'overlappingAuthorizationOutreach'
  | 'familyAuthorizationClosurePending'
> {
  const { value, currentSlaNote } = context;
  const { inboundFamilyMessage } = signals;
  const familyReportsThirdPartyNonresponse = has(
    value,
    /\bfrom (?:mom|mother|dad|father|parent|caregiver|family)\b.{0,120}\b(?:i|we) (?:haven t|have not) heard\b/
  );
  const familyNonresponse =
    !inboundFamilyMessage &&
    !familyReportsThirdPartyNonresponse &&
    has(
      value,
      /\b(no response|not respond(?:ed|ing)?|unresponsive|didn t answer|did not answer|haven t heard|have not heard|haven t gotten any responses?|have not gotten any responses?|couldn t reach|could not reach)\b/
    );
  const inactiveCoverage = has(
    value,
    /\b(?:inactive|terminated|lapsed|not active)\b.{0,35}\b(?:coverage|insurance|eligibility)\b|\b(?:coverage|insurance|eligibility)\b.{0,35}\b(?:inactive|terminated|lapsed|not active)\b/
  );
  const overlappingAuthorizationOutreach =
    (familyNonresponse ||
      has(
        value,
        /\b(follow up|following up|outreach|contact(?:ed|ing)?|called|texted|messaged|notified)\b/
      )) &&
    has(
      value,
      /\b(overlap(?:ping)?|duplicate services?|prior provider|previous provider|other authorization|closing? out|terminate|termination|discharge)\b/
    ) &&
    has(value, /\b(auth(?:orization)?|services?|provider)\b/);
  const familyAuthorizationClosurePending =
    currentSlaNote &&
    has(
      value,
      /\b(?:family|parent|caregiver)\b.{0,45}\b(?:working|trying) to (?:close|terminate|end)\b.{0,35}\b(?:other|prior|previous|overlapping) auth(?:orization)?\b/
    );
  return {
    familyReportsThirdPartyNonresponse,
    familyNonresponse,
    inactiveCoverage,
    overlappingAuthorizationOutreach,
    familyAuthorizationClosurePending,
  };
}
function overlapSignals(
  context: OperationalFactContext
): Pick<CommonOperationalSignals, 'nonBlockingAssessmentAuthorization'> {
  const { value } = context;
  const nonBlockingAssessmentAuthorization =
    has(
      value,
      /\b(?:assessment|97151)\b.{0,45}\b(?:authorization|billing)\b|\b(?:authorization|billing)\b.{0,45}\b(?:assessment|97151)\b/
    ) &&
    has(
      value,
      /\b(?:treatment authorization (?:is|was) in place|services? can start|treatment won t be delayed|will not delay treatment)\b/
    );
  return { nonBlockingAssessmentAuthorization };
}
function documentSignals(
  context: OperationalFactContext,
  signals: Pick<CommonOperationalSignals, 'inboundFamilyMessage'>
): Pick<
  CommonOperationalSignals,
  | 'diagnosticDocument'
  | 'intakeOrPayerDocument'
  | 'requestedInformation'
  | 'familyAssessmentsCompleted'
> {
  const { text, value } = context;
  const { inboundFamilyMessage } = signals;
  const diagnosticDocument = has(
    value,
    /\b(psychological evaluation|diagnostic evaluation)\b|\b(?:new|updated|current) (?:autism )?diagnosis\b|\b(new|updated|missing|old|outdated|required) (?:de|dx)\b|\b(?:de|dx) (is )?(new|updated|missing|old|outdated|required)\b/
  );
  const intakeOrPayerDocument = has(
    value,
    /\b(discharge letter|referral|psychological evaluation|diagnostic evaluation|wet signature|missing document|documents? (?:is|are) missing|intake packet|onboarding packet|new client packet|vineland|basc|pddbi)\b|\b(?:new|updated|current) (?:autism )?diagnosis\b|\b(new|updated|missing|old|outdated|required) (?:de|dx)\b|\b(?:de|dx) (is )?(new|updated|missing|old|outdated|required)\b/
  );
  const requestedInformation = extractRequestedInformation(text);
  const familyAssessmentsCompleted =
    inboundFamilyMessage &&
    has(
      value,
      /\bbasc\b.{0,45}\b(?:show as |shows as |was |is )?completed\b.{0,120}\bvineland\b.{0,45}\b(?:not started|outstanding|incomplete|pending)\b/
    ) &&
    has(
      value,
      /\b(?:i have|i ve|ive|we have|we ve|weve) (?:now )?completed (?:it|that|the assessment)\b/
    );
  return {
    diagnosticDocument,
    intakeOrPayerDocument,
    requestedInformation,
    familyAssessmentsCompleted,
  };
}
function evaluationSignals(
  context: OperationalFactContext,
  signals: Pick<CommonOperationalSignals, 'inboundFamilyMessage' | 'requestedInformation'>
): Pick<
  CommonOperationalSignals,
  'evaluationAppointmentProgress' | 'familyPursuingDiagnosticEvaluation'
> {
  const { value } = context;
  const { inboundFamilyMessage, requestedInformation } = signals;
  const evaluationAppointmentProgress =
    inboundFamilyMessage &&
    requestedInformation === 'a current diagnostic evaluation or report' &&
    has(
      value,
      /\b(?:psychiatrist|diagnostician|diagnosing provider)\b.{0,120}\bworking on\b.{0,120}\b(?:evaluation (?:appointment|appt)|appointment for (?:a |an )?evaluation)\b/
    );
  const familyPursuingDiagnosticEvaluation =
    requestedInformation === 'a current diagnostic evaluation or report' &&
    (evaluationAppointmentProgress ||
      (inboundFamilyMessage &&
        has(
          value,
          /\b(?:plan(?:ning)? to (?:get|obtain|pursue)|pursu(?:e|ing)|get (?:a )?(?:whole )?new diagnosis|(?:psychiatrist|diagnostician|diagnosing provider).{0,100}working on.{0,100}(?:evaluation (?:appointment|appt)|appointment for (?:a |an )?evaluation))\b/
        )) ||
      has(
        value,
        /\b(?:family|parent|caregiver)\b.{0,100}\b(?:plan(?:ning)? to (?:get|obtain|pursue)|pursu(?:e|ing)|get (?:a )?(?:whole )?new diagnosis)\b/
      ) ||
      has(
        value,
        /\b(?:family|parent|caregiver)\b.{0,100}\b(?:working|communicating|contacting|coordinating)\b.{0,100}\b(?:diagnosing provider|diagnostician|doctor|physician)\b.{0,100}\b(?:update|obtain|get|complete)\b/
      ) ||
      has(
        value,
        /\b(?:communicating|working|coordinating)\b.{0,80}\b(?:with )?(?:the )?(?:family|parent|caregiver)\b.{0,120}\b(?:dx[ -]?ing provider|diagnosing provider|diagnostician|doctor|physician)\b.{0,100}\b(?:update|obtain|get|complete)\b/
      ));
  return { evaluationAppointmentProgress, familyPursuingDiagnosticEvaluation };
}
function documentRequirementSignals(
  context: OperationalFactContext,
  signals: Pick<CommonOperationalSignals, 'diagnosticDocument'>
): Pick<
  CommonOperationalSignals,
  'futureDiagnosticRequirement' | 'signatureDocumentationRequirement'
> {
  const { value } = context;
  const { diagnosticDocument } = signals;
  const futureDiagnosticRequirement =
    diagnosticDocument &&
    has(
      value,
      /\b(?:grace period|next auth(?:orization)?|future auth(?:orization)?|within (?:six|6) months?|before (?:the )?next auth(?:orization)?)\b/
    );
  const signatureDocumentationRequirement =
    diagnosticDocument &&
    has(
      value,
      /\b(wet signature|electronic signature receipt|verifiable (?:electronic )?signature|signature (?:receipt|timestamp)|timestamp(?:ed)? (?:electronic )?signature)\b/
    );
  return { futureDiagnosticRequirement, signatureDocumentationRequirement };
}
function splitAssessmentSignals(
  context: OperationalFactContext
): Pick<CommonOperationalSignals, 'splitIaReportedComplete'> {
  const { value, currentSlaNote, category } = context;
  const splitIaReportedComplete =
    currentSlaNote &&
    category === 'treatmentPlan' &&
    has(value, /\b(?:parent|caregiver|family)[ -]focused\b/) &&
    has(value, /\bchild[ -]focused\b/) &&
    has(value, /\b(?:appointment|session|assessment)s?\b/) &&
    (has(
      value,
      /\bboth\b.{0,45}\b(?:occurred|completed|held|happened|took place)\b|\b(?:occurred|completed|held|happened|took place)\b.{0,45}\bboth\b/
    ) ||
      (value.match(/\b(?:occurred|completed|held|happened|took place)\b/g)?.length ?? 0) >= 2);
  return { splitIaReportedComplete };
}
function crossAssessmentSignals(
  context: OperationalFactContext
): Pick<CommonOperationalSignals, 'crossGateIaIncomplete' | 'crossGateIaCompletion'> {
  const { value, currentSlaNote, category } = context;
  const crossGateIaIncomplete =
    has(
      value,
      /\b(?:not|haven t|hasn t|hadn t|wasn t|isn t|aren t|weren t) (?:yet )?(?:finished|completed|done|conducted|performed) (?:with )?(?:the )?(initial assessment|assessment|97151|\bia\b)\b/
    ) ||
    has(
      value,
      /\b(initial assessment|assessment|97151|\bia\b) (?:is|was|has been|had been)? ?(?:not|n't) (?:yet )?(?:finished|completed|done|conducted|performed)\b/
    );
  const crossGateIaCompletion =
    currentSlaNote &&
    category !== 'intakeScheduling' &&
    !crossGateIaIncomplete &&
    !has(
      value,
      /\b(?:once|after|when|if|before)\b.{0,80}\b(initial assessment|assessment|97151|\bia\b)\b.{0,45}\b(completed|finished|conducted|done|held|performed|occurred|happened)\b/
    ) &&
    (has(
      value,
      /\b(initial assessment|assessment|97151|\bia\b) (?:was |is |has been |got )?(completed|finished|conducted|done|held|performed|occurred|happened)\b/
    ) ||
      has(
        value,
        /\b(completed|finished|conducted|did|performed|held) (?:the )?(initial assessment|assessment|97151|\bia\b)\b/
      ));
  return { crossGateIaIncomplete, crossGateIaCompletion };
}
export function commonOperationalSignals(
  context: OperationalFactContext
): CommonOperationalSignals {
  const sourceSignalsResult = sourceSignals(context);
  const continuitySignalsResult = continuitySignals(context);
  const continuationSignalsResult = continuationSignals(context);
  const providerSignalsResult = providerSignals(context);
  const prerequisiteSignalsResult = prerequisiteSignals(context);
  const holdSignalsResult = holdSignals(context);
  const assessmentSignalsResult = assessmentSignals(context);
  const familyConstraintSignalsResult = familyConstraintSignals(context);
  const settingSignalsResult = settingSignals(context);
  const contactSignalsResult = contactSignals(context, {
    inboundFamilyMessage: sourceSignalsResult.inboundFamilyMessage,
  });
  const overlapSignalsResult = overlapSignals(context);
  const documentSignalsResult = documentSignals(context, {
    inboundFamilyMessage: sourceSignalsResult.inboundFamilyMessage,
  });
  const evaluationSignalsResult = evaluationSignals(context, {
    inboundFamilyMessage: sourceSignalsResult.inboundFamilyMessage,
    requestedInformation: documentSignalsResult.requestedInformation,
  });
  const documentRequirementSignalsResult = documentRequirementSignals(context, {
    diagnosticDocument: documentSignalsResult.diagnosticDocument,
  });
  const splitAssessmentSignalsResult = splitAssessmentSignals(context);
  const crossAssessmentSignalsResult = crossAssessmentSignals(context);
  return {
    ...sourceSignalsResult,
    ...continuitySignalsResult,
    ...continuationSignalsResult,
    ...providerSignalsResult,
    ...prerequisiteSignalsResult,
    ...holdSignalsResult,
    ...assessmentSignalsResult,
    ...familyConstraintSignalsResult,
    ...settingSignalsResult,
    ...contactSignalsResult,
    ...overlapSignalsResult,
    ...documentSignalsResult,
    ...evaluationSignalsResult,
    ...documentRequirementSignalsResult,
    ...splitAssessmentSignalsResult,
    ...crossAssessmentSignalsResult,
  };
}
