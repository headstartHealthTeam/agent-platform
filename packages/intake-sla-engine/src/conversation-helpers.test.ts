import { describe, expect, it } from 'vitest';

import { dateFromRelativeWord, explicitConversationDate } from './conversation-dates.js';
import { parseConversationSentences, readableConversationList } from './conversation-sentences.js';
import { cleanDenialReason, extractDenialReason } from './denial-reason.js';

const eventDate = '2026-09-23T17:00:00Z';
describe('approved sentence parsing', () => {
  it('preserves line priority, raw text, speaker segments and original sentence IDs', () => {
    expect(parseConversationSentences(' [A] First. Second.\r\n\n [B] Third. ')).toEqual([
      { id: 0, text: 'First. Second.', raw: '[A] First. Second.' },
      { id: 1, text: 'Third.', raw: '[B] Third.' },
    ]);
    expect(parseConversationSentences('[A] First. [B] Second.')).toEqual([
      { id: 0, text: 'First.', raw: '[A] First.' },
      { id: 1, text: 'Second.', raw: '[B] Second.' },
    ]);
    expect(parseConversationSentences('One. Two? lower case. 3rd')).toEqual([
      { id: 0, text: 'One.', raw: 'One.' },
      { id: 1, text: 'Two? lower case.', raw: 'Two? lower case.' },
      { id: 2, text: '3rd', raw: '3rd' },
    ]);
    expect(parseConversationSentences()).toEqual([]);
    expect(parseConversationSentences(null)).toEqual([{ id: 0, text: 'null', raw: 'null' }]);
    expect(parseConversationSentences('<p></p>\n<A>')).toEqual([
      { id: 0, text: '', raw: '<p></p>' },
      { id: 1, text: '', raw: '<A>' },
    ]);
  });
  it('keeps the original list punctuation', () => {
    expect(readableConversationList()).toBe('');
    expect(readableConversationList(['one'])).toBe('one');
    expect(readableConversationList(['one', 'two'])).toBe('one and two');
    expect(readableConversationList(['one', 'two', 'three'])).toBe('one, two, and three');
  });
});
describe('approved conversation dates', () => {
  it.each([
    ['today', '2026-09-23'],
    ['tomorrow', '2026-09-24'],
    ['next week', '2026-09-30'],
    ['wednesday', '2026-09-23'],
    ['Monday', '2026-09-28'],
    ['unknown', null],
  ])('retains relative %s', (word, expected) => {
    expect(dateFromRelativeWord(word, eventDate)).toBe(expected);
  });
  it('keeps invalid relative dates empty and does not invent a reference date', () => {
    expect(dateFromRelativeWord('today', 'invalid')).toBeNull();
    expect(explicitConversationDate('Tomorrow', 'invalid')).toBeNull();
    expect(explicitConversationDate('9/2', 'invalid')).toBe('NaN-09-02');
  });
  it.each([
    ['9/1 update, first day is 9/28', '2026-09-28'],
    ['9/1: check tomorrow', '2026-09-24'],
    ['Authorization update: 9/1 - check on 9/28/27', '2027-09-28'],
    ['Treatment plan update: 9/1: submitted 9/2/2025', '2025-09-02'],
    ['Staffing and scheduling update: 9/1: check Friday', '2026-09-25'],
    ['Initial-assessment update: 9/1: by the 29th', '2026-09-29'],
    ['September 28th', '2026-09-28'],
    ['Sep 28', '2026-09-28'],
    ['on 2nd', '2026-09-02'],
    ['through\tthe\t30th', '2026-09-30'],
    ['by the30th', null],
    ['Not a date', null],
    ['2/31', '2026-02-31'],
    ['first day 9/2 and 9/3', '2026-09-03'],
  ])('preserves date precedence and formatting: %s', (text, expected) => {
    expect(explicitConversationDate(text, eventDate)).toBe(expected);
  });
});
describe('approved denial reasons', () => {
  it.each([
    [
      'ABLLS-R graph missing and overlapping authorization',
      'the ABLLS-R graph is missing and a prior provider has an overlapping authorization',
    ],
    [
      'behavior reduction baseline assessment',
      'the behavior-reduction baselines and measurement definitions must be corrected to match the assessment',
    ],
    [
      'BIP replacement behavior',
      'the behavior plan needs function-matched replacement behaviors and goals aligned with the assessment',
    ],
    [
      'treatment plan goals clear criteria',
      'the treatment-plan goals must be function-specific, measurable, and aligned with the assessment, with a defined transition plan',
    ],
    [
      'overlap with another provider',
      'the payer shows overlapping or duplicate services with another provider',
    ],
    ['out of network', 'the provider is out of network'],
    ['coordination of benefits', 'coordination of benefits or payer order must be corrected'],
    ['medical necessity', 'the payer says medical-necessity criteria were not met'],
    ['current diagnostic report', 'a current diagnostic evaluation or report is required'],
    [
      'missing clinical documentation',
      'the payer says required clinical documentation is missing or insufficient',
    ],
    ['signature missing', 'a required signature is missing or invalid'],
    [
      'electronic signature not verifiable',
      'the psychological evaluation requires a verifiable clinician signature',
    ],
    [
      'service order wrong provider type',
      'the service order must be signed by an eligible provider type',
    ],
    [
      'no clinician observation',
      'the diagnostic evaluation lacks a required clinician-observation measure',
    ],
    [
      'ABLLS-R grid',
      'the payer requires the ABLLS-R grid with the assessment date in the required format',
    ],
    [
      'school enrollment',
      "the payer requires documentation of the child's educational enrollment or applicable exception",
    ],
    [
      'member name does not match',
      'the client name on the submitted documentation does not match the payer record',
    ],
    [
      'missing assessment tools diagnostic',
      'the diagnostic evaluation is missing required assessment tools',
    ],
    [
      'target behavior operational definitions onset offset',
      'the payer requires measurable operational definitions with onset and offset criteria for each target behavior',
    ],
    [
      'behavioral skills assessment outdated',
      'the behavioral skills assessment is outdated and must be refreshed',
    ],
    ['ADOS-2', 'the diagnostic evaluation lacks a validated autism-specific assessment tool'],
  ])('preserves the ordered denial mapping: %s', (reason, expected) => {
    expect(extractDenialReason(`Denied because ${reason}`)).toBe(expected);
    expect(extractDenialReason(`Withdrawn because ${reason}`)).toBe(expected);
  });
  it('requires denial context and retains the requested-information fallback and explicit reason cleanup', () => {
    expect(extractDenialReason('Missing clinical documentation')).toBeNull();
    expect(extractDenialReason('Withdrawn for administrative tracking')).toBeNull();
    expect(extractDenialReason('Denied. Provider action required: BASC')).toBe(
      'the payer requires the BASC assessment'
    );
    expect(extractDenialReason('Denied because the benefit was exhausted; appeal tomorrow')).toBe(
      'the benefit was exhausted'
    );
    expect(extractDenialReason('Reason for the denial: the benefit was exhausted.')).toBe(
      'the benefit was exhausted'
    );
    expect(extractDenialReason('Denied for unclear')).toBeNull();
    expect(extractDenialReason('Denied for other')).toBeNull();
    expect(extractDenialReason('Denied for provider action required')).toBeNull();
    expect(extractDenialReason('Denied')).toBeNull();
    expect(extractDenialReason()).toBeNull();
    expect(
      cleanDenialReason(
        'Explanation: provider action required ABA provider does not meet policy guidelines Thank you for submitting, the payer said that it was denied; appeal'
      )
    ).toBe('denied');
    expect(cleanDenialReason('A reason. Current status: pending')).toBe('A reason.');
    expect(cleanDenialReason()).toBe('');
  });
});
