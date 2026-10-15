import { describe, expect, it } from 'vitest';

import { resolveSourceAuthorizationGate as resolve } from './source-authorization-gate.js';
import { sourceReviewSuperseded } from './source-authorization-milestones.js';
import {
  latestAuthorizationNoteDate,
  normalizeSourceAuthorization,
  normalizeSourceAuthorizationReview,
} from './source-authorization-normalize.js';
import type { SourceAuthorizationRecord } from './source-authorization-types.js';

const asOf = '2026-09-11T17:31:07.000Z';
const date = new Date(asOf);
const auth: SourceAuthorizationRecord = {
  Id: 'synthetic-auth',
  Authorization_Type__c: 'Initial',
  Auth_Status__c: 'Active',
  Insurance_Determination__c: 'Approved',
  LastModifiedDate: '2026-09-03T22:57:17Z',
};

describe('approved source authorization projection', () => {
  it('uses explicit dated approval notes with phase-specific milestones and retains source identity', () => {
    const record = {
      ...auth,
      Notes__c: '8/13: Payer confirmed approved authorization for 97151.',
      retained: { source: 'synthetic' },
    };
    const input = { opp: { StageName: 'IA Scheduled' }, auths: [record], asOf };
    const result = resolve(input);
    expect(result).toMatchObject({
      satisfied: true,
      state: 'Approved',
      approvalDate: '2026-08-13',
      eventDate: '2026-08-13',
    });
    if (result.status === 'Not Required') throw new Error('Expected an applicable gate');
    expect(result.record).toBe(record);
    expect(result.record?.retained).toBe(record.retained);
    expect(resolve({ ...input, asOf: date })).toEqual(result);
    for (const note of ['Not approved', 'Pending approval', 'Awaiting approval']) {
      expect(resolve({ ...input, auths: [{ ...auth, Notes__c: `8/13: ${note}` }] }).satisfied).toBe(
        false
      );
    }
    expect(
      resolve({
        opp: { StageName: 'IA Scheduled' },
        auths: [{ ...auth, Authorization_Type__c: 'Initial Consultation' }],
        asOf,
      }).state
    ).toBe('Missing');
  });

  it('preserves dated-note grammar, cutoff, year fallback and absent-date behavior', () => {
    const cases: readonly [string, string | null][] = [
      ['8/13: Approved', '2026-08-13T00:00:00.000Z'],
      ['8/13/26 - Approved\n9/10/2026: Updated\n9/12: Later', '2026-09-10T00:00:00.000Z'],
      ['\n \n 8/13\n- Approved', '2026-08-13T00:00:00.000Z'],
      ['9/12: Approved', null],
      ['prefix 8/13: Approved', null],
      ['No date', null],
    ];
    for (const [note, expected] of cases) {
      expect(latestAuthorizationNoteDate({ Notes__c: note }, date)).toBe(expected);
    }
    expect(
      latestAuthorizationNoteDate({ Notes__c: '8/13: Approved', LastModifiedDate: 'invalid' }, date)
    ).toBeNull();
    expect(
      latestAuthorizationNoteDate(
        { Notes__c: '8/13: Approved', LastModifiedDate: '2025-01-01' },
        date
      )
    ).toBe('2025-08-13T00:00:00.000Z');
    expect(
      normalizeSourceAuthorization({ ...auth, Notes__c: 'Approved' }, date).initialApprovalDate
    ).toBe(auth.LastModifiedDate);
  });

  it('retains source submission, approval, payer, coverage and active-state precedence', () => {
    const normalized = normalizeSourceAuthorization(
      {
        Id: 'synthetic-treatment',
        Authorization_Type__c: 'Treatment Auth Request',
        Auth_Status__c: 'Inactive',
        Master_Submission_Date__c: '2026-08-10',
        Master_Approval_Date__c: '2026-08-20',
        Initial_Auth_Approval_Date__c: '2026-08-21',
        Treatment_Auth_Approval_Date__c: '2026-08-22',
        No_Auth_Needed__c: true,
        Payor_Name__r: { Name: 'Synthetic Payer' },
        Payor_Name__c: 'other',
        Client_Insurance__c: 'primary',
        Denial_Reason__c: 'Additional documents',
        Denial_Reason_Explanation__c: 'Synthetic explanation',
      },
      date
    );
    expect(normalized).toMatchObject({
      authorizationType: 'Treatment',
      determination: 'Denied',
      active: false,
      initialSubmissionDate: '2026-08-10',
      treatmentSubmissionDate: '2026-08-10',
      initialApprovalDate: '2026-08-20',
      treatmentApprovalDate: '2026-08-20',
      payer: 'Synthetic Payer',
      clientInsurance: 'primary',
      noAuthNeeded: true,
    });
    expect(normalizeSourceAuthorization({}, date)).toHaveProperty('id', undefined);
    expect(
      normalizeSourceAuthorization({ Payor_Name__r: { Name: '' }, Payor_Name__c: 'fallback' }, date)
        .payer
    ).toBe('fallback');
    const review = normalizeSourceAuthorizationReview(
      { ...auth, Authorization_Type__c: 'Treatment', Notes__c: 'Approved' },
      { Treatment_Auth_Approval_Date__c: '2026-08-15' },
      date
    );
    expect(review).toMatchObject({
      treatmentApprovalDate: '2026-08-15',
      initialApprovalDate: null,
    });
    expect(
      normalizeSourceAuthorizationReview({ Auth_Status__c: 'No authorization needed' }, {}, date)
        .noAuthNeeded
    ).toBe(true);
  });

  it('scopes otherwise untyped denials only to an explicitly requested phase', () => {
    const denial = {
      Id: 'synthetic-denial',
      Denial_Reason__c: 'Missing clinical documents',
      Auth_Status__c: 'Inactive',
    };
    const stages: readonly [string, string][] = [
      ['IA Requested', 'initial'],
      ['TA Requested', 'treatment'],
    ];
    for (const [stage, phase] of stages) {
      expect(resolve({ opp: { StageName: stage }, auths: [denial], asOf })).toMatchObject({
        state: 'Denied',
        phase,
        satisfied: false,
        denialOccurred: true,
      });
    }
    expect(resolve({ opp: { StageName: 'IA Scheduled' }, auths: [denial], asOf }).state).toBe(
      'Missing'
    );
    const conflict = resolve({
      opp: { StageName: 'IA Requested' },
      asOf,
      auths: [
        { ...auth, Id: 'approved', Master_Approval_Date__c: '2026-09-03' },
        {
          ...auth,
          Id: 'denied',
          Insurance_Determination__c: 'Denied',
          Auth_Status__c: 'Denied',
          CreatedDate: '2026-09-03',
        },
      ],
    });
    expect(conflict).toMatchObject({
      state: 'Conflict',
      conflict: true,
      satisfied: false,
      blocker: 'Initial authorization records conflict',
    });
  });

  it('uses unlinked reviews but never duplicates a linked Authorization', () => {
    expect(
      resolve({
        opp: { StageName: 'IA Requested' },
        asOf,
        authReviews: [
          {
            Id: 'nullable-review',
            Authorization__c: null,
            Authorization_Type__c: 'Initial',
            Insurance_Determination__c: null,
            Auth_Status__c: null,
            Notes__c: '8/13: Approved',
            LastModifiedDate: '2026-09-03',
          },
        ],
      })
    ).toMatchObject({ state: 'Approved', recordId: 'nullable-review' });
    expect(
      resolve({
        opp: { StageName: 'IA Requested' },
        asOf,
        auths: [
          {
            Id: 'nullable-determination',
            Authorization_Type__c: 'Initial',
            Insurance_Determination__c: null,
            Auth_Status__c: 'Active',
            Denial_Reason__c: 'Synthetic denial',
            CreatedDate: '2026-09-03',
          },
        ],
      })
    ).toMatchObject({ state: 'Denied', recordId: 'nullable-determination' });
    expect(() =>
      resolve({
        opp: { StageName: 'IA Requested' },
        asOf,
        auths: [
          {
            ...auth,
            Auth_Status__c: null,
          },
        ],
      })
    ).toThrow(new TypeError("Cannot read properties of null (reading 'toLowerCase')"));
    expect(
      resolve({
        opp: { StageName: 'IA Requested' },
        asOf,
        authReviews: [
          {
            Id: 'synthetic-review',
            Authorization__c: null,
            Name: null,
            Authorization_Type__c: 'Initial',
            Insurance_Determination__c: 'Denied',
            Auth_Status__c: 'Denied',
            CreatedDate: '2026-09-01',
          },
        ],
      })
    ).toMatchObject({ state: 'Denied', recordId: 'synthetic-review', record: null });
    expect(
      resolve({
        opp: { StageName: 'IA Requested' },
        asOf,
        auths: [
          {
            Id: 'synthetic-direct-denial',
            Authorization_Type__c: null,
            Name: null,
            Denial_Reason__c: 'Synthetic missing document',
            Auth_Status__c: 'Denied',
            Client_Opportunity_Record__c: null,
          },
        ],
      })
    ).toMatchObject({ state: 'Denied', recordId: 'synthetic-direct-denial', recordName: '' });
    const review = {
      ...auth,
      Id: 'review',
      Insurance_Determination__c: 'Denied',
      Auth_Status__c: 'Denied',
      Authorization__c: 'synthetic-auth',
    };
    const input = { opp: { StageName: 'IA Requested' }, asOf, authReviews: [review] };
    expect(resolve(input)).toMatchObject({
      state: 'Denied',
      recordId: 'review',
      record: null,
      authorizationNumber: '',
    });
    expect(
      resolve({ ...input, auths: [{ ...auth, Master_Approval_Date__c: '2026-09-03' }] })
    ).toMatchObject({ state: 'Approved', recordId: 'synthetic-auth' });
    expect(
      resolve({ ...input, authReviews: [{ ...review, Notes__c: '8/15: Approved' }] })
    ).toMatchObject({ state: 'Approved', approvalDate: '2026-08-15' });
  });

  it('supersedes only older pending reviews with the appropriate opportunity approval', () => {
    const pending = { ...auth, Insurance_Determination__c: 'Pending', Auth_Status__c: 'Pending' };
    const opp = { Has_IA_Approved__c: true, IA_Approval_Checked_Timestamp__c: '2026-09-04' };
    expect(sourceReviewSuperseded(pending, opp)).toBe(true);
    for (const review of [
      { ...pending, LastModifiedDate: '2026-09-05' },
      { ...pending, LastModifiedDate: 'invalid' },
      { ...pending, LastModifiedDate: '', CreatedDate: '' },
      { ...pending, Insurance_Determination__c: 'Denied', Auth_Status__c: 'Denied' },
    ]) {
      expect(sourceReviewSuperseded(review, opp)).toBe(false);
    }
    expect(
      sourceReviewSuperseded(pending, { ...opp, IA_Approval_Checked_Timestamp__c: 'invalid' })
    ).toBe(false);
    expect(
      sourceReviewSuperseded(
        { ...pending, Authorization_Type__c: 'Treatment' },
        { Treatment_Auth_Approval_Date__c: '2026-09-04' }
      )
    ).toBe(true);
    expect(
      resolve({ opp: { ...opp, StageName: 'IA Requested' }, authReviews: [pending], asOf })
    ).toMatchObject({ state: 'Approved', recordId: 'opportunity:initial-approval' });
    expect(
      resolve({ opp: { StageName: 'IA Requested', Has_IA_Approved__c: true }, asOf })
    ).toMatchObject({ approvalDate: '2026-09-11' });
  });

  it('preserves stage-entry relevance and the not-required result shape', () => {
    const treatment = {
      ...auth,
      Authorization_Type__c: 'Treatment',
      Insurance_Determination__c: 'Pending',
      Auth_Status__c: 'Pending',
      Treatment_Auth_Submission_Date__c: '2026-09-03',
    };
    for (const entry of ['2026-09-02', '', 'invalid']) {
      expect(
        resolve({
          opp: { StageName: 'Treatment Plan', LastStageChangeDate: entry },
          auths: [treatment],
          asOf,
        })
      ).toMatchObject({ required: true, phase: 'treatment', state: 'Pending' });
    }
    expect(
      resolve({
        opp: {
          StageName: 'Treatment Plan',
          Current_SLA__r: { Stage__c: 'Treatment Plan', CreatedDate: '2026-09-04' },
        },
        auths: [treatment],
        asOf,
      }).status
    ).toBe('Not Required');
    expect(
      resolve({
        opp: {
          StageName: '',
          Current_SLA__r: { Stage__c: 'TA Requested' },
          Treatment_Auth_Approval_Date__c: '2026-09-03',
        },
        asOf,
      })
    ).toMatchObject({ satisfied: true, phase: 'treatment' });
    expect(resolve({ opp: { StageName: 'Insurance Verification' }, asOf })).toEqual({
      phase: '',
      required: false,
      satisfied: true,
      status: 'Not Required',
      state: 'Not Required',
      blocker: '',
      reason: 'No unresolved authorization prerequisite applies to the current process gate.',
      recordId: '',
      conflict: false,
      coverages: [],
    });
    expect(resolve({ opp: {} }).status).toBe('Not Required');
  });
});
