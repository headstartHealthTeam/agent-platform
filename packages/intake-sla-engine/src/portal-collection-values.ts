import type { PortalCollectionChat } from './portal-collection-types.js';

function stringValue(value: unknown): string {
  return String(value);
}
export function portalCollectionClean(value: unknown): string {
  return stringValue(value ?? '').trim();
}
export function portalCollectionFallback<T>(value: T, fallback: T): T {
  const present = Boolean(value);
  return present ? value : fallback;
}
export function portalCollectionNormalize(value: unknown): string {
  return portalCollectionClean(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}
export function portalCollectionUnique(values: readonly unknown[]): string[] {
  return [...new Set(values.map(portalCollectionClean).filter(Boolean))];
}
export function portalCollectionChatText(chat: PortalCollectionChat): string {
  return (chat.messages ?? [])
    .map((message) => portalCollectionClean(message.content).replace(/<[^>]+>/g, ' '))
    .join(' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}
export function portalCollectionChatKey(chat: PortalCollectionChat): string {
  const fingerprint = [
    portalCollectionClean(chat.providerId),
    portalCollectionClean(chat.createdAt),
    portalCollectionNormalize(portalCollectionChatText(chat)),
  ].join('|');
  return fingerprint === '||'
    ? portalCollectionClean(portalCollectionFallback(chat.messageId, chat.id))
    : fingerprint;
}
export function portalChatWithinCutoff(
  value: string | null | undefined,
  cutoff: string | null | undefined
): boolean {
  if (!value || !cutoff) return true;
  const eventTime = Date.parse(value);
  const cutoffTime = Date.parse(cutoff);
  if (!Number.isFinite(eventTime) || !Number.isFinite(cutoffTime)) return true;
  return eventTime <= cutoffTime;
}
