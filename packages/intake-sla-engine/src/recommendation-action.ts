import { isoDate, nextBusinessDay, type DateValue } from './dates.js';
import { categoryForGate } from './gate-context.js';
import { humanDate } from './recommendation-date.js';
import { accountableOwner, actionTypeForOwner, ownerName } from './recommendation-owner.js';
import type {
  RecommendationAction,
  RecommendationEvent,
  RecommendationGate,
  RecommendationOpportunity,
} from './recommendation-types.js';

const PROVIDER_OUTREACH = 'Provider Outreach';
const RECOMMENDED = 'Recommended';
interface FollowUp {
  readonly date: string | null;
  readonly basis: string;
}

export function usableFollowUpDate(candidate: DateValue, asOf: DateValue): FollowUp {
  const present = Boolean(candidate);
  if (!present) return { date: nextBusinessDay(asOf), basis: RECOMMENDED };
  const date = isoDate(candidate);
  const asOfDate = isoDate(asOf);
  if (date !== null && asOfDate !== null && date < asOfDate)
    return { date: nextBusinessDay(asOf), basis: RECOMMENDED };
  return { date, basis: 'Explicit' };
}

export function plannedActionDate(
  event?: Pick<
    RecommendationEvent,
    'milestoneKind' | 'milestoneDate' | 'plannedDate' | 'factType'
  > | null
): string | null {
  if (Object.hasOwn(event ?? {}, 'milestoneKind'))
    return event?.milestoneKind === 'planned' ? isoDate(event.milestoneDate) : null;
  return isoDate(
    event?.plannedDate ??
      (/(?:^|-)planned(?:-|$)|scheduled/.test(event?.factType ?? '') ? event?.milestoneDate : null)
  );
}

function plannedTiming(
  event: RecommendationEvent | null | undefined,
  asOf: DateValue
): { readonly date: string | null; readonly passed: boolean; readonly future: boolean } {
  const date = plannedActionDate(event);
  const cutoff = isoDate(asOf);
  return {
    date,
    passed: date !== null && cutoff !== null && date < cutoff,
    future: date !== null && cutoff !== null && date >= cutoff,
  };
}

function missedPlan(owner: string | null | undefined, date: string | null): string {
  return `${String(owner)} to confirm whether the planned ${String(humanDate(date))} milestone occurred and update the structured record with the outcome.`;
}

function eventAction(
  gate: RecommendationGate,
  asOf: DateValue,
  newest: RecommendationEvent & { readonly recommendedAction: string },
  opportunity: RecommendationOpportunity
): RecommendationAction {
  const followUp = usableFollowUpDate(newest.followUpDate ?? newest.milestoneDate, asOf);
  const planned = plannedTiming(newest, asOf);
  let text = newest.recommendedAction
    .replace(/^CSM\b/, ownerName('CSM', opportunity))
    .replace(/^Intake Ops\b/, 'Intake');
  const owner = accountableOwner(text, newest.actionOwner ?? gate.owner ?? 'CSM', opportunity);
  let type = actionTypeForOwner(
    newest.actionType ?? gate.recommendedActionType ?? PROVIDER_OUTREACH,
    owner,
    opportunity
  );
  if (planned.passed && type === 'Monitor') {
    type = PROVIDER_OUTREACH;
    text = missedPlan(owner, planned.date);
  }
  return {
    type,
    owner,
    text,
    date: followUp.date,
    basis: planned.future ? 'Explicit' : followUp.basis,
  };
}

