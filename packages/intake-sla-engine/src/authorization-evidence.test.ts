import { describe, expect, it } from 'vitest';

import {
  adaptAuthorizationReviews,
  adaptVob,
  evidenceAuthorizationPhase,
} from './authorization-review-evidence.js';
import {
  adaptPortalTreatmentAuthorizationRequests,
  type PortalAuthorizationEvidenceInput,
} from './portal-authorization-evidence.js';
import { sourceHtmlText } from './source-html-text.js';

const profile = {
  opportunityId: 'synthetic-opportunity',
  stage: '97151 Started',
  currentCsm: { name: 'Synthetic CSM' },
};
const asOf = '2026-09-11T17:31:07.000Z';
describe('authorization-review evidence', () => {
  it('preserves phase selection and excludes unrelated or consultation reviews', () => {
    const records = ['Initial', 'Treatment', 'Initial Consultation', ''].map(
      (Authorization_Type__c) => ({
        Id: `synthetic-${Authorization_Type__c}`,
        Authorization_Type__c,
      })
    );
    expect(
      adaptAuthorizationReviews({
        records,
        profile,
        asOf,
        gate: { processPosition: 'Initial authorization' },
      })
    ).toHaveLength(1);
    expect(
      adaptAuthorizationReviews({
        records,
        profile,
        asOf,
        gate: { processPosition: 'Treatment authorization' },
      })[0]?.text
    ).toBe('Treatment review is status not recorded.');
    expect(adaptAuthorizationReviews({ records, profile, asOf })).toHaveLength(3);
    for (const processPosition of ['TA Approved', '97153', 'first direct-care', 'first day'])
      expect(evidenceAuthorizationPhase({ processPosition })).toBe('Treatment');
    for (const processPosition of [
      'IA Approved',
      'IA Scheduled',
      'IC Scheduled',
      'IC Completed',
      '97151',
      'Treatment Plan',
    ])
      expect(evidenceAuthorizationPhase({ processPosition })).toBe('Initial');
    expect(adaptAuthorizationReviews({ profile, asOf })).toEqual([]);
  });
  it('does not relabel a status-only modified timestamp as a payer event', () => {
    const record = {
      Id: 'synthetic',
      CreatedDate: '2026-09-01',
      LastModifiedDate: '2026-09-09',
      Review_Status__c: 'Pending',
    };
    expect(adaptAuthorizationReviews({ records: [record], profile, asOf })[0]?.eventDate).toBe(
      '2026-09-01'
    );
    expect(
      adaptAuthorizationReviews({
        records: [{ ...record, Notes__c: '<p>Payer response</p>' }],
        profile,
        asOf,
      })[0]
    ).toMatchObject({ eventDate: '2026-09-09', rawText: 'Payer response' });
    expect(
      adaptAuthorizationReviews({
        records: [
          {
            ...record,
            Treatment_Auth_Approval_Date__c: '2026-09-05',
            Initial_Auth_Submission_Date__c: '2026-09-02',
            Notes__c: 'Response',
          },
        ],
        profile,
        asOf,
      })[0]?.eventDate
    ).toBe('2026-09-05');
    expect(
      adaptAuthorizationReviews({
        records: [{ ...record, Initial_Auth_Submission_Date__c: '2026-09-02' }],
        profile,
        asOf,
      })[0]?.eventDate
    ).toBe('2026-09-02');
  });
  it.each([
    { gateCategory: 'insurance', status: 'Denied / Pending', relevance: 9 },
    { gateCategory: 'insurance', status: 'Pending', relevance: 8 },
    { gateCategory: 'insurance', status: 'Approved', relevance: 6 },
    { gateCategory: 'rbt', status: 'Denied / Pending', relevance: 7 },
    { gateCategory: 'rbt', status: 'Pending', relevance: 6 },
    { gateCategory: 'rbt', status: 'Approved', relevance: 5 },
  ])(
    'preserves $status priority, relevance and ownership at $gateCategory',
    ({ gateCategory, status, relevance }) => {
      const event = adaptAuthorizationReviews({
        records: [{ Id: 'synthetic', Review_Status__c: status }],
        profile,
        asOf,
        gate: { gateCategory },
      })[0];
      expect(event).toMatchObject({
        eventDate: asOf,
        actionOwner: 'Insurance Ops',
        actionType: 'Insurance Follow-Up',
        processRelevance: relevance,
      });
      expect(event?.gateImpact).toBe(
        status.startsWith('Denied')
          ? 'Authorization review requires denial, appeal, or correction resolution'
          : status === 'Pending'
            ? 'Authorization review remains pending'
            : null
      );
    }
  );
});
describe('verification of benefits evidence', () => {
  const gate = { processPosition: 'Insurance Verification', unresolvedGate: 'Complete VOB' };
  it('preserves the business verification timestamp without satisfying authorization', () => {
    const event = adaptVob({
      records: [
        {
          Id: 'synthetic',
          Verification_Status__c: 'Complete',
          Eligibility_Status__c: 'Active',
          Verification_Date__c: '2026-09-01',
          LastModifiedDate: '2026-09-04T12:00:00.000Z',
        },
      ],
      profile,
      gate,
      asOf,
    })[0];
    expect(event).toMatchObject({
      eventDate: '2026-09-01T00:00:00.000Z',
      processRelevance: 7,
      gateImpact: null,
    });
    expect(event?.text).toContain('does not satisfy a separate authorization prerequisite');
    expect(
      adaptVob({
        records: [{ Id: 'synthetic' }],
        profile,
        gate: { processPosition: 'Treatment authorization' },
        asOf,
      })
    ).toEqual([]);
  });
  it('retains entered-date, latest valid source date and cutoff fallbacks for unresolved evidence', () => {
    const records = [
      {
        Id: 'synthetic-entered',
        Verification_Date__c: 'invalid',
        Verification_Date_Entered_At__c: '2026-09-02',
        CreatedDate: '2026-09-03',
      },
      {
        Id: 'synthetic-latest',
        LastModifiedDate: '2026-09-05',
        CreatedDate: '2026-09-06',
        Notes__c: '<p>Need &amp; verify</p>',
      },
      { Id: 'synthetic-cutoff', LastModifiedDate: 'invalid' },
    ];
    const events = adaptVob({ records, profile, gate, asOf });
    expect(events.map((event) => event.eventDate)).toEqual([
      '2026-09-02T00:00:00.000Z',
      '2026-09-06T00:00:00.000Z',
      asOf,
    ]);
    expect(events[1]).toMatchObject({
      rawText: 'Need & verify',
      processRelevance: 9,
      gateImpact: 'Insurance verification or eligibility remains unresolved',
    });
    expect(adaptVob({ profile, gate, asOf })).toEqual([]);
  });
});
const portalInput: PortalAuthorizationEvidenceInput = {
  profile,
  gate: { gateCategory: 'treatmentPlan' },
  asOf,
};
const submitted = {
  opportunityId: profile.opportunityId,
  authType: 'Treatment',
  submittedAt: '2026-09-05T12:00:00Z',
  requestNumber: 'synthetic-request',
};
describe('portal treatment authorization evidence', () => {
  it('selects latest eligible submitted request at the frozen cutoff without inferring payer submission', () => {
    const records = [
      submitted,
      {
        ...submitted,
        requestNumber: 'synthetic-newest',
        submittedAt: asOf,
        status: ' in progress ',
      },
      { ...submitted, requestNumber: 'synthetic-future', submittedAt: '2026-09-11T17:31:07.001Z' },
      {
        ...submitted,
        requestNumber: 'synthetic-cancelled',
        submittedAt: asOf,
        status: 'Cancelled',
      },
      { ...submitted, requestNumber: 'synthetic-other', submittedAt: asOf, opportunityId: 'other' },
    ];
    const event = adaptPortalTreatmentAuthorizationRequests({ ...portalInput, records })[0];
    expect(event).toMatchObject({
      sourceRecordId: 'synthetic-newest',
      eventDate: '2026-09-11',
      factType: 'tp-portal-submitted-awaiting-clinical-quality',
      actionOwner: 'Insurance Ops',
      actionType: 'Salesforce Update',
      processRelevance: 14,
    });
    expect(event?.text).toContain('Insurance Ops must create the downstream records');
  });
  it('keeps action-required details or honest missing details and other portal-state mismatches', () => {
    for (const comments of ['', '<p>Missing &#83;ignature</p>']) {
      const event = adaptPortalTreatmentAuthorizationRequests({
        ...portalInput,
        records: [{ ...submitted, status: 'ACTION REQUIRED', updatedAt: '2026-09-07', comments }],
      })[0];
      expect(event).toMatchObject({
        eventDate: '2026-09-07',
        factType: 'tp-portal-action-required',
        actionOwner: 'Synthetic CSM',
        actionType: 'Provider Outreach',
        rawText: comments ? 'Missing Signature' : null,
      });
      expect(event?.text).toContain(
        comments ? 'documents a requested correction' : 'is not stated in the list view'
      );
    }
    expect(
      adaptPortalTreatmentAuthorizationRequests({
        ...portalInput,
        records: [{ ...submitted, status: 'Approved' }],
      })[0]
    ).toMatchObject({
      factType: 'tp-portal-salesforce-state-mismatch',
      eventDate: '2026-09-05',
      actionOwner: 'Insurance Ops',
    });
  });
  it('retains source-specific aliases and only the original suppression conditions', () => {
    const aliasRecord = {
      clientOpportunityId: profile.opportunityId,
      type: 'Treatment Authorization',
      createdAt: '2026-09-05',
      friendlyId: 42,
    };
    expect(
      adaptPortalTreatmentAuthorizationRequests({ ...portalInput, records: [aliasRecord] })[0]
        ?.sourceRecordId
    ).toBe('42');
    expect(
      adaptPortalTreatmentAuthorizationRequests({
        ...portalInput,
        records: [submitted],
        clinicalQualityRecords: [{}],
      })
    ).toEqual([]);
    expect(
      adaptPortalTreatmentAuthorizationRequests({
        ...portalInput,
        records: [submitted],
        salesforceAuthorizationRecords: [
          {
            Authorization_Type__c: 'Treatment Auth Request',
            Master_Submission_Date__c: '2026-09-06',
          },
        ],
      })
    ).toEqual([]);
    expect(
      adaptPortalTreatmentAuthorizationRequests({
        ...portalInput,
        records: [submitted],
        salesforceAuthorizationRecords: [{ Authorization_Type__c: 'Treatment' }],
      })
    ).toHaveLength(1);
    expect(
      adaptPortalTreatmentAuthorizationRequests({
        ...portalInput,
        profile: { ...profile, stage: 'IA Scheduled' },
        records: [submitted],
      })
    ).toEqual([]);
    expect(
      adaptPortalTreatmentAuthorizationRequests({
        ...portalInput,
        gate: { gateCategory: 'insurance' },
        records: [submitted],
      })
    ).toEqual([]);
    expect(adaptPortalTreatmentAuthorizationRequests(portalInput)).toEqual([]);
    expect(
      adaptPortalTreatmentAuthorizationRequests({
        ...portalInput,
        records: [
          { ...submitted, submittedAt: '' },
          { ...submitted, authType: 'Initial' },
        ],
      })
    ).toEqual([]);
  });
});
describe('source-adapter HTML projection', () => {
  it('preserves its exact entity behavior, coercion and invalid numeric-entity failure', () => {
    expect(sourceHtmlText('<p>Text<br/>next &nbsp; &amp; &apos; &#39; &quot; &#65; &gt;</p>')).toBe(
      "Text next & ' ' \" A &gt;"
    );
    expect(sourceHtmlText()).toBe('');
    expect(sourceHtmlText(null)).toBe('null');
    expect(() => sourceHtmlText('&#99999999;')).toThrow(RangeError);
  });
});
