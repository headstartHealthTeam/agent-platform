import {
  normalizeOperationalText as normalize,
  isTreatmentPlanStatusInquiry,
  reportsTreatmentPlanSubmission,
} from './conversation-text.js';
import { hasOperationalText as has } from './operational-fact-context.js';
import type { OperationalFactContext } from './operational-fact-context.js';
export interface TreatmentPlanSignals {
  readonly planMention: RegExp;
  readonly statusInquiry: boolean;
  readonly treatmentPlanTaskContext: boolean;
  readonly substantiveTaskChatter: boolean;
  readonly contextualTreatmentAuthorizationSubmission: boolean;
  readonly planNotStarted: boolean;
  readonly schoolScheduleDependency: boolean;
  readonly futurePlanWork: boolean;
  readonly futureCompletionCommitment: boolean;
  readonly submissionCommitment: boolean;
  readonly completedButNotSubmitted: boolean;
  readonly submittedForReview: boolean;
  readonly planReady: boolean;
  readonly staffingDependentDraft: boolean;
  readonly homeDisruption: boolean;
  readonly typedNameSignature: boolean;
  readonly agedAssessmentClarification: boolean;
  readonly familyAssessmentPending: boolean;
  readonly familySignatureBeforeSubmission: boolean;
  readonly secondaryReviewAfterEdits: boolean;
  readonly pendingPayerSubmission: boolean;
  readonly submittedForHeadstartReview: boolean;
}
function draftingSignals(
  context: OperationalFactContext
): Pick<
  TreatmentPlanSignals,
  | 'planMention'
  | 'statusInquiry'
  | 'treatmentPlanTaskContext'
  | 'substantiveTaskChatter'
  | 'contextualTreatmentAuthorizationSubmission'
  | 'planNotStarted'
  | 'schoolScheduleDependency'
  | 'futurePlanWork'
> {
  const { text, value } = context;
  const sourceContext = context.context;
  const planMention = /\b(treatment plan|trimming plan|\btp\b)\b/;
  const statusInquiry = isTreatmentPlanStatusInquiry(text);
  const treatmentPlanTaskContext = has(
    normalize(sourceContext.taskSubject ?? ''),
    /\b(?:pending tp|treatment plan|\btp\b)\b/
  );
  const substantiveTaskChatter = has(normalize(sourceContext.sourceType ?? ''), /\bchatter\b/);
  const contextualTreatmentAuthorizationSubmission =
    !statusInquiry &&
    treatmentPlanTaskContext &&
    substantiveTaskChatter &&
    (has(
      value,
      /\b(?:provider|bcba|they)\b.{0,35}\bsubmitted\b.{0,35}\bauth(?:orization)? request\b/
    ) ||
      has(
        value,
        /\b(?:report|plan|it)\b.{0,20}\b(?:was|has been) submitted\b|\bsubmitted\b.{0,20}\b(?:last night|yesterday|over the weekend)\b/
      ));
  const planNotStarted =
    (!statusInquiry &&
      has(
        value,
        /\b(treatment plan|tp)\b.{0,45}\b(not (?:been )?started|hasn t (?:been )?started|has not (?:been )?started|not begun|hasn t begun|has not begun)\b/
      )) ||
    (!statusInquiry &&
      has(
        value,
        /\b(not (?:been )?started|hasn t (?:been )?started|has not (?:been )?started|not begun|hasn t begun|has not begun)\b.{0,45}\b(treatment plan|tp)\b/
      ));
  const schoolScheduleDependency =
    has(value, /\b(head start|school|preschool|daycare)\b/) &&
    has(value, /\b(schedule|hours|program|enroll|enrollment|location)\b/) &&
    has(value, /\b(wait|waiting|unsure|unknown|need|needs|confirm|decide|finaliz)\b/);
  const futurePlanWork =
    !statusInquiry &&
    (has(
      value,
      /\b(gonna|going to|will|need to|needs to|still) (?:be )?(?:work(?:ing)? on|finish|complete|draft|write)\b.{0,100}\b(treatment plan|trimming plan|\btp\b)\b/
    ) ||
      has(
        value,
        /\b(work(?:ing)? on|draft(?:ing)?|writ(?:e|ing))\b.{0,100}\b(treatment plan|trimming plan|\btp\b)\b/
      ) ||
      has(
        value,
        /\b(treatment plan|trimming plan|\btp\b)\b.{0,45}\b(?:is )?(?:still )?(?:being drafted|in draft|drafting)\b/
      ));
  return {
    planMention,
    statusInquiry,
    treatmentPlanTaskContext,
    substantiveTaskChatter,
    contextualTreatmentAuthorizationSubmission,
    planNotStarted,
    schoolScheduleDependency,
    futurePlanWork,
  };
}
function commitmentSignals(
  context: OperationalFactContext,
  signals: Pick<
    TreatmentPlanSignals,
    | 'planMention'
    | 'statusInquiry'
    | 'contextualTreatmentAuthorizationSubmission'
    | 'futurePlanWork'
  >
): Pick<
  TreatmentPlanSignals,
  | 'futureCompletionCommitment'
  | 'submissionCommitment'
  | 'completedButNotSubmitted'
  | 'submittedForReview'
  | 'planReady'
  | 'staffingDependentDraft'
  | 'homeDisruption'
