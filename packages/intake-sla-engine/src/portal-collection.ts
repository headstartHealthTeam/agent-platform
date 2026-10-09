import { scoreConversationMatch } from './conversation-match.js';
import { bindPortalRequestKeys } from './portal-collection-inventory.js';
import type {
  BoundPortalExecution,
  EnrichedPortalChat,
  MaterializedPortalRow,
  PortalCollectionBaseRow,
  PortalCollectionChat,
  PortalCollectionProfile,
  PortalCollectionRequest,
  PortalMaterializationInput,
} from './portal-collection-types.js';
import {
  portalChatWithinCutoff,
  portalCollectionChatKey,
  portalCollectionChatText,
  portalCollectionFallback,
} from './portal-collection-values.js';

interface MaterializationContext {
  readonly input: PortalMaterializationInput;
  readonly requestByKey: ReadonlyMap<string, PortalCollectionRequest>;
  readonly executions: ReadonlyMap<string, BoundPortalExecution>;
  readonly baseByOpportunity: ReadonlyMap<string | null | undefined, PortalCollectionBaseRow>;
}
function enrichChat(
  chat: PortalCollectionChat,
  profile: PortalCollectionProfile,
  request: PortalCollectionRequest | undefined
): EnrichedPortalChat {
  const match = scoreConversationMatch({
    text: portalCollectionChatText(chat),
    metadata: [chat.providerName, chat.channel].filter(Boolean).join(' '),
    targetProfile: {
      ...profile,
      providerNames: (profile.providers ?? []).map((provider) => provider.name),
    },
    providerRoster: request?.roster?.length ? request.roster : profile.providerRoster,
    providerRelationshipConfirmed:
      request?.requestType === 'Provider' &&
      request.opportunityIds?.includes(profile.opportunityId),
    linkedOpportunityId: portalCollectionFallback(
      chat.opportunityId,
      portalCollectionFallback(chat.clientOpportunityId, '')
    ),
    eventDate: chat.createdAt,
    storyStartDate: profile.searchWindow?.fromDate,
    asOf: profile.searchWindow?.toDate,
  });
  return {
    ...chat,
    matchQuality: match.quality,
    matchScore: match.score,
    // The approved caller reads `reasons`, while its scorer returns singular `reason`.
    // Preserve the existing own undefined field instead of silently changing the report contract.
    matchReasons: undefined,
    proposedOpportunityId: match.winnerOpportunityId,
  };
}
function admitChats(
  chats: readonly PortalCollectionChat[],
  profile: PortalCollectionProfile,
  requests: readonly PortalCollectionRequest[],
  requestByKey: MaterializationContext['requestByKey']
): { admitted: EnrichedPortalChat[]; weakMatches: EnrichedPortalChat[] } {
  const admitted: EnrichedPortalChat[] = [];
  const weakMatches: EnrichedPortalChat[] = [];
  for (const chat of chats) {
    const request =
      requestByKey.get(chat.requestKey ?? '') ??
      requests.find(
        (candidate) =>
          Boolean(candidate.providerUserId) && candidate.providerUserId === chat.providerId
      );
    const enriched = enrichChat(chat, profile, request);
    if (
      ['Direct', 'Likely'].includes(enriched.matchQuality) &&
      enriched.proposedOpportunityId === profile.opportunityId
    )
      admitted.push(enriched);
    else if (
      enriched.matchQuality === 'Weak' ||
      enriched.proposedOpportunityId === profile.opportunityId
    )
      weakMatches.push(enriched);
  }
  return { admitted, weakMatches };
}
function candidateChats(
  profile: PortalCollectionProfile,
  executions: readonly BoundPortalExecution[],
  context: MaterializationContext
): PortalCollectionChat[] {
  const base =
    context.baseByOpportunity.get(profile.opportunityId) ??
    context.baseByOpportunity.get(profile.opportunityName);
  const chats = [
    ...(base?.responses?.chats ?? base?.chats ?? []),
    ...executions.flatMap((execution) => execution.chats),
  ].filter((chat) =>
    portalChatWithinCutoff(
      chat.createdAt,
      context.input.sourceCutoff === undefined
        ? context.input.searchedAt
        : context.input.sourceCutoff
    )
  );
  return [...new Map(chats.map((chat) => [portalCollectionChatKey(chat), chat])).values()];
}
function materializeProfile(
  profile: PortalCollectionProfile,
  context: MaterializationContext
): MaterializedPortalRow {
  const requests = (context.input.plan?.requests ?? []).filter((request) =>
    request.opportunityIds?.includes(profile.opportunityId)
  );
  const executions = requests
    .map((request) => context.executions.get(request.requestKey))
    .filter((execution) => execution !== undefined);
  const chats = candidateChats(profile, executions, context);
  const { admitted, weakMatches } = admitChats(chats, profile, requests, context.requestByKey);
  const missing = requests.filter((request) => !context.executions.has(request.requestKey));
  const failed = executions.filter(
    (execution) => execution.status !== 'Complete' || execution.paginationComplete === false
  );
  const blocked = missing.length > 0 || failed.length > 0;
  let pages = 0;
  for (const execution of executions) pages += Number(portalCollectionFallback(execution.pages, 0));
  return {
    opportunityId: profile.opportunityId,
    opportunityName: profile.opportunityName,
    searchedAt: context.input.searchedAt,
    searched: !blocked,
    blocked,
    error: blocked
      ? `${String(missing.length)} Portal requests were missing and ${String(failed.length)} were incomplete.`
      : '',
    chats: admitted,
    weakMatches: weakMatches.sort((left, right) => right.matchScore - left.matchScore).slice(0, 3),
    recordsRetrieved: admitted.length,
    recordsScanned: chats.length,
    searchCoverage: {
      status: blocked ? 'Partial' : 'Complete',
      plannedRequests: requests.length,
      completedRequests: executions.length - failed.length,
      pages,
      paginationComplete: !blocked,
      sentinelRequestKey: context.input.plan?.sentinelRequestKey ?? null,
    },
  };
}
export function materializePortalRows(
  input: PortalMaterializationInput = {}
): MaterializedPortalRow[] {
  const context: MaterializationContext = {
    input,
    requestByKey: new Map(
      (input.plan?.requests ?? []).map((request) => [request.requestKey, request])
    ),
    executions: new Map(
      bindPortalRequestKeys(input).map((execution) => [execution.requestKey, execution])
    ),
    baseByOpportunity: new Map(
      (input.baseRows ?? []).map((row) => [
        portalCollectionFallback(row.opportunityId, row.opportunityName),
        row,
      ])
    ),
  };
  return (input.profiles ?? []).map((profile) => materializeProfile(profile, context));
}
