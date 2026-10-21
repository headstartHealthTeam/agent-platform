import { isoDate } from './dates.js';
import type { EvidenceDate } from './evidence.js';
import { categoryForGate } from './gate-context.js';
import {
  firstEvidenceText,
  latestEvidenceDate,
  requiredEvidenceValue,
  type SourceEvidenceContext,
} from './source-evidence-context.js';
import { sourceHtmlText } from './source-html-text.js';
import {
  CANDIDATE_FOLLOW_UP,
  RBT_TEAM,
  RBT_FOLLOW_UP,
  futureStaffingDate,
  staffingRecordMatches,
  type CandidateOpportunityMap,
  type StaffingEvidenceLink,
} from './staffing-evidence-common.js';
import { structuredEvidenceEvent, type StructuredEvidenceEvent } from './structured-evidence.js';

type CandidateField =
  | 'Name__c'
  | 'Name'
  | 'Applicant_First_Name__c'
  | 'Applicant_Last_Name__c'
  | 'Applicant_Status__c'
  | 'Rejection_Reason__c'
  | 'Provider_Rejection_Reason__c'
  | 'HDS_Rejection_Reason__c'
  | 'Earliest_Start_Date__c'
  | 'Offered_Extended_Date__c'
  | 'First_Interview_Date__c'
  | 'X2nd_Interview_Date__c'
  | 'Date_Applied__c'
  | 'LastModifiedDate'
  | 'CreatedDate'
  | 'Notes__c'
  | 'BCBA_Student_Notes__c'
  | 'Other_Certification_Notes__c';
export type CandidateEvidenceRecord = StaffingEvidenceLink &
  Readonly<Partial<Record<CandidateField, string | null | undefined>>> & {
    readonly Recommended_for_Hire__c?: unknown;
  };
type InterviewField =
  | 'Candidate_Name__c'
  | 'Status__c'
  | 'Recommendation_for_Hire__c'
  | 'Date_of_First_Interview__c'
  | 'LastModifiedDate'
  | 'CreatedDate'
  | 'Important_Notes__c'
  | 'Notes_for_BT_Stage__c'
  | 'Background_Screening_Notes__c';
export type InterviewEvidenceRecord = StaffingEvidenceLink &
  Readonly<Partial<Record<InterviewField, string | null | undefined>>> & {
    readonly Candidate__r?: { readonly Name?: string | null | undefined } | null | undefined;
  };
