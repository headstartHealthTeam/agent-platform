import type { StructuredResponsesClient } from '@headstart-health/openai-platform/responses';

import type { PacketInterpretation } from './ai-interpretation.js';
import type { ConversationSearchResult } from './conversation-search-result.js';
import type { EvidenceDate, EvidenceEvent } from './evidence.js';
import type { GateContext } from './gate-context.js';
import type { InterpretationProfile } from './interpretation-packet.js';
import type {
  FirefliesMeetingSegment,
  MeetingMatchAssessment,
  MeetingSegmentProfile,
  SegmentableMeeting,
} from './meeting-segment-types.js';

export type FirefliesEvidenceProfile = MeetingSegmentProfile &
  InterpretationProfile & {
    readonly opportunityId: string;
    readonly opportunityName: string;
    readonly csmNames?: readonly string[] | undefined;
  };
export interface FirefliesEvidenceMeeting extends SegmentableMeeting {
  readonly date?: string | null | undefined;
  readonly meetingRelationship?: string | null | undefined;
}
export interface FirefliesEvidenceRow {
  readonly blocked?: boolean | null | undefined;
  readonly timedOut?: boolean | null | undefined;
  readonly error?: string | null | undefined;
  readonly meetings?: readonly FirefliesEvidenceMeeting[] | null | undefined;
  readonly queriesUsed?: readonly unknown[] | null | undefined;
  readonly searchedAt?: string | null | undefined;
  readonly searchCoverage?:
    | {
        readonly queriesUsed?: readonly unknown[] | null | undefined;
        readonly paginationComplete?: boolean | null | undefined;
        readonly transcriptsComplete?: boolean | null | undefined;
      }
    | null
    | undefined;
}
export interface FirefliesEvidenceInput {
  readonly row: FirefliesEvidenceRow | null | undefined;
  readonly profile: FirefliesEvidenceProfile;
  readonly competingProfiles?: readonly MeetingSegmentProfile[] | undefined;
  readonly gate?: GateContext | undefined;
  readonly asOf: EvidenceDate;
  readonly fallbackToDeterministic?: boolean;
}
export interface FirefliesApiInput extends FirefliesEvidenceInput {
  readonly client?: StructuredResponsesClient | null;
  readonly model: string;
  readonly provider?: string;
  readonly engineVersion?: string;
}
export interface FirefliesSuppliedInterpretation {
  readonly sourceRecordId: string;
  /** Raw saved findings are decoded only after this record is selected and its binding matches. */
  readonly findings?: unknown;
  readonly binding?: unknown;
  readonly validationBinding?: unknown;
}
export interface FirefliesPrecomputed<T extends FirefliesSuppliedInterpretation> {
  readonly interpretations?: readonly T[] | null | undefined;
  readonly currentRunPrecomputed?: unknown;
  readonly apiEnabled?: boolean | null | undefined;
  readonly model?: string | null | undefined;
  readonly provider?: string | null | undefined;
  readonly engineVersion?: string | null | undefined;
  readonly store?: boolean | null | undefined;
  readonly executionProvenance?: unknown;
  readonly usage?: FirefliesEvidenceUsage | null | undefined;
}
export interface FirefliesPrecomputedInput<
  T extends FirefliesSuppliedInterpretation,
> extends FirefliesEvidenceInput {
  readonly precomputed?: FirefliesPrecomputed<T>;
}
export interface FirefliesEvidenceUsage {
  readonly inputTokens?: unknown;
  readonly outputTokens?: unknown;
}
export interface FirefliesEvidenceIdentity {
  readonly opportunityId: string;
  readonly opportunityName: string;
  readonly meetingTitle: string | null | undefined;
}
export type FirefliesEvidenceEvent = Omit<EvidenceEvent, 'matchedIdentities'> & {
  readonly matchedIdentities: readonly FirefliesEvidenceIdentity[];
  readonly assumedIdentityMatch: boolean;
  readonly assumedIdentityNote: string;
  readonly matchedAs: string;
  readonly milestoneKind?: string | null;
  readonly supportSpan?: string;
  readonly denialReason?: string | null | undefined;
  readonly appealKind?: string | null | undefined;
  readonly requestedInformation?: string | null | undefined;
};
export interface AdmittedFirefliesMatch {
  readonly opportunityId: string;
  readonly opportunityName: string;
  readonly quality: string;
  readonly score: number;
  readonly reason: string;
  readonly sourceRecordId: string;
}
export type FirefliesEvidenceMatch = MeetingMatchAssessment | AdmittedFirefliesMatch;
export interface FirefliesEvidenceResult<T, Usage = FirefliesEvidenceUsage> {
  readonly events: FirefliesEvidenceEvent[];
  readonly interpretations: T[];
  readonly failures: string[];
  readonly usage: Usage;
  readonly conversationSearchResult?: ConversationSearchResult<FirefliesEvidenceMatch>;
  readonly unrecoveredFailures?: string[];
}
export interface FirefliesApiInterpretation extends PacketInterpretation {
  readonly meetingId: FirefliesEvidenceMeeting['id'];
  readonly sourceRecordId: string;
}
export interface FirefliesEvidenceSegment {
  readonly input: FirefliesEvidenceInput;
  readonly meeting: FirefliesEvidenceMeeting;
  readonly segment: FirefliesMeetingSegment;
  readonly sourceRecordId: string;
}
