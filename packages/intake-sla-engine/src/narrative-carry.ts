import { conciseFact, inlineClause, materiallyOverlaps } from './narrative-text.js';
import type { NarrativeIssue, NarrativePacket } from './narrative-types.js';
import { canonicalFact, capitalize, normalizedFact } from './recommendation-text.js';

const INITIAL_AUTHORIZATION = 'initial-authorization';
const TREATMENT_AUTHORIZATION = 'treatment-authorization';
const TREATMENT_PLAN = 'treatment-plan';
const CLINICAL_REVIEW = 'clinical-review';
const FIRST_SERVICE = 'first-97153';
const STAFFING = 'rbt-staffing';
const PROCESS_ISSUE_ORDER = new Map([
  ['insurance-verification', 10],
  [INITIAL_AUTHORIZATION, 20],
  ['initial-assessment', 30],
  [TREATMENT_PLAN, 40],
  [CLINICAL_REVIEW, 50],
  ['payer-submission', 60],
  [TREATMENT_AUTHORIZATION, 70],
  [STAFFING, 80],
  [FIRST_SERVICE, 90],
]);

interface ActiveIssue extends NarrativeIssue {
  readonly latestEventId: string;
  readonly latestFact: string;
}

function relevantIssue(issue: ActiveIssue, packet: NarrativePacket): boolean {
  const current = packet.story?.currentGateIssueKey;
  const order = PROCESS_ISSUE_ORDER.get(current ?? '');
  if (
    issue.issueKey === current ||
    (order && (PROCESS_ISSUE_ORDER.get(issue.issueKey) ?? Number.NaN) > order)
  )
    return false;
  if (
    [INITIAL_AUTHORIZATION, TREATMENT_AUTHORIZATION].includes(current ?? '') &&
    [STAFFING, FIRST_SERVICE].includes(issue.issueKey)
  )
    return false;
  if (
    current === CLINICAL_REVIEW &&
    issue.issueKey === TREATMENT_PLAN &&
    ['tp-submission-planned', 'tp-ready'].includes(packet.newestUpdate?.factType ?? '')
  )
    return false;
  if (
    issue.issueKey === INITIAL_AUTHORIZATION &&
    packet.story?.resolvedIssues?.some((resolved) => resolved.issueKey === TREATMENT_PLAN) &&
    packet.story.timeline?.some(
      (event) => event.id === issue.latestEventId && event.factType === 'auth-expired'
    )
  )
    return false;
  const candidate = (packet.structuredGateDetail?.candidateName ?? '').toLowerCase();
  return !(
    [STAFFING, FIRST_SERVICE].includes(issue.issueKey) &&
    candidate &&
    !issue.latestFact.toLowerCase().includes(candidate)
  );
}

function alreadyCovered(issue: ActiveIssue, packet: NarrativePacket): boolean {
  const fact = normalizedFact(issue.latestFact);
  if (
    [packet.newestUpdate?.fact, packet.structuredGateDetail?.fact, packet.unresolvedGate].some(
      (value) => fact === normalizedFact(value)
    )
  )
    return true;
  if (
    materiallyOverlaps(issue.latestFact, packet.newestUpdate?.fact) ||
    materiallyOverlaps(issue.latestFact, packet.structuredGateDetail?.fact)
  )
    return true;
  if (packet.newestUpdate?.id && issue.latestEventId === packet.newestUpdate.id) return true;
  if (packet.structuredGateDetail?.id && issue.latestEventId === packet.structuredGateDetail.id)
    return true;
  if (
    (packet.futureMilestones ?? []).some(
      (event) => Boolean(event.id) && event.id === issue.latestEventId
    )
  )
    return true;
  return (packet.futureMilestones ?? []).some((event) => {
    const future = canonicalFact(event.fact);
    if (!future) return false;
    const current = canonicalFact(issue.latestFact);
    return (
      current === future ||
      (current.length >= 35 && future.includes(current)) ||
      (future.length >= 35 && current.includes(future))
    );
  });
}

export function activeCarryForwardSentence(packet: NarrativePacket): string | null {
  const issues = (packet.story?.activeIssues ?? []).filter((issue): issue is ActiveIssue => {
    if (!issue.latestEventId || !issue.latestFact) return false;
    const active: ActiveIssue = {
      ...issue,
      latestEventId: issue.latestEventId,
      latestFact: issue.latestFact,
    };
    return (
      relevantIssue(active, packet) &&
      !alreadyCovered(active, packet) &&
      !/stage-relevant operational update|unresolved gate is described in the sla summary/i.test(
        issue.latestFact
      )
    );
  });
  const issue = issues[0];
  if (!issue) return null;
  if (
    issue.issueKey === FIRST_SERVICE &&
    packet.structuredGateDetail?.factType === 'rbt-recruiting'
  )
    return 'An earlier provider start-date discussion did not produce a confirmed start; current staffing records still show no matched candidate.';
  const fact = capitalize(inlineClause(conciseFact(issue.latestFact)));
  const suffixes = new Map([
    [
      'required-documentation',
      'this documentation is still required before the current process milestone can be completed.',
    ],
    [
      'family-availability',
      'this remains a constraint on the current care plan and must be resolved before a reliable next milestone can be set.',
    ],
    [
      'provider-capacity',
      'no later evidence confirms that provider capacity or reassignment has been resolved.',
    ],
    [CLINICAL_REVIEW, 'no later Clinical Quality receipt or completed review is recorded.'],
    [INITIAL_AUTHORIZATION, 'this payer issue remains relevant to the current delay.'],
    [TREATMENT_AUTHORIZATION, 'this payer issue remains relevant to the current delay.'],
  ]);
  return `${fact}; ${suffixes.get(issue.issueKey) ?? 'no later evidence confirms that this issue was resolved.'}`;
}
