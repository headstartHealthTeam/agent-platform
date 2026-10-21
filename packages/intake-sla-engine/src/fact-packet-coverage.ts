import { isSupportingOnlySource } from './contracts.js';
import { approvedEvidence } from './evidence.js';
import { categoryForGate } from './gate-context.js';
import { duplicateOnlyConflict } from './recommendation-text.js';
import type {
  FactPacket,
  FactPacketInput,
  RecommendationEvent,
  RecommendationGate,
  RecommendationIdentityReview,
  RecommendationSourceResult,
} from './recommendation-types.js';
import { materialSourceFailure, supplementarySourceFailure } from './source-result.js';
import type { SlaStory } from './story-types.js';

interface IdentityGroup {
  readonly source: string;
  readonly sourceRecordIds: Set<string>;
  readonly matchedAs: Set<string>;
}
function identityReviews(
  events: readonly RecommendationEvent[],
  name: string | undefined
): RecommendationIdentityReview[] {
  const groups = new Map<string, IdentityGroup>();
  for (const event of events) {
    const group = groups.get(event.source) ?? {
      source: event.source,
      sourceRecordIds: new Set<string>(),
      matchedAs: new Set<string>(),
    };
    group.sourceRecordIds.add(event.sourceRecordId);
    if (event.matchedAs) group.matchedAs.add(event.matchedAs);
    groups.set(event.source, group);
  }
  return [...groups.values()].map((group) => {
    const variants = [...group.matchedAs];
    const heardAs = variants.length ? ` The name was interpreted as ${variants.join(', ')}.` : '';
    return {
      source: group.source,
      sourceRecordIds: [...group.sourceRecordIds],
      note: `Assumed ${String(name)} from a unique provider-roster ${group.source} match.${heardAs} Verify the client identity before using this evidence.`,
      matchedAs: variants,
    };
  });
}

function coverage(results: readonly RecommendationSourceResult[]): FactPacket['sourceCoverage'] {
  const found = results
    .filter((result) => result.status === 'Found')
    .map((result) => result.source);
  return {
    found,
    primaryFound: found.filter((source) => !isSupportingOnlySource(source)),
    supportingFound: found.filter(isSupportingOnlySource),
    searchedNotFound: results
      .filter((result) => result.status === 'Searched - Not Found')
      .map((result) => result.source),
    failures: results
      .filter((result) => ['Blocked', 'Timed Out', 'Unsupported'].includes(result.status))
      .map((result) => `${result.source}: ${result.status}`),
    checkedCount: results.length,
  };
}

interface PacketCoverage<T extends RecommendationEvent> {
  readonly gateCategory: string;
  readonly materialFailure: boolean;
  readonly supplementaryFailure: boolean;
  readonly conflicts: string[];
  readonly gaps: string[];
  readonly specificityMissingEvents: RecommendationEvent[];
  readonly assumedIdentityEvents: T[];
  readonly identityMatchReview: RecommendationIdentityReview[];
  readonly sourceCoverage: FactPacket['sourceCoverage'];
}

export function factPacketCoverage<T extends RecommendationEvent>(
  input: FactPacketInput<T>,
  gate: RecommendationGate,
  story: SlaStory<T>,
  newest: RecommendationEvent | null
): PacketCoverage<T> {
  const gateCategory = categoryForGate(gate);
  const materialSources = ['Salesforce Opportunity / SLA'];
  if (gateCategory === 'insurance') materialSources.push('Authorization');
  if (
    gateCategory === 'intakeScheduling' ||
    /first direct-care|97153/i.test(String(gate.processPosition))
  )
    materialSources.push('Linked Billing / Claims');
  const sourceCoverage = coverage(input.sourceResults);
  const conflicts = [...new Set([...(gate.conflicts ?? []), ...story.conflicts])].filter(
    (conflict) => !duplicateOnlyConflict(conflict)
  );
  const gaps = [...sourceCoverage.failures];
  const specificityMissingEvents = story.narrativeEvents.filter(
    (event) =>
      event.specificityMissing && ['Current', 'Conflict'].includes(event.narrativeContribution)
  );
  if (specificityMissingEvents.some((event) => event.factType === 'auth-pending'))
    gaps.push(
      'The SLA note reports pending insurance approval but does not identify the authorization it refers to.'
    );
  if (specificityMissingEvents.some((event) => event.factType !== 'auth-pending'))
    gaps.push(
      'The source identifies a required document or payer request but does not name the exact item.'
    );
  const assumedIdentityEvents = approvedEvidence(input.evidenceEvents).filter(
    (event) => event.assumedIdentityMatch
  );
  const identityMatchReview = identityReviews(assumedIdentityEvents, input.opportunity.name);
  for (const review of identityMatchReview) gaps.push(review.note);
  if (!newest) gaps.unshift('No dated substantive evidence was found for the current gate.');
  return {
    gateCategory,
    materialFailure: materialSourceFailure(input.sourceResults, materialSources),
    supplementaryFailure: supplementarySourceFailure(input.sourceResults, materialSources),
    conflicts,
    gaps,
    specificityMissingEvents,
    assumedIdentityEvents,
    identityMatchReview,
    sourceCoverage,
  };
}
