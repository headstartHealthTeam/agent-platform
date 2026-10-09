import { describe, expect, it } from 'vitest';

import {
  FirefliesBodyError,
  normalizeFirefliesConnectorBody,
  transcriptMetadata,
} from './transcript.js';

const expected = {
  transcriptId: 'synthetic-meeting',
  date: '2026-09-14T16:34:40.747Z',
  title: 'Synthetic meeting',
  organizerEmail: 'organizer@example.test',
  participants: ['provider@example.test'],
  meetingAttendees: [{ email: 'provider@example.test', displayName: 'Synthetic Provider' }],
  isLive: false,
};
const spoken = '[00:00 - 00:03] Synthetic Provider: A synthetic update.';
const text =
  'Id: synthetic-meeting\nDateString: 2026-09-14T16:34:40.000Z\nPrivacy: teammates\n' +
  `Speakers: Synthetic Provider\nSentences: ${spoken}\n` +
  'Title: Synthetic meeting\nOrganizer Email: organizer@example.test\nParticipants: provider@example.test\n' +
  'Date: 1789403700000\nMeeting Attendees: provider@example.test\nIs Live: false';
function capture(body = text): {
  retrievedAt: string;
  retrievalEndpoint: string;
  response: { content: { type: string; text: string }[] };
} {
  return {
    retrievedAt: '2026-09-14T17:01:00.000Z',
    retrievalEndpoint: 'fireflies_fetch',
    response: { content: [{ type: 'text', text: body }] },
  };
}

describe('native Fireflies transcript normalization', () => {
  it('matches source CRLF header handling while retaining exact transcript bytes', () => {
    const result = normalizeFirefliesConnectorBody({
      expected,
      capture: capture(text.replaceAll('\n', '\r\n')),
    });
    expect(result.record.fullTranscript).toBe(`${spoken}\r`);
    expect(result.provenance.timestampBinding).toBe('listing-milliseconds/body-whole-seconds');
  });
  it('preserves listing precision, exact body text and observed timestamp provenance', () => {
    const result = normalizeFirefliesConnectorBody({ expected, capture: capture() });
    expect(result.record).toEqual({
      ...expected,
      complete: true,
      fullTranscript: spoken,
      transcriptEmpty: false,
      retrievalEndpoint: 'fireflies_fetch',
      retrievedAt: '2026-09-14T17:01:00.000Z',
    });
    expect(result.provenance).toEqual({
      timestampBinding: 'listing-milliseconds/body-whole-seconds',
      bodyDateString: '2026-09-14T16:34:40.000Z',
      listingDateString: expected.date,
      sentenceStatus: 'transcript-text',
    });
    expect(
      normalizeFirefliesConnectorBody({
        expected,
        capture: capture(text.replace('40.000Z', '40.747Z')),
      }).provenance.timestampBinding
    ).toBe('exact');
    const noAttendees = text.replace(
      'Meeting Attendees: provider@example.test',
      'Meeting Attendees: No meeting attendees'
    );
    expect(
      normalizeFirefliesConnectorBody({
        expected: { ...expected, meetingAttendees: [] },
        capture: capture(noAttendees),
      }).record.meetingAttendees
    ).toEqual([]);
    expect(() =>
      normalizeFirefliesConnectorBody({ expected, capture: capture(noAttendees) })
    ).toThrow(FirefliesBodyError);
  });

  it.each([
    ['40.000Z', '41.000Z'],
    ['40.000Z', '39.999Z'],
    ['40.000Z', '40.746Z'],
    ['Id: synthetic-meeting', 'Id: wrong'],
    ['Title: Synthetic meeting', 'Title: Other'],
    ['Organizer Email: organizer@example.test', 'Organizer Email: other@example.test'],
    ['Participants: provider@example.test', 'Participants: other@example.test'],
    ['Meeting Attendees: provider@example.test', 'Meeting Attendees: other@example.test'],
    ['Is Live: false', 'Is Live: true'],
    ['Is Live: false', ''],
    ['Sentences: ', 'Missing: '],
    ['Id: synthetic-meeting', 'Id: synthetic-meeting\nId: synthetic-meeting'],
  ])('rejects changed or ambiguous native metadata (%s)', (from, to) => {
    expect(() =>
      normalizeFirefliesConnectorBody({ expected, capture: capture(text.replace(from, to)) })
    ).toThrow('FIREFLIES_CONNECTOR_BODY_INVALID');
  });

  it('rejects incomplete captures, invalid endpoints and timestamps without including raw data', () => {
    for (const value of [
      undefined,
      {},
      { ...capture(), retrievedAt: 'invalid' },
      { ...capture(), retrievalEndpoint: 'unapproved' },
      { ...capture(), response: { ...capture().response, truncated: true } },
      {
        ...capture(),
        response: { content: [...capture().response.content, { type: 'text', text }] },
      },
    ])
      expect(() => normalizeFirefliesConnectorBody({ expected, capture: value })).toThrow(
        FirefliesBodyError
      );
    expect(() =>
      normalizeFirefliesConnectorBody({
        expected,
        capture: { ...capture(), response: { isError: true } },
      })
    ).toThrow('FIREFLIES_READ_FAILED');
    expect(() =>
      normalizeFirefliesConnectorBody({
        expected: { ...expected, isLive: true },
        capture: capture(),
      })
    ).toThrow(FirefliesBodyError);
  });

  it('distinguishes explicit silence from spoken words', () => {
    const result = normalizeFirefliesConnectorBody({
      expected,
      capture: capture(text.replace(spoken, 'No sentences')),
    });
    expect(result.record.fullTranscript).toBe('');
    expect(result.record.transcriptEmpty).toBe(true);
    expect(result.provenance.sentenceStatus).toBe('explicit-empty');
    const actual = normalizeFirefliesConnectorBody({
      expected,
      capture: capture(text.replace('A synthetic update.', 'No sentences')),
    });
    expect(actual.record.transcriptEmpty).toBe(false);
    expect(actual.record.fullTranscript).toBe('[00:00 - 00:03] Synthetic Provider: No sentences');
  });

  it('normalizes listing metadata without changing its input or making workflow eligibility decisions', () => {
    const input = {
      ...expected,
      participants: ['z', 'a', 'a'],
      meetingAttendees: [
        { email: 'z', displayName: 'Z' },
        { email: 'a', displayName: 'Z' },
        { email: 'a', displayName: 'A' },
      ],
      isLive: true,
    };
    expect(transcriptMetadata(input)).toMatchObject({
      participants: ['a', 'z'],
      isLive: true,
      meetingAttendees: [
        { email: 'a', displayName: 'A' },
        { email: 'a', displayName: 'Z' },
        { email: 'z', displayName: 'Z' },
      ],
    });
    expect(input.participants).toEqual(['z', 'a', 'a']);
    expect(input.meetingAttendees[0]?.email).toBe('z');
    for (const value of [
      null,
      {},
      { ...expected, transcriptId: '' },
      { ...expected, date: 'invalid' },
      { ...expected, participants: [null] },
      { ...expected, meetingAttendees: [{ email: 'a' }] },
    ]) {
      expect(() => transcriptMetadata(value)).toThrow(FirefliesBodyError);
    }
  });
});
