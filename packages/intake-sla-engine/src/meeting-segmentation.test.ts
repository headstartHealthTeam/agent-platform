import { afterEach, describe, expect, it, vi } from 'vitest';

import { conversationInStoryWindow } from './conversation-anchors.js';
import { buildIdentityProfile } from './identity-profile.js';
import type { MeetingSegmentationInput, MeetingSegmentProfile } from './meeting-segment-types.js';
import { discoverFirefliesMeeting, segmentFirefliesMeeting } from './meeting-segmentation.js';

const profile: MeetingSegmentProfile = {
  opportunityId: 'p1',
  opportunityName: 'Synthetic Client',
  stage: 'IA Scheduled',
  practice: 'Sample Practice',
  providers: [{ name: 'Provider Example', email: 'provider@example.test' }],
  asOf: '2026-01-05',
  stageEntryDate: '2025-12-01',
};
const competitor: MeetingSegmentProfile = {
  opportunityId: 'p2',
  opportunityName: 'Another Person',
  practice: 'Sample Practice',
};
function input(
  text: string,
  extra: Partial<MeetingSegmentationInput> = {}
): MeetingSegmentationInput {
  return {
    profile,
    competingProfiles: [competitor],
    meeting: {
      id: 'm1',
      title: 'Provider Example Review',
      date: '2026-01-01',
      fullTranscript: text,
    },
    ...extra,
  };
}
afterEach(() => vi.useRealTimers());

