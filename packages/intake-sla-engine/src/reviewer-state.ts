export const REVIEWER_FIELDS = [
  'Needs CSM Review',
  'Reviewer Notes',
  'Copied to Salesforce?',
  'Reviewed By',
  'Reviewed At',
] as const;
export type ReviewerField = (typeof REVIEWER_FIELDS)[number];
export type ReviewerValues = Readonly<Record<ReviewerField, unknown>>;
export interface ReviewerRow extends Partial<ReviewerValues> {
  readonly 'Opportunity ID'?: string | null | undefined;
  readonly opportunityId?: string | null | undefined;
}
function values(row: ReviewerRow): ReviewerValues {
  return {
    'Needs CSM Review': row['Needs CSM Review'] ?? null,
    'Reviewer Notes': row['Reviewer Notes'] ?? null,
    'Copied to Salesforce?': row['Copied to Salesforce?'] ?? null,
    'Reviewed By': row['Reviewed By'] ?? null,
    'Reviewed At': row['Reviewed At'] ?? null,
  };
}
export function indexReviewerState(rows: readonly ReviewerRow[]): Map<string, ReviewerValues> {
  const state = new Map<string, ReviewerValues>();
  for (const row of rows) {
    const opportunityId = row['Opportunity ID'] ?? row.opportunityId;
    if (opportunityId) state.set(opportunityId, values(row));
  }
  return state;
}
export function restoreReviewerState<T extends ReviewerRow>(
  rows: readonly T[],
  priorRows: readonly ReviewerRow[]
): (Omit<T, ReviewerField> & Partial<ReviewerValues>)[] {
  const state = indexReviewerState(priorRows);
  return rows.map((row) => {
    const opportunityId = row['Opportunity ID'] ?? row.opportunityId;
    const preserved =
      opportunityId === null || opportunityId === undefined ? undefined : state.get(opportunityId);
    return preserved === undefined ? { ...row } : { ...row, ...preserved };
  });
}
export interface ReviewerStateDifference {
  readonly opportunityId: string;
  readonly field: ReviewerField;
  readonly before: unknown;
  readonly after: unknown;
}
export function reviewerStateDiff(
  beforeRows: readonly ReviewerRow[],
  afterRows: readonly ReviewerRow[]
): ReviewerStateDifference[] {
  const before = indexReviewerState(beforeRows);
  const after = indexReviewerState(afterRows);
  const differences: ReviewerStateDifference[] = [];
  for (const [opportunityId, previous] of before) {
    const current = new Map<string, unknown>(Object.entries(after.get(opportunityId) ?? {}));
    const prior = new Map<string, unknown>(Object.entries(previous));
    for (const field of REVIEWER_FIELDS) {
      if ((current.get(field) ?? null) !== (prior.get(field) ?? null))
        differences.push({
          opportunityId,
          field,
          before: prior.get(field) ?? null,
          after: current.get(field) ?? null,
        });
    }
  }
  return differences;
}
