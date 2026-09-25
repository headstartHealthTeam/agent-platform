import { z } from 'zod';

import { preserveCollectionRecord } from './collection-decoding.js';
import type { PortalRows } from './portal-evidence-types.js';

const optionalText = z.string().nullish();
const message = z.looseObject({
  id: optionalText,
  createdAt: optionalText,
  senderId: optionalText,
  userId: optionalText,
  authorId: optionalText,
  content: z.unknown(),
});
const chat = z.looseObject({
  messageId: optionalText,
  createdAt: optionalText,
  channel: optionalText,
  messages: z.array(preserveCollectionRecord(message)).nullish(),
  opportunityId: optionalText,
  salesforceOpportunityId: optionalText,
  clientId: optionalText,
  salesforceRecordId: optionalText,
  clientName: optionalText,
  providerName: optionalText,
  practiceName: optionalText,
  matchQuality: optionalText,
  proposedOpportunityId: optionalText,
});
const query = z.looseObject({
  mode: optionalText,
  channel: optionalText,
  providerName: optionalText,
});
const properties = z.looseObject({
  blocked: z.boolean().nullish(),
  searchedAt: optionalText,
  requestedChannel: optionalText,
  mode: optionalText,
  providerName: optionalText,
  query: preserveCollectionRecord(query).nullish(),
});
const object = z.record(z.string(), z.unknown());
function fields(value: unknown): Record<string, unknown> {
  const parsed = object.safeParse(value);
  return parsed.success ? parsed.data : {};
}
/**
 * Decode only the envelope selected by the approved adapter's nullish precedence.
 * The loader retains the untouched raw row; this is its consumed-field view.
 * Unused fallback envelopes are not additional validation requirements.
 */
function decodeRow(value: unknown, topLevel: boolean): PortalRows {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((row: unknown) => decodeRow(row, false));
  const raw = fields(value);
  // A blocked row is not opened by the authoritative adapter.
  const blocked = Boolean(raw['blocked']);
  if (topLevel && blocked) return { blocked: true };
  const row = properties.parse(raw);
  const response = fields(raw['responses']);
  const chats =
    response['chats'] ??
    fields(response['data'])['chats'] ??
    fields(raw['data'])['chats'] ??
    fields(fields(raw['structuredContent'])['data'])['chats'] ??
    raw['chats'] ??
    [];
  return {
    blocked: row.blocked,
    searchedAt: row.searchedAt,
    requestedChannel: row.requestedChannel,
    mode: row.mode,
    providerName: row.providerName,
    query: row.query,
    responses: {
      chats: z.array(preserveCollectionRecord(chat)).parse(chats),
      query: preserveCollectionRecord(query).nullish().parse(response['query']),
    },
  };
}
export function decodeSavedPortalEvidence(value: unknown): PortalRows {
  return decodeRow(value, true);
}
