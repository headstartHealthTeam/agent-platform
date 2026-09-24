import { describe, expect, it } from 'vitest';

import { adaptRbtRequests, type RbtRequestEvidenceRecord } from './rbt-request-evidence.js';
import type { StructuredEvidenceEvent } from './structured-evidence.js';

const context = {
  profile: { opportunityId: 'synthetic-opportunity', currentCsm: { name: 'Synthetic CSM' } },
  gate: { gateCategory: 'rbt' },
  asOf: '2026-09-23T17:00:00Z',
};
function project(record: RbtRequestEvidenceRecord): StructuredEvidenceEvent | undefined {
  return adaptRbtRequests({ ...context, records: [{ Id: 'synthetic-request', ...record }] })[0];
}
describe('RBT request evidence', () => {
  it('preserves relevance, empty inventories and missing-ID errors', () => {
    expect(
      adaptRbtRequests({ ...context, gate: { gateCategory: 'insurance' }, records: [{}] })
    ).toEqual([]);
    expect(adaptRbtRequests(context)).toEqual([]);
    expect(() => adaptRbtRequests({ ...context, records: [{}] })).toThrow(
      'EvidenceEvent missing sourceRecordId'
    );
  });
  it('does not refresh a closed request from later automation-only modification', () => {
    expect(
      project({
        Date_Closed__c: '2026-09-01',
        LastModifiedDate: '2026-09-22',
        CreatedDate: '2026-08-25',
      })
    ).toMatchObject({ eventDate: '2026-09-01T00:00:00.000Z' });
    expect(project({ Date_Closed__c: 'invalid', LastModifiedDate: '2026-09-22' })?.eventDate).toBe(
      context.asOf
    );
  });
  it('selects the latest qualifying replacement and preserves inactive prior assignment evidence', () => {
    const events = adaptRbtRequests({
      ...context,
      profile: { ...context.profile, currentCsm: { name: 123 } },
      records: [
        {
          Id: 'prior',
          RBT_Assigned__r: { Name: 'synthetic rbt' },
          Date_Closed__c: '2026-09-10',
          RBT_Start_Date__c: '2026-09-12',
        },
        { Id: 'older', CreatedDate: '2026-09-12' },
        { Id: 'latest', CreatedDate: '2026-09-15' },
        { Id: 'canceled', CreatedDate: '2026-09-20', RBT_Recruitment_Funnel__c: 'Canceled' },
      ],
    });
    expect(events[0]).toMatchObject({
      sourceRecordId: 'prior:latest',
      eventDate: '2026-09-15',
      factType: 'rbt-lost',
      candidateName: 'Synthetic Rbt',
      candidateActive: false,
      actionOwner: 'RBT Team',
    });
    expect(events[0]?.text).toBe(
      'The prior RBT assignment to Synthetic Rbt closed on 2026-09-10; a replacement request opened on 2026-09-15 and has no confirmed assignment or first 97153 date.'
    );
    expect(events[1]?.text).toMatch(/^Replacement RBT recruiting is active/);
  });
  it('keeps a future start monitored and a past start unverified rather than completed', () => {
    expect(
      project({ RBT_Assigned__r: { Name: 'Synthetic RBT' }, RBT_Start_Date__c: '2026-09-25' })
    ).toMatchObject({
      actionType: 'Monitor',
      milestoneDate: '2026-09-25',
      followUpDate: '2026-09-25',
      candidateActive: true,
      processRelevance: 10,
    });
    const past = project({ Est_Care_Start_Date__c: '2026-09-20' });
    expect(past).toMatchObject({
      actionType: 'Provider Outreach',
      milestoneDate: '2026-09-20',
      followUpDate: '2026-09-24',
      candidateActive: null,
      processRelevance: 9,
    });
    expect(past?.text).toBe(
      'The RBT request recorded a planned care start of 2026-09-20, but that date passed without confirmation of the first 97153 service.'
    );
    for (const date of ['1900-01-01', 'invalid', ''])
      expect(project({ RBT_Start_Date__c: date })?.factType).toBe('rbt-recruiting');
  });
  it('retains assignment precedence over cancellation and does not invent a start', () => {
    expect(
      project({ RBT_Assigned__r: { Name: 'Synthetic RBT' }, RBT_Recruitment_Funnel__c: 'Canceled' })
    ).toMatchObject({
      factType: 'rbt-assigned',
      candidateActive: true,
      milestoneDate: null,
      actionType: 'Provider Outreach',
    });
  });
  it('distinguishes restored coverage from a lost staffing path', () => {
    expect(
      project({
        RBT_Recruitment_Funnel__c: 'Canceled',
        Request_Cancellation_Reason__c: '<p>Existing RBT can cover</p>',
      })
    ).toMatchObject({
      factType: 'rbt-assigned',
      actionOwner: 'Synthetic CSM',
      processRelevance: 11,
      rawText: 'Existing RBT can cover',
    });
    expect(
      project({
        RBT_Recruitment_Funnel__c: 'Withdrawn',
        Request_Cancellation_Reason__c: 'Candidate declined',
      })
    ).toMatchObject({ factType: 'rbt-lost', actionOwner: 'RBT Team', processRelevance: 9 });
    expect(project({ RBT_Recruitment_Funnel__c: 'Declined' })?.text).toBe(
      'The RBT request is declined; no replacement coverage or start date is confirmed.'
    );
  });
  it('retains numeric count conversion and only treats active/proposed/matched counts as progress', () => {
    expect(
      project({
        Total_Screened_Candidates__c: '3',
        Active_Candidates__c: '2',
        Proposed_Candidates__c: 1,
        Matched_Candidates__c: 0,
      })
    ).toMatchObject({
      text: 'RBT recruiting is active; 3 screened, 2 active, 1 proposed, 0 matched. No candidate assignment or start date is confirmed.',
      factType: 'rbt-candidate',
    });
    expect(
      project({
        Total_Screened_Candidates__c: 3,
        Active_Candidates__c: '',
        Proposed_Candidates__c: Infinity,
        Matched_Candidates__c: null,
      })?.factType
    ).toBe('rbt-recruiting');
    expect(project({ Active_Candidates__c: -1, Proposed_Candidates__c: 1 })?.factType).toBe(
      'rbt-recruiting'
    );
    expect(project({ Active_Candidates__c: true })?.text).toContain('1 active');
    expect(
      project({ RBT_Recruitment_Funnel__c: 'On hold', Active_Candidates__c: 1 })
    ).toMatchObject({ factType: 'rbt-recruiting', processRelevance: 11 });
  });
});
