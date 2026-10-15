import {
  activeIssueGateOverride,
  prerequisiteGateOverride,
  STORY_ISSUE_ORDER,
} from './story-gate-overrides.js';
import { impliedResolvedIssues } from './story-implied-resolution.js';
import { latestStoryEvent } from './story-ranking.js';
import { explicitlyResolved } from './story-resolution.js';
import { isAuthorizationStoryIssue } from './story-restatements.js';
import { requiredStoryIssue } from './story-state.js';
import { successorGateFrom } from './story-successor.js';
import type { StoryEvent, StoryIssue, StoryState } from './story-types.js';
import { normalizedStoryText, storyEventId, storyTime } from './story-values.js';

const STORY_RESOLVED = 'Resolved';
const STORY_OPENED = 'Opened';
const STORY_INITIAL_AUTHORIZATION = 'initial-authorization';
const STORY_INITIAL = 'initial';
const STORY_TREATMENT_PLAN = 'treatment-plan';
const STORY_CONFLICTING = 'Conflicting';

function initializeCurrentIssue<T extends StoryEvent>(state: StoryState<T>): StoryIssue<T> {
  const { currentGateIssueKey: key, issues, admitted, opportunity, window, gate } = state;
  if (!issues.has(key)) {
    const resolver = latestStoryEvent(
      admitted.filter(
        (event) => explicitlyResolved(event, key) || impliedResolvedIssues(event).includes(key)
      )
    );
    issues.set(key, {
      issueKey: key,
      state: resolver ? STORY_RESOLVED : STORY_OPENED,
      openedDate: opportunity.stageEntryDate ?? opportunity.slaCreatedDate ?? window.anchorDate,
      lastUpdatedDate: null,
      openedByEventId: null,
      resolvedDate: resolver?.eventDate ?? null,
      resolvedByEventId: resolver ? storyEventId(resolver) : null,
      latestEventId: null,
      latestEvent: null,
      latestFact: resolver?.text ?? gate.unresolvedGate,
      currentGate: true,
    });
  }
  const current = requiredStoryIssue(state);
  current.currentGate = true;
  return current;
}

function submittedAuthorizationOverride<T extends StoryEvent>(
  state: StoryState<T>,
  current: StoryIssue<T>
): void {
  const text = normalizedStoryText(current.latestEvent ?? {});
  if (
    !isAuthorizationStoryIssue(state.currentGateIssueKey) ||
    !current.latestEvent ||
    !/authorization.*submitted/.test(text) ||
    !/determination (?:is )?not recorded|pending|awaiting|under review/.test(text)
  )
    return;
  const phase =
    state.currentGateIssueKey === STORY_INITIAL_AUTHORIZATION ? STORY_INITIAL : 'treatment';
  state.currentGateOverride = {
    issueKey: state.currentGateIssueKey,
    processPosition: phase === STORY_INITIAL ? 'Initial authorization' : 'Treatment authorization',
    unresolvedGate: `Receive the current ${phase} authorization determination`,
    owner: 'Insurance Ops',
    recommendedAction: `Insurance Ops to confirm the submitted ${phase} authorization determination and document the payer response and next follow-up date.`,
    recommendedActionType: 'Insurance Follow-Up',
  };
}

function eligibleSuccessor<T extends StoryEvent>(
  state: StoryState<T>,
  issue: StoryIssue<T>
): boolean {
  if (
    issue.issueKey === state.currentGateIssueKey ||
    issue.state === STORY_RESOLVED ||
    !issue.latestEvent
  )
    return false;
  if (
    issue.latestEvent.preWindowContext &&
    storyTime(issue.latestEvent.milestoneDate) <= state.asOfTime
  )
    return false;
  return !(
    issue.issueKey === STORY_INITIAL_AUTHORIZATION &&
    issue.latestEvent.factType === 'auth-expired' &&
    [STORY_TREATMENT_PLAN, 'clinical-review', 'payer-submission'].includes(
      state.currentGateIssueKey
    ) &&
    state.gate.authorization?.satisfied !== false &&
    state.admitted.some((event) => ['tp-ready', 'tp-submitted'].includes(event.factType ?? ''))
  );
}

