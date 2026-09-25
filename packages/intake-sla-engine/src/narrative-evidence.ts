import { isoDate, type DateValue } from './dates.js';
import { evidenceSpecificity } from './evidence.js';
import type { NarrativeFact, NarrativePacket, NarrativeRawFact } from './narrative-types.js';
import { AUTHORIZATION_PROGRESS_TYPES } from './recommendation-authorization-progress.js';
import { dateValue } from './recommendation-date.js';

const REVISIONS = 'tp-revisions';

export function carriedSpecificRequirement(packet: NarrativePacket): NarrativeFact | null {
  const newest = packet.newestUpdate;
  if (
    !newest?.specificityMissing ||
    !['auth-additional-info', 'required-document'].includes(newest.factType ?? '')
  )
    return null;
  return (
    [
      packet.structuredGateDetail,
      ...(packet.evidenceTimeline ?? []),
      ...(packet.supportingContext ?? []),
    ].find(
      (event): event is NarrativeFact =>
        event?.id !== newest.id &&
        Boolean(event?.requestedInformation) &&
        ['Direct', 'Likely'].includes(event?.matchQuality ?? '')
    ) ?? null
  );
}

export function complementaryAuthorizationProgress(packet: NarrativePacket): NarrativeFact | null {
  const newest = packet.newestUpdate;
  if (
    !['initial-authorization', 'treatment-authorization'].includes(
      packet.story?.currentGateIssueKey ?? ''
    ) ||
    !newest?.date
  )
    return null;
  const newestDate = isoDate(newest.date);
  return (
    [...(packet.story?.timeline ?? [])]
      .filter(
        (event) =>
          event.id !== newest.id &&
          isoDate(event.date) === newestDate &&
          event.issueKey === packet.story?.currentGateIssueKey &&
          ['Direct', 'Likely'].includes(event.matchQuality ?? '') &&
          !['Superseded', 'Conflicting'].includes(event.lifecycleState ?? '') &&
          AUTHORIZATION_PROGRESS_TYPES.has(event.factType ?? '') &&
          /\b(?:appeal|correct(?:ed|ion)?|edit(?:ed|s)?|obtain(?:ed)?|receive(?:d)?|resend|resent|resubmit(?:ted)?|send|sent|submit(?:ted)?|upload(?:ed|ing)?|termination|closure)\b/i.test(
            event.fact
          ) &&
          /\b(?:not|remain|pending|unconfirmed|await|missing|without)\b/i.test(event.fact)
      )
      .sort(
        (left, right) =>
          evidenceSpecificity(right) - evidenceSpecificity(left) ||
          Number(right.matchQuality === 'Direct') - Number(left.matchQuality === 'Direct')
      )[0] ?? null
  );
}

export function corroboratedPortalRevisionDetail(packet: NarrativePacket): NarrativeRawFact | null {
  if (packet.structuredGateDetail?.factType !== REVISIONS) return null;
  const date = isoDate(packet.structuredGateDetail.date);
  return (
    [...(packet.approvedFacts ?? [])]
      .filter(
        (event) =>
          event.source === 'Portal' &&
          event.factType === REVISIONS &&
          ['Direct', 'Likely'].includes(event.matchQuality ?? '') &&
          isoDate(event.eventDate ?? event.date) === date
      )
      .sort(
        (left, right) =>
          (right.text ?? right.fact ?? '').length - (left.text ?? left.fact ?? '').length
      )[0] ?? null
  );
}

function atOrBefore(left: string | null, right: string | null): boolean {
  // Preserve the source's nullable JavaScript comparison at the date-normalization boundary.
  return left !== null && right !== null ? left <= right : Number(left) <= Number(right);
}

export function corroboratedReportedSubmissionDate(packet: NarrativePacket): DateValue {
  if (packet.structuredGateDetail?.factType !== REVISIONS) return null;
  const date = isoDate(packet.structuredGateDetail.date);
  return (
    [...(packet.approvedFacts ?? [])]
      .filter(
        (event) =>
          event.factType === 'tp-submitted' &&
          ['Direct', 'Likely'].includes(event.matchQuality ?? '') &&
          Boolean(event.milestoneDate) &&
          atOrBefore(isoDate(event.milestoneDate), date)
      )
      .sort(
        (left, right) =>
          dateValue(right.milestoneDate) - dateValue(left.milestoneDate) ||
          dateValue(right.eventDate ?? right.date) - dateValue(left.eventDate ?? left.date)
      )[0]?.milestoneDate ?? null
  );
}
