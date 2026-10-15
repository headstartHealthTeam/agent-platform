import { z } from 'zod';

import { filesystemCode, readPrivateJson } from './private-run-storage.js';
import type { ReviewerSnapshot, ReviewerSnapshotRow } from './publication-state.js';
import { reportTimestamp } from './report-display-values.js';

const reviewerSchema = z.looseObject({
  capturedAt: z.string().nullish(),
  rows: z.array(z.looseObject({})).nullish(),
});
const historySchema = z.looseObject({
  headers: z.unknown().optional(),
  rows: z.array(z.unknown()).nullish(),
});

/** Build-time age is relative to the frozen cutoff; publication has its own live freshness check. */
export function indexReportReviewerState(
  snapshot: ReviewerSnapshot,
  runAt: Date,
  required: boolean
): Map<unknown, ReviewerSnapshotRow> {
  const capturedAt = reportTimestamp(snapshot.capturedAt);
  if (required && (!Number.isFinite(capturedAt) || runAt.getTime() - capturedAt > 7_200_000))
    throw new Error('reviewer_state.json is missing a current capture from the live Google Sheet');
  const byKey = new Map<unknown, ReviewerSnapshotRow>();
  for (const row of snapshot.rows ?? []) {
    const hasId = Boolean(row.opportunityId);
    const hasName = Boolean(row.opportunityName);
    if (hasId) byKey.set(row.opportunityId, row);
    if (hasName) byKey.set(row.opportunityName, row);
  }
  return byKey;
}
export async function loadReportReviewerState(
  file: string,
  runAt: Date,
  required: boolean
): Promise<Map<unknown, ReviewerSnapshotRow>> {
  try {
    const parsed = reviewerSchema.safeParse(await readPrivateJson(file));
    if (!parsed.success) throw new Error('Invalid saved reviewer state');
    return indexReportReviewerState(parsed.data, runAt, required);
  } catch (error) {
    if (!required && filesystemCode(error, 'ENOENT')) return new Map();
    throw error;
  }
}
function unknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}
export interface ReportHistorySnapshot {
  readonly headers?: unknown;
  readonly rows?: readonly unknown[] | null | undefined;
}
/** Preserve raw cells, the original header equality and the 99-row bound before run-ID filtering. */
export function selectReportRunHistory(
  snapshot: ReportHistorySnapshot,
  headers: readonly string[]
): readonly (readonly unknown[])[] {
  if (!unknownArray(snapshot.headers) || snapshot.headers.join('\u0000') !== headers.join('\u0000'))
    return [];
  return (snapshot.rows ?? [])
    .filter(unknownArray)
    .filter((row) => Boolean(row[0]))
    .slice(0, 99);
}
export async function loadReportRunHistory(
  file: string,
  headers: readonly string[]
): Promise<readonly (readonly unknown[])[]> {
  try {
    const parsed = historySchema.safeParse(await readPrivateJson(file));
    if (!parsed.success) throw new Error('Invalid saved Run History state');
    return selectReportRunHistory(parsed.data, headers);
  } catch (error) {
    if (filesystemCode(error, 'ENOENT')) return [];
    throw error;
  }
}
