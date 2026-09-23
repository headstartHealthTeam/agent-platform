import {
  normalizeSlackThreadResponse,
  slackThreadRetrievalProblem,
} from '@headstart-health/slack-data';
import type { SlackThreadResult } from '@headstart-health/slack-data';
import { z } from 'zod';

export type IntakeSlackThreadResult =
  | SlackThreadResult
  | {
      readonly complete: true;
      readonly text: string;
      readonly error: '';
      readonly completionEvidence: {
        readonly kind: 'verified-cutoff-replies';
        readonly sourceCutoff: string;
        readonly replies: number;
        readonly observedReplies: number;
        readonly deferredReplies: number;
      };
    };
interface ThreadRecord {
  readonly ts: string;
  readonly body: string;
}
const rowSchema = z.looseObject({
  channelId: z.unknown().optional(),
  messageTs: z.unknown().optional(),
  text: z.unknown().optional(),
  unboundedReadback: z.unknown().optional(),
});
type ThreadRow = z.infer<typeof rowSchema>;
function micros(ts: string): bigint {
  const dot = ts.indexOf('.');
  return BigInt(ts.slice(0, dot)) * 1_000_000n + BigInt(ts.slice(dot + 1));
}
function record(body: string): ThreadRecord {
  const ids = [...body.matchAll(/^Message TS: (\d+\.\d{6})$/gm)];
  const ts = ids[0]?.[1];
  if (ids.length !== 1 || ts === undefined) throw new Error('Invalid Slack cutoff record');
  return { ts, body };
}
function parseThread(capture: ThreadRow, text: string, messageTs: unknown): ThreadRecord[] {
  if (typeof capture.text !== 'string') throw new Error('Invalid Slack cutoff capture');
  const payload: unknown = JSON.parse(capture.text);
  const pagination = z.object({ pagination_info: z.string() }).parse(payload).pagination_info;
  if (pagination.trim() !== 'There are no more messages in this thread.')
    throw new Error('Invalid Slack cutoff pagination');
  text = text.replaceAll('\r\n', '\n');
  const header = /^=== THREAD REPLIES \((\d+) total\) ===$/m.exec(text);
  if (header === null || !text.startsWith('=== THREAD PARENT MESSAGE ===\n'))
    throw new Error('Invalid Slack cutoff header');
  const parent = text.slice(0, header.index).trim();
  const replies = text
    .slice(header.index + header[0].length)
    .split(/^--- Reply \d+ of \d+ ---$/m)
    .slice(1)
    .map((part) => part.trim());
  const records = [parent, ...replies].map(record);
  const first = records[0];
  if (
    first === undefined ||
    replies.length !== Number(header[1]) ||
    new Set(records.map((item) => item.ts)).size !== records.length ||
    !records.some((item) => item.ts === messageTs) ||
    records.slice(1).some((item) => micros(item.ts) <= micros(first.ts))
  )
    throw new Error('Invalid Slack cutoff identities');
  return records;
}
function cutoffThread(
  row: ThreadRow,
  minimumReplies: number,
  sourceCutoff: string | undefined
): IntakeSlackThreadResult {
  const failure = (): SlackThreadResult => ({
    complete: false,
    text: '',
    error: 'Slack post-cutoff reply accounting is incomplete or inconsistent.',
  });
  try {
    const cutoff = Date.parse(sourceCutoff ?? '');
    const fullRow = rowSchema.parse(row.unboundedReadback);
    const hasIdentity = [row.channelId, row.messageTs].every(Boolean);
    if (
      sourceCutoff === undefined ||
      !Number.isFinite(cutoff) ||
      !hasIdentity ||
      row.channelId !== fullRow.channelId ||
      row.messageTs !== fullRow.messageTs
    )
      return failure();
    const bounded = normalizeSlackThread({ ...row, unboundedReadback: undefined }, 0);
    const full = normalizeSlackThread({ ...fullRow, unboundedReadback: undefined }, minimumReplies);
    if (!bounded.complete || !full.complete) return failure();
    const fullRecords = parseThread(fullRow, full.text, row.messageTs);
    const first = fullRecords[0];
    const cutoffMicros = BigInt(cutoff) * 1000n;
    if (first === undefined || micros(first.ts) > cutoffMicros) return failure();
    const retained = fullRecords.filter((item) => micros(item.ts) <= cutoffMicros);
    if (JSON.stringify(parseThread(row, bounded.text, row.messageTs)) !== JSON.stringify(retained))
      return failure();
    return {
      ...bounded,
      completionEvidence: {
        kind: 'verified-cutoff-replies',
        sourceCutoff,
        replies: retained.length - 1,
        observedReplies: fullRecords.length - 1,
        deferredReplies: fullRecords.length - retained.length,
      },
    };
  } catch {
    return failure();
  }
}
/** Intake owns frozen-cutoff accounting; the shared provider owns complete vendor response decoding. */
export function normalizeSlackThread(
  input: unknown = {},
  minimumReplies = 0,
  { sourceCutoff }: { readonly sourceCutoff?: string | undefined } = {}
): IntakeSlackThreadResult {
  const problem = slackThreadRetrievalProblem(input, minimumReplies);
  if (problem !== null) return { complete: false, text: '', error: problem };
  const row = rowSchema.safeParse(input).data ?? {};
  const hasUnbounded = Boolean(row.unboundedReadback);
  return hasUnbounded
    ? cutoffThread(row, minimumReplies, sourceCutoff)
    : normalizeSlackThreadResponse(input, minimumReplies);
}
