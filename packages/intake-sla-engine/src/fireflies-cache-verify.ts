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
} from './fireflies-cache-contract.js';
import {
  CACHE_HOUR_MS,
  cacheReuseReason,
  healthyCacheBaseline,
  transcriptContentHash,
} from './fireflies-cache-plan.js';
import type { FirefliesCacheEntry } from './fireflies-cache-plan.js';
import { normalizeCacheTranscript } from './fireflies-cache-transcript.js';
import { validateDiscovery } from './fireflies-discovery.js';
import { sha256Json } from './json-fingerprint.js';

const planSchema = z.looseObject({
  version: z.string(),
  runId: z.string(),
  asOf: z.string(),
  planHash: z.string(),
  discoveryHash: z.string(),
  collectionPlanHash: z.string(),
  scopeHash: z.string(),
  policyHash: z.string(),
  cacheSnapshotHash: z.string(),
  mode: z.string(),
  fullRevalidation: z.boolean(),
  items: z.array(z.looseObject({ id: z.string(), metadataHash: z.string(), action: z.string() })),
});
const provenanceSchema = z.looseObject({
  id: z.string(),
  contentHash: z.string(),
  recordHash: z.string(),
  source: z.string(),
  retrievedAt: z.string(),
  discoveredAt: z.string(),
});
const reportSchema = z.looseObject({
  version: z.string(),
  status: z.string(),
  runId: z.string(),
  asOf: z.string(),
  planHash: z.string(),
  discoveryHash: z.string(),
  policyHash: z.string(),
  mode: z.string(),
  completedAt: z.string(),
  inventoryHash: z.string(),
  provenance: z.array(provenanceSchema),
});
const proofSchema = z.object({
  discovery: z.unknown(),
  policy: z.unknown(),
  priorIndex: z.unknown(),
  plan: planSchema,
  report: reportSchema,
});
type CacheProof = z.infer<typeof proofSchema>;
const PROVENANCE_MISMATCH = 'Cache transcript provenance mismatch';
export type VerifiedFirefliesCacheReport = z.infer<typeof reportSchema>;
function verifyBindings(
  proof: CacheProof,
  records: readonly unknown[],
  collectionPlan: FirefliesCollectionWindow,
  runAt: string
): void {
  const { plan, report, discovery, policy, priorIndex } = proof;
  const scope = z.object({ scope: z.unknown(), runId: z.string() }).parse(discovery);
  const { planHash, ...planBody } = plan;
  const bindings = [
    planHash === sha256Json(planBody),
    report.planHash === planHash,
    report.discoveryHash === sha256Json(discovery),
    plan.discoveryHash === report.discoveryHash,
    plan.collectionPlanHash === sha256Json(collectionPlan),
    plan.policyHash === sha256Json(policy),
    report.policyHash === plan.policyHash,
    plan.scopeHash === sha256Json(scope.scope),
    plan.cacheSnapshotHash === sha256Json(priorIndex),
    report.runId === scope.runId,
    plan.runId === scope.runId,
    plan.asOf === runAt,
    report.mode === plan.mode,
    report.inventoryHash === sha256Json(records),
  ];
  requireCacheValue(bindings.every(Boolean), 'Cache receipt binding mismatch');
}
function verifyProvenance(
  record: CompleteFirefliesTranscript,
  meeting: TranscriptMetadata,
  item: z.infer<typeof planSchema>['items'][number],
  provenance: z.infer<typeof provenanceSchema>,
  discoveredAt: string
): void {
  const bindings = [
    record.transcriptId === meeting.transcriptId,
    item.id === record.transcriptId,
    provenance.id === record.transcriptId,
    item.metadataHash === sha256Json(meeting),
    sha256Json(transcriptMetadata(record)) === item.metadataHash,
    provenance.recordHash === sha256Json(record),
    provenance.contentHash === transcriptContentHash(record),
    provenance.retrievedAt === record.retrievedAt,
    provenance.discoveredAt === discoveredAt,
  ];
  requireCacheValue(bindings.every(Boolean), PROVENANCE_MISMATCH);
}
interface EligibilityContext {
  readonly plan: CacheProof['plan'];
  readonly report: CacheProof['report'];
  readonly reconcile: boolean;
  readonly entries: ReadonlyMap<string, FirefliesCacheEntry>;
  readonly policy: FirefliesCachePolicy;
  readonly time: number;
  readonly discoveredAt: string;
}
function verifyRecord(
  record: CompleteFirefliesTranscript,
  meeting: TranscriptMetadata,
  position: number,
  context: EligibilityContext
): void {
  const { plan, report, reconcile, entries, policy, time, discoveredAt } = context;
  const item = plan.items.at(position);
  const provenance = report.provenance.at(position);
  requireCacheValue(item !== undefined && provenance !== undefined, PROVENANCE_MISMATCH);
  verifyProvenance(record, meeting, item, provenance, discoveredAt);
  if (item.action === 'reuse') {
    requireCacheValue(
      plan.mode === 'reuse' &&
        !reconcile &&
        provenance.source === 'Cache Reused' &&
        cacheReuseReason(meeting, entries.get(item.id), record, policy, time) === null,
      'Cached transcript is no longer eligible'
    );
  } else {
    requireCacheValue(
      item.action === 'fetch' &&
        ['Fresh', 'Cache Revalidated'].includes(provenance.source) &&
        cacheTimestamp(record.retrievedAt) >= cacheTimestamp(discoveredAt) &&
        cacheTimestamp(record.retrievedAt) <= cacheTimestamp(report.completedAt),
      'Required fresh transcript was not fetched'
    );
  }
}
/** Recheck linked receipts; old retrieval timestamps are never made fresh by a new run. */
export function verifyFirefliesCacheRun({
  records,
  proof: input,
  runAt: runInput,
  collectionPlan,
}: {
  readonly records: readonly unknown[];
  readonly proof: unknown;
  readonly runAt: string | Date;
  readonly collectionPlan: FirefliesCollectionWindow;
}): VerifiedFirefliesCacheReport {
  const runAt = runInput instanceof Date ? runInput.toISOString() : runInput;
  const parsed = proofSchema.safeParse(input);
  requireCacheValue(parsed.success, 'Cache receipt is missing or belongs to another run');
  const proof = parsed.data;
  const { discovery, plan, report, priorIndex } = proof;
  requireCacheValue(
    report.version === FIREFLIES_CACHE_VERSION &&
      plan.version === FIREFLIES_CACHE_VERSION &&
      report.status === 'Complete' &&
      report.asOf === runAt,
    'Cache receipt is missing or belongs to another run'
  );
  const policy = validateCachePolicy(proof.policy);
  const meetings = validateDiscovery(discovery, collectionPlan, runAt);
  verifyBindings(proof, records, collectionPlan, runAt);
  requireCacheValue(
    (plan.mode === 'shadow' || plan.mode === 'reuse') &&
      (plan.mode !== 'reuse' ||
        (typeof policy.approvalReference === 'string' &&
          policy.approvalReference.trim().length > 0)),
    'Unapproved cache reuse'
  );
  const normalized = records.map(normalizeCacheTranscript);
  requireCacheValue(
    meetings.length === records.length &&
      new Set(normalized.map((record) => record.transcriptId)).size === records.length &&
      plan.items.length === records.length &&
      report.provenance.length === records.length,
    'Cache receipt does not cover exactly the current inventory'
  );
  const time = cacheTimestamp(runAt);
  const baseline = healthyCacheBaseline(priorIndex, plan.scopeHash, plan.policyHash, time);
  const reconcile =
    baseline === null ||
    time - cacheTimestamp(baseline.lastFullRevalidationAt) >=
      policy.fullRevalidationHours * CACHE_HOUR_MS;
  requireCacheValue(plan.fullRevalidation === reconcile, 'Cache reconciliation state is invalid');
  const entries = new Map((baseline?.entries ?? []).map((entry) => [entry.id, entry]));
  const { completedAt: discoveredAt } = z.object({ completedAt: z.string() }).parse(discovery);
  requireCacheValue(
    cacheTimestamp(report.completedAt) >= cacheTimestamp(discoveredAt),
    'Invalid cache completion time'
  );
  for (const [position, meeting] of meetings.entries()) {
    const record = normalized.at(position);
    requireCacheValue(record !== undefined, PROVENANCE_MISMATCH);
    verifyRecord(record, meeting, position, {
      plan,
      report,
      reconcile,
      entries,
      policy,
      time,
      discoveredAt,
    });
  }
  return report;
}
