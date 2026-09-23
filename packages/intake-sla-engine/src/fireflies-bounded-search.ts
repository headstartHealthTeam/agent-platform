import type { TranscriptMetadata } from '@headstart-health/fireflies-data';
import { z } from 'zod';

import {
  boundedAttemptSchema,
  FIREFLIES_BOUNDED_VERSION,
  inIdentityWindow,
  requireBounded,
} from './fireflies-bounded-contract.js';
import type { BoundedSearchAttempt, BoundedSearchContext } from './fireflies-bounded-contract.js';
import { cacheTimestamp } from './fireflies-cache-contract.js';
import type { FirefliesDiscovery } from './fireflies-cache-contract.js';
import type {
  FirefliesProfile,
  FirefliesRunCollectionPlan,
  RunMeetingRequest,
} from './fireflies-collection.js';
import { sha256Json } from './json-fingerprint.js';

const executionSchema = z.looseObject({
  version: z.literal(FIREFLIES_BOUNDED_VERSION),
  runId: z.string(),
  asOf: z.string(),
  collectionPlanHash: z.string(),
  scopeHash: z.string(),
  accessVerified: z.literal(true),
  startedAt: z.string(),
  completedAt: z.string(),
  attempts: z.array(z.unknown()),
});
export function parseBoundedSearchExecution(
  input: unknown,
  discovery: FirefliesDiscovery,
  plan: FirefliesRunCollectionPlan
): z.infer<typeof executionSchema> {
  const parsed = executionSchema.safeParse(input);
  const message = 'Search execution is not bound to this run, scope, and plan';
  requireBounded(parsed.success, message);
  const execution = parsed.data;
  requireBounded(
    execution.runId === discovery.runId &&
      execution.asOf === discovery.asOf &&
      execution.collectionPlanHash === sha256Json(plan) &&
      execution.scopeHash === sha256Json(discovery.scope) &&
      cacheTimestamp(execution.startedAt) >= cacheTimestamp(discovery.asOf) &&
      cacheTimestamp(execution.completedAt) >= cacheTimestamp(execution.startedAt) &&
      cacheTimestamp(execution.completedAt) <= Date.now(),
    message
  );
  return execution;
}
export function boundedAttempts(
  inputs: readonly unknown[],
  requests: ReadonlyMap<string, RunMeetingRequest>,
  metadata: ReadonlyMap<string, TranscriptMetadata>
): Map<string, BoundedSearchAttempt> {
  const attempts = new Map<string, BoundedSearchAttempt>();
  for (const input of inputs) {
    const key = z.object({ requestKey: z.string() }).safeParse(input);
    requireBounded(
      key.success && requests.has(key.data.requestKey) && !attempts.has(key.data.requestKey),
      'Search execution contains an unknown or duplicate request'
    );
    const data = boundedAttemptSchema.omit({ pages: true }).safeParse(input);
    requireBounded(
      data.success,
      'Search execution requires explicit completion and meeting identities'
    );
    const attempt = boundedAttemptSchema.safeParse(input);
    requireBounded(
      attempt.success &&
        (!attempt.data.completed || (attempt.data.paginationComplete && attempt.data.pages > 0)),
      'Completed searches require exhausted pagination including explicit empty results'
    );
    for (const id of attempt.data.meetingIds)
      requireBounded(metadata.has(id), 'A search result is missing discovery metadata');
    attempts.set(attempt.data.requestKey, attempt.data);
  }
  return attempts;
}
const proofSchema = z.looseObject({
  opportunityId: z.string(),
  priorRequestKey: z.string(),
  usableMeetingIds: z.array(z.string()).min(1),
  providerIdentityVerified: z.literal(true),
});
const ranks = new Map([
  ['Primary', 0],
  ['Identity Fallback', 1],
  ['CSM Fallback', 2],
]);
function usablePrior(
  request: RunMeetingRequest,
  profile: FirefliesProfile,
  proof: z.infer<typeof proofSchema>,
  context: BoundedSearchContext
): boolean {
  const prior = context.requests.get(proof.priorRequestKey);
  const attempt = context.attempts.get(proof.priorRequestKey);
  if (prior === undefined || attempt === undefined) return false;
  return (
    prior.opportunityIds.includes(profile.opportunityId) &&
    prior.providerName === request.providerName &&
    (ranks.get(prior.executionTier) ?? Infinity) <
      (ranks.get(request.executionTier) ?? -Infinity) &&
    attempt.completed &&
    attempt.paginationComplete &&
    proof.usableMeetingIds.every((id) => {
      const meeting = context.metadata.get(id);
      return (
        attempt.meetingIds.includes(id) &&
        meeting !== undefined &&
        !meeting.isLive &&
        inIdentityWindow(meeting, profile, context.asOf)
      );
    })
  );
}
function primaryComplete(
  request: RunMeetingRequest,
  profile: FirefliesProfile,
  context: BoundedSearchContext
): boolean {
  return [...context.requests.values()]
    .filter(
      (value) =>
        value.executionTier === 'Primary' &&
        value.providerName === request.providerName &&
        value.opportunityIds.includes(profile.opportunityId)
    )
    .every((value) => {
      const attempt = context.attempts.get(value.requestKey);
      return attempt?.completed === true && attempt.paginationComplete;
    });
}
export function boundedRequestComplete(
  request: RunMeetingRequest,
  profile: FirefliesProfile,
  context: BoundedSearchContext
): boolean {
  const attempt = context.attempts.get(request.requestKey);
  if (attempt?.completed === true && attempt.paginationComplete) return true;
  const skipped = Boolean(attempt?.skipped);
  if (attempt === undefined || !skipped) return false;
  const receipts = z
    .array(z.looseObject({ opportunityId: z.unknown().optional() }))
    .safeParse(attempt.skipProofs);
  requireBounded(
    request.executionTier !== 'Primary' &&
      !attempt.completed &&
      attempt.pages === 0 &&
      attempt.meetingIds.length === 0 &&
      receipts.success,
    'Invalid fallback skip receipt'
  );
  const proofs = receipts.data.filter((proof) => proof.opportunityId === profile.opportunityId);
  const proof = proofSchema.safeParse(proofs[0]);
  requireBounded(
    proofs.length === 1 && proof.success,
    'A skipped fallback needs one usable prior-tier proof for each dependent Opportunity'
  );
  requireBounded(
    usablePrior(request, profile, proof.data, context),
    'Fallback skip does not prove usable prior-tier coverage'
  );
  requireBounded(
    primaryComplete(request, profile, context),
    'Primary email searches remain mandatory before fallback skips'
  );
  context.fallbackSkips.push({
    requestKey: request.requestKey,
    opportunityId: profile.opportunityId,
    priorRequestKey: proof.data.priorRequestKey,
    usableMeetingIds: proof.data.usableMeetingIds,
  });
  return true;
}
