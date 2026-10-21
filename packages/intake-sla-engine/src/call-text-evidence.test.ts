import { describe, expect, it } from 'vitest';

import { adaptCallsAndTexts, buildIdentityProfile, interpretationGateContext } from './index.js';
import type { CallTextRecord } from './index.js';

const text = 'Waiting for parent signature on treatment plan.';
const profile = buildIdentityProfile({
  opportunityId: '006-synthetic',
  opportunityName: 'Synthetic Example',
  stage: 'Treatment Plan',
  relatedSalesforceRecordIds: ['lead-synthetic'],
  providers: ['Example Clinician'],
  practice: 'Example Practice',
});
const base = {
  profile,
  gate: interpretationGateContext({ stage: 'Treatment Plan' }),
  asOf: new Date('2026-09-24T12:00:00Z'),
};
const record: CallTextRecord = {
  Id: 'call',
  WhatId: profile.opportunityId,
  Headstart_Full_Transcript__c: text,
};
describe('routine call and text evidence adapter', () => {
  it('prioritizes full transcripts, explicit related records, source timestamp and original line metadata', () => {
    const events = adaptCallsAndTexts({
      ...base,
      records: [
        {
          ...record,
          aircall__Message_Content__c: 'Ignored SMS',
          aircall__Call_summary__c: 'Ignored summary',
          aircall__Number_Name__c: 'Intake',
          aircall__Number_name__c: 'Other',
          aircall__Call_Start_Date_Time__c: '2026-09-23',
          CreatedDate: '2026-09-22',
        },
      ],
    });
    expect(events).toMatchObject([
      {
        source: 'Calls / Texts',
        sourceRecordId: 'call',
        eventDate: '2026-09-23',
        matchQuality: 'Direct',
        factType: 'tp-signature',
        rawText: text,
        matchedIdentities: [{ line: 'Intake', sourceType: 'Transcript', matchQuality: 'Direct' }],
      },
    ]);
    const identity = events[0]?.matchedIdentities[0];
    expect(identity?.sourceType).toBe('Transcript');
  });
  it.each(['aircall__Opportunity__c', 'Opportunity__c', 'WhatId'] as const)(
    'rejects another explicit Opportunity through %s',
    (field) => {
      expect(
        adaptCallsAndTexts({
          ...base,
          records: [{ ...record, WhatId: null, [field]: '006-other' }],
        })
      ).toEqual([]);
    }
  );
  it.each([
    'Intake',
    'Insurance Ops Other',
    'Insurance Ops VOB',
    'Customer Success',
    'Scheduling Pilot',
    'RBT',
  ])('retains approved line %s', (line) => {
    expect(
      adaptCallsAndTexts({ ...base, records: [{ ...record, aircall__Number_Name__c: line }] })
    ).toHaveLength(1);
  });
  it('uses the approved line-number fallback without trimming unknown line names', () => {
    expect(
      adaptCallsAndTexts({ ...base, records: [{ ...record, aircall__Number_Name__c: ' Intake ' }] })
    ).toEqual([]);
    expect(
      adaptCallsAndTexts({
        ...base,
        records: [
          {
            ...record,
            aircall__Number_Name__c: 'Other',
            aircall__Phone_Number__c: '+1 (478) 347-6197',
          },
        ],
      })
    ).toHaveLength(1);
    expect(
      adaptCallsAndTexts({
        ...base,
        records: [{ ...record, aircall__Number_Name__c: '', aircall__Number_name__c: 'Other' }],
      })
    ).toHaveLength(1);
  });
  it('excludes automated SMS only, and keeps call summaries at Likely despite direct linkage', () => {
    const automated = `Reply STOP to opt out. ${text}`;
    const sms = {
      ...record,
      Headstart_Full_Transcript__c: null,
      aircall__Message_Content__c: automated,
    };
    expect(adaptCallsAndTexts({ ...base, records: [sms] })).toEqual([]);
    expect(
      adaptCallsAndTexts({
        ...base,
        records: [{ ...sms, Headstart_Full_Transcript__c: automated }],
      })
    ).toHaveLength(1);
    expect(
      adaptCallsAndTexts({
        ...base,
        records: [{ ...sms, aircall__Message_Content__c: '', aircall__Call_summary__c: text }],
      })
    ).toMatchObject([
      {
        matchQuality: 'Likely',
        matchedIdentities: [{ sourceType: 'Call Summary' }],
      },
    ]);
  });
  it('uses linked Salesforce records or existing text matching without inventing direct linkage', () => {
    expect(
      adaptCallsAndTexts({
        ...base,
        records: [{ ...record, WhatId: null, WhoId: 'lead-synthetic' }],
      })
    ).toMatchObject([{ matchQuality: 'Direct' }]);
    expect(adaptCallsAndTexts({ ...base, records: [{ ...record, WhatId: null }] })).toMatchObject([
      { matchQuality: 'Weak' },
    ]);
    expect(
      adaptCallsAndTexts({
        ...base,
        records: [
          { ...record, WhatId: null, Headstart_Full_Transcript__c: `Synthetic Example: ${text}` },
        ],
      })
    ).toMatchObject([{ matchQuality: 'Direct' }]);
  });
  it('preserves inbound-family modality, Date fallback identity and the original empty results', () => {
    const events = adaptCallsAndTexts({
      ...base,
      gate: { gateCategory: 'intakeScheduling' },
      records: [
        {
          Id: 'sms',
          WhatId: profile.opportunityId,
          aircall__Message_Content__c: 'We have a meeting with her next week.',
          aircall__SMS_Direction__c: 'Inbound',
          aircall__Number_Name__c: 'Intake',
        },
      ],
    });
    expect(events).toMatchObject([{ factType: 'ia-family-consult-planned', milestoneDate: null }]);
    expect(events[0]?.eventDate).toBe(base.asOf);
    expect(adaptCallsAndTexts(base)).toEqual([]);
    expect(adaptCallsAndTexts({ ...base, records: null })).toEqual([]);
    expect(adaptCallsAndTexts({ ...base, records: [{ Id: 'empty' }] })).toEqual([]);
  });
});
