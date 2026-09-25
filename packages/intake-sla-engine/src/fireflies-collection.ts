import {
  assessFirefliesIdentityCoverage,
  providerFirefliesSearchPlans,
} from './provider-search.js';
import type { ProviderSearchInput, RoleFirefliesSearchPlan } from './provider-search.js';

export interface FirefliesProfile extends ProviderSearchInput {
  readonly opportunityId: string;
  readonly opportunityName: string;
  readonly searchWindow?:
    | {
        readonly fromDate?: string | null | undefined;
        readonly toDate?: string | null | undefined;
      }
    | null
    | undefined;
  readonly stageEntryDate?: string | null | undefined;
  readonly asOf?: string | null | undefined;
}
export interface FirefliesMeetingRequest {
  phase: string;
  executionTier: 'Primary' | 'Identity Fallback' | 'CSM Fallback';
  providerRole: string;
  providerName: string | null;
  participantEmail?: string;
  participantEmails?: readonly string[];
  organizerEmail?: string;
  keyword?: string;
  scope?: string;
  executeWhen?: string;
  fromDate: string | null;
  toDate: string | null;
  limit: 50;
  paginate: true;
}
export interface FirefliesOpportunityPlan {
  opportunityId: string;
  opportunityName: string;
  identityCoverage: ReturnType<typeof assessFirefliesIdentityCoverage>;
  providerPlans: RoleFirefliesSearchPlan[];
  meetingRequests: FirefliesMeetingRequest[];
  transcriptMatch: {
    clientSearchTerms: string[];
    stageTerms: string[];
    transcriptSearchTerms: string[];
    rosterOpportunityNames: string[];
    requireFullTranscript: true;
    weakMatchesAuditOnly: true;
  };
}
export interface RunMeetingRequest extends FirefliesMeetingRequest {
  requestKey: string;
  opportunityIds: string[];
  opportunityNames: string[];
}
export interface FirefliesRunCollectionPlan {
  version: string;
  fromDate: string | null;
  toDate: string | null;
  opportunityCount: number;
  opportunityRequestCount: number;
  inventoryRequestCount: number;
  primaryRequestCount: number;
  fallbackRequestCount: number;
  transcriptRetrieval: {
    primaryTool: string;
    fallbackTool: string;
    maxAttemptsPerTool: number;
    retryableStatuses: number[];
    requireFullTranscript: true;
    retainCurrentRunInventory: true;
    inventoryArtifact: string;
    inventoryFields: string[];
  };
  conversationMatching: {
    scoringVersion: string;
    likelyThreshold: number;
    weakThreshold: number;
    minimumWinnerMargin: number;
    retainTopWeakMatches: number;
  };
  meetingRequests: RunMeetingRequest[];
  opportunityPlans: FirefliesOpportunityPlan[];
}
function unique(items: readonly string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}
function requestKey(request: FirefliesMeetingRequest): string {
  return [
    request.phase,
    request.participantEmail,
    ...(request.participantEmails ?? []).map((value) => value.trim().toLowerCase()).sort(),
    request.organizerEmail,
    request.keyword,
    request.scope,
    request.fromDate,
    request.toDate,
  ].join('|');
}
export function buildFirefliesTranscriptRetrievalPlan(meetingIds: readonly string[] = []): {
  meetingId: string;
  primaryTool: string;
  fallbackTool: string;
  maxAttemptsPerTool: number;
  retryableStatuses: number[];
  requireFullTranscript: true;
}[] {
  return unique(meetingIds).map((meetingId) => ({
    meetingId,
    primaryTool: 'fireflies_fetch',
    fallbackTool: 'fireflies_get_transcript',
    maxAttemptsPerTool: 2,
    retryableStatuses: [429, 500, 502, 503, 504],
    requireFullTranscript: true,
  }));
}
function meetingRequests(
  plan: RoleFirefliesSearchPlan,
  fromDate: string | null,
  toDate: string | null
): FirefliesMeetingRequest[] {
  const base = {
    providerRole: plan.role,
    providerName: plan.primaryName,
    fromDate,
    toDate,
    limit: 50,
    paginate: true,
  } as const;
  const csm = {
    ...base,
    phase: 'Current and prior CSM',
    executionTier: 'CSM Fallback',
    executeWhen:
      'Provider participant-email and title searches do not establish a usable provider meeting inventory.',
  } as const;
  return [
    ...plan.participantEmails.map((participantEmail): FirefliesMeetingRequest => ({
      ...base,
      phase: 'Participant email',
      executionTier: 'Primary',
      participantEmail,
    })),
    ...plan.titleTerms.map((keyword): FirefliesMeetingRequest => ({
      ...base,
      phase: 'Provider and practice title',
      executionTier: 'Identity Fallback',
      executeWhen:
        'All provider participant-email searches return no usable meeting inventory for the SLA window.',
      keyword,
      scope: 'title',
    })),
    ...plan.csmEmails.map((participantEmail): FirefliesMeetingRequest => ({
      ...csm,
      participantEmail,
    })),
    ...plan.csmNames.map((keyword): FirefliesMeetingRequest => ({
      ...csm,
      keyword,
      scope: 'title',
    })),
  ];
}
export function buildFirefliesCollectionPlan(profile: FirefliesProfile): FirefliesOpportunityPlan {
  const plans = providerFirefliesSearchPlans(profile);
  const fromDate = profile.searchWindow?.fromDate ?? profile.stageEntryDate ?? null;
  const toDate = profile.searchWindow?.toDate ?? profile.asOf ?? null;
  const seen = new Set<string>();
  const requests = plans
    .flatMap((plan) => meetingRequests(plan, fromDate, toDate))
    .filter((request) => {
      const key = requestKey(request);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return {
    opportunityId: profile.opportunityId,
    opportunityName: profile.opportunityName,
    identityCoverage: assessFirefliesIdentityCoverage(profile),
    providerPlans: plans,
    meetingRequests: requests,
    transcriptMatch: {
      clientSearchTerms: unique(plans.flatMap((plan) => plan.clientSearchTerms)),
      stageTerms: unique(plans.flatMap((plan) => plan.stageTerms)),
      transcriptSearchTerms: unique(plans.flatMap((plan) => plan.transcriptSearchTerms)),
      rosterOpportunityNames: unique(plans.flatMap((plan) => plan.rosterOpportunityNames)),
      requireFullTranscript: true,
      weakMatchesAuditOnly: true,
    },
  };
}
function runRequests(
  plans: readonly FirefliesOpportunityPlan[],
  fromDate: string | null,
  toDate: string | null
): RunMeetingRequest[] {
  const inventory = new Map<string, RunMeetingRequest>();
  for (const plan of plans)
    for (const request of plan.meetingRequests) {
      const normalized = { ...request, fromDate, toDate };
      const key = requestKey(normalized);
      let entry = inventory.get(key);
      if (entry === undefined) {
        entry = { ...normalized, requestKey: key, opportunityIds: [], opportunityNames: [] };
        inventory.set(key, entry);
      }
      entry.opportunityIds.push(plan.opportunityId);
      entry.opportunityNames.push(plan.opportunityName);
    }
  return [...inventory.values()].map((request) => ({
    ...request,
    opportunityIds: unique(request.opportunityIds),
    opportunityNames: unique(request.opportunityNames),
  }));
}
export function buildRunLevelFirefliesCollectionPlan(
  profiles: readonly FirefliesProfile[] = []
): FirefliesRunCollectionPlan {
  const opportunityPlans = profiles.map(buildFirefliesCollectionPlan);
  const fromDate =
    opportunityPlans
      .flatMap((plan) => plan.meetingRequests.map((request) => request.fromDate))
      .filter((value): value is string => value !== null && value.length > 0)
      .sort()[0] ?? null;
  const toDate =
    opportunityPlans
      .flatMap((plan) => plan.meetingRequests.map((request) => request.toDate))
      .filter((value): value is string => value !== null && value.length > 0)
      .sort()
      .at(-1) ?? null;
  const requests = runRequests(opportunityPlans, fromDate, toDate);
  return {
    version: '2026-08-11.1',
    fromDate,
    toDate,
    opportunityCount: opportunityPlans.length,
    opportunityRequestCount: opportunityPlans.reduce(
      (total, plan) => total + plan.meetingRequests.length,
      0
    ),
    inventoryRequestCount: requests.length,
    primaryRequestCount: requests.filter((request) => request.executionTier === 'Primary').length,
    fallbackRequestCount: requests.filter((request) => request.executionTier !== 'Primary').length,
    transcriptRetrieval: {
      primaryTool: 'fireflies_fetch',
      fallbackTool: 'fireflies_get_transcript',
      maxAttemptsPerTool: 2,
      retryableStatuses: [429, 500, 502, 503, 504],
      requireFullTranscript: true,
      retainCurrentRunInventory: true,
      inventoryArtifact: 'fireflies_transcript_inventory.jsonl',
      inventoryFields: [
        'transcriptId',
        'meetingDate',
        'title',
        'participants',
        'providerIdentityKeys',
        'fullTranscript',
        'retrievalEndpoint',
        'retrievedAt',
      ],
    },
    conversationMatching: {
      scoringVersion: 'provider-roster-100-point-v1',
      likelyThreshold: 75,
      weakThreshold: 50,
      minimumWinnerMargin: 6,
      retainTopWeakMatches: 3,
    },
    meetingRequests: requests,
    opportunityPlans,
  };
}
