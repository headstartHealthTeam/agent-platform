import {
  conversationContextAnchors,
  conversationInStoryWindow,
  conversationProviderAnchors,
  conversationStageTerms,
  directConversationAnchor,
} from './conversation-anchors.js';
import type {
  ConversationMatch,
  ConversationMatchInput,
  ConversationProfile,
  ScoredConversationCandidate,
} from './conversation-match-types.js';
import {
  bestConversationNameMatch,
  normalizeConversationValue as normalize,
} from './conversation-name.js';

function rosterCandidates(
  profile: ConversationProfile,
  providerRoster: readonly ConversationProfile[]
): ConversationProfile[] {
  const candidates = [...providerRoster];
  const { opportunityId: id, opportunityName: name } = profile;
  if (
    !candidates.some(
      (candidate) =>
        candidate.opportunityId === id || normalize(candidate.opportunityName) === normalize(name)
    )
  )
    candidates.push(profile);
  return candidates.filter((candidate, index, all) => {
    const candidateName = candidate.opportunityName ?? candidate.name;
    return (
      Boolean(candidateName) &&
      all.findIndex(
        (item) =>
          (Boolean(candidate.opportunityId) && item.opportunityId === candidate.opportunityId) ||
          normalize(item.opportunityName ?? item.name) === normalize(candidateName)
      ) === index
    );
  });
}
function candidateScore(
  input: ConversationMatchInput,
  profile: ConversationProfile,
  opportunityId: string | null | undefined
): ScoredConversationCandidate {
  const {
    text,
    metadata = '',
    providerRelationshipConfirmed = false,
    eventDate = null,
    storyStartDate = null,
    asOf = null,
    linkedOpportunityId = null,
  } = input;
  const body = normalize(text);
  const combined = normalize(`${text} ${metadata}`);
  const direct = directConversationAnchor(text, profile, opportunityId, linkedOpportunityId);
  const name = bestConversationNameMatch(body, profile);
  const providerMatched =
    providerRelationshipConfirmed ||
    conversationProviderAnchors(profile).some((anchor) => combined.includes(anchor));
  const stageMatched = conversationStageTerms(profile.stage).some((term) =>
    body.includes(normalize(term))
  );
  const contextual = conversationContextAnchors(profile).filter((anchor) => body.includes(anchor));
  const dateAligned = conversationInStoryWindow(eventDate, storyStartDate, asOf);
  const breakdown = {
    name: name.score,
    providerRoster: providerMatched ? 25 : 0,
    stage: stageMatched ? 15 : 0,
    context: contextual.length > 0 ? 10 : 0,
    date: dateAligned ? 10 : 0,
  };
  let score = 0;
  for (const value of Object.values(breakdown)) score += value;
  return {
    profile,
    direct,
    matchedAs: name.matchedAs,
    nameMatchKind: name.kind,
    breakdown,
    score: Math.min(100, score),
    contextualAnchors: contextual,
  };
}
function disposition(
  target: ScoredConversationCandidate | undefined,
  targetWins: boolean,
  margin: number,
  sameFirstName: boolean
): Pick<ConversationMatch, 'quality' | 'reason'> {
  const firstNameOnly = /first name/i.test(target?.nameMatchKind ?? '');
  const additionalContext =
    (target?.breakdown.stage ?? 0) > 0 || (target?.breakdown.context ?? 0) > 0;
  if (target?.direct && targetWins) return { quality: 'Direct', reason: target.direct };
  if (
    targetWins &&
    target?.nameMatchKind === 'Exact full name' &&
    target.breakdown.providerRoster === 25
  )
    return {
      quality: 'Direct',
      reason: 'Exact client identity in an assigned-provider conversation.',
    };
  if (
    targetWins &&
    target !== undefined &&
    target.score >= 75 &&
    margin >= 6 &&
    target.breakdown.providerRoster === 25 &&
    additionalContext &&
    !(firstNameOnly && sameFirstName)
  )
    return {
      quality: 'Likely',
      reason: 'Unique provider-roster match with supporting process context.',
    };
  if ((target?.score ?? 0) >= 50)
    return {
      quality: 'Weak',
      reason: targetWins
        ? 'Possible roster match requires human identity confirmation.'
        : 'Another provider-roster client scored higher.',
    };
  return {
    quality: 'Rejected',
    reason: 'Conversation did not meet the roster-constrained match threshold.',
  };
}
export function scoreConversationMatch(input: ConversationMatchInput): ConversationMatch {
  const { targetProfile, providerRoster = [] } = input;
  const opportunityId = targetProfile?.opportunityId;
  const candidates = rosterCandidates(targetProfile ?? {}, providerRoster)
    .map((candidate) =>
      candidateScore(
        input,
        candidate.opportunityName
          ? candidate
          : { ...targetProfile, ...candidate, opportunityName: candidate.name },
        candidate.opportunityId
      )
    )
    .sort((left, right) => right.score - left.score);
  const target = candidates.find(
    (candidate) =>
      candidate.profile.opportunityId === opportunityId ||
      normalize(candidate.profile.opportunityName) === normalize(targetProfile?.opportunityName)
  );
  const winner = candidates[0];
  const runnerUp = candidates[1];
  const targetWins = winner === target;
  const margin =
    (target?.score ?? 0) - (targetWins ? (runnerUp?.score ?? 0) : (winner?.score ?? 0));
  const sameFirstName =
    candidates.filter(
      (candidate) =>
        normalize(candidate.profile.opportunityName).split(' ')[0] ===
        normalize(targetProfile?.opportunityName).split(' ')[0]
    ).length > 1;
  return {
    opportunityId,
    opportunityName: targetProfile?.opportunityName,
    ...disposition(target, targetWins, margin, sameFirstName),
    score: target?.score ?? 0,
    margin,
    matchedAs: target?.matchedAs ?? '',
    nameMatchKind: target?.nameMatchKind ?? 'No client name',
    scoreBreakdown: target?.breakdown ?? {
      name: 0,
      providerRoster: 0,
      stage: 0,
      context: 0,
      date: 0,
    },
    contextualAnchors: target?.contextualAnchors ?? [],
    winnerOpportunityId: winner?.profile.opportunityId ?? null,
    winnerOpportunityName: winner?.profile.opportunityName ?? null,
    runnerUpOpportunityName: runnerUp?.profile.opportunityName ?? null,
    rankedCandidates: candidates.slice(0, 3).map((candidate) => ({
      opportunityId: candidate.profile.opportunityId,
      opportunityName: candidate.profile.opportunityName,
      score: candidate.score,
      matchedAs: candidate.matchedAs,
    })),
  };
}
