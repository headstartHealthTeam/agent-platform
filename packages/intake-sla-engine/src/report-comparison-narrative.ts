import { selectCurrentCandidateMatch } from './candidate-match.js';
import { comparisonFutureDate } from './report-comparison-authorization.js';
import type { ReportComparisonInput } from './report-comparison-types.js';
import {
  reportClean,
  reportFitCompleteThought,
  reportOperationalText,
  reportShortDate,
  reportText,
  reportTruncate,
} from './report-display-values.js';

export interface ReportComparisonNarrative extends Pick<
  ReportComparisonInput,
  'freshness' | 'rbts' | 'ticketMatches' | 'runAt'
> {
  readonly position: string;
  readonly detail: string;
  readonly blocker: string;
  readonly provider: string;
}
const DEFAULT_PROVIDER = 'the provider';
interface NarrativeContext extends ReportComparisonNarrative {
  readonly evidence: string;
  readonly latestEvidence: string;
  readonly sourceDate: string;
  readonly datePrefix: string;
}
function authorizationNarrative({ blocker, position }: NarrativeContext): string | null {
  if (/authorization withdrawn/i.test(blocker))
    return reportTruncate(
      `${position} Insurance Ops must confirm why it was withdrawn and whether a corrected request or closure is required.`,
      245
    );
  if (/insurance denial|payer correction/i.test(blocker))
    return reportTruncate(
      `${position} Insurance Ops must confirm the denial reason and document the correction, appeal, or resubmission path.`,
      245
    );
  if (/partially approved/i.test(blocker))
    return reportTruncate(
      `${position} Provider and Insurance Ops must decide whether to accept the reduced authorization or appeal and document the next payer action.`,
      245
    );
  if (/authorization pending/i.test(blocker))
    return reportTruncate(`${position} The payer determination remains the blocking gate.`, 245);
  if (/insurance verification/i.test(blocker))
    return reportTruncate(
      `${position} Verification or the remaining prerequisite must be confirmed before the Opportunity can advance.`,
      245
    );
  return null;
}
function signatureLabel(evidence: string): string {
  const signatures = [
    /parent signed/i.test(evidence) ? 'parent' : '',
    /provider signed/i.test(evidence) ? 'provider' : '',
  ].filter(Boolean);
  return signatures.length === 2
    ? 'both required signatures recorded'
    : signatures.length === 1
      ? `${signatures[0] ?? ''} signature recorded`
      : 'signature status recorded';
}
function planNarrative({
  blocker,
  evidence,
  sourceDate,
  position,
  provider,
}: NarrativeContext): string | null {
  if (/treatment plan ready for submission/i.test(blocker)) {
    const signatureText = signatureLabel(evidence);
    return reportTruncate(
      `Initial assessment is complete. ${sourceDate ? `As of ${sourceDate}, ` : ''}the treatment plan is ready to submit with ${signatureText}; the submission date is not recorded.`,
      245
    );
  }
  if (
    /treatment plan/i.test(blocker) &&
    /not yet been submitted|not been submitted|not submitted/i.test(evidence)
  )
    return reportTruncate(
      `${position} ${sourceDate ? `As of ${sourceDate}, ` : ''}${reportText(provider, DEFAULT_PROVIDER)} reported the treatment plan was not submitted; completion and submission timing remain unconfirmed.`,
      245
    );
  return null;
}
function prerequisiteNarrative({
  blocker,
  datePrefix,
  latestEvidence,
}: NarrativeContext): string | null {
  if (/paired-client dependency|hold request/i.test(blocker))
    return reportTruncate(
      `${datePrefix}The provider requested a hold because this client and a paired sibling are expected to start together. The restart condition and timing must be confirmed.`,
      245
    );
  if (/interpreter|translation support/i.test(blocker))
    return reportTruncate(
      `${datePrefix}Initial authorization is approved, but the provider needs interpreter or translation support before scheduling the IA. The support and assessment date are not yet confirmed.`,
      245
    );
  if (/document|coverage correction/i.test(blocker)) {
    return /duke|original .*evaluation|other evaluation|testing tools/i.test(latestEvidence)
      ? reportTruncate(
          `${datePrefix}Insurance requested the original Duke diagnostic evaluation because the other report used insufficient testing tools. The family said they have it; receipt and payer acceptance are not confirmed.`,
          245
        )
      : reportTruncate(
          'Initial authorization is approved, but required intake documentation or coverage correction remains incomplete. Scheduling cannot proceed until the missing requirement is completed and recorded.',
          245
        );
  }
  return null;
}
function schedulingNarrative({
  blocker,
  datePrefix,
  latestEvidence,
  provider,
}: NarrativeContext): string | null {
  if (!/provider scheduling|initial assessment/i.test(blocker)) return null;
  const scheduledDate =
    // eslint-disable-next-line security/detect-unsafe-regex -- Approved fixed scheduling words and bounded numeric date; preserve the existing accepted grammar.
    /(?:\bIA\b|\bIC\b|initial assessment)?\s*scheduled for\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i.exec(
      latestEvidence
    )?.[1];
  if (scheduledDate)
    return reportTruncate(
      `Initial authorization is approved; Salesforce records the initial assessment for ${scheduledDate}. Completion is not yet confirmed, so the Opportunity remains pending scheduling.`,
      245
    );
  if (
    /ables|assessment packet/i.test(latestEvidence) &&
    /slow|not responding|without responding|haven['’]?t heard back/i.test(latestEvidence)
  )
    return reportTruncate(
      `${datePrefix}The family has not completed the ABLES assessment packet and has been slow to respond. The provider is prioritizing responsive families, so the IA is not yet scheduled.`,
      245
    );
  if (/can['’]?t intake|cannot intake/i.test(latestEvidence))
    return reportTruncate(
      `${datePrefix}${reportText(provider, 'The provider')} reported they cannot intake the client yet because of current capacity and treatment-plan backlog; the IA remains unscheduled.`,
      245
    );
  return null;
}
function candidateNarrative(context: NarrativeContext): string | null {
  const match = selectCurrentCandidateMatch(context.ticketMatches);
  const candidate = reportClean(match?.Candidate__r?.Name);
  const matchStatus = reportClean(match?.Ticket_Match_Status__c);
  const candidateStatus = reportClean(match?.Candidate__r?.Applicant_Status__c);
  if (candidate && /2nd interview completed/i.test(matchStatus))
    return reportTruncate(
      `${context.datePrefix}${candidate} completed the second interview and is ${/provider handoff/i.test(candidateStatus) ? 'in provider handoff' : 'awaiting the next staffing decision'}. Staffing and the first 97153 date remain unconfirmed.`,
      245
    );
  if (candidate && /interview/i.test(`${matchStatus} ${candidateStatus}`))
    return reportTruncate(
      `${context.datePrefix}${candidate} is in the interview process. The staffing decision and first 97153 date remain unconfirmed.`,
      245
    );
  return null;
}
function startNarrative(context: NarrativeContext): string {
  const { latestEvidence, datePrefix, position, evidence } = context;
  const futureStart = comparisonFutureDate(latestEvidence, context.runAt);
  if (/later start window|extended start/i.test(latestEvidence) && futureStart)
    return reportTruncate(
      `${datePrefix}The family requested a later treatment start, estimated for ${futureStart}. The RBT is hired, but Salesforce and linked billing do not yet confirm the first 97153 appointment.`,
      245
    );
  if (/start(?:ing|s|ed)?\s+next week/i.test(latestEvidence))
    return reportTruncate(
      `${datePrefix}The provider and CSM reported treatment is expected to start the following week. Salesforce and linked billing do not yet confirm the first 97153 appointment.`,
      245
    );
  const useful =
    /projected to start|onboarding|first 97153|start date/i.test(evidence) &&
    !/candidate Hired|match Hired|match Proposed/i.test(evidence);
  return useful
    ? reportTruncate(
        `${position} ${reportFitCompleteThought(evidence, Math.max(70, 245 - position.length - 1))}`,
        245
      )
    : reportTruncate(
        `${position} The provider must confirm start readiness and the first 97153 appointment date.`,
        245
      );
}
function staffingNarrative(context: NarrativeContext): string | null {
  if (!/RBT|candidate|staff|treatment start/i.test(context.blocker)) return null;
  const candidate = candidateNarrative(context);
  if (candidate !== null) return candidate;
  const active = context.rbts.find(
    (request) =>
      !request.Date_Closed__c &&
      /recruiting|sourcing|screening|provider interview/i.test(
        `${request.Recruiting_Launched_Status__c ?? ''} ${request.RBT_Recruitment_Funnel__c ?? ''}`
      )
  );
  if (
    active ||
    /recruiting activated|recruiting launched|sourcing|screening/i.test(context.latestEvidence)
  )
    return reportTruncate(
      `${context.datePrefix}RBT recruiting is active in sourcing and screening, but no candidate or first 97153 date is confirmed.`,
      245
    );
  return startNarrative(context);
}
function carePlanNarrative({
  blocker,
  latestEvidence,
  datePrefix,
  position,
}: NarrativeContext): string | null {
  if (!/care-plan feasibility/i.test(blocker)) return null;
  return /custody|divorc|limited availability|available monday through thursday/i.test(
    latestEvidence
  )
    ? reportTruncate(
        `${datePrefix}Split custody and limited weekday availability may prevent a consistent care schedule. The provider and family must confirm whether services can proceed and on what schedule.`,
        245
      )
    : reportTruncate(
        `${position} The specific care constraint and next decision date remain unconfirmed.`,
        245
      );
}
function fallbackEvidence(context: NarrativeContext): string {
  const { blocker, provider, evidence, sourceDate } = context;
  const generic =
    // eslint-disable-next-line security/detect-unsafe-regex -- Original bounded activity prefix and semicolon-delimited fixed tokens; retaining comparison-only semantics.
    /(?:^|:\s*)(?:f\/?u|follow[- ]?up|call|task)(?:\s+on)?[^.;]{0,80}(?:;\s*(?:call|task))*$/i.test(
      evidence
    ) ||
    // eslint-disable-next-line security/detect-unsafe-regex -- Repeated tokens consume a mandatory semicolon delimiter; this is the approved suffix test.
    (/;\s*(?:call|task)(?:;\s*(?:call|task))*$/i.test(evidence) && evidence.length < 100);
  if (
    /treatment plan/i.test(blocker) &&
    (generic ||
      !/treatment plan|parent signed|provider signed|signature|clinical review/i.test(evidence))
  )
    return `No substantive treatment-plan update was found; ${reportText(provider, DEFAULT_PROVIDER)} must confirm its status and submission timing.`;
  if (
    /provider scheduling|initial assessment|re-engagement/i.test(blocker) &&
    (generic || !/assessment|\bIA\b|schedul/i.test(evidence))
  )
    return `No confirmed initial-assessment date was found; ${reportText(provider, DEFAULT_PROVIDER)} must confirm the date or scheduling blocker.`;
  if (
    /RBT|staff|treatment start/i.test(blocker) &&
    !/RBT|97153|candidate|hired|staff|start/i.test(evidence)
  )
    return 'Staffing or start activity exists, but no provider-confirmed first 97153 appointment was found.';
  if (
    /auth|insurance|payer/i.test(blocker) &&
    !/auth|insurance|payer|deni|VOB|eligib/i.test(evidence)
  )
    return 'The current payer determination or required insurance follow-up is not independently confirmed.';
  return reportText(
    evidence,
    `No substantive update${sourceDate ? ` since ${sourceDate}` : ''}; the current blocker remains unconfirmed.`
  );
}
export function comparisonNarrative(input: ReportComparisonNarrative): string {
  const sourceDate = reportShortDate(input.freshness.latestUpdateAt);
  const context: NarrativeContext = {
    ...input,
    evidence: reportOperationalText(input.detail),
    latestEvidence: reportOperationalText(input.freshness.latestUpdateSummary),
    sourceDate,
    datePrefix: sourceDate ? `${sourceDate}: ` : '',
  };
  if (
    /insurance prerequisite was reported resolved|can now schedule the initial assessment/i.test(
      input.freshness.latestUpdateFact
    )
  )
    return reportTruncate(
      `${context.datePrefix}The insurance issue is resolved, and the provider can schedule the initial assessment with the family. The assessment date is not yet confirmed.`,
      245
    );
  const fact = input.freshness.primaryOperationalFact;
  if (fact?.summary)
    return reportFitCompleteThought(
      `${fact.summary} ${fact.gateImpact ? `Unresolved gate: ${fact.gateImpact}.` : ''}`,
      245
    );
  for (const rule of [
    authorizationNarrative,
    planNarrative,
    prerequisiteNarrative,
    schedulingNarrative,
    staffingNarrative,
    carePlanNarrative,
  ]) {
    const result = rule(context);
    if (result !== null) return result;
  }
  const evidence = fallbackEvidence(context);
  const position = reportOperationalText(input.position).replace(
    /^The Opportunity /,
    'Opportunity '
  );
  if (position.toLowerCase() === evidence.toLowerCase()) return reportTruncate(position, 245);
  return `${position} ${reportFitCompleteThought(evidence, Math.max(70, 245 - position.length - 1))}`;
}
