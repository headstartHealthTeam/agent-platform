import { z } from 'zod';

import type { DateValue } from './dates.js';
import { verifyFirefliesCacheRun } from './fireflies-cache-verify.js';

const rowSchema = z.looseObject({
  transcriptId: z.unknown().optional(),
  id: z.unknown().optional(),
  transcriptEmpty: z.unknown().optional(),
  fullTranscript: z.unknown().optional(),
  transcript: z.unknown().optional(),
  sentences: z.unknown().optional(),
  retrievedAt: z.unknown().optional(),
  collectedAt: z.unknown().optional(),
  searchedAt: z.unknown().optional(),
});
type InventoryRow = z.infer<typeof rowSchema>;
export interface TranscriptInventoryHealth {
  readonly status: 'Complete' | 'Blocked';
  readonly complete: boolean;
  readonly expectedCount: number;
  readonly retainedCount: number;
  readonly uniqueCount: number;
  readonly duplicateCount: number;
  readonly explicitlyEmptyCount: number;
  readonly missingTranscriptCount: number;
  readonly staleCount: number;
  readonly issues: readonly string[];
  readonly reason: string | null;
}
function truthyOr(left: unknown, right: unknown): unknown {
  const present = Boolean(left);
  return present ? left : right;
}
function artifactString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toString();
  if (Array.isArray(value)) return value.map(artifactString).join(',');
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
    return String(value);
  if (typeof value === 'symbol' || typeof value === 'function') return value.toString();
  return Object.prototype.toString.call(value);
}
function clean(value: unknown): string {
  return artifactString(value).trim();
}
function transcriptText(row: InventoryRow): string {
  return clean(truthyOr(row.fullTranscript, truthyOr(row.transcript, row.sentences)));
}
function timestamp(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') return new Date(value).getTime();
  if (value === null || typeof value === 'boolean') return new Date(Number(value)).getTime();
  if (value === undefined) return NaN;
  return new Date(artifactString(value)).getTime();
}
function cacheHealth(
  records: readonly InventoryRow[],
  proof: unknown,
  runAt: DateValue
): { valid: boolean; issues: string[] } {
  const present = Boolean(proof);
  if (!present) return { valid: false, issues: [] };
  try {
    const { collectionPlan } = z
      .object({ collectionPlan: z.looseObject({ fromDate: z.string(), toDate: z.string() }) })
      .parse(proof);
    if (!(typeof runAt === 'string' || runAt instanceof Date))
      throw new Error('Invalid cache run time');
    verifyFirefliesCacheRun({ records, proof, runAt, collectionPlan });
    return { valid: true, issues: [] };
  } catch {
    return {
      valid: false,
      issues: ['Fireflies cache provenance is missing, incomplete, or incompatible with this run.'],
    };
  }
}
function inventoryIssues(
  expected: number,
  rows: readonly InventoryRow[],
  ids: readonly string[],
  uniqueCount: number,
  duplicateCount: number,
  missingCount: number,
  staleCount: number
): string[] {
  const issues: string[] = [];
  if (ids.length !== rows.length) issues.push('Transcript records are missing source identities.');
  if (expected > 0 && rows.length < expected)
    issues.push(`Retained ${String(rows.length)} of ${String(expected)} requested transcripts.`);
  if (duplicateCount > 0)
    issues.push(`${String(duplicateCount)} duplicate transcript IDs were retained.`);
  if (missingCount > 0)
    issues.push(`${String(missingCount)} retained transcript records have no full transcript.`);
  if (staleCount > 0)
    issues.push(
      `${String(staleCount)} transcript records were not retrieved during the current run.`
    );
  if (expected > 0 && uniqueCount < expected)
    issues.push(`Only ${String(uniqueCount)} unique transcript IDs were retained.`);
  return issues;
}
export function assessTranscriptInventoryArtifact({
  expectedCount = 0,
  records = [],
  runAt = null,
  freshnessHours = 12,
  cacheProof = null,
}: {
  readonly expectedCount?: unknown;
  readonly records?: unknown;
  readonly runAt?: DateValue;
  readonly freshnessHours?: number;
  readonly cacheProof?: unknown;
} = {}): TranscriptInventoryHealth {
  const expected = Math.max(0, Number(expectedCount) || 0);
  const rows = Array.isArray(records) ? z.array(rowSchema).parse(records) : [];
  const ids = rows.map((row) => clean(truthyOr(row.transcriptId, row.id))).filter(Boolean);
  const uniqueIds = new Set(ids);
  const explicitlyEmpty = rows.filter(
    (row) => row.transcriptEmpty === true && transcriptText(row).length === 0
  );
  const missing = rows.filter(
    (row) => row.transcriptEmpty !== true && transcriptText(row).length === 0
  );
  const duplicateCount = Math.max(0, ids.length - uniqueIds.size);
  const cache = cacheHealth(rows, cacheProof, runAt);
  const runPresent = Boolean(runAt);
  const runTime = runPresent ? timestamp(runAt) : NaN;
  const stale =
    Number.isFinite(runTime) && !cache.valid
      ? rows.filter((row) => {
          const retrievedAt = timestamp(
            truthyOr(row.retrievedAt, truthyOr(row.collectedAt, row.searchedAt))
          );
          return (
            !Number.isFinite(retrievedAt) ||
            Math.abs(runTime - retrievedAt) > freshnessHours * 3_600_000
          );
        })
      : [];
  const issues = [
    ...cache.issues,
    ...inventoryIssues(
      expected,
      rows,
      ids,
      uniqueIds.size,
      duplicateCount,
      missing.length,
      stale.length
    ),
  ];
  return {
    status: issues.length > 0 ? 'Blocked' : 'Complete',
    complete: issues.length === 0,
    expectedCount: expected,
    retainedCount: rows.length,
    uniqueCount: uniqueIds.size,
    duplicateCount,
    explicitlyEmptyCount: explicitlyEmpty.length,
    missingTranscriptCount: missing.length,
    staleCount: stale.length,
    issues,
    reason: issues.join(' ') || null,
  };
}
