import { z } from 'zod';

import { preserveCollectionRecord } from './collection-decoding.js';
import type { BoundedCoverage } from './fireflies-bounded-coverage.js';
import {
  prepareReplayMeeting,
  replayHasClientMention,
  replayList,
  replayMeetingRelationship,
} from './fireflies-replay-prefilter.js';
import type { ReplayIdentity, PreparedReplayMeeting } from './fireflies-replay-prefilter.js';
import {
  decodeFirefliesMeetingProfile,
  decodeSegmentableMeeting,
} from './fireflies-saved-profiles.js';
import { captureProperty as field } from './google-capture-property.js';
import type { MeetingMatchAssessment } from './meeting-segment-types.js';
import { discoverFirefliesMeeting } from './meeting-segmentation.js';

interface ReplayMeeting {
  readonly id: unknown;
  readonly title: unknown;
  readonly date: unknown;
  readonly organizerEmail: unknown;
  readonly participants: unknown;
  readonly meetingAttendees: unknown;
  readonly fullTranscript: string;
  readonly quality: 'Direct' | 'Likely';
  readonly assumedName: string;
  readonly runnerUp: string;
  readonly transcriptSnippet: string;
  readonly matchedSentences: string[];
  readonly segmentCount: number;
  readonly sourceEndpoint: unknown;
  readonly meetingRelationship: 'Provider' | 'CSM';
}
interface ReplayWeakMatch extends MeetingMatchAssessment {
  readonly meetingId: unknown;
  readonly meetingTitle: unknown;
  readonly meetingDate: unknown;
}
export interface FirefliesReplayRow {
  readonly opportunityId: string;
  readonly opportunityName: string;
  readonly searchedAt: string;
  readonly searched: boolean;
  readonly blocked: boolean;
  readonly error: string;
  readonly meetings: ReplayMeeting[];
  readonly weakMatches: ReplayWeakMatch[];
  readonly recordsRetrieved: number;
  readonly providerMeetingSetRecords: number;
  readonly searchCoverage: {
    readonly status: string;
    readonly attemptedPhases: string[];
    readonly requestCount: number;
    readonly pageCount: number | null;
    readonly candidateMeetingCount: number;
    readonly meetingsEvaluated: number;
    readonly fullTranscriptsAvailable: number;
    readonly fullTranscriptsRetrieved: number;
    readonly transcriptProvenance: readonly unknown[];
    readonly blockedTranscriptCount: number;
    readonly paginationComplete: boolean;
    readonly transcriptsComplete: boolean;
    readonly retainedInventoryCount: number;
    readonly segmentsScanned: number;
  };
}
interface Candidate {
  readonly meeting: PreparedReplayMeeting;
  readonly relationship: 'Provider' | 'CSM';
}
interface ReplayInputs {
  readonly profiles: readonly ReplayIdentity[];
  readonly inventory: readonly PreparedReplayMeeting[];
  readonly searchedAt: string;
  readonly sourceCutoff: string;
  readonly boundedCoverage?: BoundedCoverage | undefined;
  readonly cacheProvenance?: readonly unknown[] | undefined;
  readonly onProgress?: (completedRows: number) => void;
}
function identity(meeting: PreparedReplayMeeting): unknown {
  const id = meeting['transcriptId'];
  const present = Boolean(id);
  return present ? id : meeting['id'];
}
function matchCandidates(
  candidates: readonly Candidate[],
  profile: ReplayIdentity,
  profilesById: ReadonlyMap<unknown, ReplayIdentity>,
  progress: () => void
): { meetings: ReplayMeeting[]; weakMatches: ReplayWeakMatch[]; segmentsScanned: number } {
  const peers = replayList(profile['providerRoster'])
    .filter((peer) => field(peer, 'opportunityId') !== profile.opportunityId)
    .map((peer) => profilesById.get(field(peer, 'opportunityId')) ?? peer);
  const meetings: ReplayMeeting[] = [];
  const weakMatches: ReplayWeakMatch[] = [];
  let segmentsScanned = 0;
  for (const { meeting, relationship } of candidates) {
    progress();
    const id = identity(meeting);
    const discovery = discoverFirefliesMeeting({
      meeting: decodeSegmentableMeeting({ ...meeting, id, meetingRelationship: relationship }),
      profile: decodeFirefliesMeetingProfile(profile),
      competingProfiles: peers.map(decodeFirefliesMeetingProfile),
    });
    segmentsScanned += discovery.sentencesScanned;
    weakMatches.push(
      ...discovery.weakMatches.map((match) => ({
        ...match,
        meetingId: id,
        meetingTitle: meeting['title'],
        meetingDate: meeting['date'],
      }))
    );
    const segments = discovery.segments;
    if (segments.length === 0) continue;
    const transcript = segments.map((segment) => segment.rawText).join('\n');
    meetings.push({
      id,
      title: meeting['title'],
      date: meeting['date'],
      organizerEmail: meeting['organizerEmail'],
      participants: meeting['participants'],
      meetingAttendees: meeting['meetingAttendees'],
      fullTranscript: transcript,
      quality: segments.some((segment) => segment.quality === 'Direct') ? 'Direct' : 'Likely',
      assumedName: segments.find((segment) => segment.quality === 'Likely')?.matchedAs ?? '',
      runnerUp: '',
      transcriptSnippet: transcript,
      matchedSentences: segments.map((segment) => segment.rawText),
      segmentCount: segments.length,
      sourceEndpoint: meeting['retrievalEndpoint'],
      meetingRelationship: relationship,
    });
  }
  return {
    meetings,
    weakMatches: weakMatches.sort((left, right) => right.score - left.score).slice(0, 3),
    segmentsScanned,
  };
}
/** Re-run exact roster matching on the proven current inventory without any source retrieval. */
export function replayFirefliesRows(input: ReplayInputs): FirefliesReplayRow[] {
  const profilesById = new Map(input.profiles.map((profile) => [profile.opportunityId, profile]));
  return input.profiles.map((profile, index) => {
    input.onProgress?.(index);
    const bounded = input.boundedCoverage?.rows.find(
      (row) => row.opportunityId === profile.opportunityId
    );
    const blocked = bounded?.status === 'Blocked';
    const providerMeetings = input.inventory.flatMap((meeting): Candidate[] => {
      const relationship = replayMeetingRelationship(meeting, profile, input.sourceCutoff);
      return relationship === null ? [] : [{ meeting, relationship }];
    });
    const candidates = providerMeetings.filter(({ meeting, relationship }) =>
      replayHasClientMention(meeting, profile, relationship)
    );
    const matched = matchCandidates(candidates, profile, profilesById, () => {
      input.onProgress?.(index);
    });
    const provenance =
      input.cacheProvenance?.filter((item) =>
        providerMeetings.some(({ meeting }) => meeting['transcriptId'] === field(item, 'id'))
      ) ?? [];
    return {
      opportunityId: profile.opportunityId,
      opportunityName: profile.opportunityName,
      searchedAt: input.searchedAt,
      searched: !blocked,
      blocked,
      error: blocked
        ? 'One or more planned Fireflies searches or provider identities remain incomplete.'
        : '',
      meetings: matched.meetings,
      weakMatches: matched.weakMatches,
      recordsRetrieved: matched.meetings.length,
      providerMeetingSetRecords: providerMeetings.length,
      searchCoverage: {
        status: blocked ? 'Partial' : 'Complete',
        attemptedPhases: bounded
          ? [...bounded.attemptedPhases, 'Roster-constrained full transcript rematch']
          : [
              'Participant email',
              'Provider and practice title',
              'Current and prior CSM',
              'Roster-constrained full transcript rematch',
            ],
        requestCount:
          bounded?.plannedRequestCount ??
          replayOptionalLength(profile['firefliesSearchPlans']) ??
          replayOptionalLength(profile['providerRoles']) ??
          0,
        pageCount: bounded?.pageCount ?? null,
        candidateMeetingCount: candidates.length,
        meetingsEvaluated: providerMeetings.length,
        fullTranscriptsAvailable: providerMeetings.length,
        fullTranscriptsRetrieved:
          input.cacheProvenance === undefined
            ? providerMeetings.length
            : provenance.filter((item) => field(item, 'source') !== 'Cache Reused').length,
        transcriptProvenance: provenance,
        blockedTranscriptCount: 0,
        paginationComplete: !blocked,
        transcriptsComplete: true,
        retainedInventoryCount: input.inventory.length,
        segmentsScanned: matched.segmentsScanned,
      },
    };
  });
}
function replayOptionalLength(value: unknown): number | undefined {
  const length = field(value, 'length');
  return length === undefined ? undefined : z.number().parse(length);
}
export function parseReplayIdentities(value: unknown): ReplayIdentity[] {
  return z
    .array(
      preserveCollectionRecord(
        z.looseObject({ opportunityId: z.string(), opportunityName: z.string() })
      )
    )
    .parse(value);
}
export function prepareReplayInventory(records: readonly unknown[]): PreparedReplayMeeting[] {
  return records.map((record) =>
    prepareReplayMeeting(z.record(z.string(), z.unknown()).parse(record))
  );
}
