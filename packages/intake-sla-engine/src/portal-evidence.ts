import { interpretConversation } from './conversation-interpretation.js';
import type {
  MergedPortalChat,
  MergedPortalRow,
  PortalEvidenceEvent,
  PortalEvidenceInput,
  PortalEvidenceUnit,
} from './portal-evidence-types.js';
import { portalIdentity, portalUnits } from './portal-evidence-units.js';
import { targetPortalSegments } from './portal-roster-segments.js';
import {
  directPortalLookup,
  isPortalRowArray,
  mergePortalSearchRows,
} from './portal-search-rows.js';
import { firstEvidenceText } from './source-evidence-context.js';
import { sourceHtmlText } from './source-html-text.js';

function unitEvents(
  input: PortalEvidenceInput,
  merged: MergedPortalRow,
  chat: MergedPortalChat,
  unit: PortalEvidenceUnit,
  direct: boolean,
  sourceRecordId: string
): PortalEvidenceEvent[] {
  const { profile, gate, asOf } = input;
  const targetSegments =
    unit.targetSegments ??
    unit.messages.flatMap((message) => targetPortalSegments(message.content, profile));
  if (!direct && !targetSegments.length) return [];
  const text =
    direct || !targetSegments.length
      ? unit.messages.map((message) => sourceHtmlText(message.content)).join(' ')
      : targetSegments.join(' ');
  return interpretConversation({
    opportunityId: profile.opportunityId,
    source: 'Portal',
    sourceRecordId,
    eventDate: firstEvidenceText(unit.anchor?.createdAt, chat.createdAt, merged.searchedAt) ?? asOf,
    text,
    rawText: unit.messages.map((message) => sourceHtmlText(message.content)).join('\n'),
    matchQuality: unit.quality,
    gate,
    asOf,
    matchedIdentities: [
      {
        opportunityId: profile.opportunityId,
        opportunityName: profile.opportunityName,
        provider: chat.providerName,
        practice: chat.practiceName,
        matchQuality: unit.quality,
        portalConversationId: firstEvidenceText(chat.messageId) ?? sourceRecordId,
      },
    ],
  });
}
export function adaptPortal(input: PortalEvidenceInput): PortalEvidenceEvent[] {
  const { row, profile } = input;
  if (!row || (!isPortalRowArray(row) && row.blocked)) return [];
  const merged = mergePortalSearchRows(row);
  const directLookup = directPortalLookup(row);
  return merged.responses.chats.flatMap((chat) => {
    const identity = portalIdentity(chat, profile, directLookup);
    const seen = new Set<string>();
    return portalUnits(chat, profile, identity).flatMap((unit) => {
      const sourceRecordId = firstEvidenceText(unit.anchor?.id, chat.messageId) ?? 'portal-chat';
      if (seen.has(sourceRecordId)) return [];
      seen.add(sourceRecordId);
      return unitEvents(input, merged, chat, unit, identity.direct, sourceRecordId);
    });
  });
}
