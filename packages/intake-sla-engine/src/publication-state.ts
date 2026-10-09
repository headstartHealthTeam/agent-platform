import { sha256Json } from './json-fingerprint.js';

export interface PublicationCaptureFreshness {
  readonly capturedAt?: string | null | undefined;
  readonly revalidatedAt?: string | null | undefined;
  readonly revalidationHash?: string | null | undefined;
  readonly spreadsheetId?: string | undefined;
}
export interface PublicationMarkerArtifact extends PublicationCaptureFreshness {
  readonly values?: readonly (readonly unknown[])[] | null | undefined;
}
export interface ReviewerSnapshotRow {
  readonly opportunityId?: unknown;
  readonly opportunityName?: unknown;
  readonly needsCsmReview?: unknown;
  readonly reviewerNotes?: unknown;
  readonly copiedToSalesforce?: unknown;
  readonly reviewedBy?: unknown;
  readonly reviewedAt?: unknown;
}
export interface ReviewerSnapshot extends PublicationCaptureFreshness {
  readonly rows?: readonly ReviewerSnapshotRow[] | null | undefined;
}
export const REVIEWER_SNAPSHOT_FIELDS = [
  'needsCsmReview',
  'reviewerNotes',
  'copiedToSalesforce',
  'reviewedBy',
  'reviewedAt',
] as const;

export function publicationMarker(artifact: PublicationMarkerArtifact = {}): {
  runId: unknown;
  lastRefresh: unknown;
} {
  const rows = artifact.values ?? [];
  return {
    runId: rows.find((row) => row[0] === 'Run ID')?.[1] ?? null,
    lastRefresh: rows.find((row) => row[0] === 'Last Refresh (ET)')?.[1] ?? null,
  };
}

function identitySortText(value: unknown): string {
  return String(value);
}
function reviewerValue(
  row: ReviewerSnapshotRow,
  field: (typeof REVIEWER_SNAPSHOT_FIELDS)[number]
): unknown {
  return Reflect.get(row, field);
}
/** Preserve own undefined, whitespace and typed reviewer values; only absent fields become null. */
export function reviewerSnapshotHash(artifact: ReviewerSnapshot = {}): string {
  const rows = (artifact.rows ?? []).map((row) => {
    return {
      opportunityId: row.opportunityId ?? null,
      opportunityName: row.opportunityName ?? null,
      ...Object.fromEntries(
        REVIEWER_SNAPSHOT_FIELDS.map((field) => [
          field,
          Object.hasOwn(row, field) ? reviewerValue(row, field) : null,
        ])
      ),
    };
  });
  rows.sort((left, right) =>
    identitySortText(left.opportunityId ?? left.opportunityName).localeCompare(
      identitySortText(right.opportunityId ?? right.opportunityName)
    )
  );
  const keys = rows.map((row) => row.opportunityId ?? row.opportunityName);
  if (new Set(keys).size !== keys.length || keys.some((key) => !key))
    throw new Error('Reviewer state contains a missing or duplicate identity');
  return sha256Json(rows);
}
