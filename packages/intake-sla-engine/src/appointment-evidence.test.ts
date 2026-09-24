import { describe, expect, it } from 'vitest';

import { adaptAlohaAppointments, adaptClaims } from './appointment-evidence.js';

const profile = { opportunityId: 'synthetic-opportunity', currentCsm: { name: 'Synthetic CSM' } };
const asOf = '2026-09-11T17:31:07.000Z';
describe('existing Aloha appointment evidence projection', () => {
  it('keeps completed and scheduled assessment/treatment evidence separate', () => {
    for (const gateCategory of ['intakeScheduling', 'rbt']) {
      for (const status of ['Completed', 'Active', null]) {
        const completed = status === 'Completed';
        const event = adaptAlohaAppointments({
          appointments: [
            {
              appointmentId: 'synthetic',
              serviceDate: '2026-09-03',
              status,
              qualifyingAssessment: true,
              qualifyingTreatment: true,
              lastModifiedDate: '2026-09-05',
              updatedAt: '2026-09-06',
              createdDate: '2026-09-04',
              CreatedDate: 'invalid',
            },
          ],
          profile,
          asOf,
          gate: { gateCategory },
        })[0];
        expect(event).toMatchObject({
          source: 'Aloha',
          category: gateCategory,
          eventDate: completed ? '2026-09-03' : '2026-09-06T00:00:00.000Z',
          actionType: completed ? 'Salesforce Update' : 'Monitor',
          milestoneDate: '2026-09-03',
          followUpDate: '2026-09-03',
          processRelevance: 10,
        });
        expect(event?.text).toContain(completed ? 'occurred' : 'schedules');
      }
    }
  });
  it('uses aliases, cutoff as timestamp fallback, ignores irrelevant rows and requires selected identity', () => {
    const input = {
      profile: { opportunityId: 'synthetic', currentCsm: null },
      asOf,
      gate: { gateCategory: 'intakeScheduling' },
    };
    expect(
      adaptAlohaAppointments({
        ...input,
        appointments: [
          {
            id: 'synthetic',
            appointmentId: '',
            serviceDate: '',
            appointmentDate: '2026-09-15',
            qualifyingAssessment: true,
          },
        ],
      })[0]
    ).toMatchObject({
      sourceRecordId: 'synthetic',
      eventDate: asOf,
      actionOwner: 'CSM',
      followUpDate: '2026-09-15',
    });
    expect(
      adaptAlohaAppointments({
        ...input,
        appointments: [
          { qualifyingAssessment: true },
          { serviceDate: '2026-09-03', qualifyingTreatment: true },
        ],
      })
    ).toEqual([]);
    expect(adaptAlohaAppointments(input)).toEqual([]);
    expect(() =>
      adaptAlohaAppointments({
        ...input,
        appointments: [{ serviceDate: '2026-09-03', qualifyingAssessment: true }],
      })
    ).toThrow('EvidenceEvent missing sourceRecordId');
  });
});
describe('existing claim evidence projection', () => {
  it('keeps supported direct-care claims and original field precedence', () => {
    const event = adaptClaims({
      records: [
        {
          id: 'synthetic-primary',
          Id: 'synthetic-alias',
          procedureCode: 97153,
          cptCode: '97151',
          serviceDate: '2026-09-03',
          dateOfService: '2026-09-04',
          status: 'Paid',
        },
      ],
      profile,
      asOf,
      gate: { gateCategory: 'rbt' },
    })[0];
    expect(event).toMatchObject({
      source: 'Claims',
      sourceRecordId: 'synthetic-primary',
      eventDate: '2026-09-03',
      milestoneDate: '2026-09-03',
      followUpDate: '2026-09-14',
      actionType: 'Salesforce Update',
      processRelevance: 10,
    });
    for (const code of ['cptCode', 'serviceCode', 'CPT_Code__c']) {
      expect(
        adaptClaims({
          records: [{ [code]: '97153', Service_Date__c: '2026-09-03' }],
          profile,
          asOf,
          gate: { gateCategory: 'rbt' },
        })[0]?.sourceRecordId
      ).toBe('claim:2026-09-03');
    }
    expect(
      adaptClaims({
        records: [{ id: '', Id: 'synthetic-alias', cptCode: '97153', dateOfService: '2026-09-03' }],
        profile: { opportunityId: 'synthetic' },
        asOf,
        gate: { gateCategory: 'rbt' },
      })[0]
    ).toMatchObject({ sourceRecordId: 'synthetic-alias', actionOwner: 'CSM' });
  });
  it('does not admit rejected/void/denied, missing-date, other-code or irrelevant-gate claims', () => {
    const records = ['Voided', 'Rejected', 'Deny'].map((claimStatus) => ({
      cptCode: '97153',
      serviceDate: '2026-09-03',
      claimStatus,
    }));
    expect(
      adaptClaims({
        records: [
          ...records,
          { cptCode: '97151', serviceDate: '2026-09-03' },
          { cptCode: '97153' },
        ],
        profile,
        asOf,
        gate: { gateCategory: 'rbt' },
      })
    ).toEqual([]);
    expect(
      adaptClaims({
        records: [{ cptCode: '97153', serviceDate: '2026-09-03' }],
        profile,
        asOf,
        gate: { gateCategory: 'insurance' },
      })
    ).toEqual([]);
    expect(adaptClaims({ profile, asOf, gate: { gateCategory: 'rbt' } })).toEqual([]);
  });
});
