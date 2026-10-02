import type { DateValue } from './dates.js';
import type { NarrativeIssue, NarrativePacket } from './narrative-types.js';
import { dateValue, humanDate } from './recommendation-date.js';

export function issueLabel(issueKey = ''): string {
  const labels = new Map([
    ['provider-capacity', 'provider capacity'],
    ['family-availability', 'family availability or care-plan feasibility'],
    ['required-documentation', 'required documentation'],
    ['initial-authorization', 'initial authorization'],
    ['treatment-authorization', 'treatment authorization'],
    ['insurance-verification', 'insurance verification'],
    ['clinical-review', 'clinical review'],
    ['payer-submission', 'payer submission'],
    ['treatment-plan', 'treatment-plan completion'],
    ['first-97153', 'the first 97153 service'],
    ['rbt-staffing', 'RBT staffing'],
    ['initial-assessment', 'the initial assessment'],
  ]);
  return labels.get(issueKey) ?? issueKey.replace(/-/g, ' ');
}

export function resolvedBusinessDate(packet: NarrativePacket, issue: NarrativeIssue): DateValue {
  const resolver = packet.story?.timeline?.find((event) => event.id === issue.resolvedByEventId);
  const explicitDate = /\b(?:verified|approved) on (\d{4}-\d{2}-\d{2})\b/i.exec(
    resolver?.fact ?? ''
  )?.[1];
  return explicitDate ?? issue.resolvedDate;
}

export function resolvedProgressSentence(packet: NarrativePacket): string | null {
  const latestUpdateTime = dateValue(packet.newestUpdate?.date);
  const resolved = (packet.story?.resolvedIssues ?? []).filter((issue) => {
    const resolver = packet.story?.timeline?.find((event) => event.id === issue.resolvedByEventId);
    return (
      resolver?.factType !== 'future-diagnostic-requirement' &&
      !(
        issue.issueKey === 'required-documentation' && resolver?.factType === 'auth-additional-info'
      ) &&
      resolver?.id !== packet.newestUpdate?.id &&
      (!latestUpdateTime || dateValue(issue.resolvedDate) <= latestUpdateTime)
    );
  });
  if (!resolved.length) return null;
  const material = resolved.slice(-2);
  const insurance = material.find((issue) => issue.issueKey === 'insurance-verification');
  if (insurance && /^Insurance Verification$/i.test(String(packet.stage))) {
    const date = humanDate(resolvedBusinessDate(packet, insurance));
    return `Earlier in this SLA, VOB and eligibility were completed${date ? ` on ${date}` : ''}, clearing the coverage check while the separate intake requirement remained.`;
  }
  return `Earlier in this SLA, ${material
    .map((issue) => {
      const date = humanDate(resolvedBusinessDate(packet, issue));
      return `${issueLabel(issue.issueKey)} was resolved${date ? ` on ${date}` : ''}`;
    })
    .join(' and ')}, allowing the process to advance.`;
}

export function futureCycleContextSentence(packet: NarrativePacket): string | null {
  const event = [...(packet.story?.timeline ?? [])]
    .reverse()
    .find((candidate) => candidate.factType === 'future-diagnostic-requirement');
  if (!event) return null;
  const date = humanDate(event.date);
  return `${date ? `Separately, as of ${date}, ` : 'Separately, '}the family is pursuing updated diagnostic documentation for a future authorization cycle; it is not the blocker for the current payer determination.`;
}
