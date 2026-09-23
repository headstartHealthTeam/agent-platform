import { slackReplyCount } from '@headstart-health/slack-data';
import { z } from 'zod';

import { requireContract as check } from './connector-checkpoint.js';
import { sha256Json } from './json-fingerprint.js';
import type { DenialContextRequirement } from './slack-denial-requirements.js';
import { materializeSlackSearchCapture } from './slack-search-capture.js';
import type { SlackSearchRow } from './slack-search-capture.js';
import { normalizeSlackThread } from './slack-thread.js';

export interface DenialMessage {
  readonly channelId?: unknown;
  readonly messageTs?: unknown;
  readonly text?: unknown;
  readonly time?: unknown;
  readonly reply_count?: unknown;
  readonly replyCount?: unknown;
  readonly threadExpanded?: unknown;
  readonly threadText?: unknown;
  readonly threadCompletionEvidence?: unknown;
}
export interface DenialMergedRow {
  readonly opportunityId: string;
  readonly paginationComplete?: unknown;
  readonly records?: readonly DenialMessage[] | null;
}
export interface DenialContextRow {
  readonly opportunityId: string;
  readonly required: true;
  readonly complete: boolean;
  readonly queryCount: number;
  readonly recordCount: number;
  readonly detail: string;
}
export interface DenialContextCoverage {
  readonly version: 1;
  readonly runId: string;
  readonly asOf: string;
  readonly requirementsHash: string;
  readonly planHash: string | null;
  readonly captureHash: string | null;
  readonly mergedRowsHash: string;
  readonly threadRowsHash: string;
  readonly applicable: number;
  readonly complete: number;
  readonly incomplete: number;
  readonly rows: readonly DenialContextRow[];
}
export interface DenialContextInputs {
  readonly requirements: readonly DenialContextRequirement[];
  readonly runId: string;
  readonly asOf: string;
  readonly plan?: unknown;
  readonly capture?: unknown;
  readonly searchRows?: unknown;
  readonly threadRows?: unknown;
  readonly mergedRows?: unknown;
}
interface ArtifactRow extends DenialMessage {
  readonly opportunityId?: unknown;
  readonly queries?: unknown;
  readonly query?: unknown;
  readonly records?: unknown;
  readonly paginationComplete?: unknown;
}
const artifactRowsSchema = z.array(z.looseObject({}));
function assertArtifactRows(value: unknown): asserts value is readonly ArtifactRow[] {
  check(
    artifactRowsSchema.safeParse(value).success,
    'Invalid consumed denial-context artifact rows'
  );
}
function artifactRows(value: unknown, nullIsEmpty = false): readonly ArtifactRow[] {
  if (value === undefined || (nullIsEmpty && value === null)) return [];
  assertArtifactRows(value);
  return value;
}
function requiredArtifactRows(value: unknown): readonly ArtifactRow[] {
  assertArtifactRows(value);
  return value;
}
function plannedTargets(plan: unknown): readonly ArtifactRow[] {
  const envelope = z.object({ targets: z.unknown().optional() }).safeParse(plan);
  return artifactRows(envelope.data?.targets, true);
}
interface DenialCoverageBinding {
  readonly requirements: readonly DenialContextRequirement[];
  readonly runId: string;
  readonly asOf: string;
  readonly plan?: unknown;
  readonly capture?: unknown;
  readonly threadRows?: unknown;
  readonly mergedRows?: unknown;
}
/** Unused optional artifacts still participate in the original proof hash, without interpretation. */
export function denialContextCoverageSummary(
  {
    requirements,
    runId,
    asOf,
    plan,
    capture,
    threadRows = [],
    mergedRows = [],
  }: DenialCoverageBinding,
  rows: readonly DenialContextRow[]
): DenialContextCoverage {
  const hasPlan = Boolean(plan),
    hasCapture = Boolean(capture);
  return {
    version: 1,
    runId,
    asOf,
    requirementsHash: sha256Json(requirements),
    planHash: hasPlan ? sha256Json(plan) : null,
    captureHash: hasCapture ? sha256Json(capture) : null,
    mergedRowsHash: sha256Json(mergedRows),
    threadRowsHash: sha256Json(threadRows),
    applicable: rows.length,
    complete: rows.filter((row) => row.complete).length,
    incomplete: rows.filter((row) => !row.complete).length,
    rows,
  };
}
function key(record: DenialMessage): string {
  return `${String(record.channelId)}:${String(record.messageTs)}`;
}
function recordProblems(
  records: readonly DenialMessage[],
  merged: ArtifactRow | undefined,
  threads: unknown,
  asOf: string
): string[] {
  const problems: string[] = [];
  for (const record of records) {
    const admitted = artifactRows(merged?.records, true).filter(
      (item) => key(item) === key(record)
    );
    const item = admitted[0];
    if (
      admitted.length !== 1 ||
      item === undefined ||
      item.text !== record.text ||
      item.time !== record.time ||
      slackReplyCount(item) !== slackReplyCount(record)
    ) {
      problems.push(
        'Captured denial-context message evidence is missing or changed in the merged row.'
      );
      continue;
    }
    const replies = slackReplyCount(record);
    if (replies === 0) continue;
    const matches = artifactRows(threads).filter((thread) => key(thread) === key(record));
    const thread =
      matches.length === 1
        ? normalizeSlackThread(matches[0], replies ?? 0, { sourceCutoff: asOf })
        : null;
    if (
      !thread?.complete ||
      !Number.isSafeInteger(thread.completionEvidence.replies) ||
      item.threadExpanded !== true ||
      item.threadText !== thread.text ||
      sha256Json(item.threadCompletionEvidence ?? null) !== sha256Json(thread.completionEvidence)
    ) {
      problems.push(
        'Denial-context message/thread coverage is incomplete or differs from the retained capture.'
      );
    }
  }
  return problems;
}
function coverageRow(
  requirement: DenialContextRequirement,
  inputs: DenialContextInputs,
  canonicalRows: readonly SlackSearchRow[],
  captureValid: boolean
): DenialContextRow {
  const problems: string[] = [];
  const planned = plannedTargets(inputs.plan).filter(
    (target) => target.opportunityId === requirement.opportunityId
  );
  const canonical = canonicalRows.find((row) => row.opportunityId === requirement.opportunityId);
  const exact = artifactRows(inputs.searchRows, true).filter(
    (row) => row.opportunityId === requirement.opportunityId
  );
  const merged = artifactRows(inputs.mergedRows).filter(
    (row) => row.opportunityId === requirement.opportunityId
  );
  const target = planned[0];
  if (
    planned.length !== 1 ||
    target === undefined ||
    requirement.queries.some(
      (q) => !requiredArtifactRows(target.queries).some((p) => p.query === q.query)
    )
  ) {
    problems.push('Required Client Intake denial-context queries are missing from the plan.');
  }
  if (
    !captureValid ||
    !canonical?.paginationComplete ||
    exact.length !== 1 ||
    sha256Json(canonical) !== sha256Json(exact[0])
  ) {
    problems.push('Denial-context searches lack current-run, terminal raw-capture evidence.');
  }
  if (merged.length !== 1 || merged[0]?.paginationComplete !== true) {
    problems.push('Denial-context search results were not merged into this run.');
  }
  problems.push(
    ...recordProblems(canonical?.records ?? [], merged[0], inputs.threadRows, inputs.asOf)
  );
  return {
    opportunityId: requirement.opportunityId,
    required: true,
    complete: problems.length === 0,
    queryCount: requirement.queries.length,
    recordCount: canonical?.records.length ?? 0,
    detail: [...new Set(problems)].join(' '),
  };
}
export function verifyDenialContext(inputs: DenialContextInputs): DenialContextCoverage {
  const { requirements, runId, asOf, plan, capture } = inputs;
  const required = requirements.filter((row) => row.required);
  let canonicalRows: SlackSearchRow[] = [];
  let captureValid = false;
  if (required.length > 0) {
    try {
      const envelope = z.object({ runId: z.unknown(), asOf: z.unknown() }).safeParse(capture);
      check(
        envelope.success && envelope.data.runId === runId && envelope.data.asOf === asOf,
        'Wrong Slack run/cutoff'
      );
      canonicalRows = materializeSlackSearchCapture({ plan, capture });
      captureValid = true;
    } catch {
      // The approved workflow retains missing/invalid capture as a row-level required-source gap.
    }
  }
  const rows = required.map((requirement) =>
    coverageRow(requirement, inputs, canonicalRows, captureValid)
  );
  return denialContextCoverageSummary(inputs, rows);
}
