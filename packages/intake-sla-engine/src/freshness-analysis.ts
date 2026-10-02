import {
  collectAuthorizationFreshness,
  collectClinicalFreshness,
} from './freshness-authorization.js';
import type { FreshnessFamily } from './freshness-candidate-types.js';
import {
  addFreshnessCandidate,
  freshnessFamilyTerms,
  freshnessStageFamily,
  type FreshnessContext,
} from './freshness-candidates.js';
import { isConcreteOperationalUpdate } from './freshness-classification.js';
import { collectCommunicationFreshness } from './freshness-communications.js';
import { freshnessEvidenceRow, type FreshnessEvidenceRow } from './freshness-evidence.js';
import { collectInterpretedFreshness } from './freshness-interpreted.js';
import { collectOpportunityFreshness } from './freshness-opportunity.js';
import {
  freshnessChangeTimeline,
  selectFreshnessCandidates,
  selectFreshnessFacts,
  type FreshnessChange,
  type FreshnessDatedFact,
  type FreshnessSelection,
} from './freshness-selection.js';
import type { FreshnessInput } from './freshness-source-types.js';
import { collectStaffingFreshness } from './freshness-staffing.js';
import { synthesizedFact } from './freshness-summary.js';
import { collectSupplementalFreshness } from './freshness-supplemental.js';
import { extractOperationalFacts } from './operational-facts.js';
import { parsePortalChats } from './portal-report.js';

const SEMI_STALE = 'Semi-Stale';

export interface FreshnessAnalysis {
  readonly opportunityName: string;
  readonly opportunityId: string;
  readonly stageFamily: FreshnessFamily;
  readonly latestUpdateAt: string;
  readonly latestUpdateSource: string;
  readonly latestUpdateSummary: string;
  readonly latestUpdateFact: string;
  readonly latestIdentityAssumption: string;
  readonly latestMatchedAs: string;
  readonly primaryOperationalFact: FreshnessDatedFact | null;
  readonly supportingOperationalFacts: FreshnessDatedFact[];
  readonly daysSinceUpdate: number | null;
  readonly updateFreshness: 'Missing' | 'Current' | 'Semi-Stale' | 'Stale';
  readonly updateNeeded: 'No' | 'Review' | 'Yes';
  readonly followUpNeeded: string;
  readonly needsFireflies: boolean;
  readonly firefliesReason: string;
  readonly operationallyExplanatory: boolean;
  readonly changeTimeline: FreshnessChange[];
  readonly evidence: FreshnessEvidenceRow[];
  readonly portalResult: string;
}
function collect(context: FreshnessContext): string {
  collectOpportunityFreshness(context);
  collectAuthorizationFreshness(context);
  collectStaffingFreshness(context);
  collectClinicalFreshness(context);
  collectCommunicationFreshness(context);
  const portal = parsePortalChats({
    opportunity: context.input.opp,
    sla: context.input.opp.Current_SLA__r,
    responses: context.input.portalResponses ?? [],
  });
  // The approved summary producer has no latestRelevantId; retain its empty source identifier.
  addFreshnessCandidate(context.candidates, {
    at: portal.latestRelevantAt,
    source: 'Portal chat',
    sourceRecordId: '',
    summary: portal.latestRelevantText,
    kind: 'discussion',
  });
  collectInterpretedFreshness(context);
  collectSupplementalFreshness(context);
  for (const candidate of context.candidates)
    candidate.operationalFacts ??= extractOperationalFacts({
      text: candidate.summary,
      category: context.family,
      eventDate: candidate.at,
      asOf: context.asOf,
      context: {
        direction: candidate.direction,
        line: candidate.line,
        sourceType: candidate.source,
      },
    });
  return portal.result;
}
function freshnessLabel(days: number | null): FreshnessAnalysis['updateFreshness'] {
  if (days === null) return 'Missing';
  if (days < 3) return 'Current';
  return days < 7 ? SEMI_STALE : 'Stale';
}
function freshnessFollowUp(
  label: FreshnessAnalysis['updateFreshness'],
  days: number | null,
  selection: FreshnessSelection
): string {
  if (label === 'Current') return 'No freshness follow-up required.';
  if (label === SEMI_STALE)
    return `Review the ${String(days)}-day-old update and retain it only if its documented milestone is still valid.`;
  return selection.latest
    ? `Get a current update; the latest relevant evidence is ${String(days)} days old (${selection.latest.source}).`
    : 'Get and document a current update; no relevant evidence was found.';
}
function firefliesReason(
  selection: FreshnessSelection,
  needsFireflies: boolean,
  days: number | null,
  explanatory: boolean
): string {
  if (!needsFireflies) return '';
  if (days === null || days >= 7)
    return selection.latest
      ? 'Latest provider-facing evidence is stale.'
      : 'No dated provider-facing evidence was found.';
  return explanatory
    ? 'Comprehensive all-SLA enrichment requires a Fireflies check even though structured evidence is usable.'
    : 'Recent activity exists, but it does not explain the current operational gate.';
}
export function analyzeOpportunityFreshness(input: FreshnessInput): FreshnessAnalysis {
  const family = freshnessStageFamily(input);
  const context: FreshnessContext = {
    input,
    family,
    relevant: freshnessFamilyTerms(family),
    asOf: input.asOf === undefined ? new Date() : input.asOf,
    candidates: [],
  };
  const portalResult = collect(context);
  const selection = selectFreshnessCandidates(context);
  const latest = selection.latest;
  const days = latest
    ? Math.max(0, Math.floor((selection.asOfTime - latest.time) / 86_400_000))
    : null;
  const label = freshnessLabel(days);
  const explanatory = isConcreteOperationalUpdate(family, latest);
  const needsFireflies = !selection.eligible.some((candidate) => candidate.source === 'Fireflies');
  return {
    opportunityName: input.opp.Name,
    opportunityId: input.opp.Id,
    stageFamily: family,
    latestUpdateAt: latest?.at ?? '',
    latestUpdateSource: latest?.source ?? '',
    latestUpdateSummary: latest?.summary ?? '',
    latestUpdateFact: synthesizedFact(family, latest, input.authorizationGate),
    latestIdentityAssumption: latest?.assumedIdentityMatch ? latest.assumedIdentityNote : '',
    latestMatchedAs: latest?.matchedAs ?? '',
    ...selectFreshnessFacts(selection),
    daysSinceUpdate: days,
    updateFreshness: label,
    updateNeeded: label === 'Current' ? 'No' : label === SEMI_STALE ? 'Review' : 'Yes',
    followUpNeeded: freshnessFollowUp(label, days, selection),
    needsFireflies,
    firefliesReason: firefliesReason(selection, needsFireflies, days, explanatory),
    operationallyExplanatory: explanatory,
    changeTimeline: freshnessChangeTimeline(context, selection),
    evidence: selection.eligible.map((candidate) =>
      freshnessEvidenceRow(context, candidate, latest)
    ),
    portalResult,
  };
}
