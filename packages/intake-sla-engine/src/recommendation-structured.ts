import { isoDate } from './dates.js';
import { approvedEvidence, evidenceSpecificity } from './evidence.js';
import { categoryForGate } from './gate-context.js';
import { dateValue } from './recommendation-date.js';
import { dedupeEvents } from './recommendation-projection.js';
import { rbtControlEvent } from './recommendation-staffing.js';
import type {
  RecommendationEvent,
  RecommendationGate,
  RecommendationRawStory,
} from './recommendation-types.js';

const BILLING_SOURCE = 'Linked Billing / Claims';
const SOURCES = new Map([
  [
    'rbt',
    new Set([
      'RBT Request',
      'Staffing',
      'Ticket Match',
      'Talent Acquisition',
      'RBT First Interview',
      BILLING_SOURCE,
    ]),
  ],
  ['treatmentPlan', new Set(['Clinical Quality', 'Authorization'])],
  ['insurance', new Set(['Authorization', 'Authorization Review', 'VOB'])],
  ['intakeScheduling', new Set(['Salesforce Opportunity / SLA', BILLING_SOURCE])],
]);
const PRIORITIES = new Map([
  [BILLING_SOURCE, 40],
  ['RBT Request', 35],
  ['Staffing', 30],
  ['Clinical Quality', 30],
  ['Authorization', 30],
  ['Authorization Review', 25],
  ['Ticket Match', 20],
  ['RBT First Interview', 15],
  ['Talent Acquisition', 10],
  ['VOB', 5],
]);

function preferredCandidate(
  events: readonly RecommendationEvent[]
): RecommendationEvent | undefined {
  const latest = new Map<string, RecommendationEvent>();
  for (const event of events.filter((candidate) => candidate.candidateName)) {
    const key = String(event.candidateName).toLowerCase();
    const current = latest.get(key);
    const sameDate = current && isoDate(event.eventDate) === isoDate(current.eventDate);
    if (
      !current ||
      (!sameDate && dateValue(event.eventDate) > dateValue(current.eventDate)) ||
      (sameDate && evidenceSpecificity(event) > evidenceSpecificity(current))
    )
      latest.set(key, event);
  }
  const active = [...latest.values()]
    .filter((event) => event.candidateActive === true)
    .sort(
      (left, right) =>
        evidenceSpecificity(right) - evidenceSpecificity(left) ||
        dateValue(right.eventDate) - dateValue(left.eventDate)
    )[0];
  const failed = [...latest.values()]
    .filter((event) => event.candidateActive === false)
    .sort((left, right) => dateValue(right.eventDate) - dateValue(left.eventDate))[0];
  return active ?? failed;
}

function eligibleStructured(
  current: readonly RecommendationEvent[],
  all: readonly RecommendationEvent[]
): readonly RecommendationEvent[] {
  const reset = current
    .filter(
      (event) =>
        ['rbt-lost', 'rbt-recruiting'].includes(event.factType ?? '') &&
        /replacement|restaff|recruiting|no confirmed (?:candidate|assignment|coverage)|no candidate/i.test(
          event.text
        )
    )
    .sort((left, right) => dateValue(right.eventDate) - dateValue(left.eventDate))[0];
  return reset
    ? all.filter(
        (event) =>
          !['rbt-assigned', 'treatment-start-planned'].includes(event.factType ?? '') ||
          dateValue(event.eventDate) >= dateValue(reset.eventDate)
      )
    : all;
}

export function structuredGateEvent(
  story: RecommendationRawStory,
  gate: RecommendationGate,
  events: readonly RecommendationEvent[] = []
): RecommendationEvent | null {
  const category = categoryForGate(gate);
  const sources = SOURCES.get(category) ?? new Set<string>();
  const current = (story.narrativeEvents ?? []).filter(
    (event) =>
      ['Current', 'Conflict', 'Future Milestone'].includes(event.narrativeContribution ?? '') &&
      sources.has(event.source)
  );
  const all = approvedEvidence(events).filter((event) => sources.has(event.source));
  const eligible = eligibleStructured(current, all);
  const candidates =
    category === 'rbt'
      ? dedupeEvents([...current, ...eligible])
      : dedupeEvents(current.length ? current : all);
  if (category === 'rbt') {
    const control = rbtControlEvent(candidates);
    if (control) return control;
  }
  const preferred = preferredCandidate(candidates);
  const ranked = preferred
    ? [preferred, ...candidates.filter((event) => event !== preferred)]
    : candidates;
  return (
    ranked.sort(
      (left, right) =>
        Number(right === preferred) - Number(left === preferred) ||
        evidenceSpecificity(right) - evidenceSpecificity(left) ||
        (right.processRelevance ?? 0) - (left.processRelevance ?? 0) ||
        (PRIORITIES.get(right.source) ?? 0) - (PRIORITIES.get(left.source) ?? 0) ||
        dateValue(right.eventDate) - dateValue(left.eventDate)
    )[0] ?? null
  );
}
