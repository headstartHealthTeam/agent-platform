import { describe, expect, it } from 'vitest';

import {
  normalizeReplayValue,
  prepareReplayMeeting,
  replayHasClientMention,
  replayMeetingRelationship,
  type ReplayIdentity,
} from './fireflies-replay-prefilter.js';
import { createReplayProgress, type ReplayProgressEvent } from './replay-progress.js';

const profile: ReplayIdentity = {
  opportunityId: 'synthetic-client',
  opportunityName: 'Synthetic Client',
  providerRoles: [
    {
      names: ['Synthetic Provider'],
      emails: ['provider@example.test'],
      practiceAliases: ['Synthetic Practice'],
    },
  ],
  currentCsm: { email: 'csm@example.test' },
  providerRoster: [{ opportunityName: 'Synthetic Client' }],
  searchWindow: { fromDate: '2026-01-01', toDate: '2026-01-10' },
};
const cutoff = '2026-01-10T12:00:00Z';
function meeting(
  text = 'Synthetic Client assessment is scheduled.',
  extra: Readonly<Record<string, unknown>> = {}
): ReturnType<typeof prepareReplayMeeting> {
  return prepareReplayMeeting({
    fullTranscript: text,
    title: 'Synthetic Practice meeting',
    date: '2026-01-05',
    organizerEmail: 'provider@example.test',
    ...extra,
  });
}
describe('original replay prefilter and safe progress telemetry', () => {
  it('normalizes and deduplicates only matching indexes while retaining the complete raw transcript', () => {
    const prepared = meeting('Sýnthetic Client Client assessment.', {
      meetingAttendees: [{ email: 'PROVIDER@example.test' }],
      participants: ['provider@example.test'],
    });
    expect(prepared['fullTranscript']).toBe('Sýnthetic Client Client assessment.');
    // The original deduplicates raw values before normalization, retaining case-distinct captures.
    expect(prepared._normalizedEmails).toEqual(['provider@example.test', 'provider@example.test']);
    expect(prepared._tokens).toEqual(['synthetic', 'client', 'assessment.']);
    expect(normalizeReplayValue(null)).toBe('');
    expect(normalizeReplayValue('  +Alias@Exámple.Test  ')).toBe('+alias@example.test');
  });
  it('selects provider before CSM and excludes outside-window or after-cutoff meetings without inferring relevance', () => {
    expect(replayMeetingRelationship(meeting(), profile, cutoff)).toBe('Provider');
    expect(
      replayMeetingRelationship(
        meeting('', { organizerEmail: 'other@example.test' }),
        profile,
        cutoff
      )
    ).toBe('Provider');
    expect(
      replayMeetingRelationship(
        meeting('', { organizerEmail: 'csm@example.test', title: 'Care coordination' }),
        profile,
        cutoff
      )
    ).toBe('CSM');
    expect(
      replayMeetingRelationship(
        meeting('', { organizerEmail: 'prior@example.test', title: '' }),
        { ...profile, priorCsms: [{ email: 'prior@example.test' }] },
        cutoff
      )
    ).toBe('CSM');
    for (const date of ['', '2025-12-31', '2026-01-11', '2026-01-10T12:00:01Z'])
      expect(replayMeetingRelationship(meeting('', { date }), profile, cutoff)).toBeNull();
    expect(
      replayMeetingRelationship(
        meeting('', { title: '', organizerEmail: 'other@example.test' }),
        profile,
        cutoff
      )
    ).toBeNull();
    expect(
      replayMeetingRelationship(
        meeting(),
        { opportunityId: 'none', opportunityName: 'None' },
        cutoff
      )
    ).toBeNull();
  });
  it('retains full-name, provider-first-name and CSM-with-provider-context candidates for the downstream matcher', () => {
    expect(replayHasClientMention(meeting(), profile, 'CSM')).toBe(true);
    expect(replayHasClientMention(meeting('Synthetic assessment.'), profile, 'Provider')).toBe(
      true
    );
    expect(
      replayHasClientMention(
        meeting('Synthetic assessment with Synthetic Practice.'),
        profile,
        'CSM'
      )
    ).toBe(true);
    expect(replayHasClientMention(meeting('Synthetic assessment.'), profile, 'CSM')).toBe(false);
    expect(
      replayHasClientMention(
        meeting('Alias Person assessment.'),
        { ...profile, knownNameVariants: ['Alias Person'] },
        'CSM'
      )
    ).toBe(true);
  });
  it('preserves fuzzy thresholds and roster uniqueness without turning the prefilter into admission', () => {
    expect(
      replayHasClientMention(meeting('Synthetik Clienx assessment.'), profile, 'Provider')
    ).toBe(true);
    expect(replayHasClientMention(meeting('Synthetik appointment.'), profile, 'Provider')).toBe(
      true
    );
    expect(
      replayHasClientMention(
        meeting('Synthetik appointment.'),
        {
          ...profile,
          providerRoster: [
            { opportunityName: 'Synthetic Client' },
            { opportunityName: 'Synthetic Other' },
          ],
        },
        'Provider'
      )
    ).toBe(false);
    expect(
      replayHasClientMention(meeting('Synthetik Clienx with Synthetic Practice.'), profile, 'CSM')
    ).toBe(true);
    expect(replayHasClientMention(meeting('Synthetik Clienx appointment.'), profile, 'CSM')).toBe(
      false
    );
    expect(
      replayHasClientMention(meeting('Unrelated person appointment.'), profile, 'Provider')
    ).toBe(false);
    expect(
      replayHasClientMention(
        meeting('Synthetic appointment.'),
        { ...profile, opportunityName: 'Synthetix' },
        'Provider'
      )
    ).toBe(true);
    expect(
      replayHasClientMention(
        meeting('Ab appointment.'),
        { ...profile, opportunityName: 'Ac' },
        'Provider'
      )
    ).toBe(false);
    expect(
      replayHasClientMention(
        meeting('Synthetic Longsurnaxe appointment.'),
        { ...profile, opportunityName: 'Synthetiz Longsurname', providerRoster: [] },
        'Provider'
      )
    ).toBe(true);
  });
  it('emits bounded counts only on interval/phase changes and records original timing', () => {
    let time = 0;
    const events: ReplayProgressEvent[] = [];
    const progress = createReplayProgress({
      now: () => new Date(cutoff),
      monotonic: () => time,
      emit: (event) => {
        events.push(event);
      },
      intervalMs: 5000,
    });
    progress.progress();
    expect(events).toHaveLength(1);
    time = 100;
    progress.progress({ nextPhase: 'matching', totalRows: 2, transcripts: 3 });
    time = 200;
    progress.progress({ completedRows: 1 });
    expect(events).toHaveLength(2);
    time = 5100;
    progress.progress({ completedRows: 1 });
    time = 5200;
    expect(progress.finish({ completedRows: 2 })).toEqual({
      startedAt: cutoff.replace('Z', '.000Z'),
      completedAt: cutoff.replace('Z', '.000Z'),
      elapsedMs: 5200,
      phaseDurationsMs: { 'waiting-for-run-lock': 100, matching: 5100 },
    });
    expect(events.map((event) => event.phase)).toEqual([
      'waiting-for-run-lock',
      'matching',
      'matching',
      'complete',
    ]);
    expect(Object.keys(events[0] ?? {})).toEqual([
      'event',
      'phase',
      'startedAt',
      'elapsedMs',
      'completedRows',
      'totalRows',
      'transcripts',
    ]);
  });
});
