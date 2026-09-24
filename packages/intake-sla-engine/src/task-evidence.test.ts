import { describe, expect, it } from 'vitest';

import { taskActivityRows } from './task-activity.js';

import { adaptTasks, buildIdentityProfile, interpretationGateContext } from './index.js';
import type { TaskEvidenceRecord } from './index.js';

const asOf = new Date('2026-09-24T12:00:00.000Z');
const profile = buildIdentityProfile({
  opportunityId: '006-synthetic',
  opportunityName: 'Synthetic Example',
  stage: 'Treatment Plan',
  relatedSalesforceRecordIds: ['lead-synthetic'],
});
const base = { profile, gate: interpretationGateContext({ stage: 'Treatment Plan' }), asOf };
const text = 'Waiting for parent signature on treatment plan.';
const record: TaskEvidenceRecord = {
  Id: 'task',
  WhatId: profile.opportunityId,
  Subject: 'Treatment plan',
  Description: text,
  CreatedDate: '2026-09-23',
};
function sms(id: string, description: string, date: string, direction: string): TaskEvidenceRecord {
  return {
    Id: id,
    WhatId: profile.opportunityId,
    Subject: 'SMS',
    Type: 'SMS',
    Description: description,
    CreatedDate: date,
    aircall__SMS_Direction__c: direction,
  };
}
const outbound = sms('out', 'Please send the PCP referral.', '2026-09-20', 'Outbound');
const inbound = sms('in', 'I sent the documents.', '2026-09-23', 'Inbound');
describe('routine task and task-chatter evidence', () => {
  it('preserves ordinary task IDs, source dates and direct relationship metadata', () => {
    expect(adaptTasks({ ...base, records: [record] })).toMatchObject([
      {
        source: 'Tasks / Task Chatter',
        sourceRecordId: 'task:1',
        eventDate: '2026-09-23',
        factType: 'tp-signature',
        matchQuality: 'Direct',
        rawText: text,
        assumedIdentityMatch: false,
        matchedIdentities: [{ activityType: 'Task', taskSubject: 'Treatment plan' }],
      },
    ]);
  });
  it('excludes another Opportunity, matches known related records and preserves missing-relationship behavior', () => {
    expect(adaptTasks({ ...base, records: [{ ...record, WhatId: '006-other' }] })).toEqual([]);
    expect(adaptTasks({ ...base, records: [{ ...record, WhatId: 'lead-other' }] })).toEqual([]);
    for (const WhatId of ['lead-synthetic', '', null, undefined])
      expect(adaptTasks({ ...base, records: [{ ...record, WhatId }] })).toMatchObject([
        { matchQuality: 'Direct' },
      ]);
    expect(
      adaptTasks({
        ...base,
        records: [{ ...record, WhatId: 'lead-other', Description: `Synthetic Example: ${text}` }],
      })
    ).toMatchObject([{ matchQuality: 'Direct' }]);
  });
  it('keeps source-dated updates within a later-modified note without admitting post-cutoff segments', () => {
    expect(
      adaptTasks({ ...base, records: [{ ...record, LastModifiedDate: '2026-09-25' }] })
    ).toEqual([]);
    expect(
      adaptTasks({
        ...base,
        records: [
          {
            ...record,
            Description: `9/23: ${text} 9/25: Family signed the treatment plan.`,
            LastModifiedDate: '2026-09-25',
          },
        ],
      })
    ).toMatchObject([
      {
        sourceRecordId: 'task:1',
        eventDate: '2026-09-23',
        factType: 'tp-signature',
      },
    ]);
  });
  it('retains Date cutoffs without turning family contact into a confirmed assessment', () => {
    const events = adaptTasks({
      ...base,
      gate: { gateCategory: 'intakeScheduling' },
      records: [
        {
          Id: 'sms',
          WhatId: profile.opportunityId,
          Type: 'SMS',
          Subject: 'SMS',
          Description: 'We have a meeting with her next week.',
          aircall__SMS_Direction__c: 'Inbound',
          aircall__Number_Name__c: 'Intake',
        },
      ],
    });
    expect(events).toMatchObject([{ factType: 'ia-family-consult-planned', milestoneDate: null }]);
    expect(events[0]?.eventDate).toBe(asOf);
    expect(adaptTasks({ ...base, records: [{ ...record, CreatedDate: '2026-09-25' }] })).toEqual(
      []
    );
  });
  it('retains embedded and flattened Chatter occurrence dates and source IDs', () => {
    const Body = 'I submitted the treatment plan yesterday.';
    const created = '2026-09-23T15:00:00Z';
    const embedded = adaptTasks({
      ...base,
      records: [
        {
          Id: 'parent',
          WhatId: profile.opportunityId,
          Subject: 'Treatment plan',
          FeedItems: [{ Id: 'feed', Body, CreatedDate: created }],
        },
      ],
    });
    expect(embedded).toMatchObject([
      {
        sourceRecordId: 'feed:1',
        eventDate: '2026-09-22',
        factType: 'tp-submitted',
        matchedIdentities: [{ activityType: 'Chatter Post' }],
      },
    ]);
    const flattened = adaptTasks({
      ...base,
      records: [
        {
          Id: 'parent',
          Source: 'Task chatter',
          Subject: 'Treatment plan',
          Summary: Body,
          CreatedDate: created,
        },
      ],
    });
    expect(flattened).toMatchObject([
      { sourceRecordId: 'parent:feed:1', eventDate: '2026-09-22', factType: 'tp-submitted' },
    ]);
    expect(
      adaptTasks({ ...base, records: [{ ...record, Description: Body, CreatedDate: created }] })
    ).toEqual([]);
  });
  it('excludes administrative emails/reminders while retaining substantive replies', () => {
    expect(
      adaptTasks({
        ...base,
        records: [
          {
            ...record,
            TaskSubtype: 'Email',
            Subject: 'Subject: Welcome to Headstart',
            Description: text,
          },
        ],
      })
    ).toEqual([]);
    expect(
      adaptTasks({
        ...base,
        records: [
          {
            ...record,
            TaskSubtype: 'Email',
            Subject: 'Subject: Welcome to Headstart',
            Description: `Still waiting. ${text}`,
          },
        ],
      })
    ).toHaveLength(1);
    expect(
      adaptTasks({
        ...base,
        records: [
          { ...record, Description: `Get an update on when the provider will submit. ${text}` },
        ],
      })
    ).toEqual([]);
    expect(
      adaptTasks({
        ...base,
        gate: { gateCategory: 'insurance' },
        records: [
          {
            ...record,
            Description:
              'Reminder to complete new client onboarding packet. Family has not received the packet.',
          },
        ],
      }).length
    ).toBeGreaterThan(0);
  });
  it('pairs an inbound family update with its prior request while preserving standalone audit facts', () => {
    const events = adaptTasks({
      ...base,
      gate: { gateCategory: 'insurance' },
      records: [inbound, outbound],
    });
    expect(events.map((event) => [event.sourceRecordId, event.factType])).toEqual([
      ['out:in:thread:1', 'family-document-update'],
      ['out:in:thread:2', 'required-document'],
      ['out:1', 'required-document'],
    ]);
    expect(events[0]).toMatchObject({
      eventDate: '2026-09-23',
      matchQuality: 'Direct',
      text: 'The family reported progress on the ABA referral; completion and receipt still must be verified.',
      rawText: 'SMS Please send the PCP referral. I sent the documents.',
      matchedIdentities: [{ activityType: 'SMS Thread' }],
    });
  });
  it.each([
    { ...inbound, WhoId: 'different-contact' },
    { ...inbound, CreatedDate: '2026-11-23' },
    { ...inbound, CreatedDate: '2026-09-19' },
    { ...inbound, Description: 'Thank you.' },
    { ...inbound, aircall__SMS_Direction__c: 'Outbound' },
  ])('does not manufacture a request-response pair without its original conditions', (reply) => {
    const events = adaptTasks({
      ...base,
      records: [{ ...outbound, WhoId: 'original-contact' }, reply],
    });
    expect(events.every((event) => !event.sourceRecordId.includes(':thread'))).toBe(true);
  });
  it('selects the service-order request and does not require synthetic contact IDs', () => {
    const events = adaptTasks({
      ...base,
      gate: { gateCategory: 'insurance' },
      records: [
        sms('service', 'Please complete the service order form.', '2026-09-21', 'Outbound'),
        inbound,
      ],
    });
    expect(events).toMatchObject([
      {
        sourceRecordId: 'service:in:thread',
        factType: 'family-document-update',
        requestedInformation: 'a signed service order',
      },
    ]);
  });
  it('expands each existing embedded feed shape without mutating inputs or inventing missing text', () => {
    const source: TaskEvidenceRecord = {
      TaskId: 'parent',
      TaskSubject: 'Original subject',
      CreatedDate: '2026-09-21',
      WhatId: profile.opportunityId,
      FeedItems: [{ Body: 'first' }],
      TaskFeed: [{ Body: 'second' }],
      ChatterPosts: [{ Body: 'third' }],
      FeedComments: [{ CommentBody: 'fourth' }],
      ChatterComments: [{ CommentBody: 'fifth' }],
    };
    const rows = taskActivityRows([source]);
    expect(rows.map((row) => row.activityId)).toEqual([
      'parent',
      'parent:chatter:1',
      'parent:chatter:2',
      'parent:chatter:3',
      'parent:chatter:4',
      'parent:chatter:5',
    ]);
    expect(rows.at(-1)).toMatchObject({
      TaskId: 'parent',
      WhatId: profile.opportunityId,
      Subject: 'Original subject',
      Description: 'fifth',
      CreatedDate: '2026-09-21',
      activityType: 'Chatter Comment',
    });
    expect(source.FeedComments?.[0]?.Description).toBeUndefined();
    expect(taskActivityRows([{ CommentBody: 'standalone' }])).toMatchObject([
      { activityId: 'task', Description: 'standalone' },
    ]);
    expect(
      taskActivityRows([{ Summary: 'flattened', Source: 'Task update', FeedItemId: 'update' }])
    ).toMatchObject([{ activityId: 'update', activityType: 'Task Update' }]);
    expect(adaptTasks(base)).toEqual([]);
    expect(adaptTasks({ ...base, records: null })).toEqual([]);
  });
});
