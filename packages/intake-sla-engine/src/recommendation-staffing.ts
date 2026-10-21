import { isoDate } from './dates.js';
import { evidenceSpecificity } from './evidence.js';
import { dateValue } from './recommendation-date.js';
import { dedupeEvents } from './recommendation-projection.js';
import type { RecommendationEvent } from './recommendation-types.js';

const REQUEST_SOURCES = new Set(['RBT Request', 'Staffing']);
const STAFFING_SOURCES = new Set([
  ...REQUEST_SOURCES,
  'Ticket Match',
  'Talent Acquisition',
  'RBT First Interview',
]);
const ASSIGNMENTS = new Set(['rbt-assigned', 'treatment-start-planned']);

function latest<T extends RecommendationEvent>(events: readonly T[]): T | undefined {
  return [...events].sort(
    (left, right) => dateValue(right.eventDate) - dateValue(left.eventDate)
  )[0];
}

function newerCandidate(
  event: RecommendationEvent,
  current: RecommendationEvent | undefined
): boolean {
  if (!current) return true;
  const sameDate = isoDate(event.eventDate) === isoDate(current.eventDate);
  return (
    dateValue(event.eventDate) > dateValue(current.eventDate) ||
    (sameDate && current.candidateActive === true && event.candidateActive === false) ||
    (sameDate &&
      current.candidateActive === event.candidateActive &&
      evidenceSpecificity(event) > evidenceSpecificity(current))
  );
}

function latestCandidates<T extends RecommendationEvent>(events: readonly T[]): T[] {
  const byCandidate = new Map<string, T>();
  for (const event of events.filter((candidate) => candidate.candidateName)) {
    const key = String(event.candidateName).toLowerCase();
    if (newerCandidate(event, byCandidate.get(key))) byCandidate.set(key, event);
  }
  return [...byCandidate.values()];
}

function requestStopsHiring(request: RecommendationEvent | undefined): boolean {
  return Boolean(
    request &&
    (/paused|on hold/i.test(request.text) ||
      /cancel(?:ed|led)|client fell through|no longer need hiring|request (?:was )?closed/i.test(
        request.text
      ))
  );
}

/** A later proposed candidate alone cannot replace a confirmed request/Staffing assignment. */
export function rbtControlEvent<T extends RecommendationEvent>(
  events: readonly T[] = []
): T | null {
  const relevant = dedupeEvents(events).filter((event) => STAFFING_SOURCES.has(event.source));
  const currentRequest = latest(
    relevant.filter(
      (event) =>
        event.source === 'RBT Request' &&
        ['rbt-recruiting', 'rbt-candidate', 'rbt-lost'].includes(event.factType ?? '') &&
        !event.candidateName
    )
  );
  const confirmed = latest(
    relevant.filter(
      (event) => REQUEST_SOURCES.has(event.source) && ASSIGNMENTS.has(event.factType ?? '')
    )
  );
  if (requestStopsHiring(currentRequest)) return currentRequest ?? null;
  const candidates = latestCandidates(relevant);
  const active = candidates
    .filter((event) => event.candidateActive === true)
    .sort(
      (left, right) =>
        dateValue(right.eventDate) - dateValue(left.eventDate) ||
        evidenceSpecificity(right) - evidenceSpecificity(left)
    )[0];
  const replacement = latest(
    relevant.filter(
      (event) =>
        REQUEST_SOURCES.has(event.source) &&
        ['rbt-lost', 'rbt-recruiting'].includes(event.factType ?? '') &&
        (!confirmed || dateValue(event.eventDate) > dateValue(confirmed.eventDate))
    )
  );
  const requestSupersedes = Boolean(
    currentRequest &&
    confirmed &&
    dateValue(currentRequest.eventDate) > dateValue(confirmed.eventDate)
  );
  if (confirmed && !replacement && !requestSupersedes) return confirmed;
  if (active && (!confirmed || replacement || requestSupersedes)) return active;
  if (
    confirmed &&
    (!currentRequest || dateValue(confirmed.eventDate) > dateValue(currentRequest.eventDate))
  )
    return confirmed;
  if (active) return active;
  if (currentRequest) return currentRequest;
  return latest(candidates.filter((event) => event.candidateActive === false)) ?? null;
}
