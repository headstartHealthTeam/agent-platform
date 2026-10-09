import type { AuthorizationEvidenceRecord } from './authorization-evidence-types.js';
import type { AuthorizationRecord } from './authorization-types.js';
import type { EvidenceDate } from './evidence.js';
import { datedTaskLines } from './source-task-dates.js';

/** Evidence-adapter projection; intentionally distinct from the live prerequisite source projection. */
export function normalizeEvidenceAuthorization(
  record: AuthorizationEvidenceRecord,
  asOf: EvidenceDate
): AuthorizationRecord {
  const authorizationType =
    record.Authorization_Type__c === 'Treatment Auth Request' &&
    Boolean(record.Treatment_Auth_Submission_Date__c)
      ? 'Treatment'
      : record.Authorization_Type__c;
  return {
    id: record.Id,
    authorizationType,
    authorizationNumber: record.Authorization_Number__c,
    determination: record.Insurance_Determination__c,
    status: record.Auth_Status__c,
    noAuthNeeded: record.No_Auth_Needed__c === true,
    initialSubmissionDate: record.Initial_Auth_Submission_Date__c,
    treatmentSubmissionDate: record.Treatment_Auth_Submission_Date__c,
    initialApprovalDate: record.Initial_Auth_Approval_Date__c,
    treatmentApprovalDate: record.Treatment_Auth_Approval_Date__c,
    authStartDate: record.Auth_start_date__c,
    authExpirationDate: record.Auth_expiration_date__c,
    clientInsurance: record.Client_Insurance__c,
    payer: record.Payor_Name__r?.Name ?? record.Payor_Name__c,
    denialReason: record.Denial_Reason__c,
    denialExplanation: record.Denial_Reason_Explanation__c,
    createdDate: record.CreatedDate,
    lastSubstantiveDate:
      datedTaskLines(
        {
          Description: record.Notes__c,
          CreatedDate: record.CreatedDate,
          LastModifiedDate: record.LastModifiedDate,
        },
        asOf
      )
        .map((note) => note.eventDate)
        .filter(Boolean)
        .sort((left, right) => new Date(right).valueOf() - new Date(left).valueOf())[0] ?? null,
    active: (record.Auth_Status__c ?? '').toLowerCase() !== 'inactive',
  };
}