function gateAction(
  gate: RecommendationGate & { readonly recommendedAction: string },
  asOf: DateValue,
  newest: RecommendationEvent | null | undefined,
  opportunity: RecommendationOpportunity
): RecommendationAction {
  const followUp = usableFollowUpDate(
    gate.recommendedFollowUpDate ?? newest?.followUpDate ?? newest?.milestoneDate,
    asOf
  );
  const planned = plannedTiming(newest, asOf);
  let text = gate.recommendedAction.replace(/^CSM\b/, ownerName('CSM', opportunity));
  const owner = accountableOwner(text, gate.owner ?? newest?.actionOwner ?? 'CSM', opportunity);
  let type = actionTypeForOwner(
    gate.recommendedActionType ?? newest?.actionType ?? PROVIDER_OUTREACH,
    owner,
    opportunity
  );
  if (planned.passed && type === 'Monitor') {
    type = PROVIDER_OUTREACH;
    text = missedPlan(owner, planned.date);
  }
  return { type, owner, text, date: followUp.date, basis: followUp.basis };
}

function occurrenceAction(
  occurrence: NonNullable<RecommendationGate['occurrence']>,
  opportunity: RecommendationOpportunity
): RecommendationAction {
  const owner = ownerName(occurrence.owner, opportunity);
  const hasPlannedMilestone = Boolean(occurrence.plannedMilestone);
  if (occurrence.actionType === 'No Action')
    return {
      type: 'No Action',
      owner: '',
      text: 'No follow-up is required for this completed gate.',
      date: null,
      basis: 'Not Applicable',
    };
  if (occurrence.actionType === 'Monitor')
    return {
      type: 'Monitor',
      owner,
      text: `${String(owner)} to confirm the IA occurred and ensure the structured completion record is updated.`,
      date: occurrence.followUpDate,
      basis: hasPlannedMilestone ? 'Explicit' : RECOMMENDED,
    };
  return {
    type: occurrence.actionType,
    owner,
    text: `${String(owner)} to verify IA completion with the provider and correct Salesforce with the confirmed occurrence date.`,
    date: occurrence.followUpDate,
    basis: RECOMMENDED,
  };
}

function defaultAction(
  gate: RecommendationGate,
  asOf: DateValue,
  opportunity: RecommendationOpportunity
): RecommendationAction {
  if (gate.owner === 'Insurance Ops')
    return {
      type: 'Insurance Follow-Up',
      owner: 'Insurance Ops',
      text: 'Insurance Ops to confirm the current payer determination and document the response and next follow-up date.',
      date: nextBusinessDay(asOf),
      basis: RECOMMENDED,
    };
  const owner = ownerName(gate.owner ?? 'CSM', opportunity);
  const provider = opportunity.provider ? ` with ${opportunity.provider}` : ' with the provider';
  const category = categoryForGate(gate);
  const messages = new Map([
    [
      'treatmentPlan',
      `${String(owner)} to confirm${provider} the treatment-plan status, outstanding prerequisites, and committed submission date.`,
    ],
    [
      'intakeScheduling',
      `${String(owner)} to confirm${provider} whether the initial assessment is scheduled or complete and document the confirmed date.`,
    ],
    [
      'rbt',
      `${String(owner)} to confirm${provider} the current RBT coverage and agreed first 97153 date.`,
    ],
  ]);
  return {
    type: PROVIDER_OUTREACH,
    owner,
    text:
      messages.get(category) ??
      `${String(owner)} to confirm the unresolved milestone and document a committed completion date.`,
    date: nextBusinessDay(asOf),
    basis: RECOMMENDED,
  };
}

export function actionFor(
  gate: RecommendationGate,
  asOf: DateValue,
  newest: RecommendationEvent | null | undefined,
  opportunity: RecommendationOpportunity
): RecommendationAction {
  const cannotClose = newest?.actionType === 'No Action' && categoryForGate(gate) !== 'insurance';
  if (newest?.recommendedAction && newest.relationship !== 'Conflicts' && !cannotClose) {
    return eventAction(
      gate,
      asOf,
      { ...newest, recommendedAction: newest.recommendedAction },
      opportunity
    );
  }
  if (gate.recommendedAction)
    return gateAction(
      { ...gate, recommendedAction: gate.recommendedAction },
      asOf,
      newest,
      opportunity
    );
  if (gate.occurrence) return occurrenceAction(gate.occurrence, opportunity);
  return defaultAction(gate, asOf, opportunity);
}
