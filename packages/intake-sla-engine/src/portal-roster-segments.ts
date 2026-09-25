import type { PortalProfile, PortalRosterCandidate } from './portal-evidence-types.js';
import { sourceHtmlText } from './source-html-text.js';

function namePattern(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // eslint-disable-next-line security/detect-non-literal-regexp -- Roster text is escaped as a literal before adding the approved fixed word/possessive boundaries.
  return new RegExp(`\\b${escaped}(?:'s)?\\b`, 'ig');
}
function portalRosterNames(profile: PortalProfile): { target: string[]; competitors: string[] } {
  const roster: PortalRosterCandidate[] = [
    {
      opportunityId: profile.opportunityId,
      opportunityName: profile.opportunityName,
      nameVariants: profile.nameVariants ?? [],
    },
    ...(profile.providerRoster ?? []),
  ]
    .filter((candidate) => Boolean(candidate.opportunityName))
    .filter(
      (candidate, index, all) =>
        all.findIndex(
          (other) =>
            Boolean(candidate.opportunityId && other.opportunityId === candidate.opportunityId) ||
            String(other.opportunityName).toLowerCase() ===
              String(candidate.opportunityName).toLowerCase()
        ) === index
    );
  const target =
    roster.find((candidate) => candidate.opportunityId === profile.opportunityId) ?? roster[0];
  const counts = new Map<string, number>();
  for (const candidate of roster) {
    const first = String(candidate.opportunityName).trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    if (first.length >= 3) counts.set(first, (counts.get(first) ?? 0) + 1);
  }
  const namesFor = (candidate: PortalRosterCandidate | undefined): string[] => {
    // The routine identity producer always supplies a target name; retain rejection if it does not.
    if (!candidate)
      throw new TypeError("Cannot read properties of undefined (reading 'opportunityName')");
    const full = [candidate.opportunityName, ...(candidate.nameVariants ?? [])]
      .map((value) => (value ?? '').trim())
      .filter(Boolean);
    const first = String(candidate.opportunityName).trim().split(/\s+/)[0] ?? '';
    if (first.length >= 3 && counts.get(first.toLowerCase()) === 1) full.push(first);
    return [...new Set(full)].sort((left, right) => right.length - left.length);
  };
  return {
    target: namesFor(target),
    competitors: roster
      .filter((candidate) => candidate.opportunityId !== profile.opportunityId)
      .flatMap(namesFor),
  };
}
interface NamePosition {
  readonly index: number;
  readonly end: number;
}
function firstNamePosition(text: string, names: readonly string[], from = 0): NamePosition | null {
  let best: NamePosition | null = null;
  for (const name of names) {
    const pattern = namePattern(name);
    pattern.lastIndex = from;
    const match = pattern.exec(text);
    if (match && (!best || match.index < best.index))
      best = { index: match.index, end: match.index + match[0].length };
  }
  return best;
}
function segmentStart(text: string, index: number, competitors: readonly string[]): number {
  const boundary = Math.max(
    ...['.', '!', '?', '\n'].map((symbol) => text.lastIndexOf(symbol, index - 1))
  );
  let priorCompetitor = -1;
  for (const name of competitors) {
    const position = [...text.slice(0, index).matchAll(namePattern(name))].at(-1)?.index ?? -1;
    priorCompetitor = Math.max(priorCompetitor, position);
  }
  const prefix = /\b(?:for|regarding|as for)\s*$/i.exec(text.slice(Math.max(0, index - 14), index));
  return prefix ? index - prefix[0].length : priorCompetitor > boundary ? index : boundary + 1;
}
/** Preserve client-clause selection within multi-client provider posts, not a new matching policy. */
export function targetPortalSegments(value: unknown, profile: PortalProfile): string[] {
  const text = sourceHtmlText(value);
  if (!text) return [];
  const { target, competitors } = portalRosterNames(profile);
  const segments: string[] = [];
  let from = 0;
  while (from < text.length) {
    const mention = firstNamePosition(text, target, from);
    if (!mention) break;
    const competitor = firstNamePosition(text, competitors, mention.end);
    const segment = text
      .slice(segmentStart(text, mention.index, competitors), competitor?.index ?? text.length)
      .trim()
      .replace(/^also\s+/i, '');
    if (segment && !segments.includes(segment)) segments.push(segment);
    from = mention.end;
  }
  return segments;
}
