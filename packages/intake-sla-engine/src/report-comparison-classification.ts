import { selectCurrentCandidateMatch } from './candidate-match.js';
import { comparisonAction } from './report-comparison-action.js';
import {
  comparisonAuthorization,
  comparisonAuthorizationOutcome,
  comparisonGateAction,
  comparisonVob,
  comparisonVobComplete,
} from './report-comparison-authorization.js';
import { comparisonClinicalQuality } from './report-comparison-position.js';
import { comparisonSummary } from './report-comparison-summary.js';
import type {
  ReportComparisonInput,
  ReportComparisonResult,
  ReportComparisonSummaries,
} from './report-comparison-types.js';
import { reportText, reportTruncate } from './report-display-values.js';
import { reportCandidateSummary, reportRbtSummary } from './report-staffing-summaries.js';
import {
  reportAuthorizationReviewSummary,
  reportAuthorizationSummary,
  reportClinicalQualitySummary,
  reportVobSummary,
} from './report-structured-summaries.js';

type Decision = Pick<
  ReportComparisonResult,
  'blocker' | 'confidence' | 'bestSource' | 'sourceQuality'
>;
const INSURANCE_VERIFICATION = 'Insurance Verification';
const INDEPENDENT_COMMUNICATION = 'Independent communication';
function datedConfidence(input: ReportComparisonInput): 'High' | 'Medium' {
  const hasDate = Boolean(input.freshness.latestUpdateAt);
  return hasDate ? 'High' : 'Medium';
}
interface ClassificationContext {
  readonly input: ReportComparisonInput;
  readonly summaries: ReportComparisonSummaries;
  readonly stage: string;
  readonly independentText: string;
  readonly text: string;
  readonly currentAuthText: string;
  readonly iaScheduling: boolean;
  readonly taScheduling: boolean;
  readonly operationalFact: ReportComparisonInput['freshness']['primaryOperationalFact'];
}
export function comparisonFamilyDeclined(text: string): boolean {
  return /decided not to (?:do|pursue|continue)|not moving forward|withdraw(?:ing|n)? from (?:care|services|treatment)|no longer (?:want|pursu).*treatment/i.test(
    text
  );
}
function contextFor(input: ReportComparisonInput): ClassificationContext {
  const summaries = {
    auth: reportAuthorizationSummary(input.auths),
    authReview: reportAuthorizationReviewSummary(input.authReviews),
    vob: reportVobSummary(input.vobs),
    cq: reportClinicalQualitySummary(input.clinicalQuality),
    rbt: reportRbtSummary(input.rbts, input.staffing),
    candidates: reportCandidateSummary(input.ticketMatches, input.interviews),
  };
  const stage = reportText(input.opp.StageName, input.sla.Stage__c);
  const independentText = `${summaries.auth.text} ${summaries.authReview.text} ${summaries.vob.text} ${summaries.cq.text} ${summaries.rbt.text} ${summaries.candidates.text} ${input.freshness.latestUpdateSummary} ${input.commsText}`;
  const auth = comparisonAuthorization(input.auths, stage);
  return {
    input,
    summaries,
    stage,
    independentText,
    text: `${stage} ${independentText}`.toLowerCase(),
    currentAuthText:
      `${auth.Auth_Status__c ?? ''} ${auth.Insurance_Determination__c ?? ''} ${auth.Denial_Reason__c ?? ''} ${auth.Denial_Reason_Explanation__c ?? ''}`.toLowerCase(),
    iaScheduling:
      stage.includes('IA Approved') ||
      stage.includes('IC Completed') ||
      stage.includes('IC Scheduled') ||
      stage === 'IA Scheduled',
    taScheduling:
      stage.includes('TA Approved') || stage.includes('97153') || stage.includes('First Day'),
    operationalFact:
      /insurance prerequisite was reported resolved|can now schedule the initial assessment/i.test(
        input.freshness.latestUpdateFact
      )
        ? null
        : input.freshness.primaryOperationalFact,
  };
}
const defaultDecision: Decision = {
  blocker: 'Needs review',
  confidence: 'Medium',
  bestSource: 'Structured Salesforce',
  sourceQuality: 'Direct',
};
function decision(blocker: string, fields: Partial<Decision> = {}): Decision {
  return { ...defaultDecision, blocker, ...fields };
}
function priorityDecision(context: ClassificationContext): Decision | null {
  const { input, operationalFact } = context;
  const { freshness, authorizationGate: gate } = input;
  if (comparisonFamilyDeclined(input.commsText))
    return decision('Family declined services / closure required', {
      bestSource: reportText(freshness.latestUpdateSource, 'Salesforce communication'),
      confidence: 'High',
    });
  if (gate.required && !gate.satisfied)
    return decision(gate.blocker ?? '', {
      bestSource: 'Authorization',
      sourceQuality: gate.conflict ? 'Blocked' : 'Direct',
      confidence: gate.conflict ? 'Low' : 'High',
    });
  if (operationalFact && (operationalFact.relevance ?? 0) >= 9) {
    const quality = reportText(operationalFact.matchQuality, 'Likely');
    return decision(reportText(operationalFact.gateImpact, 'Stage-relevant operational blocker'), {
      bestSource: reportText(
        operationalFact.source,
        freshness.latestUpdateSource,
        INDEPENDENT_COMMUNICATION
      ),
      sourceQuality: quality,
      confidence: quality === 'Weak' ? 'Low' : 'High',
    });
  }
  return null;
}
function insuranceBlocker(context: ClassificationContext): string {
  const { stage, currentAuthText, independentText, input } = context;
  let blocker: string;
  if (stage === INSURANCE_VERIFICATION)
    blocker = comparisonVobComplete(comparisonVob(input.vobs))
      ? 'Insurance verification complete / stage not advanced'
      : 'Insurance verification pending';
  else if (currentAuthText.includes('withdrawn'))
    blocker = 'Authorization withdrawn / family decision';
  else if (currentAuthText.includes('partially approved'))
    blocker = 'Treatment authorization partially approved / provider decision';
  else
    blocker = /denial|denied/.test(`${currentAuthText} ${independentText}`.toLowerCase())
      ? 'Insurance denial / payer correction'
      : 'Insurance authorization pending';

  return blocker;
}
function insuranceDecision(context: ClassificationContext): Decision | null {
  const { stage, currentAuthText, iaScheduling, summaries } = context;
  const approved =
    /approved|active/.test(currentAuthText) && !/denied|withdrawn/.test(currentAuthText);
  if (
    ![INSURANCE_VERIFICATION, 'IA Requested', 'TA Requested'].includes(stage) ||
    (iaScheduling && approved)
  )
    return null;
  const bestSource =
    stage === INSURANCE_VERIFICATION && summaries.vob.quality === 'Direct'
      ? 'VOB'
      : summaries.auth.quality === 'Direct'
        ? 'Authorization'
        : summaries.authReview.quality === 'Direct'
          ? 'Authorization Review'
          : 'Structured Salesforce';
  return decision(insuranceBlocker(context), {
    bestSource,
    confidence: [
      summaries.auth.quality,
      summaries.authReview.quality,
      summaries.vob.quality,
    ].includes('Direct')
      ? 'High'
      : 'Medium',
  });
}
function contextualDecision(context: ClassificationContext): Decision | null {
  const { input, independentText, iaScheduling, taScheduling } = context;
  const current = `${input.freshness.latestUpdateSummary} ${input.freshness.latestUpdateFact}`;
  const bestSource = reportText(input.freshness.latestUpdateSource, INDEPENDENT_COMMUNICATION);
  if (/custody|divorc|consistent care|guardian agreement/i.test(current))
    return decision('Family availability or care-plan feasibility', {
      bestSource,
      confidence: 'High',
    });
  if (/interpreter|translation service|language support/i.test(independentText) && iaScheduling)
    return decision('Interpreter or translation support required', {
      bestSource,
      confidence: datedConfidence(input),
    });
  if (/dropped off.*interest.*returned|returned.*start services/i.test(independentText))
    return decision('Provider scheduling after client re-engagement', {
      bestSource,
      confidence: 'High',
    });
  if (
    /family (?:is |still )?(?:unresponsive|unavailable|on vacation|not ready|paused|request|wants|doesn'?t want)|family availability|future start|custody|divorced parents|consistent care|guardian agreement/i.test(
      current
    ) &&
    !taScheduling
  )
    return decision('Family availability or care-plan feasibility', {
      bestSource,
      confidence: datedConfidence(input),
    });
  return null;
}
function planBlocker(context: ClassificationContext): string {
  const cq = comparisonClinicalQuality(context.input.clinicalQuality);
  if (/approved/i.test(cq.Treatment_Plan_Status__c ?? ''))
    return 'Treatment plan approved / stage not advanced';
  if (/ready to submit/i.test(cq.Treatment_Plan_Status__c ?? ''))
    return 'Treatment plan ready for submission';
  if (cq.Provider_Signature_Date__c && !cq.Parent_Signature_Date__c)
    return 'Treatment plan awaiting parent signature';
  if (cq.Parent_Signature_Date__c && !cq.Provider_Signature_Date__c)
    return 'Treatment plan awaiting provider signature';
  if (/edits sent for review|pending approval|in review/i.test(cq.Treatment_Plan_Status__c ?? ''))
    return 'Treatment plan in clinical review';
  return /signature|sent for signatures/.test(context.text)
    ? 'Treatment plan awaiting signatures'
    : 'Treatment plan drafting or review';
}
function staffingBlocker(context: ClassificationContext): string {
  const match = selectCurrentCandidateMatch(context.input.ticketMatches);
  const state = `${match?.Ticket_Match_Status__c ?? ''} ${match?.Candidate__r?.Applicant_Status__c ?? ''}`;
  if (/hired/i.test(state)) return 'Hired RBT / treatment start pending';
  if (/proposed|interview|screen/i.test(state)) return 'RBT candidate in matching or interview';
  return context.text.includes('external hire')
    ? 'RBT external hire / start date'
    : 'RBT recruiting or treatment start';
}
function planDecision(context: ClassificationContext): Decision {
  const { summaries, input } = context;
  return decision(planBlocker(context), {
    bestSource: summaries.cq.quality === 'Direct' ? 'Clinical Quality' : defaultDecision.bestSource,
    confidence:
      summaries.cq.quality === 'Direct' || input.opp.Current_Treatment_Plan_Status__c
        ? 'High'
        : 'Medium',
  });
}
function staffingDecision(context: ClassificationContext): Decision {
  const { summaries } = context;
  return decision(staffingBlocker(context), {
    bestSource:
      summaries.candidates.quality === 'Direct'
        ? 'Candidate / Interview'
        : summaries.rbt.quality === 'Direct'
          ? 'RBT Request / Staffing'
          : defaultDecision.bestSource,
    confidence:
      summaries.rbt.quality === 'Direct' || summaries.candidates.quality === 'Direct'
        ? 'High'
        : 'Medium',
  });
}
function schedulingDecision(context: ClassificationContext): Decision {
  const { stage, input } = context;
  const paired =
    /will not start one client and not the other|won't start one client and not the other|provider wants?.*client.*(?:on )?hold/i.test(
      context.independentText
    );
  const document =
    /onboarding packet|parent assessments?|vineland|basc|coordination of benefits|\bcob\b|discharge report|school (?:information|report)|diagnostic (?:report|evaluation)|original .*evaluation|evaluation .*insurance/i.test(
      input.freshness.latestUpdateSummary
    );
  const blocker = paired
    ? 'Provider hold request / paired-client dependency'
    : document
      ? 'Required document or coverage correction'
      : stage === 'IA Scheduled'
        ? 'Initial assessment completion'
        : 'Provider scheduling for initial assessment';
  return decision(blocker, {
    confidence: datedConfidence(input),
  });
}
function stageDecision(context: ClassificationContext): Decision | null {
  if (context.stage.includes('Treatment Plan') || context.stage.includes('97151'))
    return planDecision(context);
  if (context.taScheduling) return staffingDecision(context);
  if (context.iaScheduling) return schedulingDecision(context);
  return null;
}
function remainingDecision(context: ClassificationContext): Decision {
  const { input, independentText } = context;
  if (
    /documents|document|lmn|referral|diagnostic|\bde\b|discharge report|school report|working with the school|cob|coordination of benefits|onboarding packet|parent assessments?|vineland|basc/i.test(
      independentText
    )
  )
    return decision('Required document or coverage correction', {
      bestSource: reportText(input.freshness.latestUpdateSource, INDEPENDENT_COMMUNICATION),
      confidence: datedConfidence(input),
    });
  return { ...defaultDecision };
}
/** Retain comparison/source-requirement context only; never substitute it for final evidence facts. */
export function classifyReportComparison(input: ReportComparisonInput): ReportComparisonResult {
  const context = contextFor(input);
  const selected =
    priorityDecision(context) ??
    insuranceDecision(context) ??
    contextualDecision(context) ??
    stageDecision(context) ??
    remainingDecision(context);
  if (input.freshness.latestUpdateSource === 'Fireflies') {
    selected.bestSource = 'Fireflies';
    selected.sourceQuality = 'Likely';
  } else if (input.freshness.latestUpdateSource === 'Portal chat') {
    selected.bestSource = 'Portal';
    selected.sourceQuality = 'Direct';
  }
  const gate = input.authorizationGate;
  let action =
    gate.required && !gate.satisfied
      ? comparisonGateAction(gate)
      : comparisonSelectedAction(context, selected.blocker);
  let summary = comparisonSummary(input, selected.blocker, context.summaries);
  const auth = comparisonAuthorization(input.auths, context.stage);
  const evidenceConflict =
    /denied|withdrawn/i.test(
      `${auth.Auth_Status__c ?? ''} ${auth.Insurance_Determination__c ?? ''}`
    ) &&
    /still with insurance|awaiting (?:insurance )?approval|remains? pending with insurance/i.test(
      input.commsText
    ) &&
    /SMS|call/i.test(input.freshness.latestUpdateSource);
  if (evidenceConflict) {
    summary = reportTruncate(
      `${comparisonAuthorizationOutcome(context.stage, auth)} A newer family message says it remains with insurance; verify the current determination.`,
      245
    );
    action =
      'Insurance Ops to verify the current determination, correct Salesforce and family-facing status, and document the correction, appeal, or resubmission path.';
    selected.confidence = 'Low';
  }
  return {
    blocker: selected.blocker,
    action,
    confidence: selected.confidence,
    bestSource: selected.bestSource,
    sourceQuality: selected.sourceQuality,
    summary,
    evidenceConflict: evidenceConflict || Boolean(gate.conflict),
  };
}

function comparisonSelectedAction(context: ClassificationContext, blocker: string): string {
  const action = context.operationalFact?.action;
  if (action) return action;
  return comparisonAction(context.input, blocker);
}
