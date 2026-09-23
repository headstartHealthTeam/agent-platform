import { transcriptMetadata } from '@headstart-health/fireflies-data';
import type { CompleteFirefliesTranscript } from '@headstart-health/fireflies-data';

import {
  cacheTimestamp,
  FIREFLIES_CACHE_VERSION,
  requireCacheValue,
  validateCachePolicy,
} from './fireflies-cache-contract.js';
import type { FirefliesCachePolicy } from './fireflies-cache-contract.js';
import {
  CACHE_HOUR_MS,
  healthyCacheBaseline,
  planFirefliesCache,
  transcriptContentHash,
} from './fireflies-cache-plan.js';
import type {
  FirefliesCachePlan,
  FirefliesCachePlanInput,
  FirefliesCachePlanItem,
} from './fireflies-cache-plan.js';
import { normalizeCacheTranscript } from './fireflies-cache-transcript.js';
import { sha256Json } from './json-fingerprint.js';

export interface MaterializedCacheEntry {
  readonly id: string;
  readonly metadataHash: string;
  readonly contentHash: string;
  readonly objectKey: string;
  readonly lastFetchedAt: string;
  readonly nextRevalidateAt: string;
}
export interface MaterializedCacheIndex {
  readonly version: string;
  readonly scopeHash: string;
  readonly policyHash: string;
  readonly lastDiscoveryAt: string;
  readonly lastFullRevalidationAt: string;
  readonly runId: string;
  readonly entries: readonly MaterializedCacheEntry[];
}
export interface CacheTranscriptProvenance {
  readonly id: string;
  readonly contentHash: string;
  readonly recordHash: string;
  readonly source: 'Cache Reused' | 'Cache Revalidated' | 'Fresh';
  readonly retrievedAt: string;
  readonly discoveredAt: string;
}
export interface FirefliesCacheReport {
  readonly version: string;
  readonly status: string;
  readonly runId: string;
  readonly asOf: string;
  readonly planHash: string;
  readonly discoveryHash: string;
  readonly policyHash: string;
  readonly mode: string;
  readonly completedAt: string;
  readonly inventoryHash: string;
  readonly provenance: readonly CacheTranscriptProvenance[];
  readonly counts: {
    readonly total: number;
    readonly fetched: number;
    readonly reused: number;
    readonly shadowCompared: number;
    readonly shadowChanged: number;
  };
}
export interface FirefliesCacheMaterialization {
  readonly records: readonly CompleteFirefliesTranscript[];
  readonly index: MaterializedCacheIndex;
  readonly report: FirefliesCacheReport;
}
export interface CacheMaterializationInput extends FirefliesCachePlanInput {
  readonly plan: FirefliesCachePlan;
  readonly fetched?: readonly unknown[];
  readonly completedAt?: string;
}
function validateFetches(
  fetched: readonly unknown[],
  plan: FirefliesCachePlan,
  discoveryCompletedAt: string,
  completedAt: string
): Map<string, CompleteFirefliesTranscript> {
  const required = new Set(
    plan.items.filter((item) => item.action === 'fetch').map((item) => item.id)
  );
  const byId = new Map<string, CompleteFirefliesTranscript>();
  for (const input of fetched) {
    const record = normalizeCacheTranscript(input);
    requireCacheValue(
      required.has(record.transcriptId) && !byId.has(record.transcriptId),
      'Unexpected or duplicate fetched transcript'
    );
    requireCacheValue(
      cacheTimestamp(record.retrievedAt) >= cacheTimestamp(discoveryCompletedAt) &&
        cacheTimestamp(record.retrievedAt) <= cacheTimestamp(completedAt),
      'A planned fetch must be completed after current discovery'
    );
    byId.set(record.transcriptId, record);
  }
  requireCacheValue(
    byId.size === required.size,
    'Required transcript fetch failed or is missing; cache cannot fill the gap',
    'MISSING_REQUIRED_FETCH'
  );
  return byId;
}
function cacheEntry(
  item: FirefliesCachePlanItem,
  record: CompleteFirefliesTranscript,
  contentHash: string,
  policy: FirefliesCachePolicy
): MaterializedCacheEntry {
  return {
    id: item.id,
    metadataHash: item.metadataHash,
    contentHash,
    objectKey: sha256Json(record),
    lastFetchedAt: record.retrievedAt,
    nextRevalidateAt: new Date(
      cacheTimestamp(record.retrievedAt) + policy.maxValidationAgeHours * CACHE_HOUR_MS
    ).toISOString(),
  };
}
function fullRevalidationTime(
  plan: FirefliesCachePlan,
  index: unknown,
  completedAt: string
): string {
  if (plan.items.every((item) => item.action === 'fetch')) return completedAt;
  const baseline = healthyCacheBaseline(
    index,
    plan.scopeHash,
    plan.policyHash,
    cacheTimestamp(plan.asOf)
  );
  requireCacheValue(baseline !== null, 'Cache baseline is missing for planned reuse');
  return baseline.lastFullRevalidationAt;
}
export function materializeFirefliesCache({
  discovery,
  collectionPlan,
  policy: policyInput,
  index = null,
  objects = new Map<string, unknown>(),
  plan,
  fetched = [],
  completedAt = new Date().toISOString(),
}: CacheMaterializationInput): FirefliesCacheMaterialization {
  requireCacheValue(
    cacheTimestamp(completedAt) >= cacheTimestamp(discovery.completedAt),
    'Invalid materialization time'
  );
  const policy = validateCachePolicy(policyInput);
  const expected = planFirefliesCache({
    discovery,
    collectionPlan,
    policy,
    index,
    objects,
    mode: plan.mode,
  });
  requireCacheValue(
    sha256Json(plan) === sha256Json(expected),
    'Cache plan changed; replan from current inputs',
    'STALE_CACHE_PLAN'
  );
  const fetchedById = validateFetches(fetched, plan, discovery.completedAt, completedAt);
  const records: CompleteFirefliesTranscript[] = [];
  const entries: MaterializedCacheEntry[] = [];
  const provenance: CacheTranscriptProvenance[] = [];
  let shadowCompared = 0;
  let shadowChanged = 0;
  for (const item of plan.items) {
    const old = objects.get(item.id);
    const record = normalizeCacheTranscript(
      item.action === 'fetch' ? fetchedById.get(item.id) : old
    );
    requireCacheValue(
      sha256Json(transcriptMetadata(record)) === item.metadataHash,
      'Transcript metadata changed after discovery; repeat discovery'
    );
    const contentHash = transcriptContentHash(record);
    if (plan.mode === 'shadow' && item.candidateReuse) {
      shadowCompared++;
      if (transcriptContentHash(old) !== contentHash) shadowChanged++;
    }
    records.push(record);
    entries.push(cacheEntry(item, record, contentHash, policy));
    const existed = Boolean(old);
    provenance.push({
      id: item.id,
      contentHash,
      recordHash: sha256Json(record),
      source: item.action === 'reuse' ? 'Cache Reused' : existed ? 'Cache Revalidated' : 'Fresh',
      retrievedAt: record.retrievedAt,
      discoveredAt: discovery.completedAt,
    });
  }
  const nextIndex = {
    version: FIREFLIES_CACHE_VERSION,
    scopeHash: plan.scopeHash,
    policyHash: plan.policyHash,
    lastDiscoveryAt: discovery.completedAt,
    lastFullRevalidationAt: fullRevalidationTime(plan, index, discovery.completedAt),
    runId: plan.runId,
    entries,
  };
  const report = {
    version: FIREFLIES_CACHE_VERSION,
    status: 'Complete',
    runId: plan.runId,
    asOf: plan.asOf,
    planHash: plan.planHash,
    discoveryHash: plan.discoveryHash,
    policyHash: plan.policyHash,
    mode: plan.mode,
    completedAt,
    inventoryHash: sha256Json(records),
    provenance,
    counts: {
      total: records.length,
      fetched: fetchedById.size,
      reused: records.length - fetchedById.size,
      shadowCompared,
      shadowChanged,
    },
  };
  return { records, index: nextIndex, report };
}