function advanceResolvedGate<T extends StoryEvent>(
  state: StoryState<T>,
  current: StoryIssue<T>
): void {
  if (current.state !== STORY_RESOLVED) return;
  const known = [...state.issues.values()]
    .filter((issue) => eligibleSuccessor(state, issue))
    .sort(
      (left, right) =>
        storyTime(right.lastUpdatedDate) - storyTime(left.lastUpdatedDate) ||
        (STORY_ISSUE_ORDER.get(right.issueKey) ?? 0) - (STORY_ISSUE_ORDER.get(left.issueKey) ?? 0)
    )[0];
  if (known) {
    state.gateTransitionEventId = current.resolvedByEventId;
    current.currentGate = false;
    state.currentGateIssueKey = known.issueKey;
    known.currentGate = true;
    state.currentGateOverride = prerequisiteGateOverride(known, state.gate);
  }
  const resolver = current.resolvedByEventId
    ? state.admitted.find((event) => storyEventId(event) === current.resolvedByEventId)
    : null;
  const successor = known ? null : successorGateFrom(resolver ?? current.latestEvent);
  if (successor && successor.issueKey !== state.currentGateIssueKey) {
    state.gateTransitionEventId = current.resolvedByEventId;
    current.currentGate = false;
    state.currentGateIssueKey = successor.issueKey;
    state.currentGateOverride = successor;
    const existing = state.issues.get(successor.issueKey);
    if (existing && existing.state !== STORY_RESOLVED) existing.currentGate = true;
    else
      state.issues.set(successor.issueKey, {
        issueKey: successor.issueKey,
        state: STORY_OPENED,
        openedDate:
          current.resolvedDate ??
          state.opportunity.stageEntryDate ??
          state.opportunity.slaCreatedDate ??
          state.window.anchorDate,
        lastUpdatedDate: null,
        openedByEventId: current.resolvedByEventId,
        resolvedDate: null,
        resolvedByEventId: null,
        latestEventId: null,
        latestEvent: null,
        latestFact: successor.unresolvedGate,
        currentGate: true,
      });
  } else if (!known) {
    current.state = STORY_CONFLICTING;
    state.conflicts.set(
      state.currentGateIssueKey,
      `${state.currentGateIssueKey}: evidence indicates the current gate is resolved, but the Opportunity remains in ${String(state.opportunity.stage)}.`
    );
  }
}

function unresolvedPrerequisite<T extends StoryEvent>(state: StoryState<T>): void {
  const current = requiredStoryIssue(state);
  if (current.latestEvent) return;
  const order = STORY_ISSUE_ORDER.get(state.currentGateIssueKey) ?? Number.MAX_SAFE_INTEGER;
  const prerequisite = [...state.issues.values()]
    .filter(
      (issue) =>
        issue.issueKey !== state.currentGateIssueKey &&
        issue.state !== STORY_RESOLVED &&
        issue.latestEvent &&
        !issue.latestEvent.preWindowContext &&
        (['provider-capacity', 'family-availability', 'required-documentation'].includes(
          issue.issueKey
        ) ||
          (STORY_ISSUE_ORDER.get(issue.issueKey) ?? Number.MAX_SAFE_INTEGER) < order)
    )
    .sort(
      (left, right) =>
        (STORY_ISSUE_ORDER.get(right.issueKey) ?? 0) -
          (STORY_ISSUE_ORDER.get(left.issueKey) ?? 0) ||
        storyTime(right.lastUpdatedDate) - storyTime(left.lastUpdatedDate)
    )[0];
  const override = prerequisite ? prerequisiteGateOverride(prerequisite, state.gate) : null;
  if (!override || !prerequisite) return;
  current.currentGate = false;
  prerequisite.currentGate = true;
  state.currentGateIssueKey = prerequisite.issueKey;
  state.currentGateOverride = override;
}

