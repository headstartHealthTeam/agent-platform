import { getStageContract } from './contracts.js';
import type { EvidenceEvent } from './evidence.js';
import { buildFactPacket } from './fact-packet.js';
import { refineGateWithEvidence } from './gate-context.js';
import type {
  FactPacket,
  RecommendationAction,
  RecommendationEvent,
  RecommendationGate,
} from './recommendation-types.js';
import { renderRecommendation } from './recommendation.js';
import { reportGateCategory } from './report-authoritative-evidence.js';
import type { ReportBillingRow } from './report-billing.js';
import type { PreparedReportComparison } from './report-comparison-context.js';
import { reportPreferred, reportText } from './report-display-values.js';
import type { ReportOpportunityContext } from './report-opportunity-context.js';
import type { SourceOutcome } from './source-outcome.js';
import { createSourceResult, type SourceResult } from './source-result.js';
import { auditRecommendationSpecificity } from './specificity-audit.js';
import type { SpecificityAudit } from './specificity-types.js';

export type ReportRecommendationSource = Omit<SourceOutcome, 'detail'> & {
  readonly detail: string | null;
};
export function reportCoreSourceResults<T extends EvidenceEvent>(
  outcomes: readonly ReportRecommendationSource[],
  events: readonly T[],
  collectedAt: string
): SourceResult<T>[] {
  return outcomes.map((outcome) =>
    createSourceResult({
      source: outcome.source,
      searchStatus: outcome.status,
      events: events.filter((event) => event.source === outcome.source),
      failureReason: ['Blocked', 'Timed Out', 'Unsupported'].includes(outcome.status)
        ? outcome.detail
        : null,
      collectedAt,
      recordCount: outcome.recordsRetrieved,
      required: outcome.required,
    })
  );
}
export interface ReportRecommendationInput<T extends EvidenceEvent & RecommendationEvent> {
  readonly context: ReportOpportunityContext;
  readonly comparison: PreparedReportComparison;
  readonly stageFamily: string;
  readonly billing: ReportBillingRow | undefined;
  readonly events: readonly T[];
  readonly outcomes: readonly ReportRecommendationSource[];
  readonly runAt: Date;
}
export interface ReportRecommendation<T extends EvidenceEvent & RecommendationEvent> {
  readonly gate: RecommendationGate;
  readonly results: SourceResult<T>[];
  readonly packet: FactPacket<T> & { readonly specificityAudit: SpecificityAudit };
  readonly recommendation: ReturnType<typeof renderRecommendation<RecommendationAction>>;
  readonly specificityAudit: SpecificityAudit;
}
/** Only current structured resolver conflicts enter the final gate; comparison text is context. */
function coreGate<T extends EvidenceEvent & RecommendationEvent>(
  input: ReportRecommendationInput<T>
): RecommendationGate {
  const { context, comparison } = input;
  const { opp, authorizationGate } = context;
  if (opp.StageName === null) throw new TypeError('Opportunity stage cannot be null');
  const contract = getStageContract(opp.StageName);
  const auth = authorizationGate.required ? authorizationGate : null;
  const unresolved = auth && !auth.satisfied;
  return {
    processPosition: unresolved
      ? auth.phase === 'initial'
        ? 'Initial authorization'
        : 'Treatment authorization'
      : reportPreferred(contract?.position, opp.StageName),
    unresolvedGate: unresolved
      ? auth.blocker
      : reportText(contract?.unresolvedGate, comparison.expanded.blocker),
    gateCategory: reportGateCategory(input.stageFamily),
    owner: unresolved
      ? 'Insurance Ops'
      : reportText(contract?.defaultOwner, comparison.actionModel.actionOwner, 'CSM'),
    recommendedAction: null,
    recommendedActionType: null,
    recommendedFollowUpDate: null,
    confidence: reportText(comparison.expanded.confidence, auth?.conflict ? 'Low' : 'High'),
    readyToCopy: 'Review',
    authorization: auth,
    conflicts: [
      auth?.conflict ? auth.conflictReason : null,
      ...(input.billing?.reconciliation.reviewReasons ?? []),
      ...(input.billing?.reconciliation.gaps ?? []),
    ].filter((value): value is string => Boolean(value)),
  };
}
export function buildReportRecommendation<T extends EvidenceEvent & RecommendationEvent>(
  input: ReportRecommendationInput<T>
): ReportRecommendation<T> {
  const { context, comparison, events, runAt } = input;
  const { opp, identity } = context;
  const gate = coreGate(input);
  if (opp.StageName === null) throw new TypeError('Opportunity stage cannot be null');
  const recommendationGate =
    input.stageFamily === 'insurance'
      ? gate
      : refineGateWithEvidence(gate, events, {
          csm: reportPreferred(opp.CSM__c, null) ?? null,
          stageEntryDate: identity.stageEntryDate,
        });
  const results = reportCoreSourceResults(input.outcomes, events, runAt.toISOString());
  const initialPacket = buildFactPacket({
    opportunity: {
      id: opp.Id,
      name: opp.Name,
      stage: opp.StageName,
      stageEntryDate: identity.stageEntryDate,
      slaCreatedDate: reportPreferred(opp.Current_SLA__r?.CreatedDate, null),
      csm: reportPreferred(opp.CSM__c, null),
      provider: comparison.provider,
    },
    gate: recommendationGate,
    evidenceEvents: events,
    sourceResults: results,
    asOf: runAt,
  });
  const recommendation = renderRecommendation(initialPacket);
  const specificityAudit = auditRecommendationSpecificity({
    packet: initialPacket,
    recommendation,
  });
  const gaps = [...initialPacket.gaps];
  for (const issue of specificityAudit.issues)
    if (!gaps.includes(issue.description)) gaps.push(issue.description);
  const packet = {
    ...initialPacket,
    specificityAudit,
    gaps,
    readyToCopy:
      specificityAudit.requiresReview && initialPacket.readyToCopy === 'Yes'
        ? 'Review'
        : initialPacket.readyToCopy,
  };
  return { gate: recommendationGate, results, packet, recommendation, specificityAudit };
}
