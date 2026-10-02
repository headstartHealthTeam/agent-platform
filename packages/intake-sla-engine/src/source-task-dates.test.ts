import { describe, expect, it } from 'vitest';

import type { SourceAuthorizationRecord } from './source-authorization-types.js';
import { datedTaskLines, explicitTaskOccurrenceDate } from './source-task-dates.js';
import { isAdministrativeEmail, isAdministrativeTaskReminder } from './task-administrative.js';

const asOf = '2026-09-11T17:31:07.000Z';
describe('dated task evidence', () => {
  it('accepts the original direct authorization-note mapping with explicit undefined properties', () => {
    const record: SourceAuthorizationRecord = {
      Notes__c: 'Current update',
      CreatedDate: undefined,
      LastModifiedDate: undefined,
    };
    expect(
      datedTaskLines(
        {
          Description: record.Notes__c,
          CreatedDate: record.CreatedDate,
          LastModifiedDate: record.LastModifiedDate,
        },
        asOf
      )
    ).toEqual([{ text: 'Current update', eventDate: asOf }]);
  });
  it('separates recorded updates while retaining appointment dates inside their update', () => {
    const lines = datedTaskLines(
      {
        Description:
          '<p>9/1: CSM waiting for provider. 9/4: provider scheduled for 9/15; 9/10: family confirmed appointment on 9/15.</p>',
        CreatedDate: '2026-09-01',
      },
      asOf
    );
    expect(lines).toEqual([
      { text: '9/1: CSM waiting for provider.', eventDate: '2026-09-01' },
      { text: '9/4: provider scheduled for 9/15;', eventDate: '2026-09-04' },
      { text: '9/10: family confirmed appointment on 9/15.', eventDate: '2026-09-10' },
    ]);
    expect(
      datedTaskLines(
        { Description: 'Treatment plan update: 9/4: awaiting review', CreatedDate: '2026-09-01' },
        asOf
      )
    ).toEqual([{ text: 'Treatment plan update: 9/4: awaiting review', eventDate: '2026-09-04' }]);
  });
  it('preserves non-marker prefixes, valid empty notes, timestamp fallback and cutoff exclusion', () => {
    expect(
      datedTaskLines(
        { Description: 'Context: 9/4: provider confirmed', CreatedDate: '2026-09-01' },
        asOf
      )
    ).toEqual([{ text: 'Context: 9/4: provider confirmed', eventDate: '2026-09-01' }]);
    expect(
      datedTaskLines(
        { TaskDescription: 'Undated update', CreatedDate: '', LastModifiedDate: '2026-09-03' },
        asOf
      )[0]?.eventDate
    ).toBe('2026-09-03');
    expect(datedTaskLines({ Description: '', TaskDescription: 'Unused alias' }, asOf)).toEqual([]);
    expect(
      datedTaskLines({ Description: '9/12: future update', CreatedDate: '2026-09-01' }, asOf)
    ).toEqual([]);
    expect(
      datedTaskLines(
        { Description: 'Current', CreatedDate: 'invalid', LastModifiedDate: asOf },
        asOf
      )
    ).toEqual([]);
    expect(datedTaskLines({ Description: 'Current' }, asOf)[0]?.eventDate).toBe(asOf);
    expect(datedTaskLines({ Description: 'Current' }, 'invalid')).toEqual([]);
  });
  it('preserves occurrence-date year rollover and relative submission meaning', () => {
    expect(explicitTaskOccurrenceDate('Submitted on 9/4', asOf)).toBe('2026-09-04');
    expect(explicitTaskOccurrenceDate('Submitted on 12/30', asOf)).toBe('2025-12-30');
    expect(explicitTaskOccurrenceDate('Submitted yesterday', '2026-01-01T12:00:00Z')).toBe(
      '2025-12-31'
    );
    expect(explicitTaskOccurrenceDate('Submitted last night', asOf)).toBe('2026-09-10');
    expect(explicitTaskOccurrenceDate('Scheduled for 9/4', asOf)).toBeNull();
    expect(explicitTaskOccurrenceDate('Submitted on 9/4', 'invalid')).toBeNull();
  });
  it('retains bounded greedy date selection and the optional-on whitespace semantics', () => {
    expect(explicitTaskOccurrenceDate(`Submitted${' '.repeat(50)}on 9/4`, asOf)).toBe('2026-09-04');
    expect(explicitTaskOccurrenceDate(`Submitted${' '.repeat(51)}on 9/4`, asOf)).toBeNull();
    expect(explicitTaskOccurrenceDate('Submitted on\n9/4', asOf)).toBe('2026-09-04');
    expect(explicitTaskOccurrenceDate('Submitted\n9/4', asOf)).toBeNull();
    expect(explicitTaskOccurrenceDate('Submitted on 9/4 and 9/5', asOf)).toBe('2026-09-05');
    expect(explicitTaskOccurrenceDate('Submitted but no date\nSubmitted on 9/4', asOf)).toBe(
      '2026-09-04'
    );
  });
  it('scans long repeated-marker notes without extending prefix inspection or truncating the corpus', () => {
    const repeated = 'submitted '.repeat(12_000);
    expect(explicitTaskOccurrenceDate(`${repeated}no date`, asOf)).toBeNull();
    expect(explicitTaskOccurrenceDate(`${repeated}on 9/4`, asOf)).toBe('2026-09-04');
    expect(
      explicitTaskOccurrenceDate(`submitted${' '.repeat(49)}on${' '.repeat(100)}9/4`, asOf)
    ).toBe('2026-09-04');
  });
});
describe('existing administrative activity filters', () => {
  it('does not treat a template subject as an exclusion when the message reports a substantive reply', () => {
    expect(isAdministrativeEmail('Subject: Welcome to Headstart')).toBe(true);
    expect(
      isAdministrativeEmail(
        'Subject: Welcome to Headstart — family replied that the packet is missing'
      )
    ).toBe(false);
    expect(isAdministrativeEmail('See where you are in the process')).toBe(true);
    expect(isAdministrativeEmail()).toBe(false);
  });
  it('preserves update requests versus newly reported completion or scheduling', () => {
    expect(isAdministrativeTaskReminder('Get an update on when the plan will be submitted')).toBe(
      true
    );
    expect(isAdministrativeTaskReminder('Get an update on when the plan was submitted')).toBe(
      false
    );
    expect(isAdministrativeTaskReminder('As a reminder please complete the intake packet')).toBe(
      true
    );
    expect(
      isAdministrativeTaskReminder('As a reminder the appointment is scheduled for 9/15')
    ).toBe(false);
    expect(isAdministrativeTaskReminder()).toBe(false);
  });
});