function laterTreatmentPlanWork<T extends StoryEvent>(state: StoryState<T>): void {
  if (state.currentGateIssueKey !== 'clinical-review') return;
  const planned = state.issues.get(state.currentGateIssueKey);
  const later = state.issues.get(STORY_TREATMENT_PLAN);
  if (
    !planned ||
    planned.state === STORY_RESOLVED ||
    planned.latestEvent?.factType !== 'tp-submission-planned' ||
    !later ||
    later.state === STORY_RESOLVED ||
    !later.latestEvent
  )
    return;
  if (
    !['tp-drafting', 'tp-not-started', 'tp-completion-planned'].includes(
      later.latestEvent.factType ?? ''
    ) ||
    storyTime(later.lastUpdatedDate) <= storyTime(planned.lastUpdatedDate)
  )
    return;
  planned.currentGate = false;
  later.currentGate = true;
  state.currentGateIssueKey = STORY_TREATMENT_PLAN;
  state.currentGateOverride = activeIssueGateOverride(later, state.gate);
}

function reconcileActiveGate<T extends StoryEvent>(state: StoryState<T>): void {
  const { gate, currentGateOverride } = state;
  const fixed = gate.gateCategory
    ? gate.gateCategory === 'insurance'
    : /authorization|payer|insurance|vob|eligibility/i.test(
        `${gate.processPosition ?? ''} ${gate.unresolvedGate ?? ''}`
      );
  if (fixed || gate.authorization?.satisfied === false) return;
  const override = activeIssueGateOverride(
    state.issues.get(state.currentGateIssueKey),
    currentGateOverride ? { ...gate, ...currentGateOverride } : gate
  );
  if (override) state.currentGateOverride = override;
}

function restoreAuthorizationGate<T extends StoryEvent>(state: StoryState<T>): void {
  const { gate, opportunity, window } = state;
  if (gate.authorization?.satisfied !== false) return;
  const phase = (gate.authorization.phase ?? '').toLowerCase();
  const key = phase === STORY_INITIAL ? STORY_INITIAL_AUTHORIZATION : 'treatment-authorization';
  for (const issue of state.issues.values()) issue.currentGate = false;
  const current = state.issues.get(key);
  if (!current)
    state.issues.set(key, {
      issueKey: key,
      state: gate.authorization.conflict ? STORY_CONFLICTING : STORY_OPENED,
      openedDate: opportunity.stageEntryDate ?? opportunity.slaCreatedDate ?? window.anchorDate,
      lastUpdatedDate: null,
      openedByEventId: null,
      resolvedDate: null,
      resolvedByEventId: null,
      latestEventId: null,
      latestEvent: null,
      latestFact: gate.unresolvedGate,
      currentGate: true,
    });
  else {
    current.currentGate = true;
    if (current.state === STORY_RESOLVED) {
      current.state = gate.authorization.conflict ? STORY_CONFLICTING : 'Progressed';
      current.resolvedDate = null;
      current.resolvedByEventId = null;
    }
  }
  state.currentGateIssueKey = key;
  state.currentGateOverride = {
    issueKey: key,
    processPosition: phase === STORY_INITIAL ? 'Initial authorization' : 'Treatment authorization',
    unresolvedGate: gate.unresolvedGate,
    owner: 'Insurance Ops',
    recommendedAction: `Insurance Ops to confirm the current ${phase === '' ? 'payer' : phase} authorization determination and document the payer response and next follow-up date.`,
    recommendedActionType: 'Insurance Follow-Up',
  };
}

export function reconcileStoryGate<T extends StoryEvent>(state: StoryState<T>): void {
  const current = initializeCurrentIssue(state);
  submittedAuthorizationOverride(state, current);
  advanceResolvedGate(state, current);
  unresolvedPrerequisite(state);
  laterTreatmentPlanWork(state);
  reconcileActiveGate(state);
  restoreAuthorizationGate(state);
}