describe('approved Fireflies transcript selection', () => {
  it('retains direct text, raw text and scoring metadata', () => {
    const text = '[0:01] Synthetic Client assessment scheduled.';
    const result = discoverFirefliesMeeting(input(text));
    expect(result.segments).toEqual([
      {
        start: 0,
        end: 1,
        quality: 'Direct',
        assumedIdentityMatch: false,
        collectiveRosterMatch: false,
        assumedIdentityNote: '',
        matchedAs: 'synthetic client',
        matchScore: 90,
        text: 'Synthetic Client assessment scheduled.',
        rawText: text,
      },
    ]);
    expect(result.matches).toMatchObject([
      { sourceRecordId: 'm1', anchorIndex: 0, quality: 'Direct', score: 90 },
    ]);
    expect(result.providerAnchored).toBe(true);
    expect(result.sentencesScanned).toBe(1);
    expect(segmentFirefliesMeeting(input(text))).toEqual(result.segments);
  });
  it('retains a unique first-name assumption without claiming direct identity', () => {
    expect(
      discoverFirefliesMeeting(input('Synthetic will schedule the assessment.')).segments
    ).toMatchObject([
      {
        quality: 'Likely',
        assumedIdentityMatch: true,
        matchedAs: 'synthetic',
        matchScore: 75,
        assumedIdentityNote:
          'Assumed Synthetic Client from a unique provider-roster match (synthetic).',
      },
    ]);
    const result = discoverFirefliesMeeting(
      input('Synthetic will schedule the assessment.', {
        competingProfiles: [{ ...competitor, opportunityName: 'Synthetic Other' }],
      })
    );
    expect(result.segments).toEqual([]);
    expect(result.matches).toEqual([]);
  });
  it('does not interpret a meeting index as an update about every named client', () => {
    expect(
      discoverFirefliesMeeting(input('Synthetic Client and Another Person.\nNice weather today.'))
        .segments
    ).toEqual([]);
    expect(
      discoverFirefliesMeeting(
        input(
          'Synthetic Client and Another Person.\nBoth remain on hold pending insurance authorization.'
        )
      ).segments
    ).toMatchObject([
      { start: 0, end: 2, quality: 'Direct', collectiveRosterMatch: true, matchScore: 100 },
    ]);
  });
  it('stops a target window at the next client and preserves raw line breaks', () => {
    const text =
      'Another Person has a denial.\nSynthetic Client assessment scheduled.\nAdditional details.\nAnother Person has a new update.';
    expect(segmentFirefliesMeeting(input(text))).toMatchObject([
      {
        start: 1,
        end: 3,
        text: 'Synthetic Client assessment scheduled. Additional details.',
        rawText: 'Synthetic Client assessment scheduled.\nAdditional details.',
      },
    ]);
  });
  it('merges overlapping windows and retains separated windows', () => {
    const discussion = Array.from({ length: 55 }, () => 'Ordinary discussion.');
    const text = [
      'Synthetic Client assessment scheduled.',
      ...discussion,
      'Synthetic Client assessment scheduled.',
    ].join('\n');
    const result = discoverFirefliesMeeting(input(text));
    expect(result.segments.map(({ start, end, quality }) => ({ start, end, quality }))).toEqual([
      { start: 0, end: 13, quality: 'Direct' },
      { start: 40, end: 57, quality: 'Direct' },
    ]);
    expect(result.rejectedMatches.length).toBeGreaterThan(0);
    expect(discoverFirefliesMeeting(input(text, { radius: 0 })).segments).toHaveLength(2);
  });
  it('retains metadata fallback anchoring and normalized full-name variants', () => {
    for (const name of ['Synthetic Client', 'Client Synthetic', 'Synthetic C']) {
      expect(segmentFirefliesMeeting(input(`${name} assessment scheduled.`))).toHaveLength(1);
    }
    for (const name of ['S Client', 'SyntheticClient']) {
      const result = discoverFirefliesMeeting(input(`${name} assessment scheduled.`));
      expect(result.segments).toEqual([]);
      expect(result.weakMatches).toMatchObject([{ quality: 'Weak' }]);
    }
    const variantProfile = {
      ...profile,
      opportunityName: 'Anne-Marie Élan',
      clientAliases: ['Alias Person'],
    };
    for (const text of [
      'Anne Marie Elan assessment scheduled.',
      'Alias Person assessment scheduled.',
    ]) {
      expect(segmentFirefliesMeeting(input(text, { profile: variantProfile }))).toHaveLength(1);
    }
    const result = discoverFirefliesMeeting(
      input('Synthetic assessment scheduled.', {
        meeting: {
          title: 'Prov discussion',
          fullTranscript: 'Synthetic assessment scheduled.',
          date: '2026-01-01',
        },
      })
    );
    expect(result.providerAnchored).toBe(true);
    expect(result.segments).toHaveLength(1);
  });
  it('keeps weak and rejected matches without manufacturing evidence segments', () => {
    const result = discoverFirefliesMeeting(
      input('Synthetic Client assessment scheduled.', {
        profile: { ...profile, providers: [], practice: null },
        meeting: {
          title: 'Unrelated',
          fullTranscript: 'Synthetic Client assessment scheduled.',
          date: '2026-01-01',
        },
      })
    );
    expect(result.providerAnchored).toBe(false);
    expect(result.segments).toEqual([]);
    expect(result.weakMatches).toMatchObject([{ quality: 'Weak', score: 65 }]);
    expect(discoverFirefliesMeeting(input('Unrelated conversation.')).rejectedMatches).toHaveLength(
      1
    );
  });
  it('honors transcript fallback precedence, including an explicitly empty transcript', () => {
    const text = 'Synthetic Client assessment scheduled.';
    for (const meeting of [
      { transcript: text },
      { transcriptText: text },
      { transcriptSnippet: text },
      { fullTranscript: null, transcript: text },
    ]) {
      expect(
        discoverFirefliesMeeting(
          input('', { meeting: { ...meeting, title: 'Provider Example Review' } })
        ).sentencesScanned
      ).toBe(1);
    }
    expect(
      discoverFirefliesMeeting(input('', { meeting: { fullTranscript: '', transcript: text } }))
        .sentencesScanned
    ).toBe(0);
    expect(discoverFirefliesMeeting({ profile }).segments).toEqual([]);
    expect(discoverFirefliesMeeting({ profile, meeting: null }).sentencesScanned).toBe(0);
  });
  it('composes canonical identity profiles and provider clusters without adding a new shape gate', () => {
    const canonical = buildIdentityProfile({
      opportunityId: 'p1',
      opportunityName: 'Synthetic Client',
      providers: [{ name: 'Provider Example', email: 'provider@example.test' }],
    });
    const result = discoverFirefliesMeeting(
      input('Synthetic Client assessment scheduled.', { profile: canonical })
    );
    expect(result.providerAnchored).toBe(true);
    expect(result.segments).toHaveLength(1);
  });
  it('retains Date-object, numeric and date-only scoring inputs', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-05T12:00:00Z'));
    for (const eventDate of ['2026-01-01', new Date('2026-01-01'), Date.UTC(2026, 0, 1)]) {
      expect(
        conversationInStoryWindow(eventDate, new Date('2025-12-01'), new Date('2026-01-05'))
      ).toBe(true);
    }
    expect(conversationInStoryWindow('2026-01-05T23:00:00Z', null, '2026-01-05')).toBe(true);
    expect(conversationInStoryWindow('2026-01-05T23:00:00Z', null, new Date('2026-01-05'))).toBe(
      false
    );
    for (const empty of [undefined, null, '', 0, Number.NaN])
      expect(conversationInStoryWindow(empty, null, null)).toBe(true);
    expect(conversationInStoryWindow('invalid', undefined, undefined)).toBe(false);
    expect(conversationInStoryWindow('2026-01-01', 'invalid', undefined)).toBe(true);
    expect(conversationInStoryWindow('2026-01-01', null, new Date('invalid'))).toBe(false);
  });
});
