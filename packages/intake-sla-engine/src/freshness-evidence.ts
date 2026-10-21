import type { FreshnessCandidate, FreshnessContext } from './freshness-candidates.js';
import {
  isConcreteOperationalUpdate,
  isGenericOperationalPlaceholder,
} from './freshness-classification.js';
import { processGateScore } from './freshness-score.js';
import { synthesizedFact } from './freshness-summary.js';
import { firstEvidenceText } from './source-evidence-context.js';

export interface FreshnessEvidenceRow {
  readonly opportunityId: string;
  readonly source: string;
  readonly sourceRecordId: string | null;
  readonly eventDate: string;
  readonly collectedAt: string;
  readonly category: string;
  readonly issueKey: string | null | undefined;
  readonly text: string;
  readonly rawText: string;
  readonly matchQuality: string;
  readonly sourceQuality: string;
  readonly substantive: boolean;
  readonly relationship: string;
  readonly processGateRelevance: string;
  readonly processGateScore: number;
  readonly matchedEntities: { readonly opportunityId: string; readonly opportunityName: string };
  readonly matchScore: number | null;
  readonly matchReasons: readonly string[];
  readonly assumedIdentityMatch: boolean;
  readonly assumedIdentityNote: string;
  readonly matchedAs: string;
  readonly factType: string | null;
  readonly denialReason: string | null;
  readonly requestedInformation: string | null;
  readonly specificityMissing: boolean;
  readonly candidateName: string | null;
  readonly candidateStep: string | null;
  readonly candidateActive: boolean | null;
  readonly gateImpact: string | null;
  readonly milestoneDate: string | null;
  readonly milestoneKind?: string | null | undefined;
  readonly interpretationProvenance: unknown;
  readonly supportSpan: string | null | undefined;
  readonly followUpDate: string | null;
  readonly actionOwner: string | null;
  readonly actionType: string | null;
  readonly recommendedAction: string | null;
  readonly fact: string;
  readonly supportsCurrentConclusion: boolean;
}
export function freshnessEvidenceRow(
  context: FreshnessContext,
  candidate: FreshnessCandidate,
  latest: FreshnessCandidate | null
): FreshnessEvidenceRow {
  const fact = candidate.operationalFacts?.[0] ?? null;
  const synthesized =
    firstEvidenceText(fact?.summary) ??
    synthesizedFact(context.family, candidate, context.input.authorizationGate);
  const substantive =
    !isGenericOperationalPlaceholder(synthesized) &&
    (Boolean(fact) || isConcreteOperationalUpdate(context.family, candidate));
  const asOf = context.asOf;
  return {
    opportunityId: context.input.opp.Id,
    source: candidate.source,
    sourceRecordId: candidate.sourceRecordId,
    eventDate: candidate.at,
    collectedAt:
      asOf instanceof Date
        ? asOf.toISOString()
        : new Date(asOf === null ? 0 : (asOf ?? Number.NaN)).toISOString(),
    category: firstEvidenceText(fact?.category) ?? context.family,
    issueKey: fact?.issueKey,
    text: synthesized,
    rawText: candidate.summary,
    matchQuality: candidate.matchQuality,
    sourceQuality: candidate.sourceQuality,
    substantive,
    relationship: firstEvidenceText(fact?.relationship) ?? 'Supports',
    processGateRelevance: substantive ? 'Relevant' : 'Not Relevant',
    processGateScore: processGateScore(context.family, candidate),
    matchedEntities: {
      opportunityId: context.input.opp.Id,
      opportunityName: context.input.opp.Name,
    },
    matchScore: candidate.matchScore,
    matchReasons: candidate.matchReasons,
    assumedIdentityMatch: candidate.assumedIdentityMatch,
    assumedIdentityNote: candidate.assumedIdentityNote,
    matchedAs: candidate.matchedAs,
    factType: firstEvidenceText(fact?.type, candidate.kind) ?? null,
    denialReason: firstEvidenceText(fact?.denialReason) ?? null,
    requestedInformation: firstEvidenceText(fact?.requestedInformation) ?? null,
    specificityMissing: Boolean(fact?.specificityMissing),
    candidateName: firstEvidenceText(candidate.candidateName) ?? null,
    candidateStep: firstEvidenceText(candidate.candidateStep) ?? null,
    candidateActive: candidate.candidateActive,
    gateImpact: firstEvidenceText(fact?.gateImpact) ?? null,
    milestoneDate: firstEvidenceText(fact?.milestoneDate) ?? null,
    ...(Object.hasOwn(fact ?? {}, 'milestoneKind') ? { milestoneKind: fact?.milestoneKind } : {}),
    interpretationProvenance: fact?.interpretationProvenance,
    supportSpan: fact?.supportSpan,
    followUpDate: firstEvidenceText(fact?.followUpDate) ?? null,
    actionOwner: firstEvidenceText(fact?.owner) ?? null,
    actionType: firstEvidenceText(fact?.actionType) ?? null,
    recommendedAction: firstEvidenceText(fact?.action) ?? null,
    fact:
      firstEvidenceText(fact?.summary) ??
      synthesizedFact(context.family, candidate, context.input.authorizationGate),
    supportsCurrentConclusion: candidate === latest,
  };
}
