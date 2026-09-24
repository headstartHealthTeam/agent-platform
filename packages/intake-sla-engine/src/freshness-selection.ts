import type {
  FreshnessCandidate,
  FreshnessContext,
  FreshnessFact,
} from './freshness-candidates.js';
import { isConcreteOperationalUpdate } from './freshness-classification.js';
import { processGateScore } from './freshness-score.js';
import { synthesizedFact } from './freshness-summary.js';
import { freshnessTimestamp } from './freshness-values.js';

const DAY_MS = 86_400_000;
const STRUCTURED_SOURCES = new Set([
  'Authorization',
  'Authorization Review',
  'VOB',
  'Salesforce Opportunity / SLA',
  'Clinical Quality',
  'Treatment plan status',
  'RBT Request',
  'Staffing',
  'Candidate / Ticket Match',
  'RBT First Interview',
  'Linked Billing / Claims',
]);
function kindPriority(kind: string): number {
  if (kind === 'record' || kind === 'operational-note') return 3;
  return kind === 'discussion' ? 1 : 0;
}
function matchPriority(value: string): number {
  return value === 'Direct' ? 3 : value === 'Likely' ? 2 : 0;
}
export interface FreshnessSelection {
  readonly asOfTime: number;
  readonly eligible: FreshnessCandidate[];
  readonly substantive: FreshnessCandidate[];
  readonly latest: FreshnessCandidate | null;
}
export function selectFreshnessCandidates(context: FreshnessContext): FreshnessSelection {
  const asOfTime = freshnessTimestamp(context.asOf) ?? Date.now();
  const eligible = context.candidates.filter((candidate) => candidate.time <= asOfTime);
  const opp = context.input.opp;
  const anchors = [
    freshnessTimestamp(opp.Current_SLA__r?.CreatedDate),
    freshnessTimestamp(opp.SLA_Entry_Date__c),
    freshnessTimestamp(opp.LastStageChangeDate),
  ].filter((value): value is number => value !== null);
  const start = anchors.length ? Math.min(...anchors) - 3 * DAY_MS : null;
  if (start !== null)
    for (const candidate of eligible) if (candidate.time < start) candidate.operationalFacts = [];
  const current = eligible.filter(
    (candidate) =>
      start === null || candidate.time >= start || STRUCTURED_SOURCES.has(candidate.source)
  );
  eligible.sort((a, b) => b.time - a.time || kindPriority(b.kind) - kindPriority(a.kind));
  const substantive = current.filter((candidate) =>
    isConcreteOperationalUpdate(context.family, candidate)
  );
  substantive.sort(
    (a, b) =>
      processGateScore(context.family, b) - processGateScore(context.family, a) ||
      b.time - a.time ||
      matchPriority(b.matchQuality) - matchPriority(a.matchQuality) ||
      kindPriority(b.kind) - kindPriority(a.kind)
  );
  return { asOfTime, eligible, substantive, latest: substantive[0] ?? null };
}
export type FreshnessDatedFact = FreshnessFact &
  Pick<FreshnessCandidate, 'source' | 'sourceRecordId' | 'matchQuality'> & {
    readonly eventDate: string;
  };
function datedFact(candidate: FreshnessCandidate, fact: FreshnessFact): FreshnessDatedFact {
  return {
    ...fact,
    eventDate: candidate.at,
    source: candidate.source,
    sourceRecordId: candidate.sourceRecordId,
    matchQuality: candidate.matchQuality,
  };
}
export function selectFreshnessFacts(selection: FreshnessSelection): {
  primaryOperationalFact: FreshnessDatedFact | null;
  supportingOperationalFacts: FreshnessDatedFact[];
} {
  const facts = selection.substantive
    .flatMap((candidate) =>
      (candidate.operationalFacts ?? []).map((fact) => datedFact(candidate, fact))
    )
    .sort(
      (a, b) =>
        (b.relevance ?? 0) - (a.relevance ?? 0) ||
        (freshnessTimestamp(b.eventDate) ?? 0) - (freshnessTimestamp(a.eventDate) ?? 0)
    );
  const first = selection.latest?.operationalFacts?.[0];
  return {
    primaryOperationalFact:
      selection.latest && first ? datedFact(selection.latest, first) : (facts[0] ?? null),
    supportingOperationalFacts: facts
      .filter(
        (fact, index, all) =>
          all.findIndex(
            (candidate) => candidate.type === fact.type && candidate.summary === fact.summary
          ) === index
      )
      .slice(0, 5),
  };
}
export interface FreshnessChange {
  readonly eventDate: string;
  readonly source: string;
  readonly sourceRecordId: string | null;
  readonly fact: string;
}
export function freshnessChangeTimeline(
  context: FreshnessContext,
  selection: FreshnessSelection
): FreshnessChange[] {
  const changes: FreshnessChange[] = [];
  const seen = new Set<string>();
  for (const candidate of [...selection.substantive].sort((a, b) => b.time - a.time)) {
    const fact = synthesizedFact(context.family, candidate, context.input.authorizationGate);
    const key = `${candidate.at.slice(0, 10)}|${fact.toLowerCase()}`;
    if (!fact || seen.has(key)) continue;
    seen.add(key);
    changes.push({
      eventDate: candidate.at,
      source: candidate.source,
      sourceRecordId: candidate.sourceRecordId,
      fact,
    });
    if (changes.length === 3) break;
  }
  return changes.reverse();
}
