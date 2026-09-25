import {
  completeFirefliesDiscoveryPages,
  FirefliesDiscoveryError,
  normalizeFirefliesDiscoveryIdentities,
} from '@headstart-health/fireflies-data';
import type { DiscoveryIdentityCounts, TranscriptMetadata } from '@headstart-health/fireflies-data';
import { z } from 'zod';

import {
  cacheTimestamp,
  FIREFLIES_DISCOVERY_ADAPTER_VERSION,
  FirefliesCacheError,
  firefliesDiscoverySchema,
  requireCacheValue,
} from './fireflies-cache-contract.js';
import type { FirefliesCollectionWindow, FirefliesDiscovery } from './fireflies-cache-contract.js';
import { sha256Json } from './json-fingerprint.js';

function discoveryEnvelope(input: unknown): FirefliesDiscovery {
  requireCacheValue(
    firefliesDiscoverySchema
      .pick({ version: true, runId: true, asOf: true, collectionPlanHash: true })
      .safeParse(input).success,
    'Discovery is not bound to this run and collection plan'
  );
  requireCacheValue(
    firefliesDiscoverySchema.pick({ scope: true, accessVerified: true }).safeParse(input).success,
    'Current Fireflies scope and access must be verified'
  );
  requireCacheValue(
    firefliesDiscoverySchema.pick({ query: true }).safeParse(input).success,
    'Discovery must cover the complete current collection window without additional filters',
    'INCOMPLETE_DISCOVERY'
  );
  requireCacheValue(
    firefliesDiscoverySchema.pick({ pages: true }).safeParse(input).success,
    'A complete discovery page chain is required, including an explicit empty result',
    'INCOMPLETE_DISCOVERY'
  );
  const parsed = firefliesDiscoverySchema.safeParse(input);
  requireCacheValue(parsed.success, 'Cache input requires an explicit valid timestamp');
  return parsed.data;
}
/** Workflow binding and cutoff selection around the independently reusable provider page reader. */
export function validateDiscovery(
  input: unknown,
  collectionPlan: FirefliesCollectionWindow,
  asOf: unknown
): TranscriptMetadata[] {
  const time = cacheTimestamp(asOf);
  const discovery = discoveryEnvelope(input);
  requireCacheValue(
    discovery.asOf === asOf && discovery.collectionPlanHash === sha256Json(collectionPlan),
    'Discovery is not bound to this run and collection plan'
  );
  const started = cacheTimestamp(discovery.startedAt);
  const completed = cacheTimestamp(discovery.completedAt);
  requireCacheValue(started >= time && completed >= started, 'Invalid current-run discovery times');
  requireCacheValue(
    cacheTimestamp(discovery.query.fromDate) <= cacheTimestamp(collectionPlan.fromDate) &&
      cacheTimestamp(discovery.query.toDate) >= time &&
      cacheTimestamp(discovery.query.toDate) >= cacheTimestamp(collectionPlan.toDate),
    'Discovery must cover the complete current collection window without additional filters',
    'INCOMPLETE_DISCOVERY'
  );
  let meetings: TranscriptMetadata[];
  try {
    meetings = completeFirefliesDiscoveryPages(discovery.pages, discovery.query);
  } catch (error) {
    if (error instanceof FirefliesDiscoveryError)
      throw new FirefliesCacheError(
        error.code === 'INCOMPLETE_DISCOVERY' ? error.code : 'CACHE_VALIDATION_FAILED',
        discoveryFailureMessage(error)
      );
    throw error;
  }
  return meetings
    .filter((meeting) => cacheTimestamp(meeting.date) <= time)
    .sort((a, b) => a.transcriptId.localeCompare(b.transcriptId));
}
function discoveryFailureMessage(error: FirefliesDiscoveryError): string {
  switch (error.reason) {
    case 'unconsumed-next-page':
      return 'Discovery has an unconsumed next page';
    case 'invalid-continuation':
      return 'Invalid discovery page continuation';
    case 'conflicting-identity':
      return 'Conflicting duplicate discovery identity';
    case 'outside-window':
      return 'Meeting is outside discovery bounds';
    case 'invalid-metadata':
      return 'Transcript discovery metadata is incomplete';
    case undefined:
      return 'Discovery failed or pagination is incomplete';
  }
}
export interface DiscoveryNormalizationReceipt {
  readonly adapterVersion: string;
  readonly runId: string;
  readonly asOf: string;
  readonly hashAlgorithm: 'sha256Json';
  readonly rawDiscoveryHash: string;
  readonly normalizedDiscoveryHash: string;
  readonly collectionPlanHash: string;
  readonly counts: DiscoveryIdentityCounts;
}
function normalizeDiscoveryIdentities(
  raw: unknown
): ReturnType<typeof normalizeFirefliesDiscoveryIdentities> {
  try {
    return normalizeFirefliesDiscoveryIdentities(raw);
  } catch {
    throw new FirefliesCacheError(
      'INVALID_DISCOVERY_IDENTITY',
      'Unsupported discovery identity metadata'
    );
  }
}
export function normalizeFirefliesDiscovery({
  rawDiscovery,
  collectionPlan,
}: {
  readonly rawDiscovery: unknown;
  readonly collectionPlan: FirefliesCollectionWindow;
}): { readonly discovery: FirefliesDiscovery; readonly receipt: DiscoveryNormalizationReceipt } {
  const existing = z.object({ normalization: z.unknown().optional() }).safeParse(rawDiscovery);
  const alreadyNormalized = Boolean(existing.data?.normalization);
  requireCacheValue(
    !alreadyNormalized,
    'Derived discovery cannot be relabeled as raw source evidence',
    'ALREADY_NORMALIZED_DISCOVERY'
  );
  const normalized = normalizeDiscoveryIdentities(rawDiscovery);
  const rawDiscoveryHash = sha256Json(rawDiscovery);
  const discovery = discoveryEnvelope({
    ...normalized.discovery,
    normalization: {
      adapterVersion: FIREFLIES_DISCOVERY_ADAPTER_VERSION,
      rawDiscoveryHash,
    },
  });
  validateDiscovery(discovery, collectionPlan, discovery.asOf);
  return {
    discovery,
    receipt: {
      adapterVersion: FIREFLIES_DISCOVERY_ADAPTER_VERSION,
      runId: discovery.runId,
      asOf: discovery.asOf,
      hashAlgorithm: 'sha256Json',
      rawDiscoveryHash,
      normalizedDiscoveryHash: sha256Json(discovery),
      collectionPlanHash: sha256Json(collectionPlan),
      counts: normalized.counts,
    },
  };
}
