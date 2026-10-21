import { billingCollectionReceipt } from './billing-collection.js';
import { collectStructuredEvidence, type StructuredCollection } from './structured-collection.js';

export const cutoff = '2026-09-24T16:00:00.000Z';
export const id = ['006', '000000000001AAA'].join('');
export async function reportEvaluationFixture(): Promise<StructuredCollection> {
  const files = new Map<string, unknown>([
    [
      'opportunity_rows.json',
      [
        {
          Id: id,
          Name: 'Synthetic Alpha',
          StageName: 'IA Scheduled',
          Current_SLA__c: 'sla',
          Current_SLA__r: {
            CreatedDate: '2026-09-01',
            Reason_for_Delay_Notes__c: 'Provider will confirm the assessment date.',
          },
        },
        {
          Id: ['006', '000000000002AAA'].join(''),
          Name: 'Synthetic Beta',
          StageName: 'IA Scheduled',
        },
      ],
    ],
    [
      'billing_collection_contract.json',
      billingCollectionReceipt({
        records: [],
        opportunityIds: [id, ['006', '000000000002AAA'].join('')],
        cutoff,
      }),
    ],
    [
      'task_rows.json',
      [
        {
          Id: 'own',
          WhatId: id,
          Subject: 'Call',
          Description: 'The assessment is scheduled for 9/30.',
          CreatedDate: '2026-09-23',
        },
        {
          Id: 'other',
          WhatId: id,
          Subject: 'Call',
          Description: 'For Synthetic Beta: confirm the appointment.',
          CreatedDate: '2026-09-23',
        },
      ],
    ],
    [
      'task_feed_rows.json',
      [
        {
          WhatId: id,
          TaskId: 'own',
          FeedItemId: 'feed',
          TaskSubject: 'Call',
          TaskDescription: '',
          TaskStatus: 'Open',
          TaskActivityDate: '',
          Author: 'Staff',
          Source: 'Task Chatter',
          Summary: 'Assessment scheduling follow-up.',
        },
      ],
    ],
    ['rbt_rows.json', [{ Id: 'request', Client_Opportunity__c: id, RBT_Assigned__c: 'staff' }]],
    ['staffing_rows.json', [{ Id: 'staff', Name: 'Synthetic Staff' }]],
    [
      'ticket_match_rows.json',
      [
        { Id: 'match-one', RBT_Request__c: 'request', Candidate__c: 'candidate' },
        { Id: 'match-two', RBT_Request__c: 'request', Candidate__c: 'candidate' },
      ],
    ],
    [
      'first_interview_rows.json',
      [{ Id: 'interview', Candidate__c: 'candidate', Status__c: 'Scheduled' }],
    ],
    [
      'talent_acquisition_rows.json',
      [{ Id: 'candidate', Name: 'Synthetic Candidate', Applicant_Status__c: 'Interview' }],
    ],
  ]);
  return collectStructuredEvidence({
    source: { mode: 'saved' },
    cutoff,
    artifacts: {
      read: (name) => Promise.resolve(files.get(name)),
      write: (name, value) => {
        files.set(name, value);
        return Promise.resolve();
      },
    },
  });
}
