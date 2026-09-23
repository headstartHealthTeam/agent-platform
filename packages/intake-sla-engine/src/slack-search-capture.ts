import type { SlackPageRecord } from '@headstart-health/slack-data';
import { z } from 'zod';

import { requireContract as check } from './connector-checkpoint.js';
import { sha256Json } from './json-fingerprint.js';
import { normalizeSlackSearchPage } from './slack-search-page.js';

const querySchema = z.looseObject({ query: z.string().min(1) });
const targetSchema = z.looseObject({
  opportunityId: z.string().min(1),
  opportunityName: z.unknown().optional(),
  queries: z.array(querySchema).min(1),
});
const planSchema = z.looseObject({ scope: z.unknown(), targets: z.array(targetSchema) });
interface SearchTarget {
  readonly opportunityId: string;
  readonly opportunityName?: unknown;
  readonly queries: readonly { readonly query: string }[];
}
export interface SlackSearchPlan {
  readonly scope: unknown;
  readonly targets: readonly SearchTarget[];
}
const captureSchema = z.looseObject({
  version: z.literal(1),
  planHash: z.string(),
  scopeHash: z.string(),
  accessVerified: z.literal(true),
  asOf: z.string(),
  collectedAt: z.string(),
  pages: z.array(
    z.looseObject({ opportunityId: z.unknown().optional(), query: z.unknown().optional() })
  ),
});
interface SearchCapture {
  readonly asOf: string;
  readonly collectedAt: string;
  readonly pages: readonly { readonly opportunityId?: unknown; readonly query?: unknown }[];
  readonly planHash: string;
  readonly scopeHash: string;
}
export interface SlackSearchRow {
  readonly opportunityId: string;
  readonly opportunityName: unknown;
  readonly searchedAt: string;
  readonly searched: boolean;
  readonly paginationComplete: boolean;
  readonly blocked: boolean;
  readonly error: string;
  readonly searchQueries: readonly string[];
  readonly pageCount: number;
  readonly records: readonly SlackPageRecord[];
  readonly captureHash: string;
  readonly planHash: string;
  readonly sourceCutoff: string;
}
function assertPlan(value: unknown): asserts value is SlackSearchPlan {
  const parsed = planSchema.safeParse(value);
  check(
    parsed.success &&
      new Set(parsed.data.targets.map((target) => target.opportunityId)).size ===
        parsed.data.targets.length &&
      parsed.data.targets.every(
        (target) =>
          new Set(target.queries.map((query) => query.query)).size === target.queries.length
      ),
    'Invalid or duplicate Slack planned identities/queries'
  );
}
function queryKey(value: { readonly opportunityId?: unknown; readonly query?: unknown }): string {
  return `${String(value.opportunityId)}\0${String(value.query)}`;
}
function assertCapture(value: unknown, plan: SlackSearchPlan): asserts value is SearchCapture {
  const parsed = captureSchema.safeParse(value);
  check(
    parsed.success &&
      parsed.data.planHash === sha256Json(plan) &&
      parsed.data.scopeHash === sha256Json(plan.scope) &&
      Number.isFinite(Date.parse(parsed.data.asOf)) &&
      Date.parse(parsed.data.collectedAt) >= Date.parse(parsed.data.asOf) &&
      Date.parse(parsed.data.collectedAt) <= Date.now(),
    'Slack capture is not bound to its plan, scope, and cutoff'
  );
}
function collectQuery(
  capture: SearchCapture,
  target: SearchTarget,
  query: string,
  records: Map<string, SlackPageRecord>
): { readonly pageCount: number; readonly terminal: boolean } {
  const raw = capture.pages.filter(
    (page) => page.opportunityId === target.opportunityId && page.query === query
  );
  const pages = raw
    .map(normalizeSlackSearchPage)
    .sort((left, right) => left.pageNumber - right.pageNumber);
  let cursor = '';
  const cursors = new Set<string>();
  let terminal = false;
  for (const [index, page] of pages.entries()) {
    check(
      !terminal &&
        page.pageNumber === index + 1 &&
        page.requestCursor === cursor &&
        !cursors.has(cursor),
      'Slack pagination is duplicated, disconnected, or not progressing'
    );
    cursors.add(cursor);
    cursor = page.nextCursor;
    terminal = page.terminal;
    for (const record of page.records) {
      if (Number(record.messageTs) * 1000 > Date.parse(capture.asOf)) continue;
      const key = `${record.channelId}:${record.messageTs}`;
      const old = records.get(key);
      check(
        old === undefined || (old.text === record.text && old.replyCount === record.replyCount),
        'Conflicting Slack message captures require reconciliation'
      );
      records.set(key, record);
    }
  }
  return { pageCount: pages.length, terminal };
}
function materializeTarget(
  target: SearchTarget,
  capture: SearchCapture,
  plan: SlackSearchPlan
): SlackSearchRow {
  const records = new Map<string, SlackPageRecord>();
  let pageCount = 0;
  const incompleteQueries: string[] = [];
  for (const query of target.queries) {
    const result = collectQuery(capture, target, query.query, records);
    pageCount += result.pageCount;
    if (!result.terminal) incompleteQueries.push(query.query);
  }
  return {
    opportunityId: target.opportunityId,
    opportunityName: target.opportunityName,
    searchedAt: capture.collectedAt,
    searched: incompleteQueries.length === 0,
    paginationComplete: incompleteQueries.length === 0,
    blocked: incompleteQueries.length > 0,
    error: incompleteQueries.length > 0 ? 'Planned Slack queries are incomplete' : '',
    searchQueries: target.queries.map((query) => query.query),
    pageCount,
    records: [...records.values()],
    captureHash: sha256Json(capture),
    planHash: sha256Json(plan),
    sourceCutoff: capture.asOf,
  };
}
export function materializeSlackSearchCapture({
  plan,
  capture,
}: {
  readonly plan: unknown;
  readonly capture: unknown;
}): SlackSearchRow[] {
  assertPlan(plan);
  assertCapture(capture, plan);
  const expected = new Set(
    plan.targets.flatMap((target) =>
      target.queries.map((query) =>
        queryKey({ opportunityId: target.opportunityId, query: query.query })
      )
    )
  );
  check(
    capture.pages.every((page) => expected.has(queryKey(page))),
    'Unknown Slack query capture'
  );
  return plan.targets.map((target) => materializeTarget(target, capture, plan));
}
