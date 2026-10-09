import type { AuthorizationRecord } from './authorization-types.js';
import type {
  SourceAuthorizationOpportunity,
  SourceAuthorizationRecord,
} from './source-authorization-types.js';

export function authorizationSourceText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}
export function latestAuthorizationNoteDate(
  record: SourceAuthorizationRecord,
  asOf: Date
): string | null {
  const fallbackYear = Number(
    ([record.LastModifiedDate].find(Boolean) ?? asOf.toISOString()).slice(0, 4)
  );
  // Separate year/no-year patterns avoid nested repetition while preserving the source grammar.
  const patterns = [
    /(?:^|\n)\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*[-:]/g,
    /(?:^|\n)\s*(\d{1,2})\/(\d{1,2})\s*[-:]/g,
  ];
  const dates = patterns
    .flatMap((pattern) => [...(record.Notes__c ?? '').matchAll(pattern)])
    .map((match) => {
      const rawYear = match[3] ? Number(match[3]) : fallbackYear;
      const year = rawYear < 100 ? 2000 + rawYear : rawYear;
      return new Date(Date.UTC(year, Number(match[1]) - 1, Number(match[2])));
    })
    .filter((date) => !Number.isNaN(date.valueOf()) && date.valueOf() <= asOf.valueOf());
  return dates.sort((left, right) => right.valueOf() - left.valueOf())[0]?.toISOString() ?? null;
}
function explicitApprovalNote(record: SourceAuthorizationRecord): boolean {
  const note = authorizationSourceText(record.Notes__c);
  return (
    /\bapproved\b|\bno auth(?:orization)? (?:is )?needed\b/i.test(note) &&
    !/not approved|pending approval|awaiting approval/i.test(note)
  );
}
function commonFields(record: SourceAuthorizationRecord): AuthorizationRecord {
  return {
    id: record.Id,
    authorizationNumber: record.Authorization_Number__c,
    authStartDate: record.Auth_start_date__c,
    authExpirationDate: record.Auth_expiration_date__c,
    clientInsurance: record.Client_Insurance__c,
    payer: [record.Payor_Name__r?.Name].find(Boolean) ?? record.Payor_Name__c,
    denialReason: record.Denial_Reason__c,
    denialExplanation: record.Denial_Reason_Explanation__c,
    createdDate: record.CreatedDate,
  };
}
export function normalizeSourceAuthorization(
  record: SourceAuthorizationRecord,
  asOf: Date
): AuthorizationRecord {
  const authorizationType =
    authorizationSourceText(record.Authorization_Type__c) === 'Treatment Auth Request' &&
    [record.Master_Submission_Date__c, record.Treatment_Auth_Submission_Date__c].some(Boolean)
      ? 'Treatment'
      : record.Authorization_Type__c;
  const noteDate = latestAuthorizationNoteDate(record, asOf);
  const approvedNote = explicitApprovalNote(record);
  return {
    ...commonFields(record),
    authorizationType,
    determination:
      [record.Insurance_Determination__c].find(Boolean) ??
      (authorizationSourceText(
        [record.Denial_Reason__c].find(Boolean) ?? record.Denial_Reason_Explanation__c
      )
        ? 'Denied'
        : ''),
    status: record.Auth_Status__c,
    noAuthNeeded: record.No_Auth_Needed__c === true,
    initialSubmissionDate:
      [record.Master_Submission_Date__c].find(Boolean) ?? record.Initial_Auth_Submission_Date__c,
    treatmentSubmissionDate:
      [record.Master_Submission_Date__c].find(Boolean) ?? record.Treatment_Auth_Submission_Date__c,
    initialApprovalDate:
      [record.Master_Approval_Date__c, record.Initial_Auth_Approval_Date__c].find(Boolean) ??
      (authorizationSourceText(authorizationType) === 'Initial' && approvedNote
        ? (noteDate ?? record.LastModifiedDate)
        : null),
    treatmentApprovalDate:
      [record.Master_Approval_Date__c, record.Treatment_Auth_Approval_Date__c].find(Boolean) ??
      (authorizationSourceText(authorizationType) === 'Treatment' && approvedNote
        ? (noteDate ?? record.LastModifiedDate)
        : null),
    lastSubstantiveDate: noteDate,
    active: !/inactive|expired/i.test(authorizationSourceText(record.Auth_Status__c)),
  };
}
export function normalizeSourceAuthorizationReview(
  review: SourceAuthorizationRecord,
  opp: SourceAuthorizationOpportunity,
  asOf: Date
): AuthorizationRecord {
  const phase = authorizationSourceText(review.Authorization_Type__c);
  const approvedNote = explicitApprovalNote(review);
  const determination = approvedNote ? 'Approved' : review.Insurance_Determination__c;
  const status = approvedNote ? 'Active' : review.Auth_Status__c;
  const approved = /approved|active|no auth needed/i.test(`${determination ?? ''} ${status ?? ''}`);
  const noteDate = latestAuthorizationNoteDate(review, asOf);
  let approvalDate: string | null | undefined = null;
  if (approved && phase === 'Treatment') {
    approvalDate =
      [review.Treatment_Auth_Approval_Date__c, opp.Treatment_Auth_Approval_Date__c, noteDate].find(
        Boolean
      ) ?? review.LastModifiedDate;
  } else if (approved && phase === 'Initial') {
    approvalDate =
      [review.Initial_Auth_Approval_Date__c, noteDate].find(Boolean) ?? review.LastModifiedDate;
  }
  return {
    ...commonFields(review),
    authorizationType: phase,
    determination,
    status,
    noAuthNeeded: /no auth needed|no authorization needed/i.test(
      `${review.Insurance_Determination__c ?? ''} ${review.Auth_Status__c ?? ''}`
    ),
    initialSubmissionDate: review.Initial_Auth_Submission_Date__c,
    treatmentSubmissionDate: review.Treatment_Auth_Submission_Date__c,
    initialApprovalDate: phase === 'Initial' ? approvalDate : null,
    treatmentApprovalDate: phase === 'Treatment' ? approvalDate : null,
    lastSubstantiveDate: noteDate ?? review.LastModifiedDate,
    active: !/inactive|expired/i.test(authorizationSourceText(status)),
  };
}
