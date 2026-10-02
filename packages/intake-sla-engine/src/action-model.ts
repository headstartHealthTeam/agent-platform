import {
  actionExplicitFollowUpDate,
  actionIsoDate,
  actionMilestoneDate,
  actionModelText,
  actionNextBusinessDay,
  actionOwnerFromText,
} from './action-model-dates.js';
import type {
  ActionDate,
  ActionMilestone,
  ActionModelInput,
  IntakeActionModel,
} from './action-model-types.js';

interface Selection {
  readonly actionType: string;
  readonly actionOwner: string;
}

function outreachSelection(blocker: string, action: string, csm: string): Selection | null {
  const provider = {
    actionType: 'Provider Outreach',
    actionOwner: actionOwnerFromText(action, csm),
  };
  const family = {
    actionType: 'Family Outreach',
    actionOwner: actionOwnerFromText(action, 'Intake'),
  };
  if (/first 97153 appointment|Salesforce.*update/i.test(action)) return provider;
  if (
    /treatment plan|signature|provider scheduling|initial assessment|school information|paired-client dependency/i.test(
      blocker
    )
  )
    return provider;
  if (/family availability|responsiveness/i.test(blocker)) {
    return /confirm with .*whether the family|provider.*family/i.test(action) ? provider : family;
  }
  const context = `${blocker} ${action}`;
  if (/\brbt\b|staffing|candidate|treatment start/i.test(context))
    return { actionType: 'RBT Follow-Up', actionOwner: 'RBT Team' };
  if (/family|cob|coordination of benefits|discharge report/i.test(context)) return family;
  if (
    /provider|treatment plan|signature|initial assessment|\bIA\b|school information/i.test(context)
  )
    return provider;
  return null;
}

function isMonitor(
  milestone: ActionMilestone | null,
  today: string,
  action: string,
  notes: string
): boolean {
  return (
    Boolean(milestone?.date) &&
    (milestone?.date ?? '') >= today &&
    (milestone?.kind === 'submission' ||
      /^No action needed before/i.test(action) ||
      (/\b(?:scheduled|appointment|start(?:ing)?)\b/i.test(notes) &&
        !/\b(?:no|not)\b[^.;]{0,50}\b(?:scheduled|appointment|start(?:ing)?)\b/i.test(notes)))
  );
}

function selectAction(
  input: ActionModelInput,
  milestone: ActionMilestone | null,
  today: string,
  notes: string
): Selection {
  const { opp, blocker, action, milestoneOwner } = input;
  const stage = actionModelText([opp.StageName].find(Boolean) ?? opp.Current_SLA__r?.Stage__c);
  const csm = actionModelText(opp.CSM__c) || 'CSM';
  const context = `${blocker} ${action}`;
  const fallback = {
    actionType: 'Salesforce Update',
    actionOwner: actionOwnerFromText(action, 'Intake'),
  };
  if (
    /close (?:or )?discharge|close the Opportunity|discharge the Opportunity|withdrawn.*family decision/i.test(
      context
    )
  )
    return { actionType: 'Close / Discharge', actionOwner: 'Intake' };
  if (isMonitor(milestone, today, action, notes))
    return {
      actionType: 'Monitor',
      actionOwner:
        [milestoneOwner].find(Boolean) ??
        (/^No action needed before/i.test(action) ? csm : actionOwnerFromText(action, csm)),
    };
  if (/provider assignment|reassign/i.test(context)) return fallback;
  if (/advance the Opportunity|correct the stage|stage not advanced/i.test(context))
    return fallback;
  if (/authorization|insurance|payer|\bauth\b|verification/i.test(`${blocker} ${stage}`))
    return { actionType: 'Insurance Follow-Up', actionOwner: 'Insurance Ops' };
  if (/clinical review/i.test(context))
    return { actionType: 'Clinical Review', actionOwner: 'Clinical Quality' };
  return outreachSelection(blocker, action, csm) ?? fallback;
}

function followUp(
  type: string,
  notes: string,
  milestone: ActionMilestone | null,
  today: string,
  asOf: ActionDate
): Pick<IntakeActionModel, 'followUpDate' | 'followUpDateBasis'> {
  const explicit = actionExplicitFollowUpDate(notes, asOf);
  if (type === 'No Action') return { followUpDate: '', followUpDateBasis: 'Not Applicable' };
  if (explicit && explicit >= today)
    return { followUpDate: explicit, followUpDateBasis: 'Explicit' };
  if (type === 'Monitor' && milestone?.date && milestone.date >= today)
    return {
      followUpDate:
        milestone.kind === 'submission' ? actionNextBusinessDay(milestone.date) : milestone.date,
      followUpDateBasis:
        milestone.kind === 'submission'
          ? 'Recommended'
          : ([milestone.basis].find(Boolean) ?? 'Explicit'),
    };
  return { followUpDate: actionNextBusinessDay(asOf), followUpDateBasis: 'Recommended' };
}

/** Existing report action projection; Salesforce Update is a recommendation, never a write. */
export function deriveActionModel(input: ActionModelInput): IntakeActionModel {
  const {
    evidenceText = '',
    milestoneDateOverride = '',
    milestoneDateBasis = 'Recommended',
    asOf = new Date(),
  } = input;
  const notes = actionModelText(evidenceText);
  const milestone: ActionMilestone | null = milestoneDateOverride
    ? { kind: 'event', date: milestoneDateOverride, basis: milestoneDateBasis }
    : actionMilestoneDate(notes, asOf);
  const today = actionIsoDate(asOf);
  const selected = selectAction(input, milestone, today, notes);
  const actionType =
    /^No action needed before/i.test(input.action) && !milestone?.date
      ? 'No Action'
      : selected.actionType;
  return { ...selected, actionType, ...followUp(actionType, notes, milestone, today, asOf) };
}
