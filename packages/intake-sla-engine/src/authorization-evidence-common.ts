import type {
  AuthorizationEvidenceIdentity,
  AuthorizationEvidenceRecord,
  AuthorizationsEvidenceInput,
} from './authorization-evidence-types.js';
import type { EvidenceDate } from './evidence.js';
import { datedTaskLines } from './source-task-dates.js';
import type { DatedTaskLine } from './source-task-dates.js';

export function authorizationNoteLines(
  record: AuthorizationEvidenceRecord,
  asOf: EvidenceDate
): DatedTaskLine[] {
  return datedTaskLines(
    {
      Description: record.Notes__c,
      CreatedDate: record.CreatedDate,
      LastModifiedDate: record.LastModifiedDate,
    },
    asOf
  );
}
export function authorizationEvidenceIdentity(
  record: AuthorizationEvidenceRecord,
  input: AuthorizationsEvidenceInput
): AuthorizationEvidenceIdentity[] {
  return [
    {
      opportunityId: input.profile.opportunityId,
      opportunityName: input.profile.opportunityName,
      authorizationNumber: record.Authorization_Number__c,
      payer: record.Payor_Name__r?.Name ?? record.Payor_Name__c,
      matchQuality: 'Direct',
    },
  ];
}
