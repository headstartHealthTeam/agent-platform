import { isoDate } from './dates.js';
import type { NarrativePacket } from './narrative-types.js';
import { humanDate } from './recommendation-date.js';

export function futureMilestoneLabels(packet: NarrativePacket): (string | null)[] {
  const labels = new Map<string, string | null>();
  const asOfDate = isoDate(packet.asOf);
  // The approved renderer requires a valid assessment date for calendar-label inference.
  if (asOfDate === null)
    throw new TypeError('A valid assessment date is required for future milestone labels.');
  const year = Number(asOfDate.slice(0, 4));
  for (const event of packet.futureMilestones ?? []) {
    const date = isoDate(event.milestoneDate);
    if (date && date >= asOfDate) labels.set(date, humanDate(date));
  }
  const months = new Map([
    ['january', 1],
    ['february', 2],
    ['march', 3],
    ['april', 4],
    ['may', 5],
    ['june', 6],
    ['july', 7],
    ['august', 8],
    ['september', 9],
    ['october', 10],
    ['november', 11],
    ['december', 12],
  ]);
  for (const event of [...(packet.evidenceTimeline ?? []), ...(packet.priorContext ?? [])]) {
    for (const match of event.fact.matchAll(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\b/gi
    )) {
      const month = months.get((match[1] ?? '').toLowerCase());
      const day = Number(match[2]);
      const date = `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (date >= asOfDate) labels.set(date, `${String(month)}/${String(day)}`);
    }
  }
  return [...labels.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, label]) => label)
    .slice(0, 2);
}

export function futureMilestoneSentence(packet: NarrativePacket): string | null {
  const milestone = packet.futureMilestones?.[0];
  if (!milestone?.milestoneDate) return null;
  const date = String(humanDate(milestone.milestoneDate));
  if (milestone.source === 'RBT First Interview')
    return `The RBT interview is planned for ${date}; its outcome and the staffing decision remain unconfirmed.`;
  if (milestone.factType === 'treatment-start-conditional')
    return `The family tentatively requested ${date}, but staffing must be confirmed before it becomes a start plan.`;
  const context =
    `${String(packet.processPosition)} ${String(packet.unresolvedGate)}`.toLowerCase();
  if (/rbt|97153|staff|direct-care|treatment start/.test(context)) {
    return milestone.id && milestone.id === packet.newestUpdate?.id
      ? `The start is planned for ${date} and still requires completion confirmation.`
      : `A start is planned for ${date}, but it is not confirmation that the first 97153 occurred.`;
  }
  if (/assessment|\bia\b|initial consultation/.test(context))
    return `The initial assessment is planned for ${date}, but completion still must be confirmed.`;
  return `The next milestone is planned for ${date}; it has not yet occurred.`;
}
