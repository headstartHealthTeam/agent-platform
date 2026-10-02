import { uniqueConversationValues } from './conversation-name.js';

export interface SearchMatch {
  readonly quality: string;
}
export interface ConversationSearchInput<T extends SearchMatch> {
  readonly source: string;
  readonly opportunityId: string;
  readonly identitiesUsed?: readonly unknown[];
  readonly queriesUsed?: readonly unknown[];
  readonly recordsScanned?: number;
  readonly segmentsScanned?: number;
  readonly paginationComplete?: boolean;
  readonly transcriptFetchComplete?: boolean;
  readonly matches?: readonly T[];
  readonly failures?: readonly unknown[];
  readonly blocked?: boolean;
  readonly timedOut?: boolean;
  readonly unsupported?: boolean;
  readonly searchedAt?: string | null;
}
export interface ConversationMatchCounts {
  Direct: number;
  Likely: number;
  Weak: number;
  Rejected: number;
}
export interface ConversationSearchResult<T extends SearchMatch> {
  source: string;
  opportunityId: string;
  status: 'Found' | 'Searched - Not Found' | 'Blocked' | 'Timed Out' | 'Unsupported';
  searchedAt: string | null;
  identitiesUsed: unknown[];
  queriesUsed: unknown[];
  recordsScanned: number;
  segmentsScanned: number;
  paginationComplete: boolean;
  transcriptFetchComplete: boolean;
  complete: boolean;
  matchCounts: ConversationMatchCounts;
  directAndLikelyMatches: T[];
  weakMatches: T[];
  rejectedMatches: T[];
  failures: readonly unknown[];
}
function searchStatus<T extends SearchMatch>(
  input: ConversationSearchInput<T>,
  counts: ConversationMatchCounts,
  complete: boolean
): ConversationSearchResult<T>['status'] {
  if (input.unsupported) return 'Unsupported';
  if (input.timedOut) return 'Timed Out';
  if (input.blocked === true || !complete) return 'Blocked';
  return counts.Direct + counts.Likely > 0 ? 'Found' : 'Searched - Not Found';
}
export function createConversationSearchResult<T extends SearchMatch>(
  input: ConversationSearchInput<T>
): ConversationSearchResult<T> {
  const {
    source,
    opportunityId,
    identitiesUsed = [],
    queriesUsed = [],
    recordsScanned = 0,
    segmentsScanned = 0,
    paginationComplete = true,
    transcriptFetchComplete = true,
    matches = [],
    failures = [],
    searchedAt = new Date().toISOString(),
  } = input;
  const counts = {
    Direct: matches.filter((match) => match.quality === 'Direct').length,
    Likely: matches.filter((match) => match.quality === 'Likely').length,
    Weak: matches.filter((match) => match.quality === 'Weak').length,
    Rejected: matches.filter((match) => match.quality === 'Rejected').length,
  };
  const complete = paginationComplete && transcriptFetchComplete && failures.length === 0;
  return {
    source,
    opportunityId,
    status: searchStatus(input, counts, complete),
    searchedAt,
    identitiesUsed: uniqueConversationValues(identitiesUsed),
    queriesUsed: uniqueConversationValues(queriesUsed),
    recordsScanned,
    segmentsScanned,
    paginationComplete,
    transcriptFetchComplete,
    complete,
    matchCounts: counts,
    directAndLikelyMatches: matches.filter((match) => ['Direct', 'Likely'].includes(match.quality)),
    weakMatches: matches.filter((match) => match.quality === 'Weak').slice(0, 3),
    rejectedMatches: matches.filter((match) => match.quality === 'Rejected'),
    failures,
  };
}
export interface ConversationHealthInput {
  readonly source: string;
  readonly results?: readonly {
    readonly recordsScanned?: number | string | null;
    readonly matchCounts?: {
      readonly Direct?: number | string | null;
      readonly Likely?: number | string | null;
    } | null;
  }[];
  readonly sentinelExpected?: boolean;
  readonly sentinelFound?: boolean | null;
  readonly inventoryComplete?: boolean;
}
export interface ConversationSourceHealth {
  source: string;
  status: 'Blocked' | 'Complete';
  reason: string | null;
}
export function evaluateConversationSourceHealth(
  input: ConversationHealthInput
): ConversationSourceHealth {
  const {
    source,
    results = [],
    sentinelExpected = false,
    sentinelFound = null,
    inventoryComplete = true,
  } = input;
  const allZero =
    results.length > 0 &&
    results.every(
      (result) =>
        Number(result.recordsScanned ?? 0) === 0 &&
        Number(result.matchCounts?.Direct ?? 0) === 0 &&
        Number(result.matchCounts?.Likely ?? 0) === 0
    );
  if (!inventoryComplete)
    return {
      source,
      status: 'Blocked',
      reason: `${source} inventory or pagination was incomplete.`,
    };
  if (sentinelExpected && sentinelFound !== true)
    return { source, status: 'Blocked', reason: `${source} sentinel record was not recovered.` };
  if (allZero && source === 'Portal')
    return {
      source,
      status: 'Blocked',
      reason:
        'Portal returned zero records for the full cohort; source health could not be established.',
    };
  return { source, status: 'Complete', reason: null };
}
