import { slackReplyCount } from '@headstart-health/slack-data';
import { z } from 'zod';

import { captureProperty as field } from './google-capture-property.js';
import { normalizeRosterValue } from './roster-matching.js';
import { normalizeSlackThread } from './slack-thread.js';
import type { IntakeSlackThreadResult } from './slack-thread.js';

type CompletionEvidence = Extract<
  IntakeSlackThreadResult,
  { complete: true }
>['completionEvidence'];
interface MergedSlackRecord extends Readonly<Record<string, unknown>> {
  readonly replyCount: number | null;
  readonly threadExpanded: boolean;
  readonly threadText: string;
  readonly threadError: string;
  readonly threadCompletionEvidence: CompletionEvidence | undefined;
}
export interface SlackSweepRow {
  readonly opportunityId: unknown;
  readonly opportunityName: unknown;
  readonly searchedAt: unknown;
  readonly searched: boolean;
  readonly blocked: boolean;
  readonly error: unknown;
  readonly searchPath: string;
  readonly searchQueries: unknown;
  readonly paginationComplete: boolean;
  readonly threadExpansionComplete: boolean;
  readonly threadCandidates: number;
  readonly threadsRetrieved: number;
  readonly records: MergedSlackRecord[];
  readonly messages: unknown[];
  readonly events: unknown;
  readonly candidateCount: number;
  readonly messageCandidates: number;
  readonly fileCandidates: number;
  readonly truncated: boolean;
  readonly nameSearched: boolean;
}
export interface SlackSweepExecution {
  readonly generatedAt: string;
  readonly opportunities: number;
  readonly expectedOpportunities: number;
  readonly cohortComplete: boolean;
  readonly exactNameSearchesComplete: number;
  readonly recordsRetrieved: number;
  readonly opportunitiesWithRecords: number;
  readonly threadCandidates: number;
  readonly threadsRetrieved: number;
  readonly threadExpansionComplete: boolean;
  readonly blocked: number;
  readonly unassignedExactRows: number;
  readonly unassignedPageTwoRecords: number;
  readonly unassignedPriorRows: number;
  readonly searchScope: string[];
}
function stringValue(value: unknown): string {
  return String(value);
}

