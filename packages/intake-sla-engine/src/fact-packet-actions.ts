import { isoDate, nextBusinessDay } from './dates.js';
import { evidenceSpecificity } from './evidence.js';
import { actionFor } from './recommendation-action.js';
import {
  AUTHORIZATION_PROGRESS_TYPES,
  authorizationProgressAction,
} from './recommendation-authorization-progress.js';
import { dateValue, humanDate } from './recommendation-date.js';
import { shouldUseStructuredAction } from './recommendation-selection.js';
import type { FactPacketState, RecommendationEvent } from './recommendation-types.js';

function specificDenial<T extends RecommendationEvent>(
  state: FactPacketState<T>
): RecommendationEvent | undefined {
  const { story, gate } = state;
  return story.timeline
    .filter(
      (event) =>
        event.issueKey === story.currentGateIssueKey &&
        event.factType === 'auth-denial-reason' &&
        Boolean(event.recommendedAction) &&
        ['Direct', 'Likely'].includes(event.matchQuality) &&
        !['Superseded', 'Conflicting'].includes(event.lifecycleState) &&
        !(
          gate.authorization?.satisfied === true &&
          event.issueKey === `${String(gate.authorization.phase)}-authorization` &&
          dateValue(gate.authorization.approvalDate) > dateValue(event.eventDate)
        )
    )
    .sort(
      (left, right) =>
        evidenceSpecificity(right) - evidenceSpecificity(left) ||
        dateValue(right.eventDate) - dateValue(left.eventDate)
    )[0];
}

function assignedStaffingAction<T extends RecommendationEvent>(state: FactPacketState<T>): void {
  const {
    structuredDetailEvent: detail,
    assignedRbt,
    gateCategory,
    newerStaffingPathSupersedesAssignment,
  } = state;
  if (gateCategory !== 'rbt' || !assignedRbt || newerStaffingPathSupersedesAssignment || !detail)
    return;
  const { opportunity, asOf } = state.input;
  const owner = [opportunity.csm].find(Boolean) ?? 'CSM';
  const milestone = isoDate(detail.milestoneDate);
  const cutoff = isoDate(asOf);
  if (milestone && cutoff && milestone < cutoff) {
    state.action = {
      type: 'Provider Outreach',
      owner,
      text: `${owner} to verify whether ${assignedRbt} delivered the first 97153 on ${String(humanDate(milestone))}; if not, confirm and record the replacement start date.`,
      date: nextBusinessDay(asOf),
      basis: 'Recommended',
    };
  } else if (milestone) {
    state.action = {
      type: 'Monitor',
      owner,
      text:
        detail.recommendedAction ??
        `${owner} to ensure the ${String(humanDate(milestone))} first 97153 appointment for ${assignedRbt} is entered in Aloha, synced to Salesforce, and confirmed after service.`,
      date: milestone,
      basis: 'Explicit',
    };
  } else {
    state.action = {
      type: 'Provider Outreach',
      owner,
      text: `${owner} to confirm the agreed first 97153 date for ${assignedRbt} with the provider and ensure the appointment is entered in Aloha and synced to Salesforce.`,
      date: nextBusinessDay(asOf),
      basis: 'Recommended',
    };
  }
}

/** Apply the original action override order before cross-evidence conflicts. */
export function selectFactPacketAction<T extends RecommendationEvent>(
  state: FactPacketState<T>
): void {
  const { gate, newest, structuredDetailEvent, story } = state;
  const { opportunity, asOf } = state.input;
  if (
    !state.newerStaffingPathSupersedesAssignment &&
    shouldUseStructuredAction(newest, structuredDetailEvent)
  )
    state.action = actionFor(gate, asOf, structuredDetailEvent, opportunity);
  const progress = authorizationProgressAction(state.sameDayAuthorizationProgress, story, asOf);
  if (progress) state.action = progress;
  const denial = specificDenial(state);
  if (
    state.gateCategory === 'insurance' &&
    !progress &&
    denial &&
    !AUTHORIZATION_PROGRESS_TYPES.has(newest?.factType ?? '')
  )
    state.action = actionFor(gate, asOf, denial, opportunity);
  if (
    newest?.factType === 'auth-denied' &&
    /denied again after (?:reconsideration|appeal|peer review)/i.test(newest.fact ?? '') &&
    /new authorization submission remains unconfirmed/i.test(newest.fact ?? '') &&
    newest.recommendedAction
  )
    state.action = actionFor(gate, asOf, newest, opportunity);
  if (
    state.requiredDocumentationEvent &&
    ['intakeScheduling', 'treatmentPlan'].includes(state.gateCategory)
  )
    state.action = actionFor(gate, asOf, state.requiredDocumentationEvent, opportunity);
  assignedStaffingAction(state);
}

export function applyOverlapAction<T extends RecommendationEvent>(state: FactPacketState<T>): void {
  const evidence = [...state.timeline, ...state.supporting];
  const overlap = evidence.find(
    (event) =>
      /auth-denial-reason|auth-overlap-family-outreach/.test(event.factType ?? '') &&
      /overlap(?:ping)?|duplicate services?|prior-provider authorization|prior provider/i.test(
        `${event.denialReason ?? ''} ${event.text}`
      )
  );
  if (state.gateCategory !== 'insurance' || !overlap) return;
  const remediation = evidence
    .filter(
      (event) => event.factType === 'auth-overlap-remediation' && Boolean(event.recommendedAction)
    )
    .sort((left, right) => dateValue(right.eventDate) - dateValue(left.eventDate))[0];
  state.action = remediation
    ? actionFor(state.gate, state.input.asOf, remediation, state.input.opportunity)
    : {
        type: 'Family Outreach',
        owner: 'Intake',
        text: "Intake to confirm with the family that the prior provider's authorization has been terminated and send proof to Insurance Ops for payer reprocessing.",
        date: nextBusinessDay(state.input.asOf),
        basis: 'Recommended',
      };
}
