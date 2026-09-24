import { describe, expect, it } from 'vitest';

import { normalizeEvidenceAuthorization } from './authorization-evidence-normalize.js';

import {
  adaptAuthorizations,
  buildIdentityProfile,
  resolveSourceAuthorizationGate,
} from './index.js';
import type { AuthorizationEvidenceRecord } from './index.js';

const asOf = new Date('2026-09-24T12:00:00.123Z');
const profile = buildIdentityProfile({
  opportunityId: 'synthetic',
  opportunityName: 'Synthetic Example',
  stage: 'TA Requested',
});
const base = { profile, gate: { processPosition: 'Treatment authorization' }, asOf };
function authorization(
  Id = 'a',
  state = 'Approved',
  coverage = 'Primary'
): AuthorizationEvidenceRecord {
  return {
    Id,
    Client_Opportunity_Record__c: profile.opportunityId,
    Authorization_Type__c: 'Treatment',
    Client_Insurance__c: coverage,
    Insurance_Determination__c: state,
    Auth_Status__c: state,
    Payor_Name__c: `Payer ${Id}`,
    CreatedDate: '2026-09-01',
    Treatment_Auth_Submission_Date__c: '2026-09-02',
    Treatment_Auth_Approval_Date__c: '2026-09-20',
  };
}
describe('routine authorization evidence adapter', () => {
  it('composes the actual source-gate and identity producers without reinterpreting the gate', () => {
    const records = [authorization()];
    const authorizationGate = resolveSourceAuthorizationGate({
      opp: { Id: profile.opportunityId, StageName: 'TA Requested' },
      auths: records,
      asOf,
    });
    const events = adaptAuthorizations({
      ...base,
      records,
      gate: { ...base.gate, authorization: authorizationGate },
    });
    expect(events).toMatchObject([
      {
        sourceRecordId: 'a',
        factType: 'auth-approved',
        eventDate: '2026-09-20',
        issueKey: 'treatment-authorization',
        actionType: 'No Action',
        lifecycleRecordId: 'a',
      },
    ]);
    expect(records[0]?.Treatment_Auth_Approval_Date__c).toBe('2026-09-20');
  });
  it('does not call one approved coverage completion of an unresolved multi-payer prerequisite', () => {
    const events = adaptAuthorizations({
      ...base,
      records: [
        authorization(),
        {
          ...authorization('b', 'Pending', 'Secondary'),
          Denial_Reason_Explanation__c: 'Overlapping authorization needs resolution.',
        },
      ],
    });
    expect(events).toMatchObject([
      {
        sourceRecordId: 'a',
        factType: 'auth-coverage-satisfied',
        actionOwner: 'Intake',
        actionType: 'Family Outreach',
        text: 'The primary treatment authorization with Payer a was approved on 2026-09-20, but the secondary treatment authorization with Payer b remains pending.',
      },
      {
        sourceRecordId: 'b',
        factType: 'auth-pending',
        text: 'The current treatment authorization with Payer b remains pending; no final determination is recorded.',
      },
    ]);
  });
  it('uses only the newest representative event when all current coverages are satisfied', () => {
    const events = adaptAuthorizations({
      ...base,
      records: [
        authorization(),
        {
          ...authorization('b', 'Approved', 'Secondary'),
          Treatment_Auth_Approval_Date__c: '2026-09-21',
        },
      ],
    });
    expect(events).toMatchObject([
      {
        sourceRecordId: 'b',
        factType: 'auth-approved',
        text: 'All current treatment authorization prerequisites were satisfied as of 2026-09-21.',
      },
    ]);
    expect(events).toHaveLength(1);
  });
  it('retains dated confirmations and later effective-date problems as separate evidence', () => {
    const events = adaptAuthorizations({
      ...base,
      records: [
        {
          ...authorization(),
          Notes__c:
            '9/19: Payer approved. 9/21: Payer confirmed approved. 9/23: Effective date needs correction. 9/25: Payer approved.',
        },
      ],
    });
    expect(events.map((event) => [event.sourceRecordId, event.factType, event.eventDate])).toEqual([
      ['a', 'auth-approved', '2026-09-20'],
      ['a:note:2', 'auth-approved', '2026-09-21'],
      ['a:note:3', 'auth-date-correction', '2026-09-23'],
    ]);
    expect(events.at(-1)?.actionType).toBe('Insurance Follow-Up');
    expect(events.every((event) => event.lifecycleRecordId === 'a')).toBe(true);
  });
  it('records an expired prior authorization without manufacturing a current approval', () => {
    expect(
      adaptAuthorizations({
        ...base,
        records: [{ ...authorization(), Auth_expiration_date__c: '2026-09-22' }],
      })
    ).toMatchObject([
      {
        sourceRecordId: 'a:expiration',
        eventDate: '2026-09-22',
        factType: 'auth-expired',
        text: 'The prior treatment authorization with Payer a expired on 2026-09-22; no current authorization is on file.',
        actionType: 'Insurance Follow-Up',
      },
    ]);
  });
  it('retains current payer identity, contextual relevance and Date-valued missing-source-time fallback', () => {
    const record = {
      ...authorization('a', 'Pending'),
      Notes__c: 'The authorization remains pending.',
      CreatedDate: undefined,
    };
    const events = adaptAuthorizations({
      ...base,
      records: [record],
      gate: { gateCategory: 'rbt', processPosition: '97153' },
    });
    expect(events).toMatchObject([
      {
        factType: 'auth-pending',
        processRelevance: 7,
        text: 'The current treatment authorization with Payer a remains pending; no final determination is recorded.',
      },
    ]);
    expect(events[0]?.eventDate).toBe(asOf);
    expect(normalizeEvidenceAuthorization(record, asOf).lastSubstantiveDate).toBe(asOf);
  });
  it('keeps report-adapter normalization distinct from master-field and approval-note inference', () => {
    const record = {
      ...authorization('a', 'Pending'),
      Authorization_Type__c: 'Treatment Auth Request',
      Treatment_Auth_Submission_Date__c: null,
      Master_Submission_Date__c: '2026-09-02',
      Master_Approval_Date__c: '2026-09-22',
      Treatment_Auth_Approval_Date__c: null,
      Notes__c: '9/23: Approved.',
    };
    expect(normalizeEvidenceAuthorization(record, asOf)).toMatchObject({
      authorizationType: 'Treatment Auth Request',
      treatmentSubmissionDate: null,
      treatmentApprovalDate: null,
      lastSubstantiveDate: '2026-09-23',
    });
    expect(adaptAuthorizations({ ...base, records: [record] })).toEqual([]);
  });
  it('filters unrelated/consultation records and preserves phase and explicit-selection priority', () => {
    const pending = {
      ...authorization('pending', 'Pending'),
      Notes__c: 'The authorization remains pending.',
    };
    const request = {
      ...pending,
      Id: 'request',
      Authorization_Type__c: 'Treatment Auth Request',
      Treatment_Auth_Submission_Date__c: null,
    };
    const records = [
      pending,
      request,
      { ...pending, Id: 'wrong', Client_Opportunity_Record__c: 'other' },
      { ...pending, Id: 'consult', Authorization_Type__c: 'Initial Consultation' },
    ];
    expect(
      adaptAuthorizations({ ...base, records, gate: { ...base.gate, blockingRecordId: 'pending' } })
    ).toMatchObject([{ sourceRecordId: 'pending' }]);
    expect(
      adaptAuthorizations({
        ...base,
        records: [request],
        gate: { ...base.gate, blockingRecordId: 'request' },
      })
    ).toMatchObject([{ sourceRecordId: 'request' }]);
    expect(
      adaptAuthorizations({
        ...base,
        records: [request],
        gate: { ...base.gate, authorization: { coverages: [{ blockingRecordId: 'request' }] } },
      })
    ).toEqual([]);
    expect(
      adaptAuthorizations({
        ...base,
        records: [pending],
        gate: { processPosition: 'Initial authorization' },
      })
    ).toEqual([]);
  });
  it.each([
    ['Pending', 'Please send the PCP referral.', 'obtain and submit'],
    ['Additional Details Required', '', 'additional-information request'],
    ['Denied', '', 'denied path'],
    ['Pending', '', 'pending secondary'],
  ])(
    'keeps the unresolved %s coverage action from the approved resolver',
    (state, explanation, action) => {
      const events = adaptAuthorizations({
        ...base,
        records: [
          authorization(),
          { ...authorization('b', state, 'Secondary'), Denial_Reason_Explanation__c: explanation },
        ],
      });
      expect(events[0]?.factType).toBe('auth-coverage-satisfied');
      expect(events[0]?.recommendedAction).toContain(action);
    }
  );
  it('preserves no-authorization-needed meaning and original missing-date/null-state failures', () => {
    expect(
      adaptAuthorizations({ ...base, records: [{ ...authorization(), No_Auth_Needed__c: true }] })
    ).toMatchObject([{ factType: 'auth-no-auth-needed' }]);
    expect(() =>
      adaptAuthorizations({
        ...base,
        records: [
          {
            Id: 'empty-date',
            Client_Opportunity_Record__c: profile.opportunityId,
            Authorization_Type__c: 'Treatment',
            No_Auth_Needed__c: true,
          },
        ],
      })
    ).toThrow('EvidenceEvent missing eventDate');
    expect(() =>
      adaptAuthorizations({ ...base, records: [{ ...authorization(), Auth_Status__c: null }] })
    ).toThrow(TypeError);
    expect(adaptAuthorizations(base)).toEqual([]);
    expect(adaptAuthorizations({ ...base, records: null })).toEqual([]);
  });
});
