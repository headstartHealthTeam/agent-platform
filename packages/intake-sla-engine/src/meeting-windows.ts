import type { ConversationSentence } from './conversation-sentences.js';
import { containsMeetingRosterIdentity, meetingTopicBoundary } from './meeting-identity.js';
import type {
  FirefliesMeetingSegment,
  MeetingAnchor,
  MeetingSegmentProfile,
  MeetingWindowContext,
} from './meeting-segment-types.js';

function sentenceAt(sentences: readonly ConversationSentence[], index: number): string {
  return sentences.at(index)?.text ?? '';
}
export function boundedMeetingWindow(
  context: MeetingWindowContext,
  anchor: number,
  bounds: { start: number; end: number }
): { start: number; end: number } {
  let { start, end } = bounds;
  const { sentences, profile, competingProfiles } = context;
  for (let index = anchor - 1; index >= start; index -= 1) {
    if (meetingTopicBoundary(sentenceAt(sentences, index), profile, competingProfiles)) {
      start = index + 1;
      break;
    }
  }
  for (let index = anchor + 1; index < end; index += 1) {
    if (meetingTopicBoundary(sentenceAt(sentences, index), profile, competingProfiles)) {
      end = index;
      break;
    }
  }
  return { start, end };
}
export function meetingWindowText(
  sentences: readonly ConversationSentence[],
  start: number,
  end: number
): Pick<FirefliesMeetingSegment, 'text' | 'rawText'> {
  const selected = sentences.slice(start, end);
  return {
    text: selected.map((sentence) => sentence.text).join(' '),
    rawText: selected.map((sentence) => sentence.raw).join('\n'),
  };
}
export function meetingScoringContext(context: MeetingWindowContext, anchor: number): string {
  const { start, end } = boundedMeetingWindow(context, anchor, {
    start: Math.max(0, anchor - 2),
    end: Math.min(context.sentences.length, anchor + 7),
  });
  return meetingWindowText(context.sentences, start, end).text;
}
export function collectiveMeetingContext(
  sentences: readonly ConversationSentence[],
  anchor: number,
  roster: readonly MeetingSegmentProfile[]
): string | null {
  const anchorText = sentenceAt(sentences, anchor);
  if (
    roster.filter((candidate) => containsMeetingRosterIdentity(anchorText, candidate, roster))
      .length < 2
  )
    return null;
  const text = meetingWindowText(sentences, anchor, Math.min(sentences.length, anchor + 24)).text;
  const collective =
    /\b(?:both|those|these|them|their|kids|children|clients|cases|siblings)\b/i.test(text);
  const operational =
    /\b(?:appeal|authorization|deni(?:ed|al)|hearing|hold|pause|coverage|medicaid|insurance|assessment|schedule|reschedul|treatment|start|staff|rbt|plan)\b/i.test(
      text
    );
  return collective && operational ? text : null;
}
function anchorSegment(
  context: MeetingWindowContext,
  anchor: MeetingAnchor,
  radius: number
): FirefliesMeetingSegment {
  const segmentRadius = anchor.radius ?? radius;
  const bounds = {
    start: anchor.collectiveRosterMatch ? anchor.index : Math.max(0, anchor.index - segmentRadius),
    end: Math.min(context.sentences.length, anchor.index + segmentRadius + 1),
  };
  const { start, end } = anchor.collectiveRosterMatch
    ? bounds
    : boundedMeetingWindow(context, anchor.index, bounds);
  return {
    start,
    end,
    quality: anchor.quality,
    assumedIdentityMatch: Boolean(anchor.assumedIdentityMatch),
    collectiveRosterMatch: Boolean(anchor.collectiveRosterMatch),
    assumedIdentityNote: anchor.assumedIdentityNote ?? '',
    matchedAs: anchor.matchedAs ?? '',
    matchScore: anchor.matchScore ?? null,
    ...meetingWindowText(context.sentences, start, end),
  };
}
export function buildMeetingSegments(
  context: MeetingWindowContext,
  anchors: readonly MeetingAnchor[],
  radius: number
): FirefliesMeetingSegment[] {
  const segments = anchors
    .map((anchor) => anchorSegment(context, anchor, radius))
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const deduped: FirefliesMeetingSegment[] = [];
  for (const segment of segments) {
    const previous = deduped.at(-1);
    if (!previous || segment.start > previous.end) {
      deduped.push({ ...segment });
      continue;
    }
    previous.end = Math.max(previous.end, segment.end);
    previous.quality =
      previous.quality === 'Direct' || segment.quality === 'Direct' ? 'Direct' : 'Likely';
    previous.assumedIdentityMatch =
      previous.quality !== 'Direct' &&
      (previous.assumedIdentityMatch || segment.assumedIdentityMatch);
    previous.assumedIdentityNote ||= segment.assumedIdentityNote;
    previous.matchedAs ||= segment.matchedAs;
    previous.matchScore = Math.max(previous.matchScore ?? 0, segment.matchScore ?? 0);
    Object.assign(previous, meetingWindowText(context.sentences, previous.start, previous.end));
  }
  return deduped;
}
