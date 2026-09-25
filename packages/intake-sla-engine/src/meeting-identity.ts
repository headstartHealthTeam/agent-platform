import type { ConversationProfile } from './conversation-match-types.js';
import { normalizeOperationalText as normalize } from './conversation-text.js';
import type { MeetingSegmentProfile, SegmentableMeeting } from './meeting-segment-types.js';
import { providerClusterAnchors } from './provider-identity.js';

export function meetingNameVariants(profile: ConversationProfile): string[] {
  const primaryName = normalize(profile.opportunityName);
  const parts = primaryName.split(' ').filter(Boolean);
  const variants = new Set<string>();
  if (parts.length > 0) {
    variants.add(primaryName);
    variants.add(parts.join(''));
    variants.add([...parts].reverse().join(' '));
    if (parts.length > 1) {
      variants.add(`${parts[0] ?? ''} ${parts.at(-1)?.[0] ?? ''}`);
      variants.add(`${parts[0]?.[0] ?? ''} ${parts.at(-1) ?? ''}`);
    }
  }
  for (const alias of profile.clientAliases ?? []) {
    const normalized = normalize(alias);
    if (normalized) variants.add(normalized);
  }
  return [...variants].filter(Boolean);
}
export function meetingFirstName(profile: ConversationProfile): string {
  return normalize(profile.opportunityName).split(' ')[0] ?? '';
}
function practiceName(profile: ConversationProfile): unknown {
  return typeof profile.practice === 'string'
    ? profile.practice
    : (profile.practice?.['name'] ?? '');
}
export function meetingContainsName(text: string, variants: readonly string[]): boolean {
  const padded = ` ${normalize(text)} `;
  return variants.some((variant) => {
    const normalized = normalize(variant);
    return normalized.length >= 4 && padded.includes(` ${normalized} `);
  });
}
export function meetingContainsFirstName(text: string, first: string): boolean {
  return ` ${normalize(text)} `.includes(` ${first} `);
}
export function meetingMetadata(meeting: SegmentableMeeting | null | undefined): string {
  return [meeting?.title, ...(meeting?.participants ?? []), meeting?.organizerEmail]
    .filter(Boolean)
    .join(' ');
}
export function meetingHasProviderAnchor(
  meeting: SegmentableMeeting | null | undefined,
  profile: MeetingSegmentProfile
): boolean {
  const participantText = normalize(meetingMetadata(meeting));
  const practiceEmail =
    typeof profile.practice === 'object' ? profile.practice?.['email'] : undefined;
  const anchors = profile.providerIdentity
    ? providerClusterAnchors(profile.providerIdentity)
    : [
        ...(profile.providers ?? []).flatMap((provider) => [provider.name, provider.email]),
        practiceName(profile),
        practiceEmail,
      ].filter(Boolean);
  if (anchors.some((anchor) => participantText.includes(normalize(anchor)))) return true;
  const titleTokens = normalize(meeting?.title ?? '')
    .split(/\s+/)
    .filter((token) => token.length >= 3);
  return (profile.providers ?? []).some((provider) => {
    const first = normalize(provider.name ?? '').split(/\s+/)[0] ?? '';
    return (
      first.length >= 4 && titleTokens.some((token) => token.slice(0, 3) === first.slice(0, 3))
    );
  });
}
export function competingMeetingFirstName(
  profile: ConversationProfile,
  candidates: readonly ConversationProfile[]
): boolean {
  const first = meetingFirstName(profile);
  return (
    Boolean(first) &&
    candidates.some(
      (candidate) =>
        candidate.opportunityId !== profile.opportunityId &&
        meetingFirstName(candidate) === first &&
        normalize(practiceName(candidate)) === normalize(practiceName(profile))
    )
  );
}
export function containsCompetingMeetingClient(
  text: string,
  profile: ConversationProfile,
  candidates: readonly ConversationProfile[]
): boolean {
  return candidates.some((candidate) => {
    if (candidate.opportunityId === profile.opportunityId) return false;
    if (meetingContainsName(text, meetingNameVariants(candidate))) return true;
    const first = meetingFirstName(candidate);
    return (
      first.length >= 3 &&
      normalize(practiceName(candidate)) === normalize(practiceName(profile)) &&
      meetingContainsFirstName(text, first)
    );
  });
}
export function meetingTopicBoundary(
  text: string,
  profile: ConversationProfile,
  candidates: readonly ConversationProfile[]
): boolean {
  return (
    !meetingContainsName(text, meetingNameVariants(profile)) &&
    containsCompetingMeetingClient(text, profile, candidates)
  );
}
export function meetingRosterProfiles(
  profile: MeetingSegmentProfile,
  candidates: readonly MeetingSegmentProfile[]
): MeetingSegmentProfile[] {
  return [profile, ...candidates].filter(
    (candidate, index, all) =>
      all.findIndex(
        (other) =>
          (other.opportunityId ?? other.opportunityName) ===
          (candidate.opportunityId ?? candidate.opportunityName)
      ) === index
  );
}
export function containsMeetingRosterIdentity(
  text: string,
  candidate: MeetingSegmentProfile,
  roster: readonly MeetingSegmentProfile[]
): boolean {
  if (meetingContainsName(text, meetingNameVariants(candidate))) return true;
  const first = meetingFirstName(candidate);
  return (
    first.length >= 3 &&
    meetingContainsFirstName(text, first) &&
    roster.filter((record) => meetingFirstName(record) === first).length === 1
  );
}