> {
  const { text, value } = context;
  const { planMention, statusInquiry, contextualTreatmentAuthorizationSubmission, futurePlanWork } =
    signals;
  const futureCompletionCommitment =
    !statusInquiry &&
    has(value, planMention) &&
    has(
      value,
      /\b(?:will|would|should|expects? to|plans? to|due to|target(?:ed)? to)\b.{0,35}\b(?:be )?(?:complete|completed|finished|ready)\b|\b(?:complete|completed|finished|ready)\b.{0,20}\b(?:by|on)\b/
    );
  const submissionCommitment =
    !statusInquiry &&
    has(value, planMention) &&
    has(
      value,
      /\b(?:being|will be|would be|will have|would have|plans? to be|scheduled to be) (?:the )?(?:treatment plan|tp )?(?:submitted|sent)\b|\b(?:will|would|plans? to) (?:submit|send)\b|\bworking on submitting\b|\b(?:get|have) (?:the )?(?:treatment plan|tp) (?:in|submitted|sent)\b/
    ) &&
    !has(value, /\b(?:was|has been|already) (?:submitted|sent)\b/);
  const completedButNotSubmitted =
    !statusInquiry &&
    has(value, planMention) &&
    has(value, /\b(?:completed|finished|done|ready)\b/) &&
    has(
      value,
      /\b(?:has not|hasn t|still has not|still hasn t|not yet) (?:been )?submitted\b|\b(?:has not|hasn t|still has not|still hasn t|not yet) submitted\b/
    );
  const submittedForReview =
    (has(value, planMention) && reportsTreatmentPlanSubmission(text)) ||
    contextualTreatmentAuthorizationSubmission;
  const planReady =
    !statusInquiry &&
    !futurePlanWork &&
    !futureCompletionCommitment &&
    !submissionCommitment &&
    (has(
      value,
      /\b(ready to submit|ready for submission|finished|completed)\b.{0,80}\b(treatment plan|trimming plan|\btp\b)\b/
    ) ||
      has(
        value,
        /\b(treatment plan|trimming plan|\btp\b)\b.{0,80}\b(ready to submit|ready for submission|finished|completed)\b/
      ));
  const staffingDependentDraft =
    futurePlanWork &&
    has(value, /\b(rbt|staffing|staffed|candidate|recruit(?:ing)?)\b/) &&
    has(value, /\b(awaiting|waiting|until|because|motivat(?:ed|ion)|holding|delay(?:ed|ing)?)\b/);
  const homeDisruption = has(
    value,
    /\b(home renovation|home renovations|renovation|construction|home disruption)\b/
  );
  return {
    futureCompletionCommitment,
    submissionCommitment,
    completedButNotSubmitted,
    submittedForReview,
    planReady,
    staffingDependentDraft,
    homeDisruption,
  };
}
function prerequisiteSignals(
  context: OperationalFactContext,
  signals: Pick<TreatmentPlanSignals, 'planMention'>
): Pick<
  TreatmentPlanSignals,
  | 'typedNameSignature'
  | 'agedAssessmentClarification'
  | 'familyAssessmentPending'
  | 'familySignatureBeforeSubmission'
  | 'secondaryReviewAfterEdits'
  | 'pendingPayerSubmission'
  | 'submittedForHeadstartReview'
