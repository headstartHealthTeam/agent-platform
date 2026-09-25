import {
  authorizationCoverageKey,
  authorizationCurrent,
  authorizationPhase,
  authorizationRecordDate,
  denialDetails,
  normalizeAuthorization,
  sameAuthorizationEpisode,
  unresolvedPriority,
  unresolvedState,
} from './authorization-record.js';
import type {
  AuthorizationGate,
  AuthorizationGateInput,
  AuthorizationRecord,
  AuthorizationState,
} from './authorization-types.js';
import { isoDate } from './dates.js';

const RESOLVED = new Set(['approved', 'no auth needed', 'no authorization needed']);
const NO_AUTH_NEEDED = 'No Auth Needed';
const UNRESOLVED_STATE = new Map<string, AuthorizationState>([
  ['pending', 'Pending'],
  ['pending review', 'Pending Review'],
  ['additional details', 'Additional Details Required'],
  ['denied', 'Denied'],
  ['appeal', 'Appeal'],
  ['peer review', 'Peer Review'],
  ['partial approval', 'Partial Approval'],
  ['withdrawn', 'Withdrawn'],
]);

function resolvedRecord(record: AuthorizationRecord, phase: string): boolean {
  if (record.noAuthNeeded === true) return true;
  if (unresolvedState(record) !== null) return false;
  const approvalDate =
    phase === 'Initial' ? record.initialApprovalDate : record.treatmentApprovalDate;
  return (
    Boolean(approvalDate) &&
    (RESOLVED.has(normalizeAuthorization(record.determination)) ||
      RESOLVED.has(normalizeAuthorization(record.status)))
  );
}

function resolveCoverage(
  phase: string,
  key: string,
  current: AuthorizationRecord,
  candidates: readonly AuthorizationRecord[]
): AuthorizationGate {
  const episode = candidates.filter((record) => sameAuthorizationEpisode(record, current, phase));
  const resolved = episode.filter((record) => resolvedRecord(record, phase));
  const unresolved = episode.filter((record) => !resolved.includes(record));
  const description = `${key === 'unspecified' ? '' : `${key} `}${phase.toLowerCase()} authorization`;
  const common = {
    phase,
    records: episode.map((record) => record.id),
    coverage: key,
    ...denialDetails(episode),
  };
  if (resolved.length > 0 && unresolved.length > 0) {
    return {
      ...common,
      state: 'Conflict',
      satisfied: false,
      confidence: 'Low',
      blockingRecordId: current.id,
      conflict: true,
      reason: `Current ${description} records conflict; approval and unresolved states both exist.`,
    };
  }
  const milestones = {
    payer: current.payer ?? null,
    submissionDate: isoDate(
      phase === 'Initial' ? current.initialSubmissionDate : current.treatmentSubmissionDate
    ),
    determinationDate: isoDate(
      phase === 'Initial' ? current.initialApprovalDate : current.treatmentApprovalDate
    ),
  };
  if (resolved.length > 0) {
    return {
      ...common,
      ...milestones,
      state: current.noAuthNeeded ? NO_AUTH_NEEDED : 'Approved',
      satisfied: true,
      confidence: 'High',
      blockingRecordId: null,
      conflict: false,
      authorizationId: current.id,
      reason: `Current ${description} prerequisite is satisfied.`,
    };
  }
  const rawState = normalizeAuthorization(
    [current.determination, current.status].find(Boolean) ?? 'pending'
  );
  const state = unresolvedState(current) ?? UNRESOLVED_STATE.get(rawState) ?? 'Pending';
  return {
    ...common,
    ...milestones,
    state,
    satisfied: false,
    confidence: 'High',
    blockingRecordId: current.id,
    conflict: false,
    reason: `Current ${description} is ${state}.`,
    appealKind: state === 'Appeal' ? 'appeal' : state === 'Peer Review' ? 'peer review' : null,
  };
}

function coverageResults(
  candidates: readonly AuthorizationRecord[],
  phase: string
): AuthorizationGate[] {
  const byCoverage = new Map<string, AuthorizationRecord[]>();
  for (const record of candidates) {
    const key = authorizationCoverageKey(record);
    const group = byCoverage.get(key) ?? [];
    group.push(record);
    byCoverage.set(key, group);
  }
  return [...byCoverage.entries()].flatMap(([key, records]) => {
    const current = records[0];
    return current === undefined ? [] : [resolveCoverage(phase, key, current, records)];
  });
}

export function resolveAuthorizationGate({
  phase,
  authorizations = [],
  asOf = new Date().toISOString(),
}: AuthorizationGateInput): AuthorizationGate {
  const candidates = authorizations
    .filter((record) => authorizationPhase(record) === phase && authorizationCurrent(record, asOf))
    .sort(
      (a, b) =>
        new Date(authorizationRecordDate(b, phase) ?? 0).valueOf() -
          new Date(authorizationRecordDate(a, phase) ?? 0).valueOf() ||
        unresolvedPriority(unresolvedState(b)) - unresolvedPriority(unresolvedState(a))
    );
  const coverages = coverageResults(candidates, phase);
  const latest = coverages[0];
  if (latest === undefined)
    return {
      phase,
      state: 'Missing',
      satisfied: false,
      confidence: 'High',
      blockingRecordId: null,
      conflict: false,
      reason: `No current ${phase.toLowerCase()} authorization was found.`,
    };
  const blocking = coverages
    .filter((result) => !result.satisfied)
    .sort((a, b) => unresolvedPriority(b.state) - unresolvedPriority(a.state))[0];
  if (blocking !== undefined)
    return { ...blocking, conflict: coverages.some((result) => result.conflict), coverages };
  return {
    ...latest,
    state: coverages.every((result) => result.state === NO_AUTH_NEEDED)
      ? NO_AUTH_NEEDED
      : 'Approved',
    satisfied: true,
    reason:
      coverages.length === 1
        ? latest.reason
        : `Current ${phase.toLowerCase()} authorization prerequisites are satisfied for all insurance positions.`,
    coverages,
  };
}
