import { selectCurrentCandidateMatch } from './candidate-match.js';
import type { FreshnessAuthorization, FreshnessClinicalQuality } from './freshness-source-types.js';
import {
  comparisonAuthorization,
  comparisonAuthorizationOutcome,
  comparisonDenialDetail,
  comparisonPartialHours,
  comparisonPayerLabel,
  comparisonVob,
} from './report-comparison-authorization.js';
import { comparisonIndependentDiscussion } from './report-comparison-position.js';
import type {
  ReportComparisonInput,
  ReportComparisonSummaries,
} from './report-comparison-types.js';
import {
  reportLatestDate,
  reportPreferred,
  reportShortDate,
  reportText,
  reportTimestamp,
  reportTruncate,
} from './report-display-values.js';

interface SummaryContext {
  readonly input: ReportComparisonInput;
  readonly blocker: string;
  readonly summaries: ReportComparisonSummaries;
  readonly stage: string;
  readonly latest: FreshnessAuthorization;
}
function latestClinicalDate(record: FreshnessClinicalQuality): string {
  return reportLatestDate(
    record.Parent_Signature_Date__c,
    record.Provider_Signature_Date__c,
    record.TS_Edits_Sent_for_Review__c,
    record.TS_In_Review__c,
    record.CreatedDate
  );
}
function earlySummary({ input, blocker }: SummaryContext): string | null {
  const freshness = input.freshness;
  if (/family declined services/i.test(blocker))
    return reportTruncate(
      `${reportShortDate(freshness.latestUpdateAt)}: Family said they decided not to pursue treatment. Opportunity requires closure or discharge review.`,
      245
    );
  if (
    /document|coverage correction/i.test(blocker) &&
    /onboarding packet|parent assessments?|vineland|basc/i.test(freshness.latestUpdateSummary)
  ) {
    const detail = /one signature left/i.test(freshness.latestUpdateSummary)
      ? 'one onboarding-packet signature remains'
      : 'required intake documents remain incomplete';
    return reportTruncate(
      `${reportShortDate(freshness.latestUpdateAt)}: IA authorization is approved, but ${detail}; scheduling cannot proceed until completion is recorded.`,
      245
    );
  }
  return null;
}
function authorizationSummary({ input, latest, stage, blocker }: SummaryContext): string | null {
  if (
    /partially approved/i.test(
      `${latest.Insurance_Determination__c ?? ''} ${latest.Auth_Status__c ?? ''}`
    )
  ) {
    const { requested, approved } = comparisonPartialHours(latest);
    const submitted = reportText(
      latest.Treatment_Auth_Submission_Date__c,
      latest.Master_Submission_Date__c
    );
    const hours =
      approved && requested
        ? `${approved} of ${requested} requested weekly hours`
        : 'reduced hours';
    return reportTruncate(
      `TA submitted ${reportShortDate(submitted)}; payer partially approved ${hours} on ${reportShortDate(reportPreferred(input.freshness.latestUpdateAt, latest.LastModifiedDate))}. Provider and Insurance Ops must confirm acceptance or appeal.`,
      245
    );
  }
  const state = `${latest.Auth_Status__c ?? ''} ${latest.Insurance_Determination__c ?? ''}`;
  if (
    /IA Approved|IC Completed|IC Scheduled|IA Scheduled/.test(stage) &&
    /approved|active/i.test(state) &&
    !/denied|withdrawn/i.test(state)
  ) {
    const approvedAt = reportText(
      latest.Initial_Auth_Approval_Date__c,
      latest.Master_Approval_Date__c,
      latest.LastModifiedDate
    );
    return reportTruncate(
      `${reportShortDate(approvedAt)}: IA authorization is approved; the initial assessment is not yet confirmed as scheduled.`,
      245
    );
  }
  if (/auth|insurance|payer/i.test(blocker) && /denied|withdrawn/i.test(state))
    return reportTruncate(comparisonAuthorizationOutcome(stage, latest), 245);
  return null;
}
function linkedSummary({ input, blocker }: SummaryContext): string | null {
  const cq =
    [...input.clinicalQuality].sort(
      (a, b) => reportTimestamp(latestClinicalDate(b)) - reportTimestamp(latestClinicalDate(a))
    )[0] ?? {};
  const cqAt = latestClinicalDate(cq);
  if (cqAt && /treatment plan/i.test(blocker)) {
    const status = reportText(cq.Treatment_Plan_Status__c, 'updated');
    return reportTruncate(
      `${reportShortDate(cqAt)}: Treatment plan ${status.toLowerCase()}${cq.Parent_Signature_Date__c ? `; parent signed ${reportShortDate(cq.Parent_Signature_Date__c)}` : ''}${cq.Provider_Signature_Date__c ? `; provider signed ${reportShortDate(cq.Provider_Signature_Date__c)}` : ''}.`,
      245
    );
  }
  const match = selectCurrentCandidateMatch(input.ticketMatches);
  const matchAt = reportText(match?.LastModifiedDate, match?.CreatedDate);
  if (
    reportTimestamp(matchAt) >= reportTimestamp(input.freshness.latestUpdateAt) &&
    /RBT|treatment start/i.test(blocker) &&
    match?.Candidate__r?.Name
  ) {
    return reportTruncate(
      `${reportShortDate(matchAt)}: ${match.Candidate__r.Name} is ${reportText(match.Ticket_Match_Status__c, match.Candidate__r.Applicant_Status__c).toLowerCase()}${match.Candidate__r.Earliest_Start_Date__c ? ` with earliest start ${reportShortDate(match.Candidate__r.Earliest_Start_Date__c)}` : ''}; treatment start is not yet confirmed.`,
      245
    );
  }
  return null;
}
function insuranceFollowUpSummary(context: SummaryContext): string | null {
  const { input, blocker, summaries, latest, stage } = context;
  if (/cob|coordination of benefits/i.test(input.freshness.latestUpdateSummary))
    return reportTruncate(
      `${reportShortDate(input.freshness.latestUpdateAt)}: Family must update coordination of benefits so the commercial plan is primary and Medicaid secondary; awaiting family confirmation.`,
      245
    );
  if (/verification complete/i.test(blocker) && summaries.vob.quality === 'Direct') {
    const vob = comparisonVob(input.vobs);
    return reportTruncate(
      `${reportShortDate(vob.Verification_Date__c)}: VOB completed for ${reportText(vob.Payor__r?.Name, 'the payer')}; eligibility is ${reportText(vob.Eligibility_Status__c, 'verified').toLowerCase()}. Opportunity remains in Insurance Verification.`,
      245
    );
  }
  const priorDenial = comparisonDenialDetail(latest);
  const submission = reportText(
    latest.Treatment_Auth_Submission_Date__c,
    latest.Initial_Auth_Submission_Date__c,
    latest.Master_Submission_Date__c
  );
  if (
    /auth|insurance|payer/i.test(blocker) &&
    priorDenial &&
    submission &&
    /pending/i.test(`${latest.Auth_Status__c ?? ''} ${latest.Insurance_Determination__c ?? ''}`)
  )
    return reportTruncate(
      `${stage.startsWith('TA') ? 'TA' : 'IA'} resubmitted ${reportShortDate(submission)} after denial for ${priorDenial}; awaiting determination.`,
      245
    );
  return null;
}
function pendingAuthorizationSummary(context: SummaryContext, updateDate: string): string {
  const { latest, stage } = context;
  const type = stage.startsWith('TA') ? 'TA' : 'IA';
  const submitted = reportText(
    latest.Treatment_Auth_Submission_Date__c,
    latest.Initial_Auth_Submission_Date__c,
    latest.Master_Submission_Date__c
  );
  const payer = comparisonPayerLabel(latest.Client_Insurance__c);
  const priorDenial = comparisonDenialDetail(latest);
  return priorDenial &&
    /pending/i.test(`${latest.Auth_Status__c ?? ''} ${latest.Insurance_Determination__c ?? ''}`)
    ? `${type} resubmitted ${reportShortDate(submitted)} after denial for ${priorDenial}; awaiting determination.`
    : `${updateDate ? `${updateDate}: ` : ''}${type}${submitted ? ` submitted ${reportShortDate(submitted)}` : ''} to ${payer}; awaiting determination.`;
}
function fallbackSummary(context: SummaryContext): string {
  const { input, latest, blocker, summaries } = context;
  const updateDate = reportShortDate(
    reportPreferred(input.freshness.latestUpdateAt, latest.LastModifiedDate)
  );
  if (/auth|insurance|payer/i.test(blocker) && summaries.auth.quality === 'Direct')
    return pendingAuthorizationSummary(context, updateDate);
  if (/auth|insurance|payer/i.test(blocker) && summaries.authReview.quality === 'Direct')
    return `${updateDate ? `${updateDate}: ` : ''}${reportTruncate(summaries.authReview.text, 215)}`;
  if (/rbt|staff|start/i.test(blocker) && summaries.candidates.quality === 'Direct')
    return `${updateDate ? `${updateDate}: ` : ''}${reportTruncate(summaries.candidates.text, 205)}`;
  if (/rbt|staff|start/i.test(blocker) && summaries.rbt.quality === 'Direct')
    return `${updateDate ? `${updateDate}: ` : ''}${reportTruncate(summaries.rbt.text, 205)}`;
  return missingSummary(input, blocker);
}
function missingSummary(input: ReportComparisonInput, blocker: string): string {
  const date = reportShortDate(input.freshness.latestUpdateAt);
  const since = date ? ` since ${date}` : '';
  if (/provider scheduling|initial assessment/i.test(blocker))
    return `No substantive IA scheduling update${since}; the provider still needs to confirm the IA date.`;
  if (/treatment plan/i.test(blocker))
    return `No substantive treatment plan update${since}; the provider still needs to confirm status and submission timing.`;
  return `No substantive update${since}; ${blocker} remains unresolved.`;
}
export function comparisonSummary(
  input: ReportComparisonInput,
  blocker: string,
  summaries: ReportComparisonSummaries
): string {
  const stage = reportText(input.opp.StageName, input.sla.Stage__c, 'Current stage');
  const context = {
    input,
    blocker,
    summaries,
    stage,
    latest: comparisonAuthorization(input.auths, stage),
  };
  const early = earlySummary(context);
  if (early !== null) return early;
  const discussion = comparisonIndependentDiscussion(input.freshness);
  if (discussion) return discussion;
  return (
    authorizationSummary(context) ??
    linkedSummary(context) ??
    insuranceFollowUpSummary(context) ??
    reportTruncate(fallbackSummary(context), 245)
  );
}