const array = z.array(z.unknown());
function list(value: unknown): unknown[] {
  return array.parse(value ?? []);
}
function key(row: unknown): string {
  return `${String(field(row, 'channelId'))}:${String(field(row, 'messageTs'))}`;
}
function name(value: unknown): string {
  return normalizeRosterValue(value === undefined ? '' : stringValue(value));
}
function storyStart(profile: unknown, now: number): number {
  const anchors = [field(profile, 'stageEntryDate'), field(profile, 'slaCreatedDate')]
    .filter(Boolean)
    .map((value) =>
      new Date(
        value instanceof Date
          ? value.valueOf()
          : typeof value === 'number' || typeof value === 'boolean'
            ? Number(value)
            : stringValue(value)
      ).valueOf()
    )
    .filter(Number.isFinite);
  return (anchors.length > 0 ? Math.min(...anchors) : now - 120 * 86_400_000) - 3 * 86_400_000;
}
function slackTime(value: unknown = ''): number {
  return new Date(String(value).replace(' EDT', ' -0400').replace(' EST', ' -0500')).valueOf();
}
interface SweepInputs {
  readonly exactRows: readonly unknown[];
  readonly pageTwoRecords: readonly unknown[];
  readonly threadRows: readonly unknown[];
  readonly identityRows: readonly unknown[];
  readonly priorRows: readonly unknown[];
  readonly sourceCutoff?: unknown;
  readonly now?: number;
}
function rowError(count: number, row: unknown, pagination: boolean, threads: boolean): unknown {
  if (count > 1) return 'More than one full-sweep Slack result was assigned to this Opportunity.';
  if (row === null || row === undefined)
    return 'Full-sweep Slack retrieval is missing for this Opportunity.';
  const error = field(row, 'error');
  const blocked = Boolean(field(row, 'blocked')) && Boolean(error);
  if (blocked) return error;
  if (!pagination) return 'The all-channel Slack search did not record complete pagination.';
  if (!threads) return 'One or more current-story Slack threads were not expanded.';
  return error ?? '';
}
/** Assign saved captures to the frozen cohort and retain the original row-level exceptions. */
export function mergeSlackSweep({
  exactRows,
  pageTwoRecords,
  threadRows,
  identityRows,
  priorRows,
  sourceCutoff,
  now = Date.now(),
}: SweepInputs): { merged: SlackSweepRow[]; execution: SlackSweepExecution } {
  const ids = new Set(
    identityRows.map((profile) => field(profile, 'opportunityId')).filter(Boolean)
  );
  const idsByName = new Map<string, unknown[]>();
  for (const profile of identityRows) {
    const id = field(profile, 'opportunityId');
    const rawName = field(profile, 'opportunityName');
    const identified = Boolean(id) && Boolean(rawName);
    if (!identified) continue;
    const normalized = name(rawName);
    idsByName.set(normalized, [...(idsByName.get(normalized) ?? []), id]);
  }
  function group(rows: readonly unknown[]): {
    grouped: Map<unknown, unknown[]>;
    unassigned: unknown[];
  } {
    const grouped = new Map<unknown, unknown[]>();
    const unassigned: unknown[] = [];
    for (const row of rows) {
      const direct = field(row, 'opportunityId');
      const named = idsByName.get(name(field(row, 'opportunityName') ?? field(row, 'name'))) ?? [];
      const id = Boolean(direct) && ids.has(direct) ? direct : named.length === 1 ? named[0] : null;
      const assigned = Boolean(id);
      if (!assigned) {
        unassigned.push(row);
        continue;
      }
      grouped.set(id, [...(grouped.get(id) ?? []), row]);
    }
    return { grouped, unassigned };
  }
  const exact = group(exactRows),
    prior = group(priorRows),
    pageTwo = group(pageTwoRecords);
  const threads = new Map(threadRows.map((row) => [key(row), row]));
  const merged = identityRows.map((profile) => {
    const opportunityId = field(profile, 'opportunityId');
    const candidates = exact.grouped.get(opportunityId) ?? [];
    const row = candidates.length === 1 ? candidates[0] : null;
    const previous = prior.grouped.get(opportunityId) ?? [];
    const previousRow = previous.length === 1 ? previous[0] : {};
    const records = [
      ...list(field(row, 'records')),
      ...(pageTwo.grouped.get(opportunityId) ?? []),
    ].map((record) => {
      const replyCount = slackReplyCount({
        reply_count: field(record, 'reply_count'),
        replyCount: field(record, 'replyCount'),
      });
      const thread = normalizeSlackThread(threads.get(key(record)), replyCount ?? 0, {
        sourceCutoff,
      });
      const completionEvidence = thread.complete ? thread.completionEvidence : undefined;
      const countEstablished =
        replyCount !== null || Number.isSafeInteger(completionEvidence?.replies);
      const raw = z.record(z.string(), z.unknown()).parse(record);
      return {
        ...raw,
        replyCount,
        opportunityId,
        name: undefined,
        threadText: thread.text,
        threadExpanded: thread.complete && countEstablished,
        threadError: countEstablished
          ? thread.error
          : 'Slack reply coverage is unknown; a counted message/thread capture is required.',
        threadCompletionEvidence: completionEvidence,
      };
    });
    const deduped = [...new Map(records.map((record) => [key(record), record])).values()];
    const current = deduped.filter(
      (record) =>
        (record.replyCount === null || record.replyCount > 0) &&
        slackTime(field(record, 'time')) >= storyStart(profile, now)
    );
    const expanded = current.filter((record) => record.threadExpanded);
    const threadExpansionComplete = current.length === expanded.length;
    const messages = [
      ...new Map(
        list(field(previousRow, 'messages')).map((message) => [
          `${String(field(message, 'channelId'))}:${String(field(message, 'threadTs'))}:${String(field(message, 'text'))}`,
          message,
        ])
      ).values(),
    ];
    const blocked = Boolean(field(row, 'blocked'));
    const paginationComplete = field(row, 'paginationComplete') === true;
    return {
      opportunityId,
      opportunityName: field(profile, 'opportunityName'),
      searchedAt: field(row, 'searchedAt') ?? '',
      searched: field(row, 'searched') === true && paginationComplete,
      blocked:
        candidates.length !== 1 || blocked || !paginationComplete || !threadExpansionComplete,
      error: rowError(candidates.length, row, paginationComplete, threadExpansionComplete),
      searchPath:
        'All accessible Slack locations were searched by exact full client name. Current-story results with replies or unknown reply counts require verified thread coverage; Opportunity-link, authorization, and provider-roster paths remain separately auditable.',
      searchQueries: field(row, 'searchQueries') ?? [],
      paginationComplete,
      threadExpansionComplete,
      threadCandidates: current.length,
      threadsRetrieved: expanded.length,
      records: deduped,
      messages,
      events: field(previousRow, 'events') ?? [],
      candidateCount: deduped.length,
      messageCandidates: deduped.length,
      fileCandidates: 0,
      truncated: false,
      nameSearched: true,
    };
  });
  const execution = {
    generatedAt: new Date(now).toISOString(),
    opportunities: merged.length,
    expectedOpportunities: identityRows.length,
    cohortComplete:
      merged.every(
        (row) => row.paginationComplete && row.threadExpansionComplete && !row.blocked
      ) &&
      exact.unassigned.length === 0 &&
      pageTwo.unassigned.length === 0,
    exactNameSearchesComplete: merged.filter((row) => row.paginationComplete).length,
    recordsRetrieved: merged.reduce((sum, row) => sum + row.records.length, 0),
    opportunitiesWithRecords: merged.filter((row) => row.records.length > 0).length,
    threadCandidates: merged.reduce((sum, row) => sum + row.threadCandidates, 0),
    threadsRetrieved: merged.reduce((sum, row) => sum + row.threadsRetrieved, 0),
    threadExpansionComplete: merged.every((row) => row.threadExpansionComplete),
    blocked: merged.filter((row) => row.blocked).length,
    unassignedExactRows: exact.unassigned.length,
    unassignedPageTwoRecords: pageTwo.unassigned.length,
    unassignedPriorRows: prior.unassigned.length,
    searchScope: ['public channels', 'private channels', 'group DMs', 'DMs'],
  };
  return { merged, execution };
}
