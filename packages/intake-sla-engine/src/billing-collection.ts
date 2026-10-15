import type { BillingClaim } from './billing-types.js';
import { isoDate } from './dates.js';
import { sha256Json } from './json-fingerprint.js';

/** Reviewed legacy Production evidence, not the Partial provider-confirmed lifecycle. */
export const BILLING_EVIDENCE_CONTRACT = '2026-09-14.1';

export function billingClaimsQuery(opportunityIds: readonly string[]): string {
  if (
    opportunityIds.length === 0 ||
    opportunityIds.some((id) => !/^006[a-zA-Z0-9]+$/.test(id) || ![15, 18].includes(id.length))
  ) {
    throw new Error('Billing collection requires explicit Salesforce Opportunity IDs');
  }
  const ids = opportunityIds.map((id) => `'${id}'`).join(', ');
  return `SELECT Id, Name, CreatedDate, LastModifiedDate, Appointment_ID__c, Client_Opportunity__c, Authorization__r.Client_Opportunity_Record__c, Appt_Date__c, Appt_Start_Time__c, Appt_End_Time__c, Appointment_Status__c, Completed__c, Completed_Date__c, Billing_Code__c, Service_Name__c, Staff_Name__c, Rendering_Provider__c, Headstart_Provider_Profile__r.Name, RBT_Staffing__r.Name, Authorization__c, Claim_Id__c, Date_Billed__c, Notes__c FROM Billing_and_Claims__c WHERE (Client_Opportunity__c IN (${ids}) OR Authorization__r.Client_Opportunity_Record__c IN (${ids})) ORDER BY Appt_Date__c DESC, Id`;
}

interface BillingCollectionInput {
  readonly records: readonly BillingClaim[];
  readonly opportunityIds: readonly string[];
  readonly cutoff: string;
}
export interface BillingCollectionReceipt {
  readonly version: string;
  readonly cutoff: string;
  readonly opportunityIds: readonly string[];
  readonly queryHash: string;
  readonly recordsHash: string;
  readonly complete: true;
}

export function billingCollectionReceipt({
  records,
  opportunityIds,
  cutoff,
}: BillingCollectionInput): BillingCollectionReceipt {
  if (
    isoDate(cutoff) === null ||
    new Set(records.map((row) => row.Id)).size !== records.length ||
    records.some(
      (row) =>
        !row.Id ||
        !Object.hasOwn(row, 'Client_Opportunity__c') ||
        !Object.hasOwn(row, 'Authorization__r')
    )
  ) {
    throw new Error(
      'Billing collection lacks unique record identities or explicit relationship fields'
    );
  }
  return {
    version: BILLING_EVIDENCE_CONTRACT,
    cutoff,
    opportunityIds: [...opportunityIds].sort(),
    queryHash: sha256Json(billingClaimsQuery(opportunityIds)),
    recordsHash: sha256Json(records),
    complete: true,
  };
}

export function assertBillingCollectionReceipt(
  input: BillingCollectionInput & { readonly receipt: unknown }
): void {
  const expected = billingCollectionReceipt(input);
  if (sha256Json(input.receipt) !== sha256Json(expected)) {
    throw new Error(
      'Billing snapshot lacks complete current-contract relationship evidence; refresh this source only'
    );
  }
}

export function groupBillingClaims<T extends BillingClaim>(
  records: readonly T[],
  opportunityIds: readonly string[]
): Map<string, T[]> {
  const groups = new Map<string, T[]>(opportunityIds.map((id) => [id, []]));
  for (const record of records) {
    const owners = new Set(
      [record.Client_Opportunity__c, record.Authorization__r?.Client_Opportunity_Record__c].filter(
        (value): value is string => Boolean(value)
      )
    );
    for (const id of owners) groups.get(id)?.push(record);
  }
  return groups;
}
