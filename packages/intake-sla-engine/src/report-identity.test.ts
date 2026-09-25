import { describe, expect, it } from 'vitest';

import { billingCollectionReceipt } from './billing-collection.js';
import { adaptCallsAndTexts } from './call-text-evidence.js';
import type { StructuredCollectionArtifacts } from './collection-decoding.js';
import { stageRelativeSearchWindow } from './collection-search-window.js';
import { adaptFirefliesWithPrecomputedAI } from './fireflies-evidence-precomputed.js';
import { prepareCollectedReportContext, buildReportBillingRows } from './report-billing.js';
import {
  buildReportIdentityProfiles,
  reportConversationSearchPathways,
} from './report-identity.js';
import { adaptSlack } from './slack-evidence.js';
import { collectStructuredEvidence, type StructuredCollection } from './structured-collection.js';
import { adaptTasks } from './task-evidence.js';

const cutoff = '2026-09-24T16:00:00.000Z';
const ids = [
  ['006', '000000000001AAA'].join(''),
  ['006', '000000000002AAA'].join(''),
  ['006', '000000000003AAA'].join(''),
];
async function collected(): Promise<StructuredCollection> {
  const rows = ids.map((Id, index) => ({
    Id,
    Name: `Synthetic Client ${String(index)}`,
    StageName: 'IA Scheduled',
    CSM__c: 'Current Staff',
    ContactId: 'contact',
    Current_SLA__c: 'sla',
    Current_SLA__r: { CreatedDate: '2026-09-20' },
    Phone__c: '(555) 0100',
    LastStageChangeDate: '2026-09-22',
    IA_Scheduling_Status__c: 'Assessment Completed',
    Rendering_Provider__c: index === 2 ? 'other' : 'provider',
    Rendering_Provider__r: {
      Name: index === 2 ? 'Other Provider' : 'Synthetic Provider',
      Email__c: '',
      Practice_Name__c: 'practice',
      Practice_Name__r: {
        Name: 'Synthetic Practice',
        Business_Email__c: 'synthetic@example.invalid',
      },
    },
  }));
  const billing = [
    {
      Id: 'completed',
      Client_Opportunity__c: ids[0],
      Authorization__r: null,
      Billing_Code__c: '97151',
      Appointment_Status__c: 'Active',
      Completed__c: 'Yes',
      Appt_Date__c: '2026-09-22',
      CreatedDate: '2026-09-01',
    },
    {
      Id: 'future',
      Client_Opportunity__c: ids[0],
      Authorization__r: null,
      Billing_Code__c: '97151',
      Appointment_Status__c: 'Active',
      Appt_Date__c: '2026-09-28',
      CreatedDate: '2026-09-01',
    },
    {
      Id: 'after-cutoff',
      Client_Opportunity__c: ids[1],
      Authorization__r: null,
      Billing_Code__c: '97153',
      Completed__c: 'Yes',
      Appt_Date__c: '2026-09-22',
      CreatedDate: '2026-09-25',
    },
  ];
  const files = new Map<string, unknown>([
    ['opportunity_rows.json', rows],
    ['billing_claim_records.json', billing],
    [
      'billing_collection_contract.json',
      billingCollectionReceipt({ records: billing, opportunityIds: ids, cutoff }),
    ],
    [
      'identity_profile_rows.json',
      [
        {
          familyContacts: [{ id: 'contact', name: 'Synthetic Family', phone: '5550100' }],
          currentCsm: { name: 'CURRENT STAFF', email: 'staff@example.invalid', userId: 'staff' },
        },
      ],
    ],
    [
      'contact_role_rows.json',
      [
        {
          Id: 'role',
          OpportunityId: ids[0],
          ContactId: 'contact',
          IsPrimary: true,
          Role: 'Parent',
          Contact: { Name: 'Synthetic Family', Phone: '5550100' },
        },
      ],
    ],
    [
      'opportunity_history_rows.json',
      [
        {
          Id: 'csm-history',
          OpportunityId: ids[0],
          Field: 'CSM__c',
          OldValue: 'Prior Staff',
          NewValue: 'Current Staff',
        },
        {
          Id: 'stage-history',
          OpportunityId: ids[0],
          Field: 'StageName',
          NewValue: 'IA Scheduled',
          CreatedDate: '2026-09-15',
        },
      ],
    ],
    [
      'auth_rows.json',
      [
        {
          Id: 'auth',
          Client_Opportunity_Record__c: ids[0],
          Authorization_Number__c: 'AUTH',
          Payor_Name__r: { Name: 'Payer' },
          Client_Insurance__c: 'Payer',
        },
      ],
    ],
    [
      'rbt_rows.json',
      [
        {
          Id: 'request',
          Name: 'Request',
          Client_Opportunity__c: ids[0],
          RBT_Assigned__r: { Name: 'Assigned' },
          RBT_Start_Date__c: '2026-09-30',
        },
      ],
    ],
    [
      'ticket_match_rows.json',
      [
        {
          Id: 'match',
          RBT_Request__c: 'request',
          Candidate__c: 'candidate',
          Candidate__r: { Name: 'Candidate', Applicant_Status__c: 'Applicant' },
          Ticket_Match_Status__c: 'Interview',
        },
      ],
    ],
  ]);
  return collectStructuredEvidence({
    source: { mode: 'saved' },
    cutoff,
    artifacts: {
      read: (name): Promise<unknown> => Promise.resolve(files.get(name)),
      write: (): Promise<void> => Promise.resolve(),
    },
  });
}
describe('report-specific identity and billing composition', () => {
  it('supplies the actual identity producer to each downstream evidence adapter unchanged', async () => {
    const data = await collected();
    const profile = buildReportIdentityProfiles(data, cutoff).at(0);
    if (!profile) throw new Error('Synthetic identity missing');
    const before = structuredClone(profile);
    const gate = { processPosition: 'IA Scheduled', unresolvedGate: 'Assessment completion' };
    expect(adaptTasks({ records: [], profile, gate, asOf: cutoff })).toEqual([]);
    expect(adaptCallsAndTexts({ records: [], profile, gate, asOf: cutoff })).toEqual([]);
    expect(adaptSlack({ row: { records: [] }, profile, gate, asOf: cutoff })).toEqual([]);
    expect(
      adaptFirefliesWithPrecomputedAI({
        row: { meetings: [] },
        profile,
        gate,
        asOf: cutoff,
        fallbackToDeterministic: false,
      }).events
    ).toEqual([]);
    expect(profile).toEqual(before);
  });
  it('retains the actual collection fields, contacts, history, role fallback and roster scope', async () => {
    const data = await collected();
    const before = structuredClone(data);
    const identities = buildReportIdentityProfiles(data, new Date(cutoff));
    const first = identities.at(0);
    expect(first).toMatchObject({
      stageEntryDate: '2026-09-15',
      slaCreatedDate: '2026-09-20',
      priorCsms: ['Prior Staff'],
      currentCsm: { name: 'Current Staff', email: 'staff@example.invalid', userId: 'staff' },
      familyPhones: ['(555) 0100', '5550100'],
      authorizationNumbers: ['AUTH'],
      payers: ['Payer'],
      candidates: [{ id: 'candidate', name: 'Candidate', status: 'Interview' }],
      searchWindow: { fromDate: '2026-09-12', toDate: '2026-09-24' },
      providerRosterScope: 'Provider',
    });
    expect(first?.familyContacts).toHaveLength(2);
    expect(first?.providers.at(0)?.email).toBe('synthetic@example.invalid');
    expect(first?.providerRoster.map((row) => row.opportunityId)).toEqual(ids);
    // Shared verified business email is itself a provider identity key, even across distinct names.
    expect(identities.at(2)?.providerRosterScope).toBe('Provider');
    expect(reportConversationSearchPathways(identities).at(0)).not.toHaveProperty('familyContacts');
    expect(data).toEqual(before);
  });
  it('falls back to the same-practice roster only when provider matching leaves at most one peer', async () => {
    const data = await collected();
    const independent = {
      ...data,
      opportunities: data.opportunities.map((row, index) => ({
        ...row,
        Rendering_Provider__r: { Name: `Provider ${String(index)}` },
        Rendering_Provider__c: `provider-${String(index)}`,
      })),
    };
    const identities = buildReportIdentityProfiles(independent, cutoff);
    expect(identities.at(2)?.providerRosterScope).toBe('Practice');
    expect(identities.at(2)?.providerRoster.map((row) => row.opportunityId)).toEqual([
      ids[2],
      ids[0],
      ids[1],
    ]);
  });
  it('preserves partial assessment evidence and cutoff eligibility in saved billing projections', async () => {
    const data = await collected();
    const writes = new Map<string, unknown>();
    const artifacts: StructuredCollectionArtifacts = {
      read: (): Promise<unknown> => Promise.resolve(undefined),
      write: (name, value): Promise<void> => {
        writes.set(name, value);
        return Promise.resolve();
      },
    };
    const context = await prepareCollectedReportContext(data, artifacts, cutoff);
    const first = context.billingRows.at(0);
    if (!first) throw new Error('Synthetic billing row missing');
    expect(first.reconciliation.firstAssessment?.billingClaimId).toBe('completed');
    expect(first.reconciliation.outstanding.map((row) => row.billingClaimId)).toEqual(['future']);
    expect(first.reconciliation.transitionSupported).toBe(false);
    expect(first.reconciliation.gaps).toEqual([]);
    expect(context.billingRows.at(1)?.reconciliation.firstTreatment).toBeNull();
    expect(first.events.at(0)).toMatchObject({
      id: first.events.at(0)?.sourceRecordId,
      summary: first.events.at(0)?.text,
      evidenceDate: first.events.at(0)?.eventDate,
    });
    expect([...writes.keys()]).toEqual([
      'identity_profile_rows.json',
      'conversation_search_pathways.json',
      'billing_claim_rows.json',
      'billing_reconciliation_report.json',
    ]);
    expect(writes.get('billing_reconciliation_report.json')).toMatchObject({
      cutoff,
      expectedRows: 3,
      processedRows: 3,
      completedSessionRows: 1,
      outstandingAssessmentRows: 1,
      confirmedGapRows: 0,
    });
    expect(() => buildReportBillingRows(data, [], cutoff)).toThrow('Report identity missing');
  });
});
describe('stage-relative collection search window', () => {
  it('uses explicit private identity registries through the collected report boundary', async () => {
    const data = await collected();
    const writes = new Map<string, unknown>();
    const result = await prepareCollectedReportContext(
      data,
      {
        read: () => Promise.resolve(undefined),
        write: (name, value) => {
          writes.set(name, value);
          return Promise.resolve();
        },
      },
      cutoff,
      {
        clients: {
          version: 'synthetic-client-registry',
          clients: [
            {
              opportunityIds: [['006', '000000000001AAA'].join('')],
              aliases: ['Synthetic Alias'],
              evidence: { kind: 'synthetic' },
            },
          ],
        },
        providers: {
          version: 'synthetic-provider-registry',
          providers: [
            {
              salesforceIds: ['provider'],
              names: ['Synthetic Provider Alias'],
              emails: ['alias@example.invalid'],
              meetingAliases: ['Synthetic Team'],
            },
          ],
        },
      }
    );
    expect(result.identities[0]).toMatchObject({
      clientAliases: ['Synthetic Alias'],
      clientAliasRegistryVersion: 'synthetic-client-registry',
      providerIdentity: {
        registryVersion: 'synthetic-provider-registry',
      },
    });
    expect(result.identities[0]?.providerIdentity.names).toContain('Synthetic Provider Alias');
    expect(result.identities[0]?.providerIdentity.emails).toContain('alias@example.invalid');
    expect(result.identities[0]?.providerRoles[0]?.meetingAliases).toContain('Synthetic Team');
    expect(writes.get('identity_profile_rows.json')).toBe(result.identities);
    expect(buildReportIdentityProfiles(data, cutoff)[0]?.clientAliases).toEqual([]);
  });
  it('uses the earlier valid anchor with the original buffer and maximum lookback', () => {
    expect(
      stageRelativeSearchWindow({
        asOf: new Date(cutoff),
        stageEntryDate: '2026-09-20',
        slaCreatedDate: '2026-09-15',
      })
    ).toEqual({
      fromDate: '2026-09-12',
      toDate: '2026-09-24',
      basis: 'Earlier of SLA creation or stage entry minus buffer',
    });
    expect(stageRelativeSearchWindow({ asOf: cutoff, stageEntryDate: '2020-01-01' }).fromDate).toBe(
      '2026-03-28'
    );
    expect(
      stageRelativeSearchWindow({
        asOf: cutoff,
        stageEntryDate: '2026-09-30',
        slaCreatedDate: 'invalid',
      })
    ).toEqual({ fromDate: '2026-05-27', toDate: '2026-09-24', basis: 'Fallback lookback' });
    expect(() => stageRelativeSearchWindow({ asOf: 'invalid' })).toThrow('Invalid asOf');
  });
});
