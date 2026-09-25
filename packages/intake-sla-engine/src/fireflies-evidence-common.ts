import { interpretConversation } from './conversation-interpretation.js';
import { createConversationSearchResult } from './conversation-search-result.js';
import type { ConversationSearchResult } from './conversation-search-result.js';
import { createEvidenceEvent } from './evidence.js';
import type {
  AdmittedFirefliesMatch,
  FirefliesEvidenceEvent,
  FirefliesEvidenceIdentity,
  FirefliesEvidenceInput,
  FirefliesEvidenceMatch,
  FirefliesEvidenceRow,
  FirefliesEvidenceSegment,
} from './fireflies-evidence-types.js';
import { categoryForGate } from './gate-context.js';
import type { ValidatedTranscriptFinding } from './interpretation-findings.js';
import type { InterpretationPacketInput } from './interpretation-packet.js';
import { interpretedFindingSemantics } from './interpretation-semantics.js';

function identities(context: FirefliesEvidenceSegment): FirefliesEvidenceIdentity[] {
  const {
    input: { profile },
    meeting,
  } = context;
  return [
    {
      opportunityId: profile.opportunityId,
      opportunityName: profile.opportunityName,
      meetingTitle: meeting.title,
    },
  ];
}
export function firefliesPacketInput(context: FirefliesEvidenceSegment): InterpretationPacketInput {
  const { input, meeting, segment, sourceRecordId } = context;
  return {
    profile: input.profile,
    ...(input.gate === undefined ? {} : { gate: input.gate }),
    source: 'Fireflies',
    sourceRecordId,
    eventDate: meeting.date,
    segment: segment.text,
    matchQuality: segment.quality,
    matchContext: {
      meetingTitle: meeting.title,
      meetingRelationship: meeting.meetingRelationship,
      assumedIdentityMatch: segment.assumedIdentityMatch,
      assumedIdentityNote: segment.assumedIdentityNote,
      matchedAs: segment.matchedAs,
    },
  };
}
export function firefliesFindingEvent(
  context: FirefliesEvidenceSegment,
  finding: ValidatedTranscriptFinding
): FirefliesEvidenceEvent {
  const {
    input: { profile, gate },
    meeting,
    segment,
    sourceRecordId,
  } = context;
  const semantics = interpretedFindingSemantics(finding, gate);
  const uncertain = finding.semanticsSupplied && !semantics.category;
  if (!meeting.date) throw new Error('EvidenceEvent missing eventDate');
  return createEvidenceEvent({
    opportunityId: profile.opportunityId,
    source: 'Fireflies',
    sourceRecordId,
    eventDate: meeting.date,
    category: semantics.category ?? (uncertain ? 'unclassified' : categoryForGate(gate)),
    issueKey: semantics.issueKey,
    text: finding.synthesizedFact,
    rawText: segment.rawText,
    matchedIdentities: identities(context),
    assumedIdentityMatch: segment.assumedIdentityMatch,
    assumedIdentityNote: segment.assumedIdentityNote,
    matchedAs: segment.matchedAs,
    matchQuality: segment.quality,
    substantive: finding.substantive,
    relationship: uncertain ? 'Neutral' : finding.relationship,
    processRelevance: uncertain ? 0 : finding.relationship === 'Conflicts' ? 11 : 10,
    factType: semantics.factType ?? 'ai-interpreted-conversation',
    denialReason: semantics.denialReason,
    appealKind: semantics.appealKind,
    requestedInformation: semantics.requestedInformation,
    gateImpact: finding.gateImpact,
    actionOwner: finding.actionOwner,
    actionType: finding.actionType,
    recommendedAction: finding.recommendedAction,
    milestoneDate: finding.milestoneDate,
    milestoneKind: finding.milestoneKind,
    followUpDate: finding.followUpDate,
    supportSpan: finding.supportSpan,
  });
}
export function firefliesFallback(context: FirefliesEvidenceSegment): FirefliesEvidenceEvent[] {
  const {
    input: { profile, gate, asOf },
    meeting,
    segment,
    sourceRecordId,
  } = context;
  return interpretConversation({
    opportunityId: profile.opportunityId,
    source: 'Fireflies',
    sourceRecordId,
    eventDate: meeting.date,
    text: segment.text,
    rawText: segment.rawText,
    matchQuality: segment.quality,
    gate,
    asOf,
    matchedIdentities: identities(context),
    assumedIdentityMatch: segment.assumedIdentityMatch,
    assumedIdentityNote: segment.assumedIdentityNote,
    matchedAs: segment.matchedAs,
  });
}
function admittedMatches(
  events: readonly FirefliesEvidenceEvent[],
  input: FirefliesEvidenceInput
): AdmittedFirefliesMatch[] {
  const seen = new Set<string>();
  return events
    .filter(
      (event) =>
        event.substantive &&
        ['Direct', 'Likely'].includes(event.matchQuality) &&
        Boolean(event.sourceRecordId)
    )
    .filter((event) => {
      const key = `${event.sourceRecordId}:${event.matchQuality}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((event) => ({
      opportunityId: input.profile.opportunityId,
      opportunityName: input.profile.opportunityName,
      quality: event.matchQuality,
      score: event.matchQuality === 'Direct' ? 100 : 80,
      reason: 'Transcript-supported substantive interpretation was admitted as evidence.',
      sourceRecordId: event.sourceRecordId,
    }));
}
export function firefliesConversationResult(
  input: FirefliesEvidenceInput,
  row: FirefliesEvidenceRow,
  events: readonly FirefliesEvidenceEvent[],
  matches: readonly FirefliesEvidenceMatch[],
  segmentsScanned: number,
  failures: readonly string[]
): ConversationSearchResult<FirefliesEvidenceMatch> {
  const { profile } = input;
  return createConversationSearchResult({
    source: 'Fireflies',
    opportunityId: profile.opportunityId,
    identitiesUsed: [
      profile.opportunityName,
      profile.providerNames,
      profile.providerEmails,
      profile.csmNames,
    ],
    queriesUsed: row.searchCoverage?.queriesUsed ?? row.queriesUsed ?? [],
    recordsScanned: row.meetings?.length ?? 0,
    segmentsScanned,
    paginationComplete: row.searchCoverage?.paginationComplete !== false,
    transcriptFetchComplete: row.searchCoverage?.transcriptsComplete !== false,
    matches: [...matches, ...admittedMatches(events, input)],
    failures,
    blocked: Boolean(row.blocked),
    timedOut: Boolean(row.timedOut),
    ...(row.searchedAt === undefined ? {} : { searchedAt: row.searchedAt }),
  });
}
