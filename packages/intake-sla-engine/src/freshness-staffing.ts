import { candidateMatchIsActive, selectCurrentCandidateMatch } from './candidate-match.js';
import {
  addFreshnessCandidate,
  latestFreshnessRecordDate,
  type FreshnessContext,
} from './freshness-candidates.js';
import { firstEvidenceText } from './source-evidence-context.js';

function countText(value: unknown, label: string): string {
  if (value === null || value === undefined) return '';
  return `${unknownCount(value)} ${label}`;
}
function unknownCount(value: unknown): string {
  return String(value);
}
function requestFreshness(context: FreshnessContext): void {
  for (const request of context.input.rbts ?? [])
    addFreshnessCandidate(context.candidates, {
      at: firstEvidenceText(request.LastModifiedDate, request.Date_Closed__c, request.CreatedDate),
      source: 'RBT Request',
      sourceRecordId: request.Id,
      summary: [
        request.Name,
        request.Recruiting_Launched_Status__c,
        request.RBT_Recruitment_Funnel__c,
        request.RBT_Assigned__r?.Name,
        request.RBT_Start_Date__c,
        countText(request.Total_Screened_Candidates__c, 'screened'),
        countText(request.Active_Candidates__c, 'active'),
        countText(request.Proposed_Candidates__c, 'proposed'),
        countText(request.Matched_Candidates__c, 'matched'),
        request.Request_Cancellation_Reason__c,
      ]
        .filter(Boolean)
        .join('; '),
      candidateName: firstEvidenceText(request.RBT_Assigned__r?.Name) ?? null,
      candidateStep:
        firstEvidenceText(
          request.RBT_Recruitment_Funnel__c,
          request.Recruiting_Launched_Status__c
        ) ?? null,
      candidateActive: request.RBT_Assigned__r?.Name ? true : null,
    });
  for (const record of context.input.staffing ?? [])
    addFreshnessCandidate(context.candidates, {
      at: latestFreshnessRecordDate([record.Billable_Start_Date__c, record.CreatedDate]),
      source: 'Staffing',
      sourceRecordId: record.Id,
      summary: [
        record.Name,
        record.Status__c,
        record.Supervising_Provider__r?.Name,
        record.Notes__c,
      ]
        .filter(Boolean)
        .join('; '),
    });
}
function candidateFreshness(context: FreshnessContext): void {
  const matches = context.input.ticketMatches ?? [];
  const match = selectCurrentCandidateMatch(matches);
  if (match)
    addFreshnessCandidate(context.candidates, {
      at: firstEvidenceText(match.LastModifiedDate, match.CreatedDate),
      source: 'Candidate / Ticket Match',
      sourceRecordId: match.Id,
      summary: [
        match.Candidate__r?.Name,
        match.Ticket_Match_Status__c,
        match.Candidate__r?.Applicant_Status__c,
        match.Candidate__r?.Earliest_Start_Date__c,
        match.Rejection_Reason__c,
        match.Provider_Notes__c,
      ]
        .filter(Boolean)
        .join('; '),
      candidateName: firstEvidenceText(match.Candidate__r?.Name) ?? null,
      candidateStep:
        firstEvidenceText(
          [match.Ticket_Match_Status__c, match.Candidate__r?.Applicant_Status__c]
            .filter(Boolean)
            .join('; ')
        ) ?? null,
      candidateActive: candidateMatchIsActive(match),
    });
  for (const interview of context.input.firstInterviews ?? []) {
    const related = matches.find((row) => row.Candidate__c === interview.Candidate__c);
    addFreshnessCandidate(context.candidates, {
      at: firstEvidenceText(
        interview.Date_of_First_Interview__c,
        interview.LastModifiedDate,
        interview.CreatedDate
      ),
      source: 'RBT First Interview',
      sourceRecordId: interview.Id,
      summary: [
        related?.Candidate__r?.Name,
        interview.Name,
        interview.Status__c,
        interview.Interviewer__r?.Name,
        interview.Important_Notes__c,
        interview.Notes_for_BT_Stage__c,
      ]
        .filter(Boolean)
        .join('; '),
      candidateName: firstEvidenceText(related?.Candidate__r?.Name) ?? null,
      candidateStep: interview.Status__c
        ? `first interview - ${interview.Status__c}`
        : 'first interview',
      candidateActive: related ? candidateMatchIsActive(related) : null,
    });
  }
}
export function collectStaffingFreshness(context: FreshnessContext): void {
  if (context.family !== 'rbt') return;
  requestFreshness(context);
  candidateFreshness(context);
}
