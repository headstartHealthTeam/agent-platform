import { z } from 'zod';

import { preserveCollectionRecord } from './collection-decoding.js';
import type { PortalReportChat, PortalReportResponses } from './portal-report-types.js';
import { reportPreferred } from './report-display-values.js';
import {
  savedFields,
  savedOptionalText as text,
  savedSourceCheckSchema,
} from './saved-report-fields.js';
import type { SavedSourceRow } from './saved-source-rows.js';

const message = z.looseObject({ id: text, createdAt: text });
const chat = z.looseObject({
  id: text,
  messageId: text,
  createdAt: text,
  channel: text,
  providerName: text,
});
function reportChat(value: unknown): PortalReportChat {
  const raw = preserveCollectionRecord(chat).parse(value);
  const messages = raw['messages'];
  return {
    ...raw,
    // The report parser ignores a non-array messages value and uses the chat-level fallback.
    ...(Array.isArray(messages)
      ? { messages: z.array(preserveCollectionRecord(message)).parse(messages) }
      : { messages: undefined }),
  };
}
/** Report/freshness envelope selection intentionally differs from authoritative Portal evidence. */
export function decodeSavedPortalReportInput(value: unknown): PortalReportResponses {
  if (Array.isArray(value)) return value.map((item: unknown) => decodeSavedPortalReportInput(item));
  const fields = savedFields(value);
  const selected = [
    fields['chats'],
    savedFields(fields['data'])['chats'],
    savedFields(savedFields(fields['structuredContent'])['data'])['chats'],
  ].find(Array.isArray);
  return {
    chats: z
      .array(z.unknown())
      .parse(selected ?? [])
      .map(reportChat),
  };
}
export interface SavedPortalReport {
  readonly row: z.infer<typeof savedSourceCheckSchema> | undefined;
  readonly rawInput: unknown;
  readonly input: PortalReportResponses;
  readonly items: readonly unknown[];
}
export function decodeSavedPortalReport(row: SavedSourceRow | undefined): SavedPortalReport {
  const hasChats = Boolean(row?.['chats']);
  const rawInput = row?.['responses'] ?? (hasChats ? { chats: row?.['chats'] } : []);
  const fields = savedFields(rawInput);
  const rawItems = Array.isArray(rawInput)
    ? rawInput
    : reportPreferred(savedFields(fields['responses'])['chats'], fields['chats'], []);
  return {
    row:
      row === undefined ? undefined : preserveCollectionRecord(savedSourceCheckSchema).parse(row),
    rawInput,
    input: decodeSavedPortalReportInput(rawInput),
    items: z.array(z.unknown()).parse(rawItems),
  };
}
