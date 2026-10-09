import { isoDate } from './dates.js';
import { dateValue } from './recommendation-date.js';
import { normalizedFact } from './recommendation-text.js';
import type { RecommendationEvent, RecommendationFact } from './recommendation-types.js';

export function dedupeEvents<T extends { readonly text?: string | undefined }>(
  events: readonly T[]
): T[] {
  const seen = new Set();
  return events.filter((event) => {
    const key = normalizedFact(event.text);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function chronological<
  T extends Pick<RecommendationEvent, 'eventDate' | 'processRelevance'>,
>(events: readonly T[]): T[] {
  return [...events].sort(
    (left, right) =>
      dateValue(right.eventDate) - dateValue(left.eventDate) ||
      (right.processRelevance ?? 0) - (left.processRelevance ?? 0)
  );
}

export function factView(event: RecommendationEvent, contribution: string): RecommendationFact {
  return {
    id: `${event.source}:${event.sourceRecordId}`,
    sourceRecordId: event.sourceRecordId,
    date: isoDate(event.eventDate),
    source: event.source,
    fact: event.text,
    milestoneDate: isoDate(event.milestoneDate),
    gateImpact: event.gateImpact ?? null,
    factType: event.factType ?? null,
    denialReason: event.denialReason ?? null,
    appealKind: event.appealKind ?? null,
    requestedInformation: event.requestedInformation ?? null,
    specificityMissing: Boolean(event.specificityMissing),
    candidateStep: event.candidateStep ?? null,
    candidateName: event.candidateName ?? null,
    candidateActive: event.candidateActive ?? null,
    recommendedAction: event.recommendedAction ?? null,
    actionOwner: event.actionOwner ?? null,
    actionType: event.actionType ?? null,
    matchQuality: event.matchQuality,
    relationship: event.relationship,
    assumedIdentityMatch: Boolean(event.assumedIdentityMatch),
    assumedIdentityNote: event.assumedIdentityNote ?? null,
    matchedAs: event.matchedAs ?? null,
    contribution,
  };
}
