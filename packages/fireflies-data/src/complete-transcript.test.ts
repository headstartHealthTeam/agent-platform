import { describe, expect, it } from 'vitest';

import { normalizeCompleteFirefliesTranscript } from './complete-transcript.js';
import { FirefliesBodyError } from './transcript.js';

const body = {
  transcriptId: 'synthetic',
  date: '2026-01-01',
  title: 'Synthetic support meeting',
  organizerEmail: 'operator@example.test',
  participants: ['b@example.test', 'a@example.test', 'b@example.test'],
  meetingAttendees: [
    { email: 'b@example.test', displayName: 'B' },
    { email: 'a@example.test', displayName: 'A' },
  ],
  isLive: false,
  complete: true,
  fullTranscript: '  Exact\ncontent.  ',
  transcriptEmpty: false,
  retrievalEndpoint: 'fireflies_fetch',
  retrievedAt: '2026-01-02',
};
describe('complete provider transcript', () => {
  it('canonicalizes metadata and retrieval time without modifying exact body content', () => {
    const input = structuredClone(body);
    const result = normalizeCompleteFirefliesTranscript(input);
    expect(result).toEqual({
      ...body,
      date: '2026-01-01T00:00:00.000Z',
      retrievedAt: '2026-01-02T00:00:00.000Z',
      participants: ['a@example.test', 'b@example.test'],
      meetingAttendees: [body.meetingAttendees[1], body.meetingAttendees[0]],
    });
    expect(input).toEqual(body);
    expect(
      normalizeCompleteFirefliesTranscript({
        ...body,
        transcriptEmpty: undefined,
        retrievalEndpoint: 'fireflies_get_transcript',
      }).transcriptEmpty
    ).toBe(false);
    expect(
      normalizeCompleteFirefliesTranscript({
        ...body,
        fullTranscript: ' \n ',
        transcriptEmpty: true,
      }).fullTranscript
    ).toBe(' \n ');
  });
  it('rejects missing, live, partial, ambiguous-empty and malformed provider content with constant diagnostics', () => {
    for (const patch of [
      { transcriptId: '' },
      { complete: false },
      { isLive: true },
      { date: 'bad' },
      { retrievedAt: 'bad' },
      { fullTranscript: '' },
      { fullTranscript: ' ', transcriptEmpty: false },
      { transcriptEmpty: true },
      { retrievalEndpoint: 'summary' },
      { participants: [null] },
    ]) {
      expect(() => normalizeCompleteFirefliesTranscript({ ...body, ...patch })).toThrow(
        FirefliesBodyError
      );
    }
    expect(() => normalizeCompleteFirefliesTranscript(null)).toThrow(FirefliesBodyError);
    let caught: unknown;
    try {
      normalizeCompleteFirefliesTranscript({
        get transcriptId(): never {
          throw new Error('SYNTHETIC_PRIVATE_MARKER');
        },
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(FirefliesBodyError);
    if (!(caught instanceof FirefliesBodyError)) throw new Error('Expected provider error');
    expect(caught.message).toBe('FIREFLIES_CONNECTOR_BODY_INVALID');
    expect(caught.cause).toBeUndefined();
    expect(caught.stack).not.toContain('SYNTHETIC_PRIVATE_MARKER');
  });
});
