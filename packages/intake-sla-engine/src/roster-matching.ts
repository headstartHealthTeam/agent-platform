import { normalizeClientName } from './client-name.js';
import { bestRosterFirstNameMatch, bestRosterFullNameMatch } from './roster-name-scoring.js';
import type { RosterCandidate, RosterNameScore } from './roster-name-scoring.js';

export { normalizeClientName as normalizeRosterValue } from './client-name.js';
export type { RosterCandidate } from './roster-name-scoring.js';
export interface RosterMatchInput {
  readonly text: string | null | undefined;
  readonly targetOpportunityId?: string | null | undefined;
  readonly targetOpportunityName: string | null | undefined;
  readonly roster?: readonly RosterCandidate[] | null;
  readonly allowFirstNameOnly?: boolean;
  readonly minimumScore?: number;
  readonly minimumMargin?: number;
}
interface RejectedRosterMatch {
  matched: false;
  assumed: false;
  reason: string;
  score?: number;
  margin?: number;
}
interface AcceptedRosterMatch {
  matched: true;
  assumed: true;
  quality: 'Likely';
  score: number;
  margin: number;
  candidateName: string | null | undefined;
  opportunityId: string | null | undefined;
  matchedTokens: string;
  matchedName: string | null | undefined;
  runnerUpName: string | null;
  runnerUpScore: number;
  reason: string;
}
export type RosterMatch = RejectedRosterMatch | AcceptedRosterMatch;
type RankedCandidate = RosterCandidate & RosterNameScore;
function uniqueRoster(input: RosterMatchInput): RosterCandidate[] {
  const { targetOpportunityId, targetOpportunityName } = input;
  const records = [...(input.roster ?? [])];
  if (
    !records.some(
      (candidate) =>
        candidate.opportunityId === targetOpportunityId ||
        normalizeClientName(candidate.opportunityName) ===
          normalizeClientName(targetOpportunityName)
    )
  )
    records.push({ opportunityId: targetOpportunityId, opportunityName: targetOpportunityName });
  return records.filter(
    (candidate, index, all) =>
      Boolean(candidate.opportunityName) &&
      all.findIndex(
        (item) =>
          item.opportunityId === candidate.opportunityId ||
          normalizeClientName(item.opportunityName) ===
            normalizeClientName(candidate.opportunityName)
      ) === index
  );
}
interface Ranking {
  winner: RankedCandidate | undefined;
  runnerUp: RankedCandidate | undefined;
  winnerIsTarget: boolean;
  margin: number;
}
function rank(
  candidates: readonly RosterCandidate[],
  text: string,
  input: RosterMatchInput,
  score: (text: string, candidate: RosterCandidate) => RosterNameScore
): Ranking {
  const ranked = candidates
    .map((candidate) => ({ ...candidate, ...score(text, candidate) }))
    .sort((a, b) => b.score - a.score);
  const winner = ranked[0];
  const runnerUp = ranked[1];
  return {
    winner,
    runnerUp,
    winnerIsTarget:
      winner?.opportunityId === input.targetOpportunityId ||
      normalizeClientName(winner?.opportunityName) ===
        normalizeClientName(input.targetOpportunityName),
    margin: (winner?.score ?? NaN) - (runnerUp?.score ?? 0),
  };
}
function accepted(
  ranking: Ranking,
  winner: RankedCandidate,
  firstName: boolean
): AcceptedRosterMatch {
  return {
    matched: true,
    assumed: true,
    quality: 'Likely',
    score: Math.round(winner.score * 100),
    margin: Math.round(ranking.margin * 100),
    candidateName: winner.opportunityName,
    opportunityId: winner.opportunityId,
    matchedTokens: winner.matchedTokens,
    matchedName: firstName ? winner.opportunityName : winner.matchedName,
    runnerUpName: ranking.runnerUp?.opportunityName ?? null,
    runnerUpScore: Math.round((ranking.runnerUp?.score ?? 0) * 100),
    reason: firstName
      ? 'Unique fuzzy first-name match within provider roster and stage context'
      : 'Unique best fuzzy client-name match within provider roster',
  };
}
export function matchRosterOpportunity(input: RosterMatchInput): RosterMatch {
  const {
    text,
    targetOpportunityName,
    allowFirstNameOnly = false,
    minimumScore = 0.72,
    minimumMargin = 0.06,
  } = input;
  const candidates = uniqueRoster(input);
  if (!text || !targetOpportunityName || candidates.length === 0)
    return { matched: false, assumed: false, reason: 'No roster candidates' };
  const full = rank(candidates, text, input, bestRosterFullNameMatch);
  if (
    full.winnerIsTarget &&
    full.winner !== undefined &&
    full.winner.score >= minimumScore &&
    full.margin >= minimumMargin
  )
    return accepted(full, full.winner, false);
  if (!allowFirstNameOnly)
    return {
      matched: false,
      assumed: false,
      score: Math.round((full.winner?.score ?? 0) * 100),
      margin: Math.round(full.margin * 100),
      reason: full.winnerIsTarget
        ? 'Roster name match was below the confidence or uniqueness threshold'
        : 'Another provider-roster client was a better name match',
    };
  const first = rank(candidates, text, input, bestRosterFirstNameMatch);
  if (
    first.winnerIsTarget &&
    first.winner !== undefined &&
    first.winner.score >= 0.84 &&
    first.margin >= 0.08
  )
    return accepted(first, first.winner, true);
  return {
    matched: false,
    assumed: false,
    score: Math.round((first.winner?.score ?? full.winner?.score ?? 0) * 100),
    margin: Math.round(first.margin * 100),
    reason: first.winnerIsTarget
      ? 'First-name roster match was below the confidence or uniqueness threshold'
      : 'Another provider-roster client was a better first-name match',
  };
}
