import { slackDisplayTimestamp } from '@headstart-health/slack-data';

import { interpretSlackSegment } from './slack-evidence-interpretation.js';
import type {
  SlackEvidenceEvent,
  SlackEvidenceInput,
  SlackEvidenceRecord,
  SlackEvidenceRow,
} from './slack-evidence-types.js';
import { firstEvidenceText } from './source-evidence-context.js';

function resultText(row: SlackEvidenceRow): string {
  const messages = (row.messages ?? []).flatMap((message) => {
    try {
      const parsed: unknown = JSON.parse(message.text);
      if (parsed === null) throw new TypeError('Null legacy Slack message');
      const result = typeof parsed === 'object' && 'results' in parsed ? parsed.results : undefined;
      const present = Boolean(result);
      return present ? [result] : [];
    } catch {
      return message.text ? [message.text] : [];
    }
  });
  const searches = (row.searches ?? []).flatMap((search) =>
    (search.pages ?? []).map((page) => page.resultPreview).filter(Boolean)
  );
  return [...messages, ...searches].map((value: unknown) => String(value)).join('\n');
}
function nonemptyText(values: readonly unknown[], fallback: string): string {
  return (
    values.find((value): value is string => typeof value === 'string' && value.trim().length > 0) ??
    fallback
  );
}
function structuredEvents(
  input: SlackEvidenceInput,
  record: SlackEvidenceRecord | null | undefined,
  index: number
): SlackEvidenceEvent[] {
  if (!record?.text || !record.time) return [];
  const channel = nonemptyText(
    [
      record.channelName,
      typeof record.channel === 'string' ? record.channel : record.channel?.name,
    ],
    'Slack'
  );
  const author = nonemptyText(
    [
      record.from,
      record.author,
      record.bot_profile?.name,
      record.username,
      record.user_profile?.real_name,
      record.user_profile?.display_name,
    ],
    'Unknown'
  );
  if (/salesforce for slack/i.test(author) || /^#?opportunity-stage-updates$/i.test(channel))
    return [];
  return interpretSlackSegment({
    ...input,
    rawValue: [record.text, record.threadText].filter(Boolean).join('\n'),
    sourceRecordId: record.messageTs
      ? `slack:${firstEvidenceText(record.channelId) ?? 'unknown'}:${record.messageTs}`
      : `slack-record:${input.profile.opportunityId}:${String(index + 1)}`,
    eventDate: slackDisplayTimestamp(record.threadText) ?? slackDisplayTimestamp(record.time),
    channel,
    author,
    threadScoped: Boolean(record.threadText),
  });
}
function renderedEvents(
  input: SlackEvidenceInput,
  block: string,
  index: number
): SlackEvidenceEvent[] {
  const header = /^\d+\.\s+(#[^\s]+)\s+-\s+([^:]+):\s*/.exec(block);
  if (!header) return [];
  const channel = header[1] ?? '';
  const author = (header[2] ?? '').trim();
  if (/salesforce for slack/i.test(author) || /#opportunity-stage-updates/i.test(channel))
    return [];
  return interpretSlackSegment({
    ...input,
    rawValue: block.replace(header[0], ''),
    sourceRecordId: `slack-search:${input.profile.opportunityId}:${String(index + 1)}`,
    eventDate: slackDisplayTimestamp(block),
    channel,
    author,
  });
}
export function adaptSlack(input: SlackEvidenceInput): SlackEvidenceEvent[] {
  const { row } = input;
  if (!row || row.blocked) return [];
  const result = resultText(row);
  const events = (row.records ?? []).flatMap((record, index) =>
    structuredEvents(input, record, index)
  );
  if (!result) return events;
  events.push(
    ...result
      .split(/\n(?=\d+\.\s+#)/)
      .flatMap((block, index) => renderedEvents(input, block, index))
  );
  return [
    ...new Map(
      events.map((event) => [
        `${event.sourceRecordId}:${String(event.factType)}:${String(event.issueKey)}`,
        event,
      ])
    ).values(),
  ];
}
