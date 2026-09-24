import { addFreshnessCandidate, type FreshnessContext } from './freshness-candidates.js';
import { firstEvidenceText } from './source-evidence-context.js';

export function collectInterpretedFreshness(context: FreshnessContext): void {
  for (const event of context.input.interpretedConversationEvents ?? []) {
    if (!event.substantive || event.relationship === 'Neutral') continue;
    addFreshnessCandidate(context.candidates, {
      at: event.eventDate,
      source: event.source,
      sourceRecordId: event.sourceRecordId,
      summary: event.text,
      kind: 'discussion',
      matchQuality: event.matchQuality,
      sourceQuality: event.matchQuality,
      assumedIdentityMatch: Boolean(event.assumedIdentityMatch),
      assumedIdentityNote: firstEvidenceText(event.assumedIdentityNote) ?? '',
      matchedAs: firstEvidenceText(event.matchedAs) ?? '',
      operationalFacts: [
        {
          type: firstEvidenceText(event.factType) ?? 'ai-interpreted-conversation',
          category: event.category,
          issueKey: event.issueKey,
          summary: event.text,
          gateImpact: event.gateImpact,
          owner: event.actionOwner,
          actionType: event.actionType,
          action: event.recommendedAction,
          milestoneDate: event.milestoneDate,
          ...(Object.hasOwn(event, 'milestoneKind') ? { milestoneKind: event.milestoneKind } : {}),
          interpretationProvenance: event.interpretationProvenance,
          followUpDate: event.followUpDate,
          relevance: event.processRelevance,
          relationship: event.relationship,
          supportSpan: event.supportSpan,
          denialReason: event.denialReason,
          aiInterpreted: true,
        },
      ],
    });
  }
}
