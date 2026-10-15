import { describe, expect, it } from 'vitest';

import {
  mergeCollectedStaffing,
  normalizeCollectedAuthorizations,
  normalizeCollectedOpportunities,
  normalizeCollectedRbtRequests,
  normalizeCollectedStaffing,
} from './collection-normalization.js';
import { resolveSourceAuthorizationGate } from './source-authorization-gate.js';

describe('approved Salesforce collection projections', () => {
  it('retains explicit practice, then general/IA/TA provider priority and raw note fallback', () => {
    const general = { Name: 'General practice', Business_Email__c: 'office@example.test' };
    const explicit = { Name: 'Explicit practice' };
    const base = {
      Id: 'synthetic-opp',
      Name: 'Synthetic Avery',
      StageName: 'IA Scheduled',
      Rendering_Provider__r: { Practice_Name__c: 'general-id', Practice_Name__r: general },
      IA_Rendering_Provider__r: {
        Practice_Name__c: 'ia-id',
        Practice_Name__r: { Name: 'IA practice' },
      },
      TA_Rendering_Provider__r: {
        Practice_Name__c: 'ta-id',
        Practice_Name__r: { Name: 'TA practice' },
      },
      Notes__c: '  original notes  ',
    };
    const rows = normalizeCollectedOpportunities([
      base,
      {
        ...base,
        Headstart_Practice__c: 'explicit-id',
        Headstart_Practice__r: explicit,
        Intake_Notes__c: 'Intake',
      },
      { ...base, Rendering_Provider__r: null },
      { ...base, Rendering_Provider__r: null, IA_Rendering_Provider__r: null },
    ]);
    expect(rows.map((row) => row.Headstart_Practice__c)).toEqual([
      'general-id',
      'explicit-id',
      'ia-id',
      'ta-id',
    ]);
    expect(rows[0]?.Headstart_Practice__r).toBe(general);
    expect(rows[1]?.Headstart_Practice__r).toBe(explicit);
    expect(rows[0]?.Intake_Notes__c).toBe('  original notes  ');
    expect(rows[1]?.Intake_Notes__c).toBe('Intake');
  });
  it('uses practice name only when provider/explicit practice is absent and preserves empty objects', () => {
    const explicit = {};
    expect(
      normalizeCollectedOpportunities([
        { Name: 'Synthetic Avery', Practice_Name__c: 'Fallback' },
      ])[0]
    ).toMatchObject({
      Headstart_Practice__c: null,
      Headstart_Practice__r: { Name: 'Fallback' },
      Intake_Notes__c: '',
    });
    expect(
      normalizeCollectedOpportunities([
        { Name: 'Synthetic Avery', Headstart_Practice__r: explicit },
      ])[0]?.Headstart_Practice__r
    ).toBe(explicit);
    expect(normalizeCollectedOpportunities([{}])[0]?.Headstart_Practice__r).toEqual({ Name: '' });
  });
  it('retains the approved test-name and opportunity disposition exclusions without narrowing active/on-hold cohort', () => {
    const records = [
      { Id: 'keep', Name: 'Synthetic Contest', StageName: 'IA Scheduled', On_Hold__c: true },
      { Id: 'test', Name: 'Synthetic TEST Record' },
      { Id: 'admitted', Name: 'Synthetic B', StageName: 'Admitted' },
      {
        Id: 'discharge',
        Name: 'Synthetic C',
        Current_SLA__r: { Reason_for_Delay_Notes__c: 'Awaiting discharge' },
      },
      { Id: 'close', Name: 'Synthetic D', Close_Suggestion__c: 'Closed not admitted' },
    ];
    const before = structuredClone(records);
    // The original SOQL excludes Admitted; this projection must not add a second cohort rule.
    expect(normalizeCollectedOpportunities(records).map((row) => row.Id)).toEqual([
      'keep',
      'admitted',
    ]);
    expect(records).toEqual(before);
  });
  it('uses newest linked Review only as fallback and preserves opaque authorization metadata', () => {
    const extra = { keep: true };
    const auths = [{ Id: 'auth', Notes__c: 'Existing', extra }];
    const reviews = [
      {
        Authorization__c: 'auth',
        CreatedDate: '2026-09-23',
        LastModifiedDate: '2026-09-24',
        Authorization_Type__c: 'Treatment',
        Authorization_Number__c: 'new',
        Notes__c: 'New review',
        Insurance_Determination__c: 'Pending',
      },
      {
        Authorization__c: 'auth',
        CreatedDate: '2026-09-25',
        LastModifiedDate: '2026-09-21',
        Authorization_Number__c: 'old',
      },
      { Authorization__c: null, Authorization_Number__c: 'unlinked' },
    ];
    const before = structuredClone({ auths, reviews });
    const rows = normalizeCollectedAuthorizations(auths, reviews);
    expect(rows[0]).toMatchObject({
      Authorization_Type__c: 'Treatment',
      Authorization_Number__c: 'new',
      Notes__c: 'Existing',
      Insurance_Determination__c: 'Pending',
    });
    expect(rows[0]?.extra).toBe(extra);
    expect({ auths, reviews }).toEqual(before);
    expect(
      resolveSourceAuthorizationGate({
        opp: { StageName: 'TA Requested' },
        auths: rows,
        asOf: '2026-09-24',
      }).required
    ).toBe(true);
  });
  it.each(['Initial', 'Treatment', 'Initial Consultation', 'Other', ''])(
    'retains phase-specific Master date fallback for %s without asserting completion',
    (type) => {
      const row = normalizeCollectedAuthorizations(
        [
          {
            Id: 'auth',
            Authorization_Type__c: type,
            Master_Submission_Date__c: '2026-09-01',
            Master_Approval_Date__c: '2026-09-02',
          },
        ],
        []
      )[0];
      expect(row?.Initial_Auth_Submission_Date__c).toBe(
        /initial/i.test(type) ? '2026-09-01' : null
      );
      expect(row?.Initial_Auth_Approval_Date__c).toBe(/initial/i.test(type) ? '2026-09-02' : null);
      expect(row?.Treatment_Auth_Submission_Date__c).toBe(
        /treatment/i.test(type) ? '2026-09-01' : null
      );
      expect(row?.Treatment_Auth_Approval_Date__c).toBe(
        /treatment/i.test(type) ? '2026-09-02' : null
      );
    }
  );
  it('retains explicit/review date priority and own undefined phase values', () => {
    const rows = normalizeCollectedAuthorizations(
      [
        {
          Id: 'auth',
          Authorization_Type__c: 'Treatment',
          Initial_Auth_Submission_Date__c: 'direct',
          Treatment_Auth_Approval_Date__c: 'direct-approval',
        },
        { Id: 'missing', Authorization_Type__c: 'Initial' },
      ],
      [
        {
          Authorization__c: 'auth',
          Initial_Auth_Submission_Date__c: 'review',
          Treatment_Auth_Approval_Date__c: 'review-approval',
          Treatment_Auth_Submission_Date__c: 'not-an-original-fallback',
        },
      ]
    );
    expect(rows[0]?.Initial_Auth_Submission_Date__c).toBe('direct');
    expect(rows[0]?.Treatment_Auth_Approval_Date__c).toBe('direct-approval');
    expect(rows[0]?.Treatment_Auth_Submission_Date__c).toBeUndefined();
    expect(rows[1]).toHaveProperty('Initial_Auth_Approval_Date__c', undefined);
    expect(rows[1]?.Notes__c).toBe('');
  });
  it('projects inactive request close dates without converting an active request into closed', () => {
    const rows = normalizeCollectedRbtRequests([
      {
        Date_Closed__c: 'explicit',
        Inactive__c: true,
        RBT_Inactive_Date__c: 'inactive',
        LastModifiedDate: 'modified',
      },
      { Inactive__c: true, RBT_Inactive_Date__c: 'inactive', LastModifiedDate: 'modified' },
      { Inactive__c: true, LastModifiedDate: 'modified' },
      { Inactive__c: false, LastModifiedDate: 'modified' },
      { Inactive__c: true },
    ]);
    expect(rows.map((row) => row.Date_Closed__c)).toEqual([
      'explicit',
      'inactive',
      'modified',
      null,
      undefined,
    ]);
  });
  it('retains direct versus assigned-lookup billable date behavior and last-value/first-key merge order', () => {
    const source = [
      { Id: 'one', Billable_Start_Date__c: 'existing', First_Billable_Date__c: 'first' },
      { Id: 'two', First_Billable_Date__c: null },
    ];
    const direct = normalizeCollectedStaffing(source);
    const first = source[0];
    if (!first) throw new Error('Missing synthetic staffing fixture');
    const assigned = normalizeCollectedStaffing([first], true);
    expect(direct.map((row) => row.Billable_Start_Date__c)).toEqual(['existing', null]);
    expect(assigned[0]?.Billable_Start_Date__c).toBe('first');
    const merged = mergeCollectedStaffing(direct, assigned);
    expect(merged.map((row) => row.Id)).toEqual(['one', 'two']);
    expect(merged[0]).toBe(assigned[0]);
    expect(
      mergeCollectedStaffing([{ Id: undefined, marker: 1 }], [{ Id: undefined, marker: 2 }])
    ).toEqual([{ Id: undefined, marker: 2 }]);
  });
});
