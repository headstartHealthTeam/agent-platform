import type {
  PortalReportChat,
  PortalReportDedupedMessage,
  PortalReportMessage,
  PortalReportNormalizedMessage,
  PortalReportResponses,
} from './portal-report-types.js';
import { firstEvidenceText } from './source-evidence-context.js';

function stringValue(value: unknown): string {
  return String(value);
}
function cleanText(value: unknown): string {
  const present = Boolean(value);
  return stringValue(present ? value : '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
function responseArray(value: PortalReportResponses): value is readonly PortalReportResponses[] {
  return Array.isArray(value);
}
function isArray(value: unknown): boolean {
  return Array.isArray(value);
}
function extractChats(response: PortalReportResponses): readonly PortalReportChat[] {
  if (!response) return [];
  if (responseArray(response)) return response.flatMap(extractChats);
  if (isArray(response.chats)) return response.chats ?? [];
  if (isArray(response.data?.chats)) return response.data?.chats ?? [];
  if (isArray(response.structuredContent?.data?.chats))
    return response.structuredContent?.data?.chats ?? [];
  return [];
}
function normalizeMessage(
  chat: PortalReportChat,
  message: PortalReportMessage = {}
): PortalReportNormalizedMessage {
  return {
    id: firstEvidenceText(message.id, chat.messageId, chat.id) ?? '',
    channel: firstEvidenceText(chat.channel) ?? '',
    provider: [chat.providerName, chat.provider].find((value) => Boolean(value)) ?? '',
    patientSender: Boolean(message.isPatientSender ?? chat.patientSender),
    date: firstEvidenceText(message.createdAt, chat.createdAt) ?? '',
    content: cleanText(
      [message.content, chat.content, chat.latestMessagePreview].find((value) => Boolean(value))
    ),
  };
}
function normalizeChat(chat: PortalReportChat): PortalReportNormalizedMessage[] {
  const messages = isArray(chat.messages) && chat.messages?.length ? chat.messages : [{}];
  return messages.map((message) => normalizeMessage(chat, message));
}
function messageKey(message: PortalReportNormalizedMessage): string {
  return message.id || [message.provider, message.date, message.content.toLowerCase()].join('|');
}
function isoTime(value: string): number {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(time) ? 0 : time;
}
export function portalReportMessages(
  responses: PortalReportResponses
): PortalReportDedupedMessage[] {
  const raw = extractChats(responses)
    .flatMap(normalizeChat)
    .filter((chat) => chat.content);
  const channelsByMessage = new Map<string, Set<string>>();
  for (const chat of raw) {
    const key = messageKey(chat);
    const channels = channelsByMessage.get(key) ?? new Set<string>();
    if (chat.channel) channels.add(chat.channel);
    channelsByMessage.set(key, channels);
  }
  const deduped: PortalReportDedupedMessage[] = [];
  const seen = new Set<string>();
  for (const chat of raw.sort((left, right) => isoTime(right.date) - isoTime(left.date))) {
    const key = messageKey(chat);
    if (seen.has(key)) continue;
    seen.add(key);
    const channels = [...(channelsByMessage.get(key) ?? [])];
    deduped.push({
      ...chat,
      channel: channels.length > 1 ? 'unattributed' : chat.channel,
      channelConflict: channels.length > 1,
    });
  }
  return deduped;
}
