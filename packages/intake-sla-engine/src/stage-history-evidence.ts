import { createEvidenceEvent, type EvidenceEvent } from './evidence.js';
import { categoryForGate } from './gate-context.js';
import {
  firstEvidenceText,
  requiredEvidenceValue,
  type SourceEvidenceContext,
} from './source-evidence-context.js';
import type { StageTransition } from './stage-entry.js';

export interface StageHistoryRecord extends StageTransition {
  readonly Id?: string | null;
}
export interface StageHistoryEvidenceInput extends SourceEvidenceContext {
  readonly records?: readonly StageHistoryRecord[] | null;
}
function normalized(value: StageTransition['NewValue'] = ''): string {
  return String(value).toLowerCase().replace(/\s+/g, ' ').trim();
}
export function adaptStageHistory({
  records,
  profile,
  gate,
  asOf,
}: StageHistoryEvidenceInput): EvidenceEvent[] {
  const stage = normalized(profile.stage);
  return (records ?? [])
    .filter((record) => /stage/i.test(record.Field ?? '') && normalized(record.NewValue) === stage)
    .map((record) =>
      createEvidenceEvent({
        opportunityId: profile.opportunityId,
        source: 'Salesforce Stage History',
        sourceRecordId: requiredEvidenceValue(record.Id, 'sourceRecordId'),
        eventDate: requiredEvidenceValue(firstEvidenceText(record.CreatedDate, asOf), 'eventDate'),
        category: categoryForGate(gate),
        text: `The Opportunity entered ${String(record.NewValue)}.`,
        matchQuality: 'Direct',
        substantive: true,
        relationship: 'Neutral',
        processRelevance: 4,
      })
    );
}
