import { nameEditDistance, normalizeClientName } from './client-name.js';

export interface RosterCandidate {
  readonly [key: string]: unknown;
  readonly opportunityId?: string | null | undefined;
  readonly opportunityName?: string | null | undefined;
  readonly knownNameVariants?: readonly string[] | null;
  readonly clientAliases?: readonly string[] | null;
}
export interface RosterNameScore {
  score: number;
  matchedTokens: string;
  matchedName?: string;
}
function phoneticKey(value: string): string {
  return normalizeClientName(value)
    .replace(/^kn/, 'n')
    .replace(/^wr/, 'r')
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/qu/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/tion/g, 'shun')
    .replace(/[aeiouy]+/g, '')
    .replace(/(.)\1+/g, '$1')
    .slice(0, 8);
}
function tokenSimilarity(left = '', right = ''): number {
  const a = normalizeClientName(left);
  const b = normalizeClientName(right);
  if (a.length === 0 || b.length === 0) return 0;
  if (a === b) return 1;
  const editScore = Math.max(0, 1 - nameEditDistance(a, b) / Math.max(a.length, b.length));
  const phonetic = phoneticKey(a);
  const phoneticScore =
    Math.min(a.length, b.length) >= 4 && phonetic.length > 0 && phonetic === phoneticKey(b)
      ? 0.9
      : 0;
  return Math.max(editScore, phoneticScore);
}
const COMMON_SPEECH_TOKENS = new Set([
  'about',
  'again',
  'aloha',
  'also',
  'because',
  'could',
  'family',
  'going',
  'maybe',
  'other',
  'over',
  'provider',
  'really',
  'should',
  'their',
  'there',
  'these',
  'thing',
  'think',
  'those',
  'wasn',
  'would',
]);
function nameScore(name: string, tokens: readonly string[]): number {
  const parts = normalizeClientName(name).split(' ').filter(Boolean);
  if (parts.length === 0 || tokens.length !== parts.length) return 0;
  if (parts.length === 1) return tokenSimilarity(parts[0], tokens[0]);
  const first = tokenSimilarity(parts[0], tokens[0]);
  const last = tokenSimilarity(parts.at(-1), tokens.at(-1));
  const middle =
    parts.length > 2
      ? parts
          .slice(1, -1)
          .reduce((sum, part, index) => sum + tokenSimilarity(part, tokens.at(index + 1)), 0) /
        (parts.length - 2)
      : 1;
  return first * 0.5 + last * 0.4 + middle * 0.1;
}
function candidateNames(candidate: RosterCandidate): string[] {
  return [
    candidate.opportunityName,
    ...(candidate.knownNameVariants ?? []),
    ...(candidate.clientAliases ?? []),
  ].filter(
    (value, index, all): value is string =>
      typeof value === 'string' && value.length > 0 && all.indexOf(value) === index
  );
}
export function bestRosterFullNameMatch(text: string, candidate: RosterCandidate): RosterNameScore {
  const tokens = normalizeClientName(text).split(' ').filter(Boolean);
  let best: RosterNameScore = { score: 0, matchedTokens: '' };
  for (const name of candidateNames(candidate)) {
    const length = normalizeClientName(name).split(' ').filter(Boolean).length;
    if (length < 2 || tokens.length < length) continue;
    for (let index = 0; index <= tokens.length - length; index++) {
      const window = tokens.slice(index, index + length);
      const score = nameScore(name, window);
      if (score > best.score) best = { score, matchedTokens: window.join(' '), matchedName: name };
    }
  }
  return best;
}
export function bestRosterFirstNameMatch(
  text: string,
  candidate: RosterCandidate
): RosterNameScore {
  const target = normalizeClientName(candidate.opportunityName).split(' ')[0] ?? '';
  let best: RosterNameScore = { score: 0, matchedTokens: '' };
  if (target.length < 4) return best;
  for (const token of normalizeClientName(text)
    .split(' ')
    .filter((value) => value.length >= 4)) {
    if (token !== target && COMMON_SPEECH_TOKENS.has(token)) continue;
    const score = tokenSimilarity(target, token);
    if (score > best.score) best = { score, matchedTokens: token };
  }
  return best;
}
