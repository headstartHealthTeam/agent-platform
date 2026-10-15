import { transcriptMetadata } from '@headstart-health/fireflies-data';
import type {
  CompleteFirefliesTranscript,
  TranscriptMetadata,
} from '@headstart-health/fireflies-data';

import { FIREFLIES_BOUNDED_VERSION } from './fireflies-bounded-contract.js';
import type { BoundedInputs, BoundedSearchAttempt } from './fireflies-bounded-contract.js';
import type { FirefliesDiscovery } from './fireflies-cache-contract.js';
import { cacheFixture } from './fireflies-cache-fixture.test-support.js';
import { buildRunLevelFirefliesCollectionPlan } from './fireflies-collection.js';
import type { FirefliesProfile, FirefliesRunCollectionPlan } from './fireflies-collection.js';
import { sha256Json } from './json-fingerprint.js';
import type { ProviderRoleCluster } from './provider-identity-types.js';
import { buildProviderRoleClusters } from './provider-identity.js';

export interface BoundedFixture extends BoundedInputs {
  collectionPlan: FirefliesRunCollectionPlan;
  discovery: FirefliesDiscovery & {
    pages: {
      status: 'Complete';
      offset: number;
      nextOffset: null;
      meetings: TranscriptMetadata[];
    }[];
  };
  profiles: (FirefliesProfile & {
    providerRoles: ProviderRoleCluster[];
    searchWindow: { fromDate: string; toDate: string };
  })[];
  searchExecution: {
    version: string;
    runId: string;
    asOf: string;
    startedAt: string;
    completedAt: string;
    collectionPlanHash: string;
    scopeHash: string;
    accessVerified: boolean;
    attempts: BoundedSearchAttempt[];
  };
  fetched: CompleteFirefliesTranscript[];
}
export function first<T>(values: readonly T[]): T {
  const value = values[0];
  if (value === undefined) throw new Error('Missing synthetic fixture value');
  return value;
}
export function replanBoundedFixture(input: BoundedFixture): void {
  input.collectionPlan = buildRunLevelFirefliesCollectionPlan(
    input.profiles.map((profile) => ({ ...profile, asOf: input.discovery.asOf }))
  );
  input.discovery.collectionPlanHash = sha256Json(input.collectionPlan);
  input.searchExecution.collectionPlanHash = sha256Json(input.collectionPlan);
  input.searchExecution.attempts = input.searchExecution.attempts.filter((attempt) =>
    input.collectionPlan.meetingRequests.some(
      (request) => request.requestKey === attempt.requestKey
    )
  );
}
export function boundedFixture(): BoundedFixture {
  const candidateId = 'synthetic-candidate';
  const input = cacheFixture(10, [candidateId, 'synthetic-unrelated']);
  const profile = {
    opportunityId: 'synthetic-opportunity',
    opportunityName: 'Synthetic Client',
    stage: 'IA Approved',
    stageEntryDate: '2026-01-01',
    renderingProvider: { name: 'Synthetic Provider', email: 'provider@example.test' },
    practice: { name: 'Synthetic Practice' },
    currentCsm: { name: 'Synthetic CSM', email: 'csm@example.test' },
    searchWindow: { fromDate: '2026-01-01', toDate: input.discovery.asOf },
  };
  const profiles = [{ ...profile, providerRoles: buildProviderRoleClusters(profile) }];
  const meetings = input.fetched.map(transcriptMetadata);
  const unrelated = meetings.at(1);
  if (unrelated === undefined) throw new Error('Missing unrelated fixture');
  Object.assign(unrelated, {
    title: 'Unrelated meeting',
    organizerEmail: 'unrelated@example.test',
    participants: ['unrelated@example.test'],
    isLive: true,
  });
  const collectionPlan = buildRunLevelFirefliesCollectionPlan(
    profiles.map((value) => ({ ...value, asOf: input.discovery.asOf }))
  );
  const discovery = {
    ...input.discovery,
    collectionPlanHash: sha256Json(collectionPlan),
    pages: [{ status: 'Complete' as const, offset: 0, nextOffset: null, meetings }],
  };
  return {
    profiles,
    collectionPlan,
    discovery,
    fetched: input.fetched,
    searchExecution: {
      version: FIREFLIES_BOUNDED_VERSION,
      runId: discovery.runId,
      asOf: discovery.asOf,
      startedAt: discovery.startedAt,
      completedAt: discovery.completedAt,
      collectionPlanHash: sha256Json(collectionPlan),
      scopeHash: sha256Json(discovery.scope),
      accessVerified: true,
      attempts: collectionPlan.meetingRequests.map((request, index) => ({
        requestKey: request.requestKey,
        completed: true,
        paginationComplete: true,
        pages: 1,
        meetingIds: index === 0 ? [candidateId, candidateId] : [],
      })),
    },
  };
}
