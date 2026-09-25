import { candidateMatchRank } from './candidate-match.js';
import type {
  FreshnessInterview,
  FreshnessRbt,
  FreshnessStaffing,
} from './freshness-source-types.js';
import type { ReportCandidateMatch, ReportSourceSummary } from './report-display-types.js';
import {
  reportGroupBy,
  reportPlainText,
  reportPreferred,
  reportText,
  reportTimestamp,
  reportTruncate,
} from './report-display-values.js';

function requestSummary(request: FreshnessRbt): string {
  return [
    request.Name,
    request.Recruiting_Launched_Status__c,
    request.RBT_Recruitment_Funnel__c,
    request.RBT_Assigned__r?.Name ? `assigned ${request.RBT_Assigned__r.Name}` : '',
    request.RBT_Start_Date__c ? `start ${request.RBT_Start_Date__c}` : '',
    request.Est_Care_Start_Date__c ? `est ${request.Est_Care_Start_Date__c}` : '',
    request.Date_Closed__c ? `closed ${request.Date_Closed__c}` : '',
    request.Request_Cancellation_Reason__c
      ? `cancel ${reportTruncate(request.Request_Cancellation_Reason__c, 100)}`
      : '',
  ]
    .filter(Boolean)
    .join('; ');
}
function staffingSummary(staff: FreshnessStaffing): string {
  return [
    staff.Name,
    staff.Status__c,
    staff.Billable_Start_Date__c ? `billable ${staff.Billable_Start_Date__c}` : '',
    staff.Supervising_Provider__r?.Name ? `supervisor ${staff.Supervising_Provider__r.Name}` : '',
    staff.Notes__c ? `notes ${reportTruncate(staff.Notes__c, 120)}` : '',
  ]
    .filter(Boolean)
    .join('; ');
}
export function reportRbtSummary(
  requests: readonly FreshnessRbt[],
  staffing: readonly FreshnessStaffing[]
): ReportSourceSummary {
  const requestPieces = [...requests]
    .sort((a, b) => reportTimestamp(b.CreatedDate) - reportTimestamp(a.CreatedDate))
    .slice(0, 2)
    .map(requestSummary);
  const staffingPieces = [...staffing]
    .sort((a, b) => reportTimestamp(b.CreatedDate) - reportTimestamp(a.CreatedDate))
    .slice(0, 2)
    .map(staffingSummary);
  const pieces = [...requestPieces, ...staffingPieces];
  return {
    text: pieces.length
      ? reportTruncate(pieces.join(' | '), 800)
      : 'No RBT Request/Staffing rows found',
    quality: pieces.length ? 'Direct' : 'Not found',
    best: reportText(requests[0]?.Name, staffing[0]?.Name),
  };
}
function candidateParts(match: ReportCandidateMatch, interview: FreshnessInterview): string[] {
  const candidate = match.Candidate__r ?? {};
  return [
    candidate.Name ?? '',
    `match ${reportText(match.Ticket_Match_Status__c, 'unknown')}`,
    candidate.Applicant_Status__c ? `candidate ${candidate.Applicant_Status__c}` : '',
    candidate.Earliest_Start_Date__c ? `earliest start ${candidate.Earliest_Start_Date__c}` : '',
    interview.Date_of_First_Interview__c ? `interview ${interview.Date_of_First_Interview__c}` : '',
    interview.Status__c ? `interview ${interview.Status__c}` : '',
    match.Rejection_Reason__c ? `rejected ${match.Rejection_Reason__c}` : '',
    match.Reason_for_Decline__c ? `declined ${match.Reason_for_Decline__c}` : '',
    candidate.HDS_Rejection_Reason__c
      ? `candidate rejected ${candidate.HDS_Rejection_Reason__c}`
      : '',
    candidate.Provider_Rejection_Reason__c
      ? `provider rejected ${candidate.Provider_Rejection_Reason__c}`
      : '',
  ];
}
function candidateNotes(match: ReportCandidateMatch, interview: FreshnessInterview): string[] {
  return [
    match.Provider_Notes__c ? `provider notes ${reportPlainText(match.Provider_Notes__c)}` : '',
    match.Interview_Notes__c
      ? `match interview notes ${reportPlainText(match.Interview_Notes__c)}`
      : '',
    interview.Important_Notes__c
      ? `interview notes ${reportPlainText(interview.Important_Notes__c)}`
      : '',
    match.Candidate__r?.Notes__c
      ? `candidate notes ${reportPlainText(match.Candidate__r.Notes__c)}`
      : '',
  ];
}
export function reportCandidateSummary(
  matches: readonly ReportCandidateMatch[],
  interviews: readonly FreshnessInterview[]
): ReportSourceSummary {
  if (!matches.length && !interviews.length)
    return { text: 'No linked candidate/interview rows found', quality: 'Not found', best: '' };
  const byCandidate = reportGroupBy(interviews, (interview) => interview.Candidate__c);
  const sorted = [...matches].sort(
    (a, b) =>
      candidateMatchRank(b) - candidateMatchRank(a) ||
      reportTimestamp(reportPreferred(b.LastModifiedDate, b.CreatedDate)) -
        reportTimestamp(reportPreferred(a.LastModifiedDate, a.CreatedDate))
  );
  const pieces = sorted.slice(0, 3).map((match) => {
    const interview =
      match.Interview__r ??
      (byCandidate.get(match.Candidate__c) ?? []).sort(
        (a, b) =>
          reportTimestamp(reportPreferred(b.Date_of_First_Interview__c, b.LastModifiedDate)) -
          reportTimestamp(reportPreferred(a.Date_of_First_Interview__c, a.LastModifiedDate))
      )[0] ??
      {};
    return [...candidateParts(match, interview), ...candidateNotes(match, interview)]
      .filter(Boolean)
      .join('; ');
  });
  return {
    text: reportTruncate(pieces.join(' | '), 1000),
    quality: 'Direct',
    best: reportText(sorted[0]?.Candidate__r?.Name, interviews[0]?.Name),
  };
}
