import { isoDate } from './dates.js';
import { STORY_ISSUE_ORDER } from './story-gate-overrides.js';
import { impliedResolvedIssues } from './story-implied-resolution.js';
import { latestStoryEvent } from './story-ranking.js';
import { isAuthorizationStoryIssue } from './story-restatements.js';
import { successorGateFrom } from './story-successor.js';
import type {
  AnnotatedStoryEvent,
  SlaStory,
  StoryEvent,
  StoryIssue,
  StoryIssueView,
  StorySourceResult,
  StoryState,
} from './story-types.js';
import { normalizedStoryText, storyEventId, storyTime } from './story-values.js';

const STORY_CONFLICT = 'Conflict';
const STORY_HISTORY = 'History';
const STORY_CURRENT = 'Current';
const STORY_CLINICAL_REVIEW = 'clinical-review';

function issueView<T extends StoryEvent>(issue: StoryIssue<T>): StoryIssueView {
  return {
    issueKey: issue.issueKey,
    state: issue.state,
    openedDate: isoDate(issue.openedDate),
    lastUpdatedDate: isoDate(issue.lastUpdatedDate),
    resolvedDate: isoDate(issue.resolvedDate),
    openedByEventId: issue.openedByEventId,
    resolvedByEventId: issue.resolvedByEventId,
    latestEventId: issue.latestEventId,
    latestFact: issue.latestFact,
    currentGate: issue.currentGate,
  };
}

function contribution<T extends StoryEvent>(
  event: AnnotatedStoryEvent<T>,
  active: ReadonlySet<string>,
  resolved: ReadonlySet<string>,
  future: boolean
): string {
  if (event.lifecycleState === 'Superseded') return 'Audit Only';
  if (event.lifecycleState === 'Conflicting') return STORY_CONFLICT;
  if (event.preWindowContext) return STORY_HISTORY;
  if (future) return active.has(event.issueKey) ? STORY_CURRENT : 'Future Milestone';
  if (active.has(event.issueKey)) return STORY_CURRENT;
  if (resolved.has(event.issueKey)) return STORY_HISTORY;
  return event.narrativeContribution;
}

function annotateContributions<T extends StoryEvent>(
  state: StoryState<T>,
  activeIssues: readonly StoryIssue<T>[],
  resolvedIssues: readonly StoryIssue<T>[]
): AnnotatedStoryEvent<T>[] {
  const active = new Set(activeIssues.map((issue) => issue.issueKey));
  const resolved = new Set(resolvedIssues.map((issue) => issue.issueKey));
  const future: AnnotatedStoryEvent<T>[] = [];
  for (const event of state.annotated) {
    const futureDate =
      Boolean(event.milestoneDate) && storyTime(event.milestoneDate) > state.asOfTime;
    // These earlier branches deliberately keep future milestones out of the monitoring list.
    const eligibleFuture =
      futureDate &&
      !['Superseded', 'Conflicting'].includes(event.lifecycleState) &&
      !event.preWindowContext;
    event.narrativeContribution = contribution(event, active, resolved, futureDate);
    if (eligibleFuture) future.push(event);
    const issue = state.issues.get(event.issueKey);
    if (issue?.resolvedByEventId) {
      event.resolvedByEventId = issue.resolvedByEventId;
      event.resolutionDate = issue.resolvedDate;
    }
  }
  return future;
}

function authorizationContext<T extends StoryEvent>(
  current: readonly AnnotatedStoryEvent<T>[],
  key: string
): AnnotatedStoryEvent<T>[] {
  if (!isAuthorizationStoryIssue(key)) return [];
  return current.filter((event) => {
    if (event.issueKey === key) return true;
    if (!['required-documentation', 'family-availability'].includes(event.issueKey)) return false;
    return /authorization|payer|denial|overlap|duplicate services|diagnostic|psychological|service order|referral|vineland|basc|signature|discharge/.test(
      normalizedStoryText(event)
    );
  });
}

function predecessorResolution<T extends StoryEvent>(
  state: StoryState<T>,
  currentGateEvents: readonly AnnotatedStoryEvent<T>[],
  resolved: readonly StoryIssue<T>[],
  narrative: readonly AnnotatedStoryEvent<T>[]
): AnnotatedStoryEvent<T> | null {
  const order = STORY_ISSUE_ORDER.get(state.currentGateIssueKey) ?? 0;
  const proven = new Set(currentGateEvents.flatMap((event) => impliedResolvedIssues(event)));
  const ids = new Set(
    resolved
      .filter(
        (issue) =>
          Boolean(issue.resolvedByEventId) &&
          !proven.has(issue.issueKey) &&
          (STORY_ISSUE_ORDER.get(issue.issueKey) ?? Number.MAX_SAFE_INTEGER) < order
      )
      .map((issue) => issue.resolvedByEventId)
  );
  return latestStoryEvent(narrative.filter((event) => ids.has(storyEventId(event))));
}

