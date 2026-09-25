import type { DelayHistory } from './delay-history-types.js';
import {
  CURRENT_POSITION_MARKER,
  delayHistoryOmissions,
  renderDelayHistory,
} from './delay-history.js';
import { operationalSummary } from './narrative-operational.js';
import { augmentShortSummary } from './narrative-scope.js';
import { shortHumanSummary } from './narrative-short.js';
import type { NarrativeAction, NarrativePacket } from './narrative-types.js';

export function renderCurrentRecommendation<A extends NarrativeAction>(
  packet: NarrativePacket & { readonly action: A }
): { suggestedSlaSummary: string; operationalSummary: string } & A {
  const summary = augmentShortSummary(shortHumanSummary(packet), packet);
  return {
    suggestedSlaSummary: summary,
    operationalSummary: operationalSummary(packet),
    ...packet.action,
  };
}

export function renderRecommendation<A extends NarrativeAction>(
  packet: NarrativePacket & { readonly action: A }
): {
  suggestedSlaSummary: string;
  operationalSummary: string;
  delayHistory: DelayHistory | null;
} & A {
  const current = renderCurrentRecommendation(packet);
  const history = renderDelayHistory(packet.delayHistory);
  const summary = history
    ? `${CURRENT_POSITION_MARKER}\n${current.operationalSummary}\n\nDelay history:\n${history}`
    : current.operationalSummary;
  const omissions = delayHistoryOmissions(packet.delayHistory, summary);
  if (omissions.length) throw new Error('Material delay history was omitted from the narrative');
  return { ...current, operationalSummary: summary, delayHistory: packet.delayHistory ?? null };
}

export function assertNoRawLeakage(
  recommendation: { readonly suggestedSlaSummary: string; readonly operationalSummary: string },
  events: readonly { readonly rawText?: string | null | undefined }[]
): boolean {
  const text =
    `${recommendation.suggestedSlaSummary} ${recommendation.operationalSummary}`.toLowerCase();
  return events
    .filter((event) => Boolean(event.rawText && event.rawText.length >= 40))
    .every((event) => !text.includes((event.rawText ?? '').toLowerCase().slice(0, 40)));
}
