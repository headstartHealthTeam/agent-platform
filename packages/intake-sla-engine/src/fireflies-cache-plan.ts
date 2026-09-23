import { transcriptMetadata } from '@headstart-health/fireflies-data';
import type {
  CompleteFirefliesTranscript,
  TranscriptMetadata,
} from '@headstart-health/fireflies-data';
import { z } from 'zod';

import {
  cacheTimestamp,
  FIREFLIES_CACHE_VERSION,
  requireCacheValue,
  validateCachePolicy,
} from './fireflies-cache-contract.js';
import type {
  FirefliesCachePolicy,
  FirefliesCollectionWindow,
  FirefliesDiscovery,
} from './fireflies-cache-contract.js';
import { normalizeCacheTranscript } from './fireflies-cache-transcript.js';
import { validateDiscovery } from './fireflies-discovery.js';
import { sha256Json } from './json-fingerprint.js';

export const CACHE_HOUR_MS = 3_600_000;
const indexSchema = z.looseObject({
  version: z.literal(FIREFLIES_CACHE_VERSION),
  scopeHash: z.string(),
  policyHash: z.string(),
  lastFullRevalidationAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  lastDiscoveryAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  entries: z.array(
    z.looseObject({
      id: z.string(),
      metadataHash: z.unknown().optional(),
      contentHash: z.unknown().optional(),
      lastFetchedAt: z.unknown().optional(),
      nextRevalidateAt: z.unknown().optional(),
    })
  ),
});
export type FirefliesCacheIndex = z.infer<typeof indexSchema>;
export type FirefliesCacheEntry = FirefliesCacheIndex['entries'][number];
export type CacheReuseReason =
  | 'missing-or-corrupt'
  | 'metadata-changed'
  | 'content-unverifiable'
  | 'invalid-fetch-time'
  | 'stabilizing'
  | 'revalidation-due';
export interface FirefliesCachePlanItem {
  readonly id: string;
  readonly metadataHash: string;
  readonly action: 'reuse' | 'fetch';
  readonly reason:
    CacheReuseReason | 'full-revalidation' | 'shadow-validation' | 'within-approved-validation-age';
  readonly candidateReuse: boolean;
}
export interface FirefliesCachePlan {
  readonly version: string;
  readonly runId: string;
  readonly asOf: string;
  readonly discoveryHash: string;
  readonly collectionPlanHash: string;
  readonly scopeHash: string;
  readonly policyHash: string;
  readonly cacheSnapshotHash: string;
  readonly mode: 'shadow' | 'reuse';
  readonly fullRevalidation: boolean;
  readonly items: readonly FirefliesCachePlanItem[];
  readonly planHash: string;
}
export interface FirefliesCachePlanInput {
  readonly discovery: FirefliesDiscovery;
  readonly collectionPlan: FirefliesCollectionWindow;
  readonly policy: unknown;
  readonly index?: unknown;
  readonly objects?: ReadonlyMap<string, unknown>;
  readonly mode?: string;
}
function transcriptContent({
  retrievedAt: _retrievedAt,
  retrievalEndpoint: _retrievalEndpoint,
  ...content
}: CompleteFirefliesTranscript): Omit<
  CompleteFirefliesTranscript,
  'retrievedAt' | 'retrievalEndpoint'
