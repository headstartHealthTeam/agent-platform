import { z } from 'zod';

import type { EvidenceEvent } from './evidence.js';

export const sourceStatusSchema = z.enum([
  'Found',
  'Searched - Not Found',
  'Blocked',
  'Timed Out',
  'Unsupported',
]);
export type SourceStatus = z.infer<typeof sourceStatusSchema>;
type MatchedEvent = Pick<EvidenceEvent, 'substantive' | 'matchQuality'>;
const FAILURES = new Set<string>(['Blocked', 'Timed Out', 'Unsupported']);

export interface SourceResult<T extends MatchedEvent = EvidenceEvent> {
  readonly source: string;
  readonly status: SourceStatus;
  readonly collectedAt: string;
  readonly runId: string | null;
  readonly requestCount: number;
  readonly attempts: number;
  readonly pageCount: number;
  readonly recordCount: number;
  readonly cacheHits: number;
  readonly required: boolean;
  readonly paginationComplete: boolean;
  readonly relevantMatches: readonly T[];
  readonly weakMatches: readonly T[];
  readonly failureReason: string | null;
}
export type SourceResultInput<T extends MatchedEvent> = Pick<SourceResult<T>, 'source'> &
  Partial<Omit<SourceResult<T>, 'source' | 'status' | 'relevantMatches' | 'weakMatches'>> & {
    readonly searchStatus: SourceStatus;
    readonly events?: readonly T[];
  };

export function createSourceResult<T extends MatchedEvent = EvidenceEvent>({
  source,
  searchStatus,
  paginationComplete = true,
  events = [],
  failureReason = null,
  collectedAt = new Date().toISOString(),
  runId = null,
  requestCount = 1,
  attempts = 1,
  pageCount = 1,
  recordCount = 0,
  cacheHits = 0,
  required = true,
}: SourceResultInput<T>): SourceResult<T> {
  if (!sourceStatusSchema.safeParse(searchStatus).success)
    throw new Error(`Invalid source status: ${searchStatus}`);
  const substantiveMatches = events.filter(
    (event) => event.substantive && ['Direct', 'Likely'].includes(event.matchQuality)
  );
  let status = searchStatus;
  let reason = failureReason;
  if (!paginationComplete && !FAILURES.has(status)) {
    status = 'Blocked';
    reason ??= 'Search pagination was incomplete.';
  } else if (status === 'Found' && substantiveMatches.length === 0) {
    status = 'Searched - Not Found';
    reason ??= 'Search completed, but no Direct or Likely substantive evidence matched.';
  }
  return {
    source,
    status,
    collectedAt,
    runId,
    requestCount,
    attempts,
    pageCount,
    recordCount,
    cacheHits,
    required,
    paginationComplete,
    relevantMatches: substantiveMatches,
    weakMatches: events.filter((event) => event.matchQuality === 'Weak'),
    failureReason: reason,
  };
}

export function sourceCoverageComplete(
  results: readonly { readonly source: string }[],
  requiredSources: readonly string[]
): boolean {
  const sources = new Set(results.map((result) => result.source));
  return requiredSources.every((source) => sources.has(source));
}

interface FailureResult {
  readonly required?: boolean;
  readonly source: string;
  readonly status: string;
}

export function materialSourceFailure(
  results: readonly FailureResult[],
  materialSources: readonly string[]
): boolean {
  return results.some(
    (result) =>
      result.required !== false &&
      materialSources.includes(result.source) &&
      FAILURES.has(result.status)
  );
}

export function supplementarySourceFailure(
  results: readonly FailureResult[],
  materialSources: readonly string[] = []
): boolean {
  return results.some(
    (result) =>
      result.required !== false &&
      !materialSources.includes(result.source) &&
      FAILURES.has(result.status)
  );
}
