import { requireContract as check } from './connector-checkpoint.js';
import { REVIEWER_SNAPSHOT_FIELDS, reviewerSnapshotHash } from './publication-state.js';
import type { ReviewerSnapshotRow } from './publication-state.js';

export const GOOGLE_REVIEWER_FIELDS = [
  ['Needs CSM Review', 'needsCsmReview'],
  ['Reviewer Notes', 'reviewerNotes'],
  ['Copied to Salesforce?', 'copiedToSalesforce'],
  ['Reviewed By', 'reviewedBy'],
  ['Reviewed At', 'reviewedAt'],
] as const;
export const GOVERNED_SHEETS = [
  'Review Queue',
  'On-Hold Review',
  'Evidence Detail',
  'Data Dictionary',
  'Source & Run Notes',
  'Generation Ledger',
  'Run History',
] as const;
export type GoogleEnteredScalar = string | number | boolean | null;

/** Intake's state-table projection only; raw assertion captures retain typed entered values. */
export function googleEnteredScalar(value: unknown): GoogleEnteredScalar {
  if (value === undefined || value === null) return null;
  if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)
    return null;
  check(
    typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1,
    'Invalid Google user-entered value'
  );
  const entries: [string, unknown][] = Object.entries(value);
  const [key, scalar] = entries[0] ?? [];
  check(
    (key === 'numberValue' && typeof scalar === 'number' && Number.isFinite(scalar)) ||
      (key === 'boolValue' && typeof scalar === 'boolean') ||
      ((key === 'stringValue' || key === 'formulaValue') && typeof scalar === 'string'),
    'Unsupported Google cell value'
  );
  return key === 'stringValue' && scalar === '' ? null : scalar;
}
type NormalizedReviewerRow<T> = Omit<T, (typeof REVIEWER_SNAPSHOT_FIELDS)[number]> &
  ReviewerSnapshotRow;
export function normalizeReviewerBlanks<R extends ReviewerSnapshotRow, T extends object>(
  artifact: T & { readonly rows: readonly R[] }
): Omit<T, 'rows'> & { rows: NormalizedReviewerRow<R>[] } {
  const rows = artifact.rows.map((row) => ({
    ...row,
    ...Object.fromEntries(
      REVIEWER_SNAPSHOT_FIELDS.map((key) => {
        const value: unknown = Reflect.get(row, key);
        return [key, value === '' || value === undefined ? null : value];
      })
    ),
  }));
  reviewerSnapshotHash({ rows });
  return { ...artifact, rows };
}
