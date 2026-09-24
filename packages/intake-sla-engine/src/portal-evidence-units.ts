import type {
  MergedPortalChat,
  PortalEvidenceUnit,
  PortalProfile,
} from './portal-evidence-types.js';
import { targetPortalSegments } from './portal-roster-segments.js';
import { sourceHtmlText } from './source-html-text.js';
import { assessTextMatch } from './text-match.js';

function normalize(value: string | null | undefined = ''): string {
  return String(value).toLowerCase().replace(/\s+/g, ' ').trim();
}
export function portalIdentity(
  chat: MergedPortalChat,
  profile: PortalProfile,
  directLookup: boolean
): { direct: boolean; quality: string } {
  const ids = new Set(
    [profile.opportunityId, ...(profile.salesforceRecordIds ?? [])].filter(Boolean)
  );
  const linkedIds = [
    chat.opportunityId,
    chat.salesforceOpportunityId,
    chat.clientId,
    chat.salesforceRecordId,
  ].filter((value): value is string => Boolean(value));
  const explicitRecord = linkedIds.some((id) => ids.has(id));
  const explicitClient = normalize(chat.clientName) === normalize(profile.opportunityName);
  const proposed =
    (chat.matchQuality === 'Direct' || chat.matchQuality === 'Likely') &&
    chat.proposedOpportunityId === profile.opportunityId;
  return {
    direct: explicitRecord || explicitClient || directLookup || proposed,
    quality: proposed ? (chat.matchQuality ?? '') : 'Direct',
  };
}
export function portalUnits(
  chat: MergedPortalChat,
  profile: PortalProfile,
  identity: { direct: boolean; quality: string }
): PortalEvidenceUnit[] {
  const messages = (chat.messages ?? []).filter((message) =>
    Boolean(sourceHtmlText(message.content))
  );
  if (!messages.length) return [];
  if (identity.direct)
    return [
      {
        messages,
        anchor: [...messages].sort(
          (left, right) =>
            new Date(right.createdAt === null ? 0 : (right.createdAt ?? NaN)).valueOf() -
            new Date(left.createdAt === null ? 0 : (left.createdAt ?? NaN)).valueOf()
        )[0],
        quality: identity.quality,
      },
    ];
  const sourceContext = [
    chat.providerName,
    chat.practiceName,
    chat.clientName,
    ...chat.returnedChannelLabels,
  ]
    .filter(Boolean)
    .join(' ');
  return messages
    .map((message, index) => {
      const window = messages.slice(Math.max(0, index - 1), index + 2);
      const targetSegments = window.flatMap((candidate) =>
        targetPortalSegments(candidate.content, profile)
      );
      const windowText = targetSegments.length
        ? targetSegments.join(' ')
        : window.map((candidate) => sourceHtmlText(candidate.content)).join(' ');
      const match = assessTextMatch({
        text: windowText,
        sourceContext,
        identity: profile,
        stage: profile.stage,
      });
      return { messages: window, anchor: message, quality: match.quality, targetSegments };
    })
    .filter((unit) => ['Direct', 'Likely'].includes(unit.quality));
}