> {
  const { value, currentSlaNote } = context;
  const slaReasonContext = normalize(context.context.slaReason ?? '');
  const { planMention } = signals;
  const typedNameSignature =
    has(value, /\b(typed name|type(?:d)? (?:their|the|a) name)\b/) &&
    has(value, /\b(re[- ]?sign|signature|sign again|needs? to sign)\b/);
  const agedAssessmentClarification =
    has(value, /\bvineland\b/) &&
    has(value, /\b(?:more than|over|older than) 90 days?\b/) &&
    has(value, /\b(?:ready to submit|ready for review|submit for review)\b/) &&
    has(value, /\b(?:need|needs|repeat|complete).{0,45}\b(?:again|new|updated)?\b/);
  const familyAssessmentPending =
    currentSlaNote &&
    has(
      value,
      /\b(?:waiting|awaiting)\b.{0,45}\b(?:assessment|vineland|basc)\b.{0,35}\b(?:from|by)\b.{0,20}\b(?:family|parent|caregiver)\b|\b(?:assessment|vineland|basc)\b.{0,45}\b(?:from|by)\b.{0,20}\b(?:family|parent|caregiver)\b.{0,35}\b(?:waiting|awaiting|pending)\b/
    );
  const familySignatureBeforeSubmission =
    currentSlaNote &&
    has(
      value,
      /\b(?:family|parent|caregiver)\b.{0,55}\b(?:signature|signatures|signs|sign(?:ed|ing)?)\b|\b(?:signature|signatures|signs|sign(?:ed|ing)?)\b.{0,55}\b(?:family|parent|caregiver)\b/
    ) &&
    (has(value, /\b(?:awaiting|waiting|waits?|need|needs|missing|pending)\b/) ||
      has(value, /\bsent for (?:the )?(?:parent|family|caregiver) signature\b/) ||
      has(
        value,
        /\bonce\b.{0,45}\b(?:rec d|receive|received|receiving|obtain|obtained)\b.{0,25}\b(?:signature|signatures|signs)\b/
      )) &&
    has(value, /\b(?:submit|submission|treatment plan|\btp\b)\b/);
  const secondaryReviewAfterEdits =
    currentSlaNote &&
    has(value, planMention) &&
    has(value, /\b(?:corrected|corrections?|revised|revisions?|edits?)\b/) &&
    has(value, /\b(?:secondary review|second review|re[- ]?review|review again)\b/) &&
    has(value, /\b(?:awaiting|waiting|pending|submitted|sent|in review)\b/);
  const pendingPayerSubmission =
    currentSlaNote &&
    (has(
      value,
      /\b(?:awaiting|waiting|pending)\b.{0,40}\b(?:insurance|payer) submission\b|\b(?:insurance|payer) submission\b.{0,40}\b(?:awaiting|waiting|pending)\b/
    ) ||
      (has(value, /\b(?:awaiting|waiting|pending)\b.{0,20}\bsubmission\b/) &&
        has(slaReasonContext, /\b(?:insurance|payer)\b/)));
  const submittedForHeadstartReview =
    currentSlaNote &&
    has(value, /\b(?:treatment plan|\btp\b)\b/) &&
    has(value, /\bsubmit(?:ted|tal)?\b/) &&
    has(
      value,
      /\b(?:headstart|internal|clinical quality)\b.{0,30}\breview\w*\b|\breview\w*\b.{0,30}\b(?:headstart|internal|clinical quality)\b|\bunder review\b/
    );
  return {
    typedNameSignature,
    agedAssessmentClarification,
    familyAssessmentPending,
    familySignatureBeforeSubmission,
    secondaryReviewAfterEdits,
    pendingPayerSubmission,
    submittedForHeadstartReview,
  };
}
export function treatmentPlanSignals(context: OperationalFactContext): TreatmentPlanSignals {
  const drafting = draftingSignals(context);
  const commitments = commitmentSignals(context, drafting);
  return {
    ...drafting,
    ...commitments,
    ...prerequisiteSignals(context, { ...drafting, ...commitments }),
  };
}
