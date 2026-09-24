import { nextStepSentence } from './narrative-state.js';
import type { NarrativePacket } from './narrative-types.js';
import { humanDate } from './recommendation-date.js';
import { capitalize, requiredItemIsPlural } from './recommendation-text.js';

export function specialOperationalSummary(packet: NarrativePacket): string | null {
  const newest = packet.newestUpdate;
  if (newest?.factType === 'tp-portal-submitted-awaiting-clinical-quality')
    return [
      `The provider submitted portal Treatment Authorization request${newest.sourceRecordId ? ` #${newest.sourceRecordId}` : ''} on ${String(humanDate(newest.date))}.`,
      `The Opportunity remains in ${packet.stage}.`,
      "No matching Salesforce Treatment Authorization or Clinical Quality record is present, so the provider submission has not entered Headstart's downstream review workflow.",
      'The next internal milestone is creation of the Salesforce Authorization and Clinical Quality records and movement to Treatment Plan In-review; this is not payer submission.',
      nextStepSentence(packet),
    ].join(' ');
  if (packet.startEvidenceConflict)
    return [
      `The client is currently in ${packet.stage}.`,
      `On ${String(humanDate(packet.startEvidenceConflict.reportedDate))}, the provider reported that direct-care treatment had started.`,
      `That conflicts with the staffing record showing ${String(humanDate(packet.startEvidenceConflict.plannedDate))} as the planned start, and Salesforce and linked billing have no completed first 97153 service.`,
      'The actual treatment-start date remains unverified.',
      nextStepSentence(packet),
    ].join(' ');
  const conflict = packet.iaCompletionDocumentationConflict;
  if (!conflict) return null;
  const requiredDate = humanDate(conflict.requiredItemDate);
  const plural = requiredItemIsPlural(conflict.requiredItem);
  return [
    'Initial authorization is approved, and the case is waiting for confirmed IA completion.',
    `On ${String(humanDate(conflict.reportedDate))}, the provider reported that the IA occurred, but Salesforce and linked billing do not show a completed assessment date.`,
    `${capitalize(conflict.requiredItem)} ${plural ? 'were' : 'was'} also still outstanding${requiredDate ? ` as of ${requiredDate}` : ''}.`,
    'Those records conflict and must be reconciled before the case advances to treatment-plan work.',
    nextStepSentence(packet),
  ].join(' ');
}
