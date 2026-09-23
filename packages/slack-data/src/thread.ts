import { z } from 'zod';

import {
  failedSlackEnvelope,
  hasSlackContinuation,
  slackEnvelope,
  type SlackEnvelope,
} from './envelope.js';

export type SlackThreadResult =
  | {
      readonly complete: false;
      readonly text: '';
      readonly error: string;
    }
  | {
      readonly complete: true;
      readonly text: string;
      readonly error: '';
      readonly completionEvidence: {
        readonly kind: 'explicit-no-replies' | 'explicit-reply-count' | 'pagination-receipt';
        readonly replies?: number;
      };
    };

function blocked(error: string): SlackThreadResult {
  return { complete: false, text: '', error };
}

function payloadText(payload: unknown): string | null {
  if (typeof payload === 'string') return payload;
  const value = slackEnvelope(payload);
  if (typeof value.messages === 'string') return value.messages;
  return typeof value.results === 'string' ? value.results : null;
}

function parsePayload(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return text;
  }
}

function noReplies(
  text: string,
  payload: SlackEnvelope,
  parent: unknown,
  minimum: number
): SlackThreadResult {
  const parents = [...text.matchAll(/^=== THREAD PARENT MESSAGE ===\r?$/gm)];
  const ids = [...text.matchAll(/^Message TS: (\d+\.\d{6})\r?$/gm)];
  const terminal =
    typeof payload.pagination_info === 'string' &&
    payload.pagination_info.trim() === 'There are no more messages in this thread.';
  const identity =
    parents.length === 1 &&
    ids.length === 1 &&
    (parent === null || parent === undefined || parent === ids[0]?.[1]);
  const empty =
    /\nNo thread messs?ages\r?\n?$/.test(text) && !text.includes('--- Reply ') && minimum === 0;
  if (!terminal || !identity || !empty) {
    return blocked('Slack no-replies receipt is incomplete or conflicts with the parent identity.');
  }
  return {
    complete: true,
    text,
    error: '',
    completionEvidence: { kind: 'explicit-no-replies', replies: 0 },
  };
}

function explicitReplies(text: string, minimum: number): SlackThreadResult {
  const headers = [...text.matchAll(/^=== THREAD REPLIES \((\d+) total\) ===\r?$/gm)];
  const replies = [...text.matchAll(/^--- Reply (\d+) of (\d+) ---\r?$/gm)];
  const header = headers[0];
  const expected = Number(header?.[1]);
  if (
    headers.length !== 1 ||
    header === undefined ||
    !Number.isSafeInteger(expected) ||
    expected < minimum
  ) {
    return blocked('Slack thread explicit reply counts are incomplete or inconsistent.');
  }
  const complete =
    replies.length === expected &&
    replies.every(
      (reply, index) =>
        Number(reply[1]) === index + 1 &&
        Number(reply[2]) === expected &&
        reply.index > header.index &&
        Boolean(
          text.slice(reply.index + reply[0].length, replies[index + 1]?.index ?? text.length).trim()
        )
    );
  if (!complete)
    return blocked('Slack thread explicit reply counts are incomplete or inconsistent.');
  return {
    complete: true,
    text,
    error: '',
    completionEvidence: { kind: 'explicit-reply-count', replies: expected },
  };
}

const messageSchema = z.object({
  text: z.string().refine((value) => Boolean(value.trim())),
  ts: z.string().regex(/^\d+\.\d+$/),
  thread_ts: z.unknown().optional(),
  reply_count: z.unknown().optional(),
});

function structuredReplies(
  messages: unknown,
  parentTs: unknown,
  minimum: number
): SlackThreadResult {
  const parsed = z.array(messageSchema).safeParse(messages);
  if (!parsed.success) return blocked('Slack thread response has an unsupported message shape.');
  const records = parsed.data;
  const ids = new Set(records.map((message) => message.ts));
  const parents = records.filter((message) => message.ts === message.thread_ts);
  const parent = parents[0];
  if (
    parent === undefined ||
    parents.length !== 1 ||
    ids.size !== records.length ||
    (parentTs !== null &&
      parentTs !== undefined &&
      (typeof parentTs !== 'string' || !ids.has(parentTs))) ||
    records.some((message) => message.thread_ts !== parent.ts)
  ) {
    return blocked(
      'Slack thread parent or reply identities are missing, duplicated, or inconsistent.'
    );
  }
  if (
    typeof parent.reply_count !== 'number' ||
    !Number.isSafeInteger(parent.reply_count) ||
    parent.reply_count < 0
  ) {
    return blocked(
      'Slack thread parent or reply identities are missing, duplicated, or inconsistent.'
    );
  }
  const replies = records.length - 1;
  if (replies !== parent.reply_count || replies < minimum) {
    return blocked('Slack thread captured reply counts are incomplete or inconsistent.');
  }
  return {
    complete: true,
    text: JSON.stringify(messages),
    error: '',
    completionEvidence: { kind: 'pagination-receipt', replies },
  };
}

/** Normalize one complete vendor response; caller owns window selection and run receipts. */
export function normalizeSlackThreadResponse(
  input: unknown = {},
  minimumReplies = 0
): SlackThreadResult {
  const row = slackEnvelope(input);
  if (!Number.isSafeInteger(minimumReplies) || minimumReplies < 0)
    return blocked('Slack reply count is invalid.');
  if (failedSlackEnvelope(row, true) || hasSlackContinuation(row)) {
    return blocked('Slack thread retrieval is blocked or incomplete.');
  }
  if (typeof row.text !== 'string' || !row.text.trim())
    return blocked('Slack thread response is missing.');
  const payload = parsePayload(row.text);
  const metadata = slackEnvelope(payload);
  if (failedSlackEnvelope(metadata) || hasSlackContinuation(metadata)) {
    return blocked('Slack thread response reports an error or unconsumed continuation.');
  }
  const text = payloadText(payload);
  if (text !== null && !text.trim()) return blocked('Slack thread response is missing.');
  if (text !== null && /^No thread messs?ages\r?$/m.test(text))
    return noReplies(text, metadata, row.messageTs, minimumReplies);
  if (text?.includes('=== THREAD REPLIES')) return explicitReplies(text, minimumReplies);
  if (row.paginationComplete !== true)
    return blocked('Slack thread has no explicit completion evidence.');
  if (text === null)
    return structuredReplies(
      metadata.messages ?? metadata.results ?? payload,
      row.messageTs,
      minimumReplies
    );
  return { complete: true, text, error: '', completionEvidence: { kind: 'pagination-receipt' } };
}
