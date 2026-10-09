import type {
  MergedPortalChat,
  MergedPortalRow,
  PortalChat,
  PortalRows,
  PortalSearchRow,
} from './portal-evidence-types.js';
import { sourceHtmlText } from './source-html-text.js';

export function isPortalRowArray(row: PortalRows): row is readonly PortalRows[] {
  return Array.isArray(row);
}
export function portalChats(row: PortalRows): readonly PortalChat[] {
  if (!row) return [];
  if (isPortalRowArray(row)) return row.flatMap(portalChats);
  return (
    row.responses?.chats ??
    row.responses?.data?.chats ??
    row.data?.chats ??
    row.structuredContent?.data?.chats ??
    row.chats ??
    []
  );
}
function messageFingerprint(chat: PortalChat): string {
  const content = (chat.messages ?? [])
    .map((message) =>
      [
        (message.createdAt ?? '').slice(0, 16),
        message.senderId ?? message.userId ?? message.authorId ?? '',
        sourceHtmlText(message.content ?? '').toLowerCase(),
      ].join(':')
    )
    .join('|');
  return content || `id:${chat.messageId ?? ''}`;
}
function rowProperty(row: PortalRows): PortalSearchRow | undefined {
  return row && !isPortalRowArray(row) ? row : undefined;
}
export function mergePortalSearchRows(rows: PortalRows = []): MergedPortalRow {
  const inputRows = (isPortalRowArray(rows) ? rows : [rows]).filter(Boolean);
  const chats: MergedPortalChat[] = [];
  const seen = new Set<string>();
  for (const row of inputRows) {
    const properties = rowProperty(row);
    for (const chat of portalChats(row)) {
      const fingerprint = messageFingerprint(chat);
      if (!fingerprint || seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      chats.push({
        ...chat,
        channel: null,
        returnedChannelLabels: [
          properties?.requestedChannel,
          properties?.query?.channel,
          properties?.responses?.query?.channel,
          chat.channel,
        ].filter((value): value is string => Boolean(value)),
      });
    }
  }
  return {
    searchedAt:
      inputRows
        .map((row) => rowProperty(row)?.searchedAt)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null,
    responses: { chats },
    portalChannelAttributionIgnored: true,
  };
}
export function directPortalLookup(row: PortalRows): boolean {
  const inputs = isPortalRowArray(row) ? row : [row];
  const providerScoped = portalChats(row).some(
    (chat) => Boolean(chat.providerName) || Boolean(chat.provider) || Boolean(chat.practiceName)
  );
  return inputs.some((input) => {
    const properties = rowProperty(input);
    return (
      properties?.query?.mode === 'client_lookup' ||
      properties?.mode === 'client_lookup' ||
      (!properties?.query?.mode &&
        !properties?.mode &&
        !properties?.query?.providerName &&
        !properties?.providerName &&
        !providerScoped)
    );
  });
}
