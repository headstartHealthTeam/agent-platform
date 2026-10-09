import type { CompleteFirefliesTranscript } from '@headstart-health/fireflies-data';

import { FIREFLIES_CACHE_VERSION } from './fireflies-cache-contract.js';
import type {
  FirefliesCachePolicy,
  FirefliesCollectionWindow,
  FirefliesDiscovery,
} from './fireflies-cache-contract.js';
import { materializeFirefliesCache } from './fireflies-cache-materialize.js';
import type { FirefliesCacheMaterialization } from './fireflies-cache-materialize.js';
import { planFirefliesCache } from './fireflies-cache-plan.js';
import type { FirefliesCachePlan } from './fireflies-cache-plan.js';
import { sha256Json } from './json-fingerprint.js';

export interface CacheFixture {
  discovery: FirefliesDiscovery;
  collectionPlan: FirefliesCollectionWindow;
  policy: FirefliesCachePolicy;
  fetched: CompleteFirefliesTranscript[];
  completedAt: string;
}
export function cacheFixture(
  day = 10,
  ids: readonly string[] = ['synthetic-meeting'],
  meetingDate = '2026-01-02T12:00:00.000Z'
): CacheFixture {
  const asOf = `2026-01-${String(day).padStart(2, '0')}T17:00:00.000Z`;
  const completedAt = asOf.replace('17:00:00', '17:02:00');
  const collectionPlan = { fromDate: '2026-01-01', toDate: asOf };
  const meetings = ids.map((transcriptId) => ({
    transcriptId,
    date: meetingDate,
    title: 'Synthetic Practice meeting',
    organizerEmail: 'provider@example.test',
    participants: ['provider@example.test'],
    meetingAttendees: [],
    isLive: false,
  }));
  const pages = [];
  for (let offset = 0; offset <= meetings.length; offset += 50) {
    const chunk = meetings.slice(offset, offset + 50);
    pages.push({
      status: 'Complete',
      offset,
      nextOffset: chunk.length === 50 ? offset + 50 : null,
      meetings: chunk,
    });
  }
  return {
    collectionPlan,
    discovery: {
      version: FIREFLIES_CACHE_VERSION,
      runId: `synthetic-${String(day)}`,
      asOf,
      startedAt: asOf,
      completedAt,
      collectionPlanHash: sha256Json(collectionPlan),
      scope: {
        provider: 'fireflies',
        principalId: 'synthetic-operator',
        workspaceId: 'synthetic-workspace',
      },
      accessVerified: true,
      query: {
        kind: 'all-accessible-transcripts',
        fromDate: '2026-01-01',
        toDate: asOf,
        limit: 50,
      },
      pages,
    },
    policy: {
      version: FIREFLIES_CACHE_VERSION,
      stabilizationHours: 48,
      maxValidationAgeHours: 72,
      fullRevalidationHours: 168,
      approvalReference: 'synthetic-test-policy-only',
    },
    fetched: meetings.map((meeting) => ({
      ...meeting,
      complete: true,
      fullTranscript: 'Synthetic Client assessment is scheduled for Monday.',
      transcriptEmpty: false,
      retrievalEndpoint: 'fireflies_fetch',
      retrievedAt: completedAt.replace('17:02:00', '17:03:00'),
    })),
    completedAt: completedAt.replace('17:02:00', '17:04:00'),
  };
}
interface CacheExecution extends FirefliesCacheMaterialization {
  proof: {
    discovery: FirefliesDiscovery;
    collectionPlan: FirefliesCollectionWindow;
    policy: FirefliesCachePolicy;
    plan: FirefliesCachePlan;
    priorIndex: FirefliesCacheMaterialization['index'] | null;
    report: FirefliesCacheMaterialization['report'];
  };
}
export function executeCache(
  input: CacheFixture,
  previous: FirefliesCacheMaterialization | null = null,
  mode = 'shadow'
): CacheExecution {
  const index = previous?.index ?? null;
  const objects = new Map((previous?.records ?? []).map((record) => [record.transcriptId, record]));
  const plan = planFirefliesCache({ ...input, index, objects, mode });
  const fetched = input.fetched.filter((record) =>
    plan.items.some((item) => item.id === record.transcriptId && item.action === 'fetch')
  );
  const result = materializeFirefliesCache({ ...input, index, objects, plan, fetched });
  const proof = {
    discovery: input.discovery,
    collectionPlan: input.collectionPlan,
    policy: input.policy,
    plan,
    priorIndex: index,
    report: result.report,
  };
  return { ...result, proof };
}