> {
  return content;
}
export function transcriptContentHash(record: unknown): string {
  return sha256Json(transcriptContent(normalizeCacheTranscript(record)));
}
export function healthyCacheBaseline(
  input: unknown,
  scopeHash: string,
  policyHash: string,
  time: number
): FirefliesCacheIndex | null {
  const parsed = indexSchema.safeParse(input);
  if (!parsed.success) return null;
  const index = parsed.data;
  const healthy =
    index.scopeHash === scopeHash &&
    index.policyHash === policyHash &&
    Date.parse(index.lastFullRevalidationAt) <= time &&
    Date.parse(index.lastDiscoveryAt) <= time &&
    new Set(index.entries.map((entry) => entry.id)).size === index.entries.length;
  return healthy ? index : null;
}
export function cacheReuseReason(
  meeting: TranscriptMetadata,
  entry: FirefliesCacheEntry | undefined,
  record: unknown,
  policy: FirefliesCachePolicy,
  time: number
): CacheReuseReason | null {
  const recordPresent = Boolean(record);
  if (entry === undefined || !recordPresent) return 'missing-or-corrupt';
  try {
    if (
      entry.metadataHash !== sha256Json(meeting) ||
      sha256Json(transcriptMetadata(record)) !== entry.metadataHash
    )
      return 'metadata-changed';
    if (entry.contentHash !== transcriptContentHash(record)) return 'content-unverifiable';
    const normalized = normalizeCacheTranscript(record);
    if (
      cacheTimestamp(normalized.retrievedAt) !== cacheTimestamp(entry.lastFetchedAt) ||
      cacheTimestamp(entry.lastFetchedAt) > time
    )
      return 'invalid-fetch-time';
    if (time - cacheTimestamp(meeting.date) < policy.stabilizationHours * CACHE_HOUR_MS)
      return 'stabilizing';
    if (
      time >= cacheTimestamp(entry.nextRevalidateAt) ||
      time - cacheTimestamp(entry.lastFetchedAt) >= policy.maxValidationAgeHours * CACHE_HOUR_MS
    )
      return 'revalidation-due';
    return null;
  } catch {
    return 'content-unverifiable';
  }
}
export function planFirefliesCache({
  discovery,
  collectionPlan,
  policy: policyInput,
  index = null,
  objects = new Map<string, unknown>(),
  mode = 'shadow',
}: FirefliesCachePlanInput): FirefliesCachePlan {
  const policy = validateCachePolicy(policyInput);
  requireCacheValue(mode === 'shadow' || mode === 'reuse', 'Unknown cache execution mode');
  requireCacheValue(
    mode !== 'reuse' ||
      (typeof policy.approvalReference === 'string' && policy.approvalReference.trim().length > 0),
    'Reuse requires an explicitly approved validation-age policy'
  );
  const meetings = validateDiscovery(discovery, collectionPlan, discovery.asOf);
  const time = cacheTimestamp(discovery.asOf);
  const scopeHash = sha256Json(discovery.scope);
  const policyHash = sha256Json(policy);
  const baseline = healthyCacheBaseline(index, scopeHash, policyHash, time);
  const reconcile =
    baseline === null ||
    time - Date.parse(baseline.lastFullRevalidationAt) >=
      policy.fullRevalidationHours * CACHE_HOUR_MS;
  const entries = new Map((baseline?.entries ?? []).map((entry) => [entry.id, entry]));
  const items = meetings.map((meeting): FirefliesCachePlanItem => {
    const reason = reconcile
      ? 'full-revalidation'
      : cacheReuseReason(
          meeting,
          entries.get(meeting.transcriptId),
          objects.get(meeting.transcriptId),
          policy,
          time
        );
    return {
      id: meeting.transcriptId,
      metadataHash: sha256Json(meeting),
      action: mode === 'reuse' && reason === null ? 'reuse' : 'fetch',
      reason:
        reason ?? (mode === 'shadow' ? 'shadow-validation' : 'within-approved-validation-age'),
      candidateReuse: reason === null,
    };
  });
  const body: Omit<FirefliesCachePlan, 'planHash'> = {
    version: FIREFLIES_CACHE_VERSION,
    runId: discovery.runId,
    asOf: discovery.asOf,
    discoveryHash: sha256Json(discovery),
    collectionPlanHash: sha256Json(collectionPlan),
    scopeHash,
    policyHash,
    cacheSnapshotHash: sha256Json(index),
    mode,
    fullRevalidation: reconcile,
    items,
  };
  return { ...body, planHash: sha256Json(body) };
}
