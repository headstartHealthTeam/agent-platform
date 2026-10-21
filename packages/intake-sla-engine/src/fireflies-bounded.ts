import {
  completeFirefliesDiscoveryPages,
  transcriptMetadata,
} from '@headstart-health/fireflies-data';
import type { TranscriptMetadata } from '@headstart-health/fireflies-data';

import {
  FIREFLIES_BOUNDED_VERSION,
  inIdentityWindow,
  requireBounded,
} from './fireflies-bounded-contract.js';
import type {
  BoundedInputs,
  BoundedIssue,
  BoundedRow,
  BoundedSearchContext,
  CandidateMeeting,
  FirefliesCandidateManifest,
} from './fireflies-bounded-contract.js';
import {
  boundedAttempts,
  boundedRequestComplete,
  parseBoundedSearchExecution,
} from './fireflies-bounded-search.js';
import { cacheTimestamp, firefliesDiscoverySchema } from './fireflies-cache-contract.js';
import { buildRunLevelFirefliesCollectionPlan } from './fireflies-collection.js';
import type { FirefliesProfile, FirefliesRunCollectionPlan } from './fireflies-collection.js';
import { validateDiscovery } from './fireflies-discovery.js';
import { sha256Json } from './json-fingerprint.js';

interface MeetingLink {
  meeting: TranscriptMetadata;
  requestKeys: Set<string>;
  opportunityIds: Set<string>;
}
function candidateRow(
  profile: FirefliesProfile,
  plan: FirefliesRunCollectionPlan,
  context: BoundedSearchContext,
  links: Map<string, MeetingLink>
): BoundedRow {
  inIdentityWindow({ date: context.asOf }, profile, context.asOf);
  const relevant = plan.meetingRequests.filter((request) =>
    request.opportunityIds.includes(profile.opportunityId)
  );
  const issues: BoundedIssue[] = relevant.flatMap((request) =>
    boundedRequestComplete(request, profile, context)
      ? []
      : [
          {
            requestKey: request.requestKey,
            reason: context.attempts.has(request.requestKey)
              ? 'Incomplete search'
              : 'Missing search',
          },
        ]
  );
  const identity = plan.opportunityPlans.find(
    (value) => value.opportunityId === profile.opportunityId
  );
  if (identity?.identityCoverage.status !== 'Complete')
    issues.push({ reason: 'Incomplete provider identity coverage' });
  for (const request of relevant) {
    for (const id of context.attempts.get(request.requestKey)?.meetingIds ?? []) {
      const meeting = context.metadata.get(id);
      requireBounded(meeting !== undefined, 'A search result is missing discovery metadata');
      if (!inIdentityWindow(meeting, profile, context.asOf)) continue;
      const link = links.get(id) ?? {
        meeting,
        requestKeys: new Set<string>(),
        opportunityIds: new Set<string>(),
      };
      link.requestKeys.add(request.requestKey);
      link.opportunityIds.add(profile.opportunityId);
      links.set(id, link);
    }
  }
  return {
    opportunityId: profile.opportunityId,
    status: issues.length > 0 ? 'Blocked' : 'Complete',
    issues,
    plannedRequestCount: relevant.length,
    completedRequestCount:
      relevant.length - issues.filter((issue) => Boolean(issue.requestKey)).length,
    pageCount: relevant.reduce(
      (sum, request) => sum + (context.attempts.get(request.requestKey)?.pages ?? 0),
      0
    ),
    attemptedPhases: [
      ...new Set(
        relevant
          .filter((request) => context.attempts.has(request.requestKey))
          .map((request) => request.phase)
      ),
    ],
  };
}
function linkedMeetings(links: ReadonlyMap<string, MeetingLink>): CandidateMeeting[] {
  return [...links.values()]
    .map(({ meeting, requestKeys, opportunityIds }) => ({
      ...meeting,
      metadataHash: sha256Json(transcriptMetadata(meeting)),
      requestKeys: [...requestKeys].sort(),
      opportunityIds: [...opportunityIds].sort(),
    }))
    .sort((a, b) => a.transcriptId.localeCompare(b.transcriptId));
}
export function buildFirefliesCandidateManifest(inputs: BoundedInputs): FirefliesCandidateManifest {
  const { discovery: rawDiscovery, collectionPlan, profiles, searchExecution } = inputs;
  const discovery = firefliesDiscoverySchema.parse(rawDiscovery);
  const { asOf } = discovery;
  validateDiscovery(rawDiscovery, collectionPlan, asOf);
  requireBounded(
    cacheTimestamp(discovery.completedAt) <= Date.now(),
    'Discovery completion is in the future'
  );
  const census = completeFirefliesDiscoveryPages(discovery.pages, discovery.query);
  requireBounded(
    profiles.length > 0 &&
      profiles.every((profile) => profile.opportunityId.length > 0) &&
      new Set(profiles.map((profile) => profile.opportunityId)).size === profiles.length,
    'Current identities must be unique and explicit'
  );
  requireBounded(
    sha256Json(collectionPlan) ===
      sha256Json(
        buildRunLevelFirefliesCollectionPlan(profiles.map((profile) => ({ ...profile, asOf })))
      ),
    'Collection plan does not match current identities'
  );
  const execution = parseBoundedSearchExecution(searchExecution, discovery, collectionPlan);
  const metadata = new Map(census.map((meeting) => [meeting.transcriptId, meeting]));
  const requests = new Map(
    collectionPlan.meetingRequests.map((request) => [request.requestKey, request])
  );
  const context: BoundedSearchContext = {
    asOf,
    metadata,
    requests,
    attempts: boundedAttempts(execution.attempts, requests, metadata),
    fallbackSkips: [],
  };
  const links = new Map<string, MeetingLink>();
  const rows = profiles.map((profile) => candidateRow(profile, collectionPlan, context, links));
  const meetings = linkedMeetings(links);
  const body = {
    version: FIREFLIES_BOUNDED_VERSION,
    mode: 'bounded-fresh' as const,
    runId: discovery.runId,
    asOf,
    discoveryHash: sha256Json(rawDiscovery),
    collectionPlanHash: sha256Json(collectionPlan),
    profilesHash: sha256Json(profiles),
    searchExecutionHash: sha256Json(searchExecution),
    retrievalNotBefore: new Date(
      Math.max(cacheTimestamp(discovery.completedAt), cacheTimestamp(execution.completedAt))
    ).toISOString(),
    counts: {
      discovered: census.length,
      candidateBodies: meetings.length,
      reuse: 0 as const,
      unrelatedBodiesExcluded: census.length - meetings.length,
      plannedSearches: requests.size,
      incompleteSearches: new Set(
        rows.flatMap((row) => row.issues.map((issue) => issue.requestKey).filter(Boolean))
      ).size,
      blockedRows: rows.filter((row) => row.status === 'Blocked').length,
    },
    rows,
    meetings,
    fallbackSkips: context.fallbackSkips,
  };
  return { ...body, manifestHash: sha256Json(body) };
}
