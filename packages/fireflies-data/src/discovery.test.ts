import { describe, expect, it } from 'vitest';

import {
  completeFirefliesDiscoveryPages,
  normalizeFirefliesDiscoveryIdentities,
} from './discovery.js';

const window = { fromDate: '2026-09-01', toDate: '2026-09-11T17:31:07Z', limit: 2 };
const meeting = {
  transcriptId: 'synthetic-transcript',
  title: 'Synthetic business meeting',
  date: '2026-09-10',
  organizerEmail: '',
  participants: ['operator@example.test'],
  meetingAttendees: [{ email: 'operator@example.test', displayName: 'Synthetic operator' }],
  isLive: false,
};
const page = { status: 'Complete', offset: 0, nextOffset: null, meetings: [meeting] };

describe('provider-owned discovery contracts', () => {
  it('normalizes optional identity omissions without altering raw evidence or other fields', () => {
    const raw = {
      pages: [
        {
          ...page,
          extra: 'page',
          meetings: [
            {
              ...meeting,
              participants: [null, 'operator@example.test'],
              meetingAttendees: [
                { email: 'operator@example.test' },
                { email: 'second@example.test', displayName: null },
                { email: 'third@example.test', displayName: 'Known' },
              ],
              summary_status: 'skipped',
            },
          ],
        },
      ],
      callerReceipt: 'retained',
    };
    const before = structuredClone(raw);
    const result = normalizeFirefliesDiscoveryIdentities(raw);
    expect(raw).toEqual(before);
    expect(result.counts).toEqual({
      meetings: 1,
      nullParticipantsRemoved: 1,
      optionalDisplayNamesDefaulted: 2,
    });
    expect(result.discovery).toMatchObject({
      callerReceipt: 'retained',
      pages: [
        {
          extra: 'page',
          meetings: [
            {
              summary_status: 'skipped',
              isLive: false,
              participants: ['operator@example.test'],
              meetingAttendees: [
                { email: 'operator@example.test', displayName: '' },
                { email: 'second@example.test', displayName: '' },
                { email: 'third@example.test', displayName: 'Known' },
              ],
            },
          ],
        },
      ],
    });
    expect(normalizeFirefliesDiscoveryIdentities({ pages: [] }).counts.meetings).toBe(0);
  });

  it('rejects unknown identity shapes rather than dropping them', () => {
    for (const extra of [
      { participants: [{}] },
      { participants: ['not an email'] },
      { participants: null },
      { organizerEmail: 'invalid' },
      { meetingAttendees: [null] },
      { meetingAttendees: [{ email: 'invalid' }] },
      { meetingAttendees: [{ email: 'operator@example.test', displayName: {} }] },
    ]) {
      expect(() =>
        normalizeFirefliesDiscoveryIdentities({ pages: [{ meetings: [{ ...meeting, ...extra }] }] })
      ).toThrow('INVALID_DISCOVERY_IDENTITY');
    }
    expect(() => normalizeFirefliesDiscoveryIdentities({})).toThrow('INVALID_DISCOVERY_IDENTITY');
  });
  it('sanitizes cloning and getter failures without exposing raw diagnostics', () => {
    const marker = 'SYNTHETIC_PRIVATE_MARKER';
    const uncloneable = {
      pages: [],
      extra: function diagnostic(): string {
        return 'SYNTHETIC_PRIVATE_MARKER';
      },
    };
    const getter = {
      pages: [],
      get extra(): string {
        throw new Error(marker);
      },
    };
    for (const input of [uncloneable, getter]) {
      expect(() => normalizeFirefliesDiscoveryIdentities(input)).toThrow(
        'INVALID_DISCOVERY_IDENTITY'
      );
      expect(() => normalizeFirefliesDiscoveryIdentities(input)).not.toThrow(marker);
    }
    const hostilePage = [
      {
        ...page,
        get meetings(): readonly unknown[] {
          throw new Error(marker);
        },
      },
    ];
    expect(() => completeFirefliesDiscoveryPages(hostilePage, window)).toThrow(
      'INCOMPLETE_DISCOVERY'
    );
    expect(() => completeFirefliesDiscoveryPages(hostilePage, window)).not.toThrow(marker);
  });

  it('accepts explicit empty, complete offset chains and identical duplicates', () => {
    expect(completeFirefliesDiscoveryPages([{ ...page, meetings: [] }], window)).toEqual([]);
    const pages = [
      { ...page, meetings: [meeting, meeting], nextOffset: 2 },
      { ...page, offset: 2, meetings: [] },
    ];
    expect(completeFirefliesDiscoveryPages(pages, window)).toEqual([
      { ...meeting, date: '2026-09-10T00:00:00.000Z' },
    ]);
    expect(completeFirefliesDiscoveryPages([page], window)).toHaveLength(1);
  });

  it('requires every page and does not repair an incomplete chain', () => {
    for (const pages of [
      [],
      [{ ...page, status: 'Blocked' }],
      [{ ...page, offset: 2 }],
      [{ ...page, meetings: [meeting, meeting] }],
      [{ ...page, nextOffset: 2 }],
      [{ ...page, meetings: [meeting, meeting, meeting] }],
      [page, { ...page, offset: 2, meetings: [] }],
      [
        { ...page, meetings: [meeting, meeting], nextOffset: 3 },
        { ...page, offset: 2, meetings: [] },
      ],
    ]) {
      expect(() => completeFirefliesDiscoveryPages(pages, window)).toThrow('INCOMPLETE_DISCOVERY');
    }
    expect(() => completeFirefliesDiscoveryPages([page], { ...window, limit: 0 })).toThrow(
      'INCOMPLETE_DISCOVERY'
    );
    expect(() => completeFirefliesDiscoveryPages([page], { ...window, fromDate: 'bad' })).toThrow(
      'INCOMPLETE_DISCOVERY'
    );
  });
  it('rejects reversed query windows even for empty results, but permits equal inclusive bounds', () => {
    const empty = [{ ...page, meetings: [] }];
    expect(() =>
      completeFirefliesDiscoveryPages(empty, {
        ...window,
        fromDate: '2026-09-12',
        toDate: '2026-09-11',
      })
    ).toThrow('INCOMPLETE_DISCOVERY');
    const equal = { ...window, fromDate: '2026-09-10', toDate: '2026-09-10' };
    expect(completeFirefliesDiscoveryPages(empty, equal)).toEqual([]);
    expect(completeFirefliesDiscoveryPages([page], equal)).toHaveLength(1);
  });

  it('requires metadata, query-window membership and consistent duplicate identities', () => {
    for (const extra of [
      { date: '2026-08-01' },
      { date: '2026-09-12' },
      { isLive: undefined },
      { date: 'bad' },
    ]) {
      expect(() =>
        completeFirefliesDiscoveryPages([{ ...page, meetings: [{ ...meeting, ...extra }] }], window)
      ).toThrow('INVALID_DISCOVERY_METADATA');
    }
    const pages = [
      { ...page, meetings: [meeting, { ...meeting, title: 'Conflicting title' }], nextOffset: 2 },
      { ...page, offset: 2, meetings: [] },
    ];
    expect(() => completeFirefliesDiscoveryPages(pages, window)).toThrow(
      'INVALID_DISCOVERY_METADATA'
    );
  });
});
