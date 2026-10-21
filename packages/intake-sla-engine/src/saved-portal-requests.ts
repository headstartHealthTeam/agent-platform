import { z } from 'zod';

import { preserveCollectionRecord } from './collection-decoding.js';
import { savedOptionalText as text } from './saved-report-fields.js';

const identifier = z.union([z.string(), z.number()]).nullish();
const request = z.looseObject({
  opportunityId: text,
  clientOpportunityId: text,
  authType: text,
  type: text,
  Authorization_Type__c: text,
  status: text,
  Auth_Status__c: text,
  submittedAt: text,
  createdAt: text,
  Portal_Submission_Date__c: text,
  updatedAt: text,
  comments: text,
  Notes__c: text,
  requestNumber: identifier,
  friendlyId: identifier,
  Id: identifier,
});
const inventory = z.looseObject({ collectedAt: text, complete: z.unknown().optional() });
export function decodeSavedPortalRequests(
  records: readonly unknown[]
): readonly z.infer<typeof request>[] {
  return z.array(preserveCollectionRecord(request)).parse(records);
}
export function decodeSavedPortalRequestInventory(
  value: unknown
): z.infer<typeof inventory> | null {
  // An array inventory retains the original absent completeness/timestamp properties.
  return value === null || value === undefined
    ? null
    : Array.isArray(value)
      ? {}
      : preserveCollectionRecord(inventory).parse(value);
}