interface CandidateSourceInput extends SourceEvidenceContext {
  readonly candidateToOpportunity?: CandidateOpportunityMap | null;
}
export interface TalentAcquisitionEvidenceInput extends CandidateSourceInput {
  readonly records?: readonly CandidateEvidenceRecord[] | null;
}
export interface FirstInterviewEvidenceInput extends CandidateSourceInput {
  readonly records?: readonly InterviewEvidenceRecord[] | null;
}
interface CandidateState {
  readonly candidate: string;
  readonly status: string;
  readonly rejected: boolean;
  readonly hired: boolean;
  readonly availability: string | null;
  readonly eventDate: EvidenceDate;
}
function candidateNarrative(state: CandidateState): string {
  const { candidate, status, rejected, hired, availability, eventDate } = state;
  if (rejected)
    return `As of ${String(isoDate(eventDate))}, ${candidate} is no longer an active candidate (${status.toLowerCase()}); replacement staffing is not confirmed.`;
  if (hired)
    return `As of ${String(isoDate(eventDate))}, ${candidate} has reached ${status.toLowerCase()}${availability ? ` and reported earliest availability of ${availability}` : ''}, but a confirmed client assignment and first 97153 date are not recorded.`;
  return `As of ${String(isoDate(eventDate))}, ${candidate} is at ${status.toLowerCase()} in the RBT hiring process${availability ? ` with reported earliest availability of ${availability}` : ''}; the staffing decision and expected start remain unconfirmed.`;
}
function candidateEvent(
  record: CandidateEvidenceRecord,
  input: TalentAcquisitionEvidenceInput
): StructuredEvidenceEvent {
  const candidateName =
    firstEvidenceText(
      record.Name__c,
      record.Name,
      [record.Applicant_First_Name__c, record.Applicant_Last_Name__c].filter(Boolean).join(' ')
    ) ?? null;
  const status = firstEvidenceText(record.Applicant_Status__c) ?? 'status not recorded';
  const rejected = /reject|declin|withdraw|inactive|no show/i.test(
    `${status} ${record.Rejection_Reason__c ?? ''} ${record.Provider_Rejection_Reason__c ?? ''} ${record.HDS_Rejection_Reason__c ?? ''}`
  );
  const hired =
    Boolean(record.Recommended_for_Hire__c) || /hire|offer accepted|matched/i.test(status);
  const availability = record.Earliest_Start_Date__c
    ? isoDate(record.Earliest_Start_Date__c)
    : null;
  const eventDate =
    latestEvidenceDate(
      record.Offered_Extended_Date__c,
      record.First_Interview_Date__c,
      record.X2nd_Interview_Date__c,
      record.Date_Applied__c,
      record.LastModifiedDate,
      record.CreatedDate
    ) ?? input.asOf;
  return structuredEvidenceEvent({
    opportunityId: input.profile.opportunityId,
    source: 'Talent Acquisition',
    sourceRecordId: requiredEvidenceValue(record.Id, 'sourceRecordId'),
    eventDate,
    category: 'rbt',
    text: candidateNarrative({
      candidate: candidateName ?? 'The linked candidate',
      status,
      rejected,
      hired,
      availability,
      eventDate,
    }),
    gateImpact: rejected
      ? 'RBT candidate is no longer active; replacement staffing is required'
      : hired
        ? 'RBT candidate has reached the hiring stage; treatment start remains unconfirmed'
        : 'RBT candidate is progressing; staffing remains unconfirmed',
    actionOwner: RBT_TEAM,
    actionType: RBT_FOLLOW_UP,
    recommendedAction: rejected
      ? 'RBT Team to confirm the replacement candidate pipeline and next staffing milestone.'
      : CANDIDATE_FOLLOW_UP,
    processRelevance: hired || rejected ? 9 : 8,
    milestoneDate: null,
    rawText:
      sourceHtmlText(
        [record.Notes__c, record.BCBA_Student_Notes__c, record.Other_Certification_Notes__c]
          .filter(Boolean)
          .join(' ')
      ) || null,
    factType: rejected ? 'rbt-lost' : hired ? 'rbt-assigned' : 'rbt-candidate',
    candidateStep: status,
    candidateName,
    candidateActive: candidateName ? !rejected : null,
  });
}
export function adaptTalentAcquisition(
  input: TalentAcquisitionEvidenceInput
): StructuredEvidenceEvent[] {
  if (categoryForGate(input.gate) !== 'rbt') return [];
  return (input.records ?? [])
    .filter((record) =>
      staffingRecordMatches(record, input.profile.opportunityId, input.candidateToOpportunity)
    )
    .map((record) => candidateEvent(record, input));
}
function interviewEvent(
  record: InterviewEvidenceRecord,
  input: FirstInterviewEvidenceInput
): StructuredEvidenceEvent {
  const candidateName =
    firstEvidenceText(record.Candidate__r?.Name, record.Candidate_Name__c) ?? null;
  const candidate = candidateName ?? 'The linked candidate';
  const status =
    firstEvidenceText(record.Status__c, record.Recommendation_for_Hire__c) ??
    'outcome not recorded';
  const planned = futureStaffingDate(record.Date_of_First_Interview__c, input.asOf);
  const date = isoDate(record.Date_of_First_Interview__c);
  const eventDate =
    latestEvidenceDate(
      planned ? null : record.Date_of_First_Interview__c,
      record.LastModifiedDate,
      record.CreatedDate
    ) ?? input.asOf;
  return structuredEvidenceEvent({
    opportunityId: input.profile.opportunityId,
    source: 'RBT First Interview',
    sourceRecordId: requiredEvidenceValue(record.Id, 'sourceRecordId'),
    eventDate,
    category: 'rbt',
    text: planned
      ? `${candidate}'s first interview is planned for ${String(date)} with status ${status.toLowerCase()}; the interview outcome and staffing decision remain unconfirmed.`
      : `On ${String(isoDate(eventDate))}, ${candidate} reached first interview with status ${status.toLowerCase()}; the final staffing decision and start date remain unconfirmed.`,
    gateImpact: planned
      ? 'RBT interview is planned; staffing remains unconfirmed'
      : 'RBT candidate reached interview; staffing remains unconfirmed',
    actionOwner: RBT_TEAM,
    actionType: planned ? 'Monitor' : RBT_FOLLOW_UP,
    recommendedAction: planned
      ? `RBT Team to monitor the ${String(date)} interview and document its outcome and next staffing step.`
      : 'RBT Team to document the interview outcome, next candidate step, and expected staffing date.',
    milestoneDate: planned ? date : null,
    followUpDate: planned ? date : null,
    processRelevance: 8,
    rawText:
      sourceHtmlText(
        [
          record.Important_Notes__c,
          record.Notes_for_BT_Stage__c,
          record.Background_Screening_Notes__c,
        ]
          .filter(Boolean)
          .join(' ')
      ) || null,
    factType: 'rbt-candidate',
    candidateStep: `first interview - ${status}`,
    candidateName,
    candidateActive: candidateName
      ? !/reject|declin|withdraw|no show|unresponsive/i.test(status)
      : null,
  });
}
export function adaptRbtFirstInterviews(
  input: FirstInterviewEvidenceInput
): StructuredEvidenceEvent[] {
  if (categoryForGate(input.gate) !== 'rbt') return [];
  return (input.records ?? [])
    .filter((record) =>
      staffingRecordMatches(record, input.profile.opportunityId, input.candidateToOpportunity)
    )
    .map((record) => interviewEvent(record, input));
}
