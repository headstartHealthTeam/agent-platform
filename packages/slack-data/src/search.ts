import { z } from 'zod';

import { SlackResponseError, unwrapSlackSearchResponse } from './envelope.js';
import type { SlackEnvelope } from './envelope.js';
import { normalizeSlackThreadResponse } from './thread.js';

export interface SlackIndividualReadback {
  readonly channelId: string;
  readonly messageTs: string;
  readonly response: unknown;
}
export interface SlackSearchRecord<T extends SlackIndividualReadback> {
  readonly channelId: string;
  readonly channelName: string;
  readonly messageTs: string;
  readonly threadTs?: string;
  readonly from: string;
  readonly displayTime: string;
  readonly url: string;
  readonly text: string;
  readonly replyCount: number | null;
  readonly individualReadback?: T;
  readonly originalSearchText?: string;
}
export type SlackRenderedSearchPage<T extends SlackIndividualReadback> = SlackEnvelope & {
  readonly records: readonly SlackSearchRecord<T>[];
  readonly nextCursor: string;
};
const renderedSchema = z.looseObject({
  results: z.string(),
  pagination_info: z.string(),
  messages: z.undefined().optional(),
  records: z.undefined().optional(),
  nextCursor: z.string().optional(),
});
const fieldsSchema = z.object({
  channelName: z.string(),
  channelId: z.string(),
  from: z.string(),
  displayTime: z.string(),
  messageTs: z.string(),
  count: z.string().optional(),
  permalink: z.string(),
  text: z.string(),
});
type MessageFields = z.infer<typeof fieldsSchema>;
// Only this module can create errors whose messages the public boundary may retain.
class RenderedSearchError extends SlackResponseError {}
function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new RenderedSearchError(message);
}
function continuation(paginationInfo: string): {
  readonly terminal: boolean;
  readonly nextCursor: string;
} {
  const pagination = paginationInfo.replace(/(?:\\n|\s)+$/, '');
  const next = /^For the next page of results use cursor `([^`\s]+)`$/.exec(pagination);
  const terminal = pagination === 'End of results - No more pages available.';
  const nextCursor = terminal ? '' : next?.[1];
  check(nextCursor !== undefined, 'Slack rendered search has no supported explicit page receipt');
  return { terminal, nextCursor };
}
function parseFields(record: string): MessageFields {
  const lines = record.split('\n');
  const line = (index: number): string => `${lines.at(index) ?? ''}\n`;
  const channel = /^Channel: ([^\n]+) \(ID: ([CGD][A-Z0-9]+)\)\n$/.exec(line(0));
  let index = 1;
  if (/^Participants: [^\n]+\n$/.test(line(index))) index++;
  const from = /^From: ([^\n]+)\n$/.exec(line(index++))?.[1];
  const displayTime = /^Time: ([^\n]+)\n$/.exec(line(index++))?.[1];
  const messageTs = /^Message_ts: (\d+\.\d{6})\n$/.exec(line(index++))?.[1];
  const count = /^Reply count: (0|[1-9]\d*)\n$/.exec(line(index))?.[1];
  if (count !== undefined) index++;
  const permalink = /^Permalink: \[link\]\((https:\/\/[^\s)]+)\)\n$/.exec(line(index++))?.[1];
  const textHeader = /^Text: ?\n$/.test(line(index++));
  const body = lines.slice(index).join('\n');
  const boundary = '\n\n---\n\n';
  const text = textHeader && body.endsWith(boundary) ? body.slice(0, -boundary.length) : undefined;
  const parsed = fieldsSchema.safeParse({
    channelName: channel?.[1],
    channelId: channel?.[2],
    from,
    displayTime,
    messageTs,
    count,
    permalink,
    text,
  });
  check(
    parsed.success,
    'Slack detailed message is missing identity, text, or its complete boundary'
  );
  return parsed.data;
}
function messageUrl(fields: MessageFields): URL {
  let url: URL;
  try {
    url = new URL(fields.permalink);
  } catch {
    throw new RenderedSearchError('Slack message permalink is invalid');
  }
  check(
    url.protocol === 'https:' &&
      url.hostname.endsWith('.slack.com') &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      url.pathname === `/archives/${fields.channelId}/p${fields.messageTs.replace('.', '')}`,
    'Slack message permalink and identity disagree'
  );
  return url;
}
function threadIdentity(url: URL, fields: MessageFields): string | null {
  const threadTs = url.searchParams.get('thread_ts');
  const keys = [...url.searchParams.keys()];
  const validThread =
    threadTs !== null &&
    /^\d+\.\d{6}$/.test(threadTs) &&
    BigInt(threadTs.replace('.', '')) <= BigInt(fields.messageTs.replace('.', ''));
  check(
    new Set(keys).size === keys.length &&
      keys.every((key) => ['thread_ts', 'cid'].includes(key)) &&
      (!url.search || validThread) &&
      (!url.searchParams.has('cid') || url.searchParams.get('cid') === fields.channelId),
    'Slack thread permalink and message identity disagree'
  );
  return threadTs;
}
function readbackContent<T extends SlackIndividualReadback>(
  fields: MessageFields,
  replyCount: number | null,
  readbacks: readonly T[],
  used: Set<T>
): {
  readonly text: string;
  readonly replyCount: number;
  readonly individualReadback: T;
  readonly originalSearchText: string;
} {
  const matches = readbacks.filter(
    (item) => item.channelId === fields.channelId && item.messageTs === fields.messageTs
  );
  const readback = matches[0];
  check(
    matches.length === 1 && readback !== undefined,
    'Empty Slack search text requires one identity-bound individual read'
  );
  const payload = unwrapSlackSearchResponse(readback.response);
  const normalized = normalizeSlackThreadResponse(
    { channelId: fields.channelId, messageTs: fields.messageTs, text: JSON.stringify(payload) },
    replyCount ?? 0
  );
  const parent = normalized.text
    .split(/^=== THREAD REPLIES \(\d+ total\) ===$/m)[0]
    ?.replace(/\nNo thread messs?ages\s*$/, '');
  const match =
    /^=== THREAD PARENT MESSAGE ===\nFrom: [^\n]*\nTime: [^\n]+\nMessage TS: (\d+\.\d{6})\n([\s\S]+)$/.exec(
      parent ?? ''
    );
  const text = match?.[2]?.trim();
  check(
    normalized.complete &&
      typeof normalized.completionEvidence.replies === 'number' &&
      Number.isSafeInteger(normalized.completionEvidence.replies) &&
      match?.[1] === fields.messageTs &&
      text !== undefined &&
      text !== '',
    'Individual Slack message is incomplete or has no verifiable content'
  );
  used.add(readback);
  return {
    text,
    replyCount: normalized.completionEvidence.replies,
    individualReadback: readback,
    originalSearchText: fields.text,
  };
}
function normalizeRecord<T extends SlackIndividualReadback>(
  record: string,
  readbacks: readonly T[],
  used: Set<T>
): SlackSearchRecord<T> {
  const fields = parseFields(record);
  const replyCount = fields.count === undefined ? null : Number(fields.count);
  check(replyCount === null || Number.isSafeInteger(replyCount), 'Slack reply count is malformed');
  const content = fields.text.trim()
    ? { text: fields.text, replyCount }
    : readbackContent(fields, replyCount, readbacks, used);
  const threadTs = threadIdentity(messageUrl(fields), fields);
  return {
    channelId: fields.channelId,
    channelName: fields.channelName,
    messageTs: fields.messageTs,
    ...(threadTs ? { threadTs } : {}),
    from: fields.from,
    displayTime: fields.displayTime,
    url: fields.permalink,
    ...content,
  };
}
function messageBlocks(content: string): string[] {
  const countHeader = /^## Messages \(([1-9]\d*) results\)\n/.exec(content);
  check(countHeader !== null, 'Slack search requires detailed message results, not concise text');
  const total = Number(countHeader[1]);
  const body = content.slice(countHeader[0].length);
  const headers = [...body.matchAll(/^### Result (\d+) of (\d+)\n/gm)];
  check(
    Number.isSafeInteger(total) &&
      total <= 20 &&
      headers.length === total &&
      headers[0]?.index === 0,
    'Slack rendered result count is incomplete or ambiguous'
  );
  return headers.map((header, index) => {
    check(
      Number(header[1]) === index + 1 && Number(header[2]) === total,
      'Slack rendered result numbering is inconsistent'
    );
    return body.slice(header.index + header[0].length, headers[index + 1]?.index ?? body.length);
  });
}
/** Vendor format only. The caller hashes raw captures, binds readback time and applies its own cutoff. */
function normalizeRenderedSearch<T extends SlackIndividualReadback = SlackIndividualReadback>(
  response: unknown,
  query: string,
  messageReadbacks: readonly T[] = []
): SlackRenderedSearchPage<T> {
  check(Array.isArray(messageReadbacks), 'Invalid Slack individual readbacks');
  const parsed = renderedSchema.safeParse(response);
  check(parsed.success, 'Slack rendered search response is ambiguous or incomplete');
  const rendered = parsed.data;
  const { terminal, nextCursor } = continuation(rendered.pagination_info);
  check(
    rendered.nextCursor === undefined || rendered.nextCursor === nextCursor,
    'Slack rendered and structured continuation signals conflict'
  );
  const prefix = `# Search Results for: ${query}\n\n`;
  check(
    !/[\r\n]/.test(query) && rendered.results.startsWith(prefix),
    'Slack rendered search query does not match its plan'
  );
  const content = rendered.results.slice(prefix.length);
  const used = new Set<T>();
  const empty = content === 'No results found.\n';
  if (empty) check(terminal, 'An empty Slack search cannot claim an unconsumed page');
  const records = empty
    ? []
    : messageBlocks(content).map((record) => normalizeRecord(record, messageReadbacks, used));
  check(
    new Set(records.map((record) => `${record.channelId}:${record.messageTs}`)).size ===
      records.length,
    'Slack rendered page has duplicate message identities'
  );
  check(used.size === messageReadbacks.length, 'Unused or duplicate Slack individual readbacks');
  return { ...rendered, records, nextCursor };
}

export function normalizeSlackRenderedSearch<
  T extends SlackIndividualReadback = SlackIndividualReadback,
>(
  response: unknown,
  query: string,
  messageReadbacks: readonly T[] = []
): SlackRenderedSearchPage<T> {
  try {
    return normalizeRenderedSearch(response, query, messageReadbacks);
  } catch (error) {
    if (error instanceof RenderedSearchError) throw error;
    // Accessors and serialization hooks can embed source text in native error messages/causes.
    throw new SlackResponseError('Slack rendered search response could not be normalized');
  }
}
