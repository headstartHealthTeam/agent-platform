import type { SalesforceQueryReader } from '@headstart-health/salesforce-read';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { adaptAuthorizationReviews } from './authorization-review-evidence.js';
import { billingCollectionReceipt } from './billing-collection.js';
import type { StructuredCollectionArtifacts } from './collection-decoding.js';
import { initialCollectionQueries, INTAKE_OPPORTUNITY_QUERY } from './collection-queries.js';
import { buildIdentityProfile } from './identity-profile.js';
import { connectIntakeSalesforce } from './salesforce-reader.js';
import { resolveSourceAuthorizationGate } from './source-authorization-gate.js';
import { adaptStageHistory } from './stage-history-evidence.js';
import { collectStructuredEvidence } from './structured-collection.js';

const ID = ['006', '000000000001AAA'].join('');
const cutoff = '2026-09-24T16:00:00.000Z';
const target = { targetOrg: 'synthetic', expectedOrgId: '00D000000000001AAA' };
class MemoryArtifacts implements StructuredCollectionArtifacts {
  readonly files = new Map<string, unknown>();
  readonly writes: string[] = [];
  readonly reads: string[] = [];
  read(name: string): Promise<unknown> {
    this.reads.push(name);
    return Promise.resolve(this.files.get(name));
  }
  write(name: string, value: unknown): Promise<void> {
    this.writes.push(name);
    this.files.set(name, value);
    return Promise.resolve();
  }
}
function opportunity(): {
  Id: string;
  Name: string;
  StageName: string;
  ContactId: string;
  CSM__c: string;
  IA_Rendering_Provider__r: { Practice_Name__c: string; Practice_Name__r: { Name: string } };
} {
  return {
    Id: ID,
    Name: 'Synthetic Client',
    StageName: 'IA Scheduled',
    ContactId: 'contact',
    CSM__c: "Staff O'Example\\North",
    IA_Rendering_Provider__r: {
      Practice_Name__c: 'practice',
      Practice_Name__r: { Name: 'Synthetic Practice' },
    },
  };
}
function response(soql: string): unknown[] {
  if (soql.includes(' FROM Organization ')) return [{ Id: target.expectedOrgId, IsSandbox: false }];
  if (soql === INTAKE_OPPORTUNITY_QUERY)
    return [opportunity(), { Id: ['006', '000000000002AAA'].join(''), Name: 'Test Client' }];
  if (soql.includes(' FROM Authorization__c '))
    return [
      {
        Id: 'auth',
        Client_Opportunity_Record__c: ID,
        Authorization_Type__c: 'Initial',
        Master_Approval_Date__c: '2026-09-20',
      },
    ];
  if (soql.includes(' FROM Authorization_Review__c '))
    return [
      {
        Id: 'review',
        Authorization__c: 'auth',
        Notes__c: 'Synthetic review',
        CreatedDate: '2026-09-20',
      },
    ];
  if (soql.includes(' FROM RBT_Request__c '))
    return [
      { Id: 'rbt', RBT_Assigned__c: 'staff', Inactive__c: true, LastModifiedDate: '2026-09-21' },
    ];
  if (soql.includes(' FROM Staffing__c '))
    return [
      {
        Id: 'staff',
        Name: soql.includes(' WHERE Id ') ? 'Assigned result' : 'Direct result',
        First_Billable_Date__c: '2026-09-30',
      },
    ];
  if (soql.includes(' FROM Billing_and_Claims__c '))
    return [
      {
        Id: 'billing',
        Client_Opportunity__c: ID,
        Authorization__r: null,
        Billing_Code__c: '97151',
        Completed__c: 'Yes',
        Appt_Date__c: '2026-09-22',
      },
    ];
  if (soql.includes(' FROM Task '))
    return [
      {
        Id: 'task',
        WhatId: ID,
        Subject: soql.includes('LAST_N_DAYS') ? 'Line result' : 'Direct result',
        Status: 'Open',
      },
    ];
  if (soql.includes(' FROM aircall__Aircall_AI__c '))
    return [
      { Id: 'sms', aircall__Subtype__c: 'SMS', aircall__Description__c: 'Synthetic message' },
      { Id: 'voice', aircall__Description__c: 'Not a transcript' },
    ];
  if (soql.includes(' FROM TaskFeed '))
    return [
      {
        Id: 'feed',
        ParentId: 'task',
        CreatedDate: '2026-09-22',
        Body: 'Synthetic progress',
        FeedComments: { records: [] },
      },
    ];
  return relatedResponse(soql);
}
function relatedResponse(soql: string): unknown[] {
  if (soql.includes(' FROM Ticket_Match__c '))
    return [
      {
        Id: 'match',
        Candidate__c: 'candidate',
        Candidate__r: { Name: 'Synthetic Candidate', Applicant_Status__c: 'Interview' },
        Interview__r: { Status__c: 'Scheduled' },
      },
    ];
  if (soql.includes(' FROM RBT_First_Interview__c '))
    return [
      { Id: 'interview', Candidate__c: 'candidate', Candidate__r: { Name: 'Synthetic Candidate' } },
    ];
  if (soql.includes(' FROM Talent_Acquisition__c '))
    return [{ Id: 'candidate', Name: 'Synthetic Candidate' }];
  if (soql.includes(' FROM OpportunityContactRole '))
    return [
      {
        Id: 'role',
        OpportunityId: ID,
        ContactId: 'contact',
        Contact: { Name: 'Synthetic Contact', Phone: '5550100' },
      },
    ];
  return [];
}
async function syntheticReader(
  respond: (soql: string) => unknown[] = response
): Promise<{ reader: SalesforceQueryReader; queries: string[] }> {
  const queries: string[] = [];
  const reader = await connectIntakeSalesforce(target, async (args) => {
    const soql = args.at(-1);
    if (!soql) throw new Error('Synthetic query missing');
    queries.push(soql);
    const records = respond(soql);
    return JSON.stringify({
      status: 0,
      result: { done: true, totalSize: records.length, records },
    });
  });
  return { reader, queries };
}
const writeOrder = [
  'opportunity_rows.json',
  'auth_rows.json',
  'authorization_review_rows.json',
  'vob_rows.json',
  'clinical_quality_rows.json',
  'rbt_rows.json',
  'staffing_rows.json',
  'billing_collection_contract.json',
  'billing_claim_records.json',
  'ticket_match_rows.json',
  'first_interview_rows.json',
  'talent_acquisition_rows.json',
  'task_rows.json',
  'task_feed_rows.json',
  'aircall_rows.json',
  'opportunity_history_rows.json',
  'contact_role_rows.json',
];
describe('structured collection composition', () => {
  it('uses the shared verified reader and original selection, query order, enrichment and artifact order', async () => {
    const { reader, queries } = await syntheticReader();
    const artifacts = new MemoryArtifacts();
    const result = await collectStructuredEvidence({
      source: { mode: 'live', reader },
      artifacts,
      cutoff,
    });
    expect(result.opportunities).toHaveLength(1);
    expect(result.opportunities.at(0)?.Headstart_Practice__r.Name).toBe('Synthetic Practice');
    expect(result.authorizations.at(0)?.Notes__c).toBe('Synthetic review');
    expect(result.authorizations.at(0)?.Initial_Auth_Approval_Date__c).toBe('2026-09-20');
    expect(result.rbtRequests.at(0)?.Date_Closed__c).toBe('2026-09-21');
    expect(result.staffing.at(0)?.Name).toBe('Assigned result');
    expect(result.tasks.at(0)?.Subject).toBe('Line result');
    expect(result.aircalls.map((row) => row.aircall__Message_Content__c)).toEqual([
      'Synthetic message',
      '',
    ]);
    expect(result.taskUpdates.at(0)?.Summary).toBe('Synthetic progress');
    expect(result.ticketMatches.at(0)?.Candidate__r?.Name).toBe('Synthetic Candidate');
    expect(result.contactRoles.at(0)?.Contact?.Name).toBe('Synthetic Contact');
    expectTypeOf(result.opportunities.at(0)?.Id).toEqualTypeOf<string | undefined>();
    expectTypeOf(result.rbtRequests.at(0)?.RBT_Assigned__c).toEqualTypeOf<
      string | null | undefined
    >();
    expectTypeOf(result.authorizations.at(0)?.Client_Opportunity_Record__c).toEqualTypeOf<
      string | null | undefined
    >();
    expect(artifacts.writes).toEqual(writeOrder);
    const initial = initialCollectionQueries({
      opportunityIds: [ID],
      primaryContactIds: ['contact'],
      csmNames: [opportunity().CSM__c],
    });
    expect(queries.slice(2, 15)).toEqual(Object.values(initial));
    expect(queries).toHaveLength(22);
    expect(queries.at(0)).toContain(' FROM Organization ');
    expect(queries.at(1)).toBe(INTAKE_OPPORTUNITY_QUERY);
    expect(artifacts.files.get('billing_collection_contract.json')).toEqual(
      billingCollectionReceipt({ records: result.billingClaims, opportunityIds: [ID], cutoff })
    );
    const opp = result.opportunities.at(0);
    if (!opp) throw new Error('Synthetic Opportunity missing');
    const profile = buildIdentityProfile({
      opportunityId: opp.Id,
      opportunityName: opp.Name,
      stage: 'IA Scheduled',
    });
    const gate = resolveSourceAuthorizationGate({
      opp,
      auths: result.authorizations,
      authReviews: result.authorizationReviews,
      asOf: cutoff,
    });
    expect(gate).toHaveProperty('satisfied');
    expect(
      adaptAuthorizationReviews({
        records: result.authorizationReviews,
        profile,
        gate: { gateCategory: 'insurance' },
        asOf: cutoff,
      })
    ).toHaveLength(1);
    expect(
      adaptStageHistory({ records: result.opportunityHistory, profile, asOf: cutoff })
    ).toEqual([]);
  });
  it('reuses frozen artifacts without a reader, preserves source metadata/order and reconstructs contacts', async () => {
    const artifacts = new MemoryArtifacts();
    const raw = { extra: { preserved: true }, ...opportunity() };
    artifacts.files.set('opportunity_rows.json', [raw]);
    artifacts.files.set('identity_profile_rows.json', [
      {
        familyContacts: [{ id: 'contact', name: 'First', phone: '111' }],
        currentCsm: { name: 'Staff', userId: 'user' },
      },
      {
        familyContacts: [{ id: 'contact', name: 'Last', phone: '222' }],
        currentCsm: { name: 'STAFF', email: 'synthetic@example.invalid' },
      },
    ]);
    const authorization = { extra: { nested: true }, Id: 'auth', No_Auth_Needed__c: undefined };
    artifacts.files.set('auth_rows.json', [authorization]);
    artifacts.files.set(
      'billing_collection_contract.json',
      billingCollectionReceipt({ records: [], opportunityIds: [ID], cutoff })
    );
    const result = await collectStructuredEvidence({
      source: { mode: 'saved' },
      artifacts,
      cutoff,
    });
    expect(result.opportunities.at(0)?.['extra']).toBe(raw.extra);
    expect(Object.keys(result.opportunities.at(0) ?? {}).at(0)).toBe('extra');
    expect(result.authorizations.at(0)?.['extra']).toBe(authorization.extra);
    expect(result.contacts).toEqual([
      { Id: 'contact', Name: 'Last', Email: undefined, Phone: '222', MobilePhone: '222' },
    ]);
    expect(result.csmUsers).toEqual([
      { Id: undefined, Name: 'STAFF', Email: 'synthetic@example.invalid', IsActive: true },
    ]);
    expect(artifacts.writes).toEqual(
      writeOrder.filter((name) => name !== 'billing_collection_contract.json')
    );
    expect(artifacts.reads.at(0)).toBe('identity_profile_rows.json');
    expect(raw).not.toHaveProperty('Headstart_Practice__c');
    expect(authorization).not.toHaveProperty('Notes__c');
  });
  it('retains the existing nonempty frozen cohort and complete billing receipt requirements', async () => {
    const artifacts = new MemoryArtifacts();
    await expect(
      collectStructuredEvidence({ source: { mode: 'saved' }, artifacts, cutoff })
    ).rejects.toThrow('requires opportunity_rows.json');
    expect(artifacts.writes).toEqual([]);
    artifacts.files.set('opportunity_rows.json', [opportunity()]);
    await expect(
      collectStructuredEvidence({ source: { mode: 'saved' }, artifacts, cutoff })
    ).rejects.toThrow('refresh this source only');
    expect(artifacts.writes.at(-1)).toBe('staffing_rows.json');
    expect(artifacts.files.has('billing_claim_records.json')).toBe(false);
  });
  it('queries relationship expansions in original 100-row and TaskFeed 75-row chunks', async () => {
    const { reader, queries } = await syntheticReader((soql) => {
      if (soql.includes(' FROM Task '))
        return Array.from({ length: 151 }, (_, index) => ({
          Id: `task-${String(index)}`,
          WhatId: ID,
        }));
      if (soql.includes(' FROM RBT_Request__c '))
        return Array.from({ length: 101 }, (_, index) => ({
          Id: `rbt-${String(index)}`,
          RBT_Assigned__c: `staff-${String(index)}`,
        }));
      return response(soql);
    });
    await collectStructuredEvidence({
      source: { mode: 'live', reader },
      artifacts: new MemoryArtifacts(),
      cutoff,
    });
    expect(queries.filter((query) => query.includes(' FROM TaskFeed '))).toHaveLength(3);
    expect(queries.filter((query) => query.includes(' FROM Staffing__c WHERE Id '))).toHaveLength(
      2
    );
    expect(queries.filter((query) => query.includes(' FROM Ticket_Match__c '))).toHaveLength(2);
  });
  it('rejects wrong-shaped collected evidence before treating it as an empty source', async () => {
    const { reader } = await syntheticReader((soql) =>
      soql.includes(' FROM Task ') ? [{ Id: 'task', IsClosed: 'false' }] : response(soql)
    );
    const artifacts = new MemoryArtifacts();
    await expect(
      collectStructuredEvidence({ source: { mode: 'live', reader }, artifacts, cutoff })
    ).rejects.toThrow('incomplete evidence');
    expect(artifacts.writes).toEqual(['opportunity_rows.json']);
  });
});
