import { nameEditDistance } from './client-name.js';
import type { ConversationProfile } from './conversation-match-types.js';
import { normalizeIdentityValue } from './provider-identity-values.js';

export function normalizeConversationValue(value: unknown = ''): string {
  return normalizeIdentityValue(String(value));
}
export function uniqueConversationValues(values: readonly unknown[] = []): unknown[] {
  return [...new Set(values.flat().filter(Boolean))];
}
function similarity(left = '', right = ''): number {
  const a = normalizeConversationValue(left);
  const b = normalizeConversationValue(right);
  if (a.length === 0 || b.length === 0) return 0;
  if (a === b) return 1;
  return Math.max(
    0,
    1 - nameEditDistance(a, b, normalizeIdentityValue) / Math.max(a.length, b.length)
  );
}
function phraseWindows(text: string, size: number): string[] {
  const tokens = normalizeConversationValue(text).split(' ').filter(Boolean);
  if (size === 0 || tokens.length < size) return [];
  return Array.from({ length: tokens.length - size + 1 }, (_, index) =>
    tokens.slice(index, index + size).join(' ')
  );
}
function clientAliases(profile: ConversationProfile): string[] {
  return uniqueConversationValues([
    profile.opportunityName,
    profile.name,
    profile.clientName,
    profile.knownNameVariants,
    profile.clientAliases,
  ])
    .map(normalizeConversationValue)
    .filter(Boolean);
}
export interface ConversationNameMatch {
  score: number;
  matchedAs: string;
  kind: string;
}
function fuzzyFullName(body: string, aliases: readonly string[]): ConversationNameMatch {
  let best = { score: 0, matchedAs: '', kind: 'No client name' };
  for (const alias of aliases) {
    const parts = alias.split(' ');
    for (const window of phraseWindows(body, parts.length)) {
      let total = 0;
      for (const [index, part] of parts.entries())
        total += similarity(part, window.split(' ').at(index));
      const score = total / parts.length;
      if (score >= 0.78 && Math.round(score * 36) > best.score)
        best = { score: Math.round(score * 36), matchedAs: window, kind: 'Fuzzy full name' };
    }
  }
  return best;
}
export function bestConversationNameMatch(
  text: string,
  profile: ConversationProfile
): ConversationNameMatch {
  const body = normalizeConversationValue(text);
  const primaryName = normalizeConversationValue(profile.opportunityName ?? profile.name);
  const fullAliases = clientAliases(profile).filter((alias) => alias.includes(' '));
  const exact = fullAliases.find((alias) => body.includes(alias));
  if (exact !== undefined)
    return {
      score: 40,
      matchedAs: exact,
      kind: exact === primaryName ? 'Exact full name' : 'Exact verified alias',
    };
  const targetFirst = primaryName.split(' ')[0] ?? '';
  return firstNameMatch(body, targetFirst, fuzzyFullName(body, fullAliases));
}
function firstNameMatch(
  body: string,
  targetFirst: string,
  initial: ConversationNameMatch
): ConversationNameMatch {
  let best = initial;
  if (targetFirst.length >= 3) {
    for (const token of body.split(' ')) {
      const score = similarity(targetFirst, token);
      const points = token === targetFirst || score >= 0.8 ? 25 : 0;
      if (points > best.score)
        best = {
          score: points,
          matchedAs: token,
          kind: token === targetFirst ? 'Exact first name' : 'Fuzzy first name',
        };
    }
  }
  return best;
}
