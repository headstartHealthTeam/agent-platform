import { nextBusinessDay } from './dates.js';
import { accountableAction } from './recommendation-owner.js';
import type { FactPacketState, RecommendationEvent } from './recommendation-types.js';

/** Preserve the approved override order; this port does not redefine publication policy. */
export function factPacketReadiness<T extends RecommendationEvent>(
  state: FactPacketState<T>
): string {
  state.action = accountableAction(state.action);
  let readiness = state.gate.readyToCopy ?? 'Review';
  if (state.materialFailure) readiness = 'Blocked';
  else if (state.supplementaryFailure) readiness = 'Review';
  if (state.conflicts.length) {
    readiness = 'Review';
    if (state.action.type === 'No Action') {
      const owner =
        [state.action.owner, state.input.opportunity.csm].find(Boolean) ?? 'Insurance Ops';
      state.action = {
        type: 'Insurance Follow-Up',
        owner,
        text: `${owner} to reconcile the conflicting evidence and confirm the controlling authorization status before the case advances.`,
        date: nextBusinessDay(state.input.asOf),
        basis: 'Recommended',
      };
    }
  }
  if (state.specificityMissingEvents.length) readiness = 'Review';
  if (state.assumedIdentityEvents.length) readiness = 'Review';
  const plannedMilestone = state.gate.occurrence?.plannedMilestone;
  if (
    state.freshness === 'Semi-Stale' &&
    (plannedMilestone === null || plannedMilestone === undefined)
  )
    readiness = 'Review';
  if (state.freshness === 'Stale' || state.freshness === 'Missing') readiness = 'Review';
  return readiness;
}
