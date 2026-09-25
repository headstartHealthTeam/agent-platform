import { isoDate, nextBusinessDay } from './dates.js';
import { requiredItemFromEvent } from './recommendation-candidate.js';
import { dateValue } from './recommendation-date.js';
import { requiredItemIsPlural } from './recommendation-text.js';
import type { FactPacketState, RecommendationEvent } from './recommendation-types.js';

function startConflict<T extends RecommendationEvent>(state: FactPacketState<T>): void {
  const reported = state.timeline.find((event) =>
    /provider reports direct-care treatment started/i.test(event.text)
  );
  const planned = state.futureMilestones.find((event) =>
    /97153|direct-care|care start|treatment start/i.test(`${event.fact} ${event.gateImpact ?? ''}`)
  );
  state.startEvidenceConflict =
    reported && planned
      ? { reportedDate: isoDate(reported.eventDate), plannedDate: isoDate(planned.milestoneDate) }
      : null;
  if (!state.startEvidenceConflict) return;
  state.conflicts.push(
    `Provider-reported treatment start conflicts with a later planned start of ${String(state.startEvidenceConflict.plannedDate)} and no structured first-service confirmation`
  );
  const owner = [state.input.opportunity.csm].find(Boolean) ?? 'CSM';
  state.action = {
    type: 'Provider Outreach',
    owner,
    text: `${owner} to verify the actual first 97153 date with the provider and correct Salesforce with the confirmed outcome.`,
    date: nextBusinessDay(state.input.asOf),
    basis: 'Recommended',
  };
}

function outstandingDocument(events: readonly RecommendationEvent[]): RecommendationEvent | null {
  const documents = events
    .filter(
      (event) => event.factType === 'required-document' && Boolean(requiredItemFromEvent(event))
    )
    .sort(
      (left, right) =>
        dateValue(right.eventDate) - dateValue(left.eventDate) ||
        String(requiredItemFromEvent(right)).length - String(requiredItemFromEvent(left)).length
    );
  const latest = documents[0] ?? null;
  if (!latest) return null;
  const latestDate = isoDate(latest.eventDate);
  const currentItems = documents
    .filter((event) => isoDate(event.eventDate) === latestDate)
    .map(requiredItemFromEvent)
    .filter(Boolean)
    .join(' ');
  return /\bVineland\b/i.test(currentItems) && /\bBASC\b/i.test(currentItems)
    ? { ...latest, requestedInformation: 'the Vineland assessment and the BASC assessment' }
    : latest;
}

function documentationConflict<T extends RecommendationEvent>(state: FactPacketState<T>): void {
  const reported = state.narrative.find(
    (event) =>
      event.factType === 'ia-completed' &&
      !['Salesforce Opportunity / SLA', 'Linked Billing / Claims'].includes(event.source)
  );
  const outstanding = outstandingDocument(state.narrative);
  const { opportunity, asOf } = state.input;
  state.iaCompletionDocumentationConflict =
    /IA Approved|IA Scheduled|IC Completed/i.test(String(opportunity.stage)) &&
    reported &&
    outstanding
      ? {
          reportedDate: isoDate(reported.eventDate),
          requiredItem: requiredItemFromEvent(outstanding),
          requiredItemDate: isoDate(outstanding.eventDate),
        }
      : null;
  const conflict = state.iaCompletionDocumentationConflict;
  if (!conflict) return;
  const owner = [opportunity.csm].find(Boolean) ?? 'CSM';
  const plural = requiredItemIsPlural(conflict.requiredItem);
  state.conflicts.push(
    `The provider reported the IA occurred, but ${String(conflict.requiredItem)} ${plural ? 'remain' : 'remains'} outstanding and structured IA completion is not recorded`
  );
  state.action = {
    type: 'Salesforce Update',
    owner,
    text: `${owner} to verify the IA occurrence date and whether ${String(conflict.requiredItem)} ${plural ? 'are' : 'is'} still outstanding, then correct the structured records with the confirmed outcome.`,
    date: nextBusinessDay(asOf),
    basis: 'Recommended',
  };
}

export function reconcileFactPacketConflicts<T extends RecommendationEvent>(
  state: FactPacketState<T>
): void {
  startConflict(state);
  documentationConflict(state);
}
