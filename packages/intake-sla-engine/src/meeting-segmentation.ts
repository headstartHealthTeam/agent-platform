import type { ConversationMatch } from './conversation-match-types.js';
import { scoreConversationMatch } from './conversation-match.js';
import { parseConversationSentences } from './conversation-sentences.js';
import {
  competingMeetingFirstName,
  containsCompetingMeetingClient,
  containsMeetingRosterIdentity,
  meetingContainsFirstName,
  meetingContainsName,
  meetingFirstName,
  meetingHasProviderAnchor,
  meetingMetadata,
  meetingNameVariants,
  meetingRosterProfiles,
} from './meeting-identity.js';
import type {
  FirefliesMeetingDiscovery,
  FirefliesMeetingSegment,
  MeetingAnchor,
  MeetingMatchAssessment,
  MeetingSegmentationInput,
  MeetingSegmentProfile,
  MeetingWindowContext,
} from './meeting-segment-types.js';
import {
  buildMeetingSegments,
  collectiveMeetingContext,
  meetingScoringContext,
} from './meeting-windows.js';

interface DiscoveryState extends MeetingWindowContext {
  readonly input: MeetingSegmentationInput;
  readonly rosterProfiles: readonly MeetingSegmentProfile[];
  readonly providerAnchored: boolean;
  readonly firstIsAmbiguous: boolean;
  readonly variants: readonly string[];
  readonly targetFirst: string;
  readonly matches: MeetingMatchAssessment[];
}
function matchAt(state: DiscoveryState, index: number): ConversationMatch {
  const { input, profile, competingProfiles, providerAnchored } = state;
  const match = scoreConversationMatch({
    text: meetingScoringContext(state, index),
    metadata: meetingMetadata(input.meeting),
    targetProfile: profile,
    providerRoster: competingProfiles.length ? competingProfiles : (profile.providerRoster ?? []),
    providerRelationshipConfirmed: providerAnchored,
    eventDate: input.meeting?.date,
    storyStartDate: profile.storyStartDate ?? profile.stageEntryDate ?? profile.slaCreatedDate,
    asOf: profile.asOf,
  });
  state.matches.push({ ...match, sourceRecordId: input.meeting?.id ?? null, anchorIndex: index });
  return match;
}
function acceptedAnchor(match: ConversationMatch, index: number): MeetingAnchor | null {
  return match.quality === 'Direct' || match.quality === 'Likely'
    ? { index, quality: match.quality, matchedAs: match.matchedAs, matchScore: match.score }
    : null;
}
function anchorAt(state: DiscoveryState, text: string, index: number): MeetingAnchor | null {
  const { profile, competingProfiles, rosterProfiles, sentences } = state;
  const competing = containsCompetingMeetingClient(text, profile, competingProfiles);
  const collective = competing ? collectiveMeetingContext(sentences, index, rosterProfiles) : null;
  if (competing && !collective) return null;
  if (collective && containsMeetingRosterIdentity(text, profile, rosterProfiles)) {
    return {
      index,
      quality: 'Direct',
      matchedAs: profile.opportunityName,
      matchScore: 100,
      radius: 24,
      collectiveRosterMatch: true,
    };
  }
  const match = matchAt(state, index);
  const anchor = acceptedAnchor(match, index);
  if (meetingContainsName(text, state.variants)) return anchor;
  if (anchor) {
    return {
      ...anchor,
      assumedIdentityMatch: match.quality === 'Likely',
      assumedIdentityNote:
        match.quality === 'Likely'
          ? `Assumed ${String(profile.opportunityName)} from a unique provider-roster match (${match.matchedAs}).`
          : '',
    };
  }
  return state.providerAnchored &&
    !state.firstIsAmbiguous &&
    state.targetFirst.length >= 3 &&
    meetingContainsFirstName(text, state.targetFirst)
    ? { index, quality: 'Likely' }
    : null;
}
export function discoverFirefliesMeeting(
  input: MeetingSegmentationInput
): FirefliesMeetingDiscovery {
  const { meeting, profile, competingProfiles = [], radius = 10 } = input;
  const sentences = parseConversationSentences(
    meeting?.fullTranscript ??
      meeting?.transcript ??
      meeting?.transcriptText ??
      meeting?.transcriptSnippet ??
      ''
  );
  const matches: MeetingMatchAssessment[] = [];
  const state: DiscoveryState = {
    input,
    sentences,
    profile,
    competingProfiles,
    matches,
    rosterProfiles: meetingRosterProfiles(profile, competingProfiles),
    providerAnchored: meetingHasProviderAnchor(meeting, profile),
    firstIsAmbiguous: competingMeetingFirstName(profile, competingProfiles),
    variants: meetingNameVariants(profile),
    targetFirst: meetingFirstName(profile),
  };
  const anchors: MeetingAnchor[] = [];
  for (const [index, sentence] of sentences.entries()) {
    const anchor = anchorAt(state, sentence.text, index);
    if (anchor) anchors.push(anchor);
  }
  return {
    segments: buildMeetingSegments(state, anchors, radius),
    matches,
    weakMatches: matches
      .filter((match) => match.quality === 'Weak')
      .sort((left, right) => right.score - left.score)
      .slice(0, 3),
    rejectedMatches: matches.filter((match) => match.quality === 'Rejected'),
    sentencesScanned: sentences.length,
    providerAnchored: state.providerAnchored,
  };
}
export function segmentFirefliesMeeting(
  input: MeetingSegmentationInput
): FirefliesMeetingSegment[] {
  return discoverFirefliesMeeting(input).segments;
}
