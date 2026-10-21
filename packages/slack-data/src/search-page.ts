import { z } from 'zod';

import {
  failedSlackEnvelope,
  slackEnvelope,
  slackEnvelopeSchema,
  SlackResponseError,
} from './envelope.js';
import type { SlackEnvelope } from './envelope.js';

export interface SlackReplyMetadata {
  readonly reply_count?: unknown;
  readonly replyCount?: unknown;
}
export function slackReplyCount(record: SlackReplyMetadata = {}): number | null {
  const counts = [record.reply_count, record.replyCount].filter(
    (value) => value !== null && value !== undefined
  );
  if (
    !counts.every(
      (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ) ||
    new Set(counts).size > 1
  )
    throw new SearchPageError('Slack reply counts are malformed or conflicting');
  const count = counts[0];
  return typeof count === 'number' ? count : null;
}
const recordSchema = z.looseObject({
  channel: z.unknown().optional(),
  channelId: z.unknown().optional(),
  ts: z.unknown().optional(),
  messageTs: z.unknown().optional(),
  text: z.string(),
  reply_count: z.unknown().optional(),
  replyCount: z.unknown().optional(),
});
export interface SlackPageRecord {
  readonly channelId: string;
  readonly messageTs: string;
  readonly text: string;
  readonly replyCount: number | null;
  readonly time: string;
}
export interface SlackSearchPageResult {
  readonly nextCursor: string;
  readonly terminal: boolean;
  readonly records: readonly SlackPageRecord[];
}
class SearchPageError extends SlackResponseError {}
function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new SearchPageError(message);
}
function assertSuccessfulEnvelope(value: unknown): asserts value is SlackEnvelope {
  const parsed = slackEnvelopeSchema.safeParse(value);
  check(
    parsed.success && !failedSlackEnvelope(parsed.data),
    'Slack search response is failed or incomplete'
  );
}
function normalizeRecord(value: unknown): SlackPageRecord {
  const parsed = recordSchema.safeParse(value);
  check(parsed.success, 'Malformed Slack message identity');
  const record = parsed.data;
  const channelId =
    z.object({ id: z.unknown().optional() }).safeParse(record.channel).data?.id ?? record.channelId;
  const messageTs = record.ts ?? record.messageTs;
  check(
    typeof channelId === 'string' &&
      channelId.length > 0 &&
      typeof messageTs === 'string' &&
      /^\d+\.\d+$/.test(messageTs),
    'Malformed Slack message identity'
  );
  return {
    ...record,
    channelId,
    messageTs,
    replyCount: slackReplyCount(record),
    time: new Date(Number(messageTs) * 1000).toISOString(),
  };
}
function cursors(response: SlackEnvelope, payload: SlackEnvelope): string | undefined {
  const values = [
    slackEnvelope(response.response_metadata).next_cursor,
    slackEnvelope(payload.response_metadata).next_cursor,
    response.next_cursor,
    payload.next_cursor,
    response['nextCursor'],
    payload['nextCursor'],
  ].filter((value) => value !== undefined);
  check(
    values.every((value) => typeof value === 'string') && new Set(values).size <= 1,
    'Slack continuation signals conflict'
  );
  const cursor = values[0];
  return typeof cursor === 'string' ? cursor : undefined;
}
function pagination(
  response: SlackEnvelope,
  payload: SlackEnvelope,
  pageNumber: number,
  recordCount: number
): Pick<SlackSearchPageResult, 'nextCursor' | 'terminal'> {
  let nextCursor = cursors(response, payload);
  const paging: unknown = payload['paging'] ?? response['paging'];
  const hasPaging = Boolean(paging);
  let terminal: boolean;
  if (hasPaging) {
    const parsed = z
      .object({ page: z.number().int(), pages: z.number().int().nonnegative() })
      .safeParse(paging);
    check(
      parsed.success &&
        parsed.data.page === pageNumber &&
        (parsed.data.pages === 0
          ? parsed.data.page === 1 && recordCount === 0
          : parsed.data.page <= parsed.data.pages),
      'Malformed Slack page counters'
    );
    terminal = parsed.data.pages === 0 || parsed.data.page === parsed.data.pages;
    if (nextCursor !== undefined)
      check(Boolean(nextCursor) === !terminal, 'Slack page and cursor completeness conflict');
    nextCursor ??= terminal ? '' : `page:${String(parsed.data.page + 1)}`;
  } else {
    check(
      nextCursor !== undefined,
      'Slack terminal coverage requires an explicit cursor or page counter'
    );
    terminal = nextCursor === '';
  }
  if (response.has_more !== undefined)
    check(response.has_more === !terminal, 'Slack has_more conflicts with pagination');
  return { nextCursor, terminal };
}
/** Vendor page mechanics only; the consumer owns query receipts, scope, cutoff and capture hashes. */
export function normalizeSlackSearchPageResponse(
  response: unknown,
  pageNumber: number
): SlackSearchPageResult {
  try {
    assertSuccessfulEnvelope(response);
    const payload: unknown = response.messages ?? response;
    assertSuccessfulEnvelope(payload);
    const records: unknown = payload['matches'] ?? payload['records'];
    check(Array.isArray(records), 'Slack page has no supported record collection');
    return {
      ...pagination(response, payload, pageNumber, records.length),
      records: records.map((record: unknown) => normalizeRecord(record)),
    };
  } catch (error) {
    if (error instanceof SearchPageError) throw error;
    throw new SlackResponseError('Slack search page could not be normalized');
  }
}
