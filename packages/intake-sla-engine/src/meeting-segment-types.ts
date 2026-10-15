import type { ConversationMatch, ConversationProfile } from './conversation-match-types.js';
import type { ConversationSentence } from './conversation-sentences.js';
import type { DateValue } from './dates.js';
import type { ProviderIdentityCluster } from './provider-identity-types.js';

export interface MeetingSegmentProfile extends ConversationProfile {
  readonly providerIdentity?:
    | Pick<
        ProviderIdentityCluster,
        | 'salesforceIds'
        | 'names'
        | 'emails'
        | 'phones'
        | 'practiceAliases'
        | 'meetingAliases'
        | 'portalProviderIds'
      >
    | null
    | undefined;
  readonly providerRoster?: readonly ConversationProfile[] | null | undefined;
  readonly storyStartDate?: DateValue;
  readonly stageEntryDate?: DateValue;
  readonly slaCreatedDate?: DateValue;
  readonly asOf?: DateValue;
}
export interface SegmentableMeeting {
  readonly id?: string | number | null | undefined;
  readonly title?: string | null | undefined;
  readonly participants?: readonly (string | null | undefined)[] | null | undefined;
  readonly organizerEmail?: string | null | undefined;
  readonly date?: DateValue;
  readonly fullTranscript?: string | null | undefined;
  readonly transcript?: string | null | undefined;
  readonly transcriptText?: string | null | undefined;
  readonly transcriptSnippet?: string | null | undefined;
}
export interface MeetingSegmentationInput {
  readonly meeting?: SegmentableMeeting | null | undefined;
  readonly profile: MeetingSegmentProfile;
  readonly competingProfiles?: readonly MeetingSegmentProfile[] | undefined;
  readonly radius?: number | undefined;
}
export interface MeetingMatchAssessment extends ConversationMatch {
  sourceRecordId: string | number | null;
  anchorIndex: number;
}
export interface FirefliesMeetingSegment {
  start: number;
  end: number;
  quality: 'Direct' | 'Likely';
  assumedIdentityMatch: boolean;
  collectiveRosterMatch: boolean;
  assumedIdentityNote: string;
  matchedAs: string;
  matchScore: number | null;
  text: string;
  rawText: string;
}
export interface FirefliesMeetingDiscovery {
  segments: FirefliesMeetingSegment[];
  matches: MeetingMatchAssessment[];
  weakMatches: MeetingMatchAssessment[];
  rejectedMatches: MeetingMatchAssessment[];
  sentencesScanned: number;
  providerAnchored: boolean;
}
export interface MeetingAnchor {
  index: number;
  quality: FirefliesMeetingSegment['quality'];
  matchedAs?: string | null | undefined;
  matchScore?: number;
  radius?: number;
  collectiveRosterMatch?: boolean;
  assumedIdentityMatch?: boolean;
  assumedIdentityNote?: string;
}
export interface MeetingWindowContext {
  readonly sentences: readonly ConversationSentence[];
  readonly profile: MeetingSegmentProfile;
  readonly competingProfiles: readonly MeetingSegmentProfile[];
}
