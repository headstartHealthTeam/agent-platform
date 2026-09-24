import type { NarrativePacket } from './narrative-types.js';
import { cleanTerminalPunctuation, shortenSentence } from './recommendation-text.js';

export function materialAuthorizationScopeSentence(packet: NarrativePacket): string | null {
  if (!/^TA\b/i.test(packet.stage)) return null;
  const event = (packet.story?.timeline ?? []).find(
    (candidate) =>
      candidate.issueKey === 'treatment-authorization' &&
      /partial(?:ly)? approved|approved only part|denied [\d,]+ of [\d,]+ units/i.test(
        candidate.fact
      )
  );
  if (!event && !/partial(?:ly)?\s*approv/i.test(packet.authorization?.state ?? '')) return null;
  const units = /denied ([\d,]+) of ([\d,]+) units/i.exec(event?.fact ?? '');
  const peerReview = /peer-to-peer|peer review/i.test(event?.fact ?? '');
  if (units)
    return `TA is only partially approved: ${units[1] ?? ''} of ${units[2] ?? ''} requested units remain denied${peerReview ? ', with peer review requested' : ''}`;
  return `TA is only partially approved${peerReview ? ', with peer review requested for the denied scope' : '; the denied scope remains unresolved'}`;
}

export function augmentShortSummary(summary: string, packet: NarrativePacket): string {
  const scope = materialAuthorizationScopeSentence(packet);
  if (scope && /partial(?:ly)?\s*approv/i.test(packet.authorization?.state ?? '')) {
    summary = summary.replace(
      /TA was denied because/i,
      'TA was partially approved; the payer denied the remaining scope because'
    );
    if (summary.length > 254) summary = shortenSentence(summary, 254);
  }
  if (!scope || /partial(?:ly)? approved|requested units remain denied/i.test(summary))
    return summary;
  const reserved = scope.length + 2;
  const base =
    summary.length + reserved <= 254 ? summary : shortenSentence(summary, 254 - reserved);
  return `${cleanTerminalPunctuation(base)}. ${scope}.`;
}
