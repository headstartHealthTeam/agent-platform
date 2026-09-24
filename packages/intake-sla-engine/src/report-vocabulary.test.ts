import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  REPORT_EVIDENCE_HEADERS,
  REPORT_HISTORY_HEADERS,
  REPORT_HOLD_HEADERS,
  REPORT_HOLD_INSERT_INDEX,
  REPORT_QUEUE_HEADERS,
  reportDataDictionary,
  reportHeaderNotes,
} from './report-vocabulary.js';

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
describe('approved report vocabulary', () => {
  it('retains exact merged-source column order and hold insertion', () => {
    const headers = [
      REPORT_QUEUE_HEADERS,
      REPORT_HOLD_HEADERS,
      REPORT_EVIDENCE_HEADERS,
      REPORT_HISTORY_HEADERS,
    ];
    expect(headers.map((row) => row.length)).toEqual([37, 41, 38, 12]);
    // These digests were independently extracted from approved main 15b66ac, not this implementation.
    expect(digest(headers)).toBe(
      'c91d099652461e2ec95ad3a7942371ccb04fdebd76f3e04b8fc559f92bbae775'
    );
    expect(REPORT_HOLD_HEADERS.at(REPORT_HOLD_INSERT_INDEX - 1)).toBe('Needs CSM Review');
    expect(REPORT_HOLD_HEADERS.at(REPORT_HOLD_INSERT_INDEX)).toBe('On Hold Reason');
  });
  it('retains every header note and all eighty data-dictionary rows', () => {
    const dictionary = reportDataDictionary();
    expect(dictionary).toHaveLength(80);
    expect(digest(dictionary)).toBe(
      '91bcd9e3da33c1933191c5f836eb4c6f984c91db3a1b4bb37c005454659941e0'
    );
    expect(digest(reportHeaderNotes())).toBe(
      '33f69c8345278c37e5751997a1b96e55e04e0ec6ece7928e9c662cbec53f380a'
    );
    expect(
      Object.values(reportHeaderNotes()).every((notes) => notes.every((note) => note.length > 0))
    ).toBe(true);
  });
});