function latestSubstantive<T extends StoryEvent>(
  state: StoryState<T>,
  narrative: readonly AnnotatedStoryEvent<T>[],
  resolved: readonly StoryIssue<T>[]
): AnnotatedStoryEvent<T> | null {
  const key = state.currentGateIssueKey;
  const current = narrative.filter(
    (event) =>
      !event.preWindowContext &&
      [STORY_CURRENT, STORY_CONFLICT].includes(event.narrativeContribution)
  );
  const currentGate = current.filter((event) => event.issueKey === key);
  const history = narrative.filter(
    (event) =>
      event.issueKey === key &&
      [STORY_CURRENT, STORY_CONFLICT, STORY_HISTORY].includes(event.narrativeContribution)
  );
  const transition = state.gateTransitionEventId
    ? narrative.find((event) => storyEventId(event) === state.gateTransitionEventId)
    : null;
  const predecessor = predecessorResolution(state, currentGate, resolved, narrative);
  const successorOpening = latestStoryEvent(
    narrative.filter((event) => successorGateFrom(event)?.issueKey === key)
  );
  const latestCurrent = latestStoryEvent([
    ...currentGate,
    ...authorizationContext(current, key),
    ...(successorOpening ? [successorOpening] : []),
  ]);
  return (
    latestCurrent ??
    transition ??
    predecessor ??
    (state.gate.authorization?.satisfied === false ? latestStoryEvent(history) : null) ??
    latestStoryEvent(current) ??
    latestStoryEvent(narrative.filter((event) => !event.preWindowContext))
  );
}

function clinicalGateOverride<T extends StoryEvent>(
  state: StoryState<T>,
  latest: AnnotatedStoryEvent<T> | null
): void {
  if (state.currentGateIssueKey !== STORY_CLINICAL_REVIEW) return;
  if (latest?.factType === 'tp-portal-submitted-awaiting-clinical-quality') {
    state.currentGateOverride = {
      issueKey: STORY_CLINICAL_REVIEW,
      processPosition: 'Treatment plan received; Clinical Quality intake pending',
      unresolvedGate:
        'Create the Salesforce Treatment Authorization and Clinical Quality records and move the Opportunity to Treatment Plan In-review',
      owner: 'Insurance Ops',
      recommendedAction:
        'Insurance Ops to create the Salesforce Treatment Authorization and Clinical Quality records and move the Opportunity to Treatment Plan In-review.',
      recommendedActionType: 'Salesforce Update',
    };
  } else if (
    /treatment plan was reported submitted|treatment plan was submitted for clinical review/.test(
      normalizedStoryText(latest ?? {})
    )
  ) {
    state.currentGateOverride = {
      issueKey: STORY_CLINICAL_REVIEW,
      processPosition: 'Treatment plan clinical review',
      unresolvedGate: 'Confirm Clinical Quality disposition and any requested edits',
      owner: 'CSM',
      recommendedAction:
        'CSM to confirm the submitted treatment plan entered Clinical Quality review and identify any requested edits.',
      recommendedActionType: 'Provider Outreach',
    };
  }
}

export function storyResult<T extends StoryEvent>(
  state: StoryState<T>,
  sourceResults: readonly StorySourceResult[]
): SlaStory<T> {
  const activeIssues = [...state.issues.values()]
    .filter((issue) => issue.state !== 'Resolved')
    .sort(
      (left, right) =>
        Number(right.currentGate) - Number(left.currentGate) ||
        storyTime(right.lastUpdatedDate) - storyTime(left.lastUpdatedDate)
    );
  const resolvedIssues = [...state.issues.values()]
    .filter((issue) => issue.state === 'Resolved')
    .sort((left, right) => storyTime(left.resolvedDate) - storyTime(right.resolvedDate));
  const future = annotateContributions(state, activeIssues, resolvedIssues);
  const narrativeEvents = state.annotated.filter(
    (event) => event.narrativeContribution !== 'Audit Only'
  );
  const latest = latestSubstantive(state, narrativeEvents, resolvedIssues);
  clinicalGateOverride(state, latest);
  return {
    version: '2026-08-11.9',
    storyStartDate: state.window.startDate,
    storyAnchorDate: state.window.anchorDate,
    storyWindowBasis: state.window.basis,
    currentGateIssueKey: state.currentGateIssueKey,
    currentGate: state.currentGateOverride?.unresolvedGate ?? state.gate.unresolvedGate,
    currentGateOverride: state.currentGateOverride,
    latestSubstantiveEvent: latest,
    timeline: state.annotated,
    narrativeEvents,
    activeIssues: activeIssues.map(issueView),
    resolvedIssues: resolvedIssues.map(issueView),
    futureMilestones: future.sort(
      (left, right) => storyTime(left.milestoneDate) - storyTime(right.milestoneDate)
    ),
    conflicts: [...new Set(state.conflicts.values())],
    sourceCoverage: sourceResults.map((result) => ({
      source: result.source,
      status: result.status,
      collectedAt: result.collectedAt,
      failureReason: result.failureReason,
    })),
  };
}
