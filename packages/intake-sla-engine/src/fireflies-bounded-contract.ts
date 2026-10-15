import type { TranscriptMetadata } from '@headstart-health/fireflies-data';
import { z } from 'zod';

import { cacheTimestamp } from './fireflies-cache-contract.js';
import type {
  FirefliesProfile,
  FirefliesRunCollectionPlan,
  RunMeetingRequest,
} from './fireflies-collection.js';

export const FIREFLIES_BOUNDED_VERSION = '2026-09-11.1';
export function requireBounded(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export interface BoundedInputs {
  readonly discovery: unknown;
  readonly collectionPlan: FirefliesRunCollectionPlan;
  readonly profiles: readonly FirefliesProfile[];
  readonly searchExecution: unknown;
}
export const boundedAttemptSchema = z.looseObject({
  requestKey: z.string(),
  completed: z.boolean(),
  paginationComplete: z.boolean(),
  meetingIds: z.array(z.string().min(1)),
  pages: z.number().int().nonnegative(),
  skipped: z.unknown().optional(),
  skipProofs: z.unknown().optional(),
});
export type BoundedSearchAttempt = z.infer<typeof boundedAttemptSchema>;
export interface BoundedFallbackSkip {
  requestKey: string;
  opportunityId: string;
  priorRequestKey: string;
  usableMeetingIds: string[];
}
export interface BoundedIssue {
  requestKey?: string;
  reason: string;
}
export interface BoundedRow {
  opportunityId: string;
  status: 'Blocked' | 'Complete';
  issues: BoundedIssue[];
  plannedRequestCount: number;
  completedRequestCount: number;
  pageCount: number;
  attemptedPhases: string[];
}
export interface CandidateMeeting extends TranscriptMetadata {
  metadataHash: string;
  requestKeys: string[];
  opportunityIds: string[];
}
export interface FirefliesCandidateManifest {
  version: string;
  mode: 'bounded-fresh';
  runId: string;
  asOf: string;
  discoveryHash: string;
  collectionPlanHash: string;
  profilesHash: string;
  searchExecutionHash: string;
  retrievalNotBefore: string;
  counts: {
    discovered: number;
    candidateBodies: number;
    reuse: 0;
    unrelatedBodiesExcluded: number;
    plannedSearches: number;
    incompleteSearches: number;
    blockedRows: number;
  };
  rows: BoundedRow[];
  meetings: CandidateMeeting[];
  fallbackSkips: BoundedFallbackSkip[];
  manifestHash: string;
}
export interface BoundedSearchContext {
  asOf: string;
  metadata: ReadonlyMap<string, TranscriptMetadata>;
  requests: ReadonlyMap<string, RunMeetingRequest>;
  attempts: ReadonlyMap<string, BoundedSearchAttempt>;
  fallbackSkips: BoundedFallbackSkip[];
}
export function inIdentityWindow(
  meeting: { readonly date: string },
  profile: FirefliesProfile,
  asOf: string
): boolean {
  const time = cacheTimestamp(meeting.date);
  const from = profile.searchWindow?.fromDate;
  const to = profile.searchWindow?.toDate;
  requireBounded(
    typeof from === 'string' && typeof to === 'string',
    'An explicit identity window is required'
  );
  const end = cacheTimestamp(/^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999Z` : to);
  requireBounded(cacheTimestamp(from) <= end, 'Identity window is reversed');
  return time >= cacheTimestamp(from) && time <= end && time <= cacheTimestamp(asOf);
}
