import { cleanConversationSentence } from './conversation-text.js';

export interface ConversationSentence {
  readonly id: number;
  readonly text: string;
  readonly raw: string;
}

export function readableConversationList(items: readonly string[] = []): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${String(items[0])} and ${String(items[1])}`;
  return `${items.slice(0, -1).join(', ')}, and ${String(items.at(-1))}`;
}

export function parseConversationSentences(text: unknown = ''): ConversationSentence[] {
  const value = String(text);
  const lines = value
    .replace(/\r/g, '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const sentence = (raw: string, id: number): ConversationSentence => ({
    id,
    text: cleanConversationSentence(raw),
    raw: raw.trim(),
  });
  if (lines.length > 1) return lines.map(sentence);
  const matches = [...value.matchAll(/(\[[^\]]+\]\s*[^[]+?)(?=\s*\[[^\]]+\]|$)/g)];
  if (matches.length) return matches.map((match, id) => sentence(match[1] ?? '', id));
  return value
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map(sentence)
    .filter((item) => item.text);
}
