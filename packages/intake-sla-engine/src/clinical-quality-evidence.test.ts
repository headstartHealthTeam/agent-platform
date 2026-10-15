import { describe, expect, it } from 'vitest';

import {
  adaptClinicalQuality,
  type ClinicalQualityEvidenceRecord,
} from './clinical-quality-evidence.js';
import type { StructuredEvidenceEvent } from './structured-evidence.js';

const profile = {
  opportunityId: 'synthetic-opportunity',
  currentCsm: { name: 'Synthetic CSM' },
  stage: '97151 Started',
};
const asOf = '2026-09-23T17:00:00Z';
function project(record: ClinicalQualityEvidenceRecord): StructuredEvidenceEvent | undefined {
  return adaptClinicalQuality({ profile, asOf, records: [{ Id: 'synthetic-cq', ...record }] })[0];
}
describe('Clinical Quality evidence', () => {
  it('does not validate an unused CSM name when the existing branch assigns another owner', () => {
    const unconsumedProfile = { ...profile, currentCsm: { name: 123 } };
    for (const record of [
      {
        Treatment_Plan_Status__c: 'Approved',
        Parent_Signature_Date__c: '2026-09-21',
        Provider_Signature_Date__c: '2026-09-22',
      },
      {
        Treatment_Plan_Status__c: 'In Review',
        Parent_Signature_Date__c: '2026-09-21',
        Provider_Signature_Date__c: '2026-09-22',
      },
      { Treatment_Plan_Status__c: 'Reviewing' },
    ]) {
      expect(
        adaptClinicalQuality({
          profile: unconsumedProfile,
          asOf,
          records: [{ Id: 'synthetic-cq', ...record }],
        })
      ).toHaveLength(1);
    }
    for (const status of ['Changes requested', 'Awaiting signatures']) {
      expect(() =>
        adaptClinicalQuality({
          profile: unconsumedProfile,
          asOf,
          records: [{ Id: 'synthetic-cq', Treatment_Plan_Status__c: status }],
        })
      ).toThrow('Evidence action owner must be text');
    }
  });
  it('retains gate and stage relevance without requiring unused input fields', () => {
    expect(
      adaptClinicalQuality({
        profile: { opportunityId: 'synthetic', stage: 'IA Scheduled' },
        gate: { gateCategory: 'insurance' },
        asOf,
        records: [{}],
      })
    ).toEqual([]);
    expect(adaptClinicalQuality({ profile, asOf })).toEqual([]);
    expect(
      adaptClinicalQuality({
        profile: { opportunityId: 'synthetic' },
        gate: { gateCategory: 'treatmentPlan' },
        asOf,
        records: [{ Id: 'cq' }],
      })[0]?.actionOwner
    ).toBe('CSM');
    expect(() => adaptClinicalQuality({ profile, asOf, records: [{}] })).toThrow(
      'EvidenceEvent missing sourceRecordId'
    );
  });
  it('retains correction priority, requested detail and latest business timestamp', () => {
    const event = project({
      Treatment_Plan_Status__c: 'Approved',
      Parent_Signature_Date__c: '2026-09-21',
      Provider_Signature_Date__c: '2026-09-20',
      TS_In_Review__c: '2026-09-15',
      TS_Edits_Sent_for_Review__c: '2026-09-22',
      Treatment_Barriers_Notes__c: '<p>Correction: Vineland examiner credential</p>',
      LastModifiedDate: 'invalid',
    });
    expect(event).toMatchObject({
      source: 'Clinical Quality',
      category: 'treatmentPlan',
      eventDate: '2026-09-22T00:00:00.000Z',
      text: 'Clinical Quality began review on 2026-09-15 and sent treatment-plan edits back on 2026-09-22; the Vineland examiner name and credential remain unresolved.',
      factType: 'tp-revisions',
      processRelevance: 12,
      actionOwner: 'Synthetic CSM',
      actionType: 'Provider Outreach',
      requestedInformation: 'the Vineland examiner name and credential',
    });
    expect(project({ Treatment_Plan_Status__c: 'Changes requested' })?.text).toBe(
      'Clinical Quality sent treatment-plan edits back on 2026-09-23; provider resubmission is not recorded.'
    );
  });
  it.each(['Approved', 'Ready to submit', 'Completed'])(
    'does not equate signed %s with payer submission',
    (status) => {
      expect(
        project({
          Treatment_Plan_Status__c: status,
          Parent_Signature_Date__c: '2026-09-21',
          Provider_Signature_Date__c: '2026-09-22',
        })
      ).toMatchObject({
        gateImpact: 'Signed treatment plan is ready for payer submission',
        actionOwner: 'Insurance Ops',
        actionType: 'Insurance Follow-Up',
        factType: 'tp-signature',
        processRelevance: 10,
        text: `Clinical Quality records both parent and provider signatures and marks the treatment plan ${status.toLowerCase()}; payer submission is not yet confirmed.`,
      });
    }
  );
  it('keeps signatures separate from completed clinical review', () => {
    expect(
      project({
        Treatment_Plan_Status__c: 'In Review',
        Parent_Signature_Date__c: '2026-09-21',
        Provider_Signature_Date__c: '2026-09-22',
      })
    ).toMatchObject({
      gateImpact: 'Signed treatment plan awaits Clinical Quality completion',
      actionOwner: 'Clinical Quality',
      actionType: 'Clinical Review',
      processRelevance: 10,
    });
  });
  it('prioritizes pending review before premature signature outreach', () => {
    expect(
      project({ Treatment_Plan_Status__c: 'In Review', TS_In_Review__c: '2026-09-20' })
    ).toMatchObject({
      text: 'Clinical Quality began treatment-plan review on 2026-09-20; no review disposition or requested edits are recorded.',
      factType: 'tp-clinical-review',
      actionOwner: 'Clinical Quality',
      processRelevance: 11,
    });
    expect(project({ Treatment_Plan_Status__c: 'Reviewing' })?.text).toBe(
      'Clinical Quality began treatment-plan review; no review disposition or requested edits are recorded.'
    );
  });
  it.each([
    [{}, 'parent and provider'],
    [{ Parent_Signature_Date__c: '2026-09-21' }, 'provider'],
    [{ Provider_Signature_Date__c: '2026-09-21' }, 'parent'],
  ])('preserves only the missing signatures', (record, missing) => {
    expect(project({ Treatment_Plan_Status__c: 'Awaiting signatures', ...record })).toMatchObject({
      text: `Clinical Quality shows awaiting signatures; the ${missing} signature is not recorded.`,
      actionOwner: 'Synthetic CSM',
      factType: 'tp-signature',
    });
  });
});
