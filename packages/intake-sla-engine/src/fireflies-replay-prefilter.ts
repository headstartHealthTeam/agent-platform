import { z } from 'zod';

import { nameEditDistance } from './client-name.js';
import { captureProperty as field } from './google-capture-property.js';

export interface ReplayIdentity extends Readonly<Record<string, unknown>> {
  readonly opportunityId: string;
  readonly opportunityName: string;
}
export interface PreparedReplayMeeting extends Readonly<Record<string, unknown>> {
  readonly _normalizedBody: string;
  readonly _tokens: readonly string[];
  readonly _normalizedTitle: string;
  readonly _normalizedEmails: readonly string[];
}
export function replayList(value: unknown): unknown[] {
  return z.array(z.unknown()).parse(value ?? []);
}
function stringValue(value: unknown): string {
  return String(value);
}
export function normalizeReplayValue(value: unknown): string {
  return stringValue(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9@.+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function unique(values: readonly unknown[]): unknown[] {
  return [...new Set(values.flat().filter(Boolean))];
}
function meetingEmails(meeting: unknown): string[] {
  return unique([
    field(meeting, 'organizerEmail'),
    field(meeting, 'participants'),
    replayList(field(meeting, 'meetingAttendees')).map((row) => field(row, 'email')),
  ]).map(normalizeReplayValue);
}
export function prepareReplayMeeting(
  meeting: Readonly<Record<string, unknown>>
): PreparedReplayMeeting {
  const body = normalizeReplayValue(meeting['fullTranscript']);
  return {
    ...meeting,
    _normalizedBody: body,
    _tokens: [...new Set(body.split(' ').filter((token) => token.length >= 3))],
    _normalizedTitle: normalizeReplayValue(meeting['title']),
    _normalizedEmails: meetingEmails(meeting),
  };
}
function anchors(profile: ReplayIdentity): {
  providerEmails: string[];
  csmEmails: string[];
  providerTerms: string[];
} {
  const roles = replayList(profile['providerRoles']);
  return {
    providerEmails: unique(roles.flatMap((provider) => field(provider, 'emails') ?? [])).map(
      normalizeReplayValue
    ),
    csmEmails: unique([
      field(profile['currentCsm'], 'email'),
      replayList(profile['priorCsms']).map((csm) => field(csm, 'email')),
      roles.flatMap((provider) => field(provider, 'csmEmails') ?? []),
    ]).map(normalizeReplayValue),
    providerTerms: unique(
      roles.flatMap((provider) => [
        field(provider, 'names'),
        field(provider, 'practiceAliases'),
        field(provider, 'meetingAliases'),
      ])
    )
      .map(normalizeReplayValue)
      .filter((term) => term.length >= 4),
  };
}
export function replayMeetingRelationship(
  meeting: PreparedReplayMeeting,
  profile: ReplayIdentity,
  sourceCutoff: string
): 'Provider' | 'CSM' | null {
  const date = stringValue(meeting['date'] ?? '');
  const day = date.slice(0, 10);
  const window = profile['searchWindow'];
  const from = field(window, 'fromDate');
  const to = field(window, 'toDate');
  if (!day || (Boolean(from) && day < String(from)) || (Boolean(to) && day > String(to)))
    return null;
  if (sourceCutoff && Date.parse(date) > Date.parse(sourceCutoff)) return null;
  const selected = anchors(profile);
  if (meeting._normalizedEmails.some((email) => selected.providerEmails.includes(email)))
    return 'Provider';
  if (selected.providerTerms.some((term) => meeting._normalizedTitle.includes(term)))
    return 'Provider';
  if (meeting._normalizedEmails.some((email) => selected.csmEmails.includes(email))) return 'CSM';
  return null;
}
function fuzzy(tokens: readonly string[], target: string, threshold: number): boolean {
  return tokens.some(
    (token) =>
      Math.abs(token.length - target.length) <= threshold &&
      nameEditDistance(token, target, normalizeReplayValue) <= threshold
  );
}
/** Broad mention prefilter only; the reviewed roster/segmentation engine still decides admission. */
export function replayHasClientMention(
  meeting: PreparedReplayMeeting,
  profile: ReplayIdentity,
  relationship: 'Provider' | 'CSM'
): boolean {
  const body = meeting._normalizedBody;
  const aliases = unique([profile.opportunityName, ...replayList(profile['knownNameVariants'])])
    .map(normalizeReplayValue)
    .filter((value) => value.includes(' ') && value.length >= 5);
  // eslint-disable-next-line security/detect-non-literal-regexp -- Preserve the approved prefilter's pattern semantics after its fixed identity alphabet normalization; escaping changes matching behavior.
  if (aliases.some((alias) => new RegExp(`(?:^| )${alias}(?: |$)`).test(body))) return true;
  const [first = '', ...lastParts] = normalizeReplayValue(profile.opportunityName).split(' ');
  const last = lastParts.at(-1) ?? '';
  const tokens = meeting._tokens;
  const providerContext = anchors(profile).providerTerms.some((term) => body.includes(term));
  if (relationship === 'Provider' && tokens.includes(first)) return true;
  if (relationship === 'CSM' && tokens.includes(first) && providerContext) return true;
  if (!(first.length >= 3 && fuzzy(tokens, first, first.length >= 8 ? 2 : 1))) return false;
  if (!last) return true;
  const fuzzyLast = fuzzy(tokens, last, last.length >= 8 ? 2 : 1);
  const rosterFirstNames = replayList(profile['providerRoster'])
    .map((row) => normalizeReplayValue(field(row, 'opportunityName')).split(' ')[0])
    .filter(Boolean);
  const uniqueFirst = rosterFirstNames.filter((name) => name === first).length === 1;
  if (relationship === 'CSM' && !providerContext) return false;
  return fuzzyLast || uniqueFirst;
}
