import { conciseFact, inlineClause } from './narrative-text.js';
import type { NarrativeFact, NarrativePacket } from './narrative-types.js';
import { dateValue, humanDate } from './recommendation-date.js';
import { asInlineSentence, normalizedFact } from './recommendation-text.js';

export function rbtCurrentState(packet: NarrativePacket): string {
  const latest = packet.newestUpdate?.fact ?? '';
  if (/request is paused/i.test(latest)) return 'The RBT request is paused.';
  if (/recruiting is active|staffing activity shows/i.test(latest))
    return 'RBT recruiting remains open.';
  if (/replacement .*required|no longer viable/i.test(latest))
    return 'Replacement staffing remains open.';
  return 'RBT staffing remains unconfirmed.';
}

export function sourceUpdateLead(
  packet: Pick<NarrativePacket, 'asOf'> & { readonly newestUpdate: NarrativeFact }
): string {
  const sourceDate = humanDate(packet.newestUpdate.date);
  const assessed = Boolean(packet.asOf);
  return assessed
    ? `Assessed through ${String(humanDate(packet.asOf))} using the ${String(sourceDate)} source update,`
    : `As of ${String(sourceDate)},`;
}

export function missingCompletionConfirmationSentence(packet: NarrativePacket): string | null {
  if (
    /TA Approved|First Day of 97153/i.test(String(packet.stage)) &&
    !(packet.story?.resolvedIssues ?? []).length &&
    /assigned|hired|matched/i.test(packet.newestUpdate?.fact ?? '') &&
    /first 97153|start date/i.test(packet.newestUpdate?.fact ?? '')
  ) {
    return 'Salesforce and linked billing do not yet show a completed first 97153 service.';
  }
  return null;
}

export function freshnessSentence(packet: NarrativePacket): string | null {
  if (packet.freshness === 'Missing') return null;
  const date = String(humanDate(packet.newestUpdate?.date));
  if (packet.freshness === 'Current')
    return `The latest substantive update is current as of ${date}.`;
  if (packet.freshness === 'Semi-Stale')
    return packet.futureMilestones?.length
      ? `The latest substantive update is from ${date}; the documented future milestone remains valid but still requires confirmation.`
      : `The latest substantive update is from ${date} and should be reconfirmed.`;
  return `The latest substantive update is from ${date} and is stale, so the current status should be reconfirmed.`;
}

export function nextStepSentence(packet: NarrativePacket): string {
  if (packet.action.type === 'No Action') return 'No additional action is currently required.';
  const action = inlineClause(packet.action.text);
  const hasDate = Boolean(packet.action.date);
  return hasDate
    ? `Next step: ${action}; follow up on ${String(humanDate(packet.action.date))}.`
    : `Next step: ${action}.`;
}

export function structuredDetailSentence(packet: NarrativePacket): string | null {
  const detail = packet.structuredGateDetail;
  if (
    !detail?.fact ||
    detail.id === packet.newestUpdate?.id ||
    normalizedFact(detail.fact) === normalizedFact(packet.newestUpdate?.fact)
  )
    return null;
  if (
    detail.factType === 'tp-revisions' &&
    packet.newestUpdate?.factType === 'tp-resubmitted-for-review' &&
    dateValue(packet.newestUpdate.date) > dateValue(detail.date)
  ) {
    return `The structured ${String(detail.source)} record still lists requested edits as of ${String(humanDate(detail.date))}; the later provider-reported resubmission needs confirmation against that record.`;
  }
  return `Structured ${String(detail.source)} evidence from ${String(humanDate(detail.date))} shows ${asInlineSentence(conciseFact(detail.fact))}`;
}
