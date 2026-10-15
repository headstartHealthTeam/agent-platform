import { describe, expect, it } from 'vitest';

import { isAdministrativeOnly } from './freshness-administrative.js';
import {
  extractLatestSubstantiveNote,
  isGeneratedSlaDraft,
  isSubstantiveHumanSlaNote,
  stripGeneratedSlaDraft,
} from './freshness-notes.js';
import { dateAnchoredSummary, parseFreshnessNoteDate } from './freshness-values.js';

const asOf = new Date('2026-09-24T22:00:00.000Z');
describe('approved freshness note semantics', () => {
  it.each([
    '',
    '9/4: Has the family responded?',
    'CSM meeting with provider on 9/4 for an update',
    'Update reqd',
    'Still no substantive update yet, CSM to follow up tomorrow',
    'No update',
    'No update provider followup',
    'Awaiting a CSM update',
    'Provider to follow up with the family for a start date by 9/20',
    'The provider will schedule next week',
    'CSM emailed the provider requesting a status update',
    'Email sent to provider requesting updates about the TP',
    'Has transitioned to Intake',
    'On the agenda to discuss with staff',
  ])('excludes only existing administrative patterns: %s', (note) => {
    expect(isAdministrativeOnly(note)).toBe(true);
    expect(isSubstantiveHumanSlaNote(note, asOf)).toBe(false);
  });
  it.each([
    '9/4: Has the family responded? Family signed the treatment plan.',
    '9/4 Family must complete the PDDBI before the payer can continue',
    'Provider confirmed the assessment appointment for 9/25',
    '9/4 Pending authorization',
  ])('retains substantive human progress and constraints: %s', (note) => {
    expect(isSubstantiveHumanSlaNote(note, asOf)).toBe(true);
  });
  it('keeps undated fallback metadata without synthesizing a note date', () => {
    expect(extractLatestSubstantiveNote('Family signed the plan', asOf, asOf)).toEqual({
      at: asOf,
      summary: 'Family signed the plan',
      explicitDate: false,
    });
    expect(extractLatestSubstantiveNote('Family signed the plan', asOf, asOf)?.at).toBe(asOf);
    expect(extractLatestSubstantiveNote('ordinary words', undefined, asOf)).toEqual({
      at: undefined,
      summary: 'ordinary words',
      explicitDate: false,
    });
    expect(isSubstantiveHumanSlaNote('ordinary words', asOf)).toBe(false);
    expect(extractLatestSubstantiveNote(null, asOf, asOf)).toBeNull();
  });
  it('selects the latest substantive dated segment, not a newer administrative request', () => {
    expect(
      extractLatestSubstantiveNote(
        '9/24: Update needed | 9/22: Family signed the plan | 9/20: Awaiting signatures',
        asOf,
        asOf
      )
    ).toEqual({
      at: '2026-09-22T12:00:00.000Z',
      summary: 'Family signed the plan |',
      explicitDate: true,
    });
    expect(
      extractLatestSubstantiveNote(
        '9/24: Update needed | 9/20: Has transitioned to Intake',
        asOf,
        asOf
      )
    ).toBeNull();
    expect(extractLatestSubstantiveNote('9/4 Pending authorization', asOf, asOf)?.at).toBe(
      '2026-09-04T12:00:00.000Z'
    );
  });
  it('preserves reference-year and UTC-noon parsing rather than introducing rollover rules', () => {
    expect(parseFreshnessNoteDate('12/31', '2026-01-01')).toBe('2026-12-31T12:00:00.000Z');
    expect(parseFreshnessNoteDate('9/4/26', asOf)).toBe('2026-09-04T12:00:00.000Z');
    expect(parseFreshnessNoteDate('9/4/1999', asOf)).toBe('1999-09-04T12:00:00.000Z');
    expect(parseFreshnessNoteDate('2/31/2026', asOf)).toBe('2026-03-03T12:00:00.000Z');
    expect(parseFreshnessNoteDate('9/4', 'invalid')).toBe('');
    expect(parseFreshnessNoteDate('invalid', asOf)).toBe('');
  });
  it('preserves one potentially human generator-like sentence but removes corroborated drafts', () => {
    const single = 'No substantive treatment-plan update was found.';
    expect(isGeneratedSlaDraft(single)).toBe(true);
    expect(stripGeneratedSlaDraft(single)).toBe(single);
    expect(stripGeneratedSlaDraft(`${single} Recommended owner action:Contact provider.`)).toBe('');
    expect(stripGeneratedSlaDraft(`Family signed the plan; ${single}`)).toBe(
      'Family signed the plan'
    );
    expect(stripGeneratedSlaDraft('Human note without a signature')).toBe(
      'Human note without a signature'
    );
  });
  it('retains timestamp versus midnight-UTC display meaning and avoids duplicate prefixes', () => {
    expect(dateAnchoredSummary('Update', '2026-09-20T00:00:00.000Z')).toBe('9/20: Update');
    expect(dateAnchoredSummary('Update', '2026-09-20T02:00:00Z')).toBe('9/19: Update');
    expect(dateAnchoredSummary('Update', '2026-09-20')).toBe('9/19: Update');
    expect(dateAnchoredSummary('As of 9/20, update', '2026-09-20T00:00:00Z')).toBe(
      'As of 9/20, update'
    );
    expect(dateAnchoredSummary('9/20 update', '2026-09-20T00:00:00Z')).toBe('9/20 update');
    expect(dateAnchoredSummary('9/20', '2026-09-20T00:00:00Z')).toBe('9/20: 9/20');
    expect(dateAnchoredSummary('Update', 'invalid')).toBe('Update');
    expect(dateAnchoredSummary('', asOf)).toBe('');
  });
});
