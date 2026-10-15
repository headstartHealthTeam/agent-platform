import { expect, it } from 'vitest';

import {
  dateFromRelativeWord,
  explicitConversationDate,
  extractOperationalFacts,
  interpretConversation,
} from './index.js';

it('retains source-specific identity metadata through public array consumers', () => {
  const events = interpretConversation({
    opportunityId: 'synthetic-opportunity',
    source: 'Tasks',
    sourceRecordId: 'synthetic-task',
    eventDate: '2026-09-24',
    asOf: '2026-09-24',
    text: 'Authorization pending.',
    matchQuality: 'Direct',
    gate: { gateCategory: 'insurance' },
    matchedIdentities: [
      {
        opportunityId: 'synthetic-opportunity',
        opportunityName: 'Synthetic Example',
        taskSubject: 'Authorization follow-up',
        activityType: 'Task Chatter',
      },
    ],
  });
  const subjects: string[] = events.flatMap((event) =>
    event.matchedIdentities.map((identity) => identity.taskSubject)
  );
  const activity: string | undefined = events.at(0)?.matchedIdentities.at(0)?.activityType;
  const subject: string | undefined = events[0]?.matchedIdentities[0]?.taskSubject;
  expect(subjects).toEqual(['Authorization follow-up']);
  expect(activity).toBe('Task Chatter');
  expect(subject).toBe('Authorization follow-up');
});

it('accepts original Date and numeric fact inputs without changing native date semantics', () => {
  const asOf = new Date('2026-09-24T22:00:00Z');
  expect(
    extractOperationalFacts({
      text: 'Pending Ins Approval',
      category: 'intakeScheduling',
      eventDate: asOf,
      asOf,
    })
  ).toEqual([]);
  for (const eventDate of [asOf, asOf.valueOf(), asOf.toISOString()]) {
    expect(
      extractOperationalFacts({
        text: 'Initial assessment completed yesterday.',
        category: 'other',
        eventDate,
        asOf,
        context: { noteType: 'sla' },
      })
    ).toMatchObject([{ type: 'ia-completed', milestoneDate: '2026-09-23' }]);
    expect(explicitConversationDate('Assessment scheduled 9/25.', eventDate)).toBe('2026-09-25');
    expect(dateFromRelativeWord('tomorrow', eventDate)).toBe('2026-09-25');
  }
  expect(explicitConversationDate('9/25', null)).toBe('1970-09-25');
  expect(explicitConversationDate('9/25', undefined)).toBe('NaN-09-25');
  expect(explicitConversationDate('September 25', 0)).toBe('1970-09-25');
  expect(explicitConversationDate('on the 25th', new Date('invalid'))).toBe('NaN-NaN-25');
  expect(dateFromRelativeWord('tomorrow', 0)).toBeNull();
  expect(asOf.toISOString()).toBe('2026-09-24T22:00:00.000Z');
});
