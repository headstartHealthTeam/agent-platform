import type { InterviewEvidenceRecord } from './candidate-evidence.js';
import type { CandidateMatch } from './candidate-match.js';
import { isoDate } from './dates.js';
import { categoryForGate } from './gate-context.js';
import {
  firstEvidenceText,
  latestEvidenceDate,
  requiredEvidenceValue,
  type SourceEvidenceContext,
} from './source-evidence-context.js';
import { sourceHtmlText } from './source-html-text.js';
import {
  RBT_TEAM,
  RBT_FOLLOW_UP,
  CANDIDATE_FOLLOW_UP,
  futureStaffingDate,
  type CandidateOpportunityMap,
} from './staffing-evidence-common.js';
import {
  structuredEvidenceEvent,
  type StructuredEvidenceEvent,
  type StructuredEvidenceInput,
} from './structured-evidence.js';

export interface TicketMatchEvidenceRecord extends Omit<CandidateMatch, 'Candidate__r'> {
  readonly Id?: string | null | undefined;
  readonly RBT_Request__c?: string | null | undefined;
  readonly Candidate__c?: string | null | undefined;
  readonly Interview_Notes__c?: string | null | undefined;
  readonly Provider_Notes__c?: string | null | undefined;
  readonly Candidate__r?:
    | (NonNullable<CandidateMatch['Candidate__r']> & {
        readonly Name?: string | null | undefined;
      })
    | null
    | undefined;
}
export interface TicketMatchEvidenceInput extends SourceEvidenceContext {
  readonly records?: readonly TicketMatchEvidenceRecord[] | null;
  readonly requestToOpportunity: CandidateOpportunityMap;
  readonly firstInterviews?: readonly InterviewEvidenceRecord[];
}
interface MatchState {
  readonly record: TicketMatchEvidenceRecord;
  readonly interview: InterviewEvidenceRecord | undefined;
  readonly planned: boolean;
  readonly candidateName: string | null;
  readonly candidate: string;
  readonly state: string;
  readonly eventDate: string;
  readonly rejected: boolean;
  readonly hired: boolean;
  readonly interviewed: boolean;
  readonly candidateStep: string;
}
type MatchCommon = Omit<StructuredEvidenceInput, 'source' | 'sourceRecordId'>;
function combinedMatchState(record: TicketMatchEvidenceRecord): string {
  const values = [
    record.Ticket_Match_Status__c,
    record.Candidate__r?.Applicant_Status__c,
    record.Reason_for_Decline__c,
    record.Rejection_Reason__c,
    record.Candidate__r?.Provider_Rejection_Reason__c,
    record.Candidate__r?.HDS_Rejection_Reason__c,
  ]
    .map((value) => (value ?? '').trim())
    .filter(Boolean);
  return values
    .filter(
      (value, index) =>
        values.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) === index
    )
    .join('; ');
}
function interviewModified(interview: InterviewEvidenceRecord): number {
  const value = firstEvidenceText(interview.LastModifiedDate) ?? interview.CreatedDate;
  // Preserve Date(null) versus Date(undefined), including the first-row retention on invalid dates.
  return new Date(value === null ? 0 : (value ?? NaN)).valueOf();
}
function interviewsByCandidate(
  records: readonly InterviewEvidenceRecord[]
): Map<string | null | undefined, InterviewEvidenceRecord> {
  const result = new Map<string | null | undefined, InterviewEvidenceRecord>();
  for (const record of records) {
    const current = result.get(record.Candidate__c);
    if (!current || interviewModified(record) > interviewModified(current))
      result.set(record.Candidate__c, record);
  }
  return result;
}
function matchContext(
  record: TicketMatchEvidenceRecord,
  interview: InterviewEvidenceRecord | undefined,
  asOf: string
): MatchState {
  const candidateName = firstEvidenceText(record.Candidate__r?.Name) ?? null;
  const state = combinedMatchState(record) || 'candidate linked';
  const planned = futureStaffingDate(interview?.Date_of_First_Interview__c, asOf);
  const eventDate =
    latestEvidenceDate(
      planned ? null : interview?.Date_of_First_Interview__c,
      interview?.LastModifiedDate,
      record.LastModifiedDate,
      record.CreatedDate
    ) ?? asOf;
  const rejected = /reject|declin|withdraw|unresponsive|no show|did not pass/i.test(state);
  const hired = /hired|matched|accepted/i.test(state);
  const interviewed =
    Boolean(interview?.Date_of_First_Interview__c) || /interview|screen/i.test(state);
  const candidateStep =
    !hired && interviewed && interview?.Status__c
      ? `first interview - ${interview.Status__c}`
      : state;
  return {
    record,
    interview,
    planned,
    candidateName,
    candidate: candidateName ?? 'The linked candidate',
    state,
    eventDate,
    rejected,
    hired,
    interviewed,
    candidateStep,
  };
}
function matchNarrative(context: MatchState): string {
  const {
    record,
    interview,
    candidate,
    state,
    eventDate,
    rejected,
    hired,
    interviewed,
    planned,
    candidateStep,
  } = context;
  const date = String(isoDate(eventDate));
  if (rejected)
    return `As of ${date}, ${candidate} is no longer an active staffing path (${state}); replacement coverage is not confirmed.`;
  if (hired)
    return `As of ${date}, ${candidate} is ${state.toLowerCase()}, but the first 97153 date is not recorded.`;
  const matchStatus = (record.Ticket_Match_Status__c ?? '').trim();
  const applicantStatus = (record.Candidate__r?.Applicant_Status__c ?? '').trim();
  if (
    matchStatus &&
    applicantStatus &&
    matchStatus.toLowerCase() !== applicantStatus.toLowerCase()
  ) {
    return `As of ${date}, ${candidate} is ${matchStatus.toLowerCase()} to the provider while the candidate record remains at ${applicantStatus.toLowerCase()}; the staffing decision and expected start date are not recorded.`;
  }
  if (planned)
    return `${candidate}'s first interview is planned for ${String(isoDate(interview?.Date_of_First_Interview__c))}; the interview outcome, staffing decision, and start date remain unconfirmed.`;
  if (interviewed)
    return `As of ${date}, ${candidate} reached ${candidateStep.toLowerCase()}; the outcome, staffing decision, and expected start date are not recorded.`;
  return `As of ${date}, ${candidate} is at ${state.toLowerCase()}; the next candidate milestone is not recorded.`;
}
function matchCommon(context: MatchState, opportunityId: string): MatchCommon {
  const { record, interview, rejected, hired, candidateName } = context;
  return {
    opportunityId,
    eventDate: context.eventDate,
    category: 'rbt',
    text: matchNarrative(context),
    gateImpact: rejected
      ? 'Leading RBT candidate is no longer active; replacement staffing is required'
      : hired
        ? 'RBT candidate is selected; first 97153 scheduling remains unconfirmed'
        : 'RBT candidate is progressing but staffing is not confirmed',
    actionOwner: RBT_TEAM,
    actionType: RBT_FOLLOW_UP,
    recommendedAction: rejected
      ? 'RBT Team to confirm the replacement candidate pipeline and next expected staffing milestone.'
      : CANDIDATE_FOLLOW_UP,
    processRelevance: hired ? 10 : rejected ? 9 : 8,
    factType: rejected ? 'rbt-lost' : hired ? 'rbt-assigned' : 'rbt-candidate',
    candidateStep: context.candidateStep,
    candidateName,
    candidateActive: candidateName ? !rejected : null,
    rawText:
      sourceHtmlText(
        [
          record.Interview_Notes__c,
          record.Provider_Notes__c,
          interview?.Important_Notes__c,
          interview?.Notes_for_BT_Stage__c,
        ]
          .filter(Boolean)
          .join(' ')
      ) || null,
  };
}
function linkedInterview(
  context: MatchState,
  interview: InterviewEvidenceRecord,
  common: MatchCommon
): StructuredEvidenceEvent {
  const { candidate, planned, eventDate } = context;
  const date = isoDate(interview.Date_of_First_Interview__c);
  const status = interview.Status__c ? ` with status ${interview.Status__c.toLowerCase()}` : '';
  return structuredEvidenceEvent({
    ...common,
    source: 'RBT First Interview',
    sourceRecordId: requiredEvidenceValue(interview.Id, 'sourceRecordId'),
    eventDate:
      firstEvidenceText(
        planned ? null : interview.Date_of_First_Interview__c,
        interview.LastModifiedDate,
        eventDate
      ) ?? '',
    text: planned
      ? `${candidate}'s first interview is planned for ${String(date)}${status}; the interview outcome and staffing decision remain unconfirmed.`
      : `On ${String(isoDate(firstEvidenceText(interview.Date_of_First_Interview__c, eventDate)))}, ${candidate} reached first interview${status}; the staffing decision and expected start date remain unconfirmed.`,
    milestoneDate: planned ? date : null,
    followUpDate: planned ? date : null,
    actionType: planned ? 'Monitor' : common.actionType,
    recommendedAction: planned
      ? `RBT Team to monitor the ${String(date)} interview and document its outcome and next staffing step.`
      : common.recommendedAction,
    candidateStep: `first interview${interview.Status__c ? ` - ${interview.Status__c}` : ''}`,
  });
}
function matchEvents(context: MatchState, opportunityId: string): StructuredEvidenceEvent[] {
  const { record, interview, candidate, rejected, candidateStep } = context;
  const common = matchCommon(context, opportunityId);
  const events = [
    structuredEvidenceEvent({
      ...common,
      source: 'Ticket Match',
      sourceRecordId: requiredEvidenceValue(record.Id, 'sourceRecordId'),
    }),
  ];
  if (record.Candidate__c && record.Candidate__r) {
    events.push(
      structuredEvidenceEvent({
        ...common,
        source: 'Talent Acquisition',
        sourceRecordId: record.Candidate__c,
        text: `${candidate} has applicant status ${firstEvidenceText(record.Candidate__r.Applicant_Status__c) ?? 'not recorded'}; ${rejected ? 'this is not an active staffing path' : 'staffing and the expected start date remain unconfirmed'}.`,
        candidateStep:
          firstEvidenceText(record.Candidate__r.Applicant_Status__c, candidateStep) ?? '',
      })
    );
  }
  if (interview) events.push(linkedInterview(context, interview, common));
  return events;
}
export function adaptTicketMatches(input: TicketMatchEvidenceInput): StructuredEvidenceEvent[] {
  if (categoryForGate(input.gate) !== 'rbt') return [];
  const interviews = interviewsByCandidate(input.firstInterviews ?? []);
  return (input.records ?? [])
    .filter(
      (record) =>
        input.requestToOpportunity.get(record.RBT_Request__c) === input.profile.opportunityId
    )
    .flatMap((record) =>
      matchEvents(
        matchContext(record, interviews.get(record.Candidate__c), input.asOf),
        input.profile.opportunityId
      )
    );
}
