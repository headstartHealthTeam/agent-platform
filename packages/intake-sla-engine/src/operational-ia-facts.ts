import { nextBusinessDay } from './dates.js';
import { hasOperationalText as has } from './operational-fact-context.js';
import type { OperationalFactContext } from './operational-fact-context.js';
import { iaSignals } from './operational-ia-signals.js';
import type { IaSignals } from './operational-ia-signals.js';
const PROVIDER_OUTREACH = 'Provider Outreach';
const IA_OUTREACH = 'ia-scheduling-outreach';
function addInboundMeeting(context: OperationalFactContext, signals: IaSignals): boolean {
  const { value, asOf, add } = context;
  const { inboundFamilyProviderMeeting } = signals;
  if (!inboundFamilyProviderMeeting) return false;
  add({
    type: 'ia-family-consult-planned',
    summary: has(value, /\b(?:provider|bcba)\b/)
      ? 'The family reports a meeting with the assigned provider is planned for next week, but the source does not establish an exact date or confirm that the meeting is the initial assessment.'
      : 'The family reports a meeting is planned for next week, but the source does not identify its purpose, an exact date, or whether it is the initial assessment.',
    gateImpact: 'A family-reported meeting is planned, but the IA appointment remains unconfirmed',
    owner: 'CSM',
    actionType: PROVIDER_OUTREACH,
    action:
      'CSM to confirm the meeting purpose and exact date and document the committed initial-assessment appointment.',
    relevance: 12,
    kind: 'IA_PRECURSOR_CONSULT',
    milestoneDate: null,
    followUpDate: nextBusinessDay(asOf),
  });
  return true;
}
function addFamilyConsult(context: OperationalFactContext, signals: IaSignals): boolean {
  const { date, datePassed, asOf, add } = context;
  const dateLabel = String(date);
  const { familyConsultBeforeIa } = signals;
  if (!familyConsultBeforeIa) return false;
  add({
    type: 'ia-family-consult-planned',
    summary: date
      ? `The provider planned a family consult for ${dateLabel} before the assigned provider schedules the initial assessment; no IA date is committed.`
      : 'The provider planned a family consult before the assigned provider schedules the initial assessment; no IA date is committed.',
    gateImpact: 'Provider-family consult precedes IA scheduling; no committed IA date is confirmed',
    owner: 'CSM',
    actionType: datePassed ? PROVIDER_OUTREACH : 'Monitor',
    action: datePassed
      ? `CSM to confirm whether the ${dateLabel} family consult occurred and obtain the assigned provider's committed IA date.`
      : `CSM to monitor the family consult planned for ${dateLabel} and obtain the assigned provider's committed IA date afterward.`,
    relevance: 11,
    kind: 'IA_PRECURSOR_CONSULT',
    milestoneDate: date,
    followUpDate: datePassed ? nextBusinessDay(asOf) : date,
  });
  return true;
}
function addUnderway(context: OperationalFactContext, signals: IaSignals): boolean {
  const { add } = context;
  const { iaUnderway, needsAlohaProviderSetup, explicitIaCompletion } = signals;
  if (!(iaUnderway && !explicitIaCompletion)) return false;
  add({
    type: 'ia-underway',
    summary: needsAlohaProviderSetup
      ? 'The provider reports the initial assessment has started and treatment-plan work is underway, but provider setup in Aloha and structured IA completion remain unresolved.'
      : 'The provider reports the initial assessment has started, but structured completion is not yet confirmed.',
    gateImpact: needsAlohaProviderSetup
      ? 'Initial assessment is underway; provider setup and structured completion remain unresolved'
      : 'Initial assessment is underway but completion remains unconfirmed',
    owner: 'CSM',
    actionType: needsAlohaProviderSetup ? 'Salesforce Update' : PROVIDER_OUTREACH,
    action: needsAlohaProviderSetup
      ? 'CSM to complete the provider setup needed for Aloha synchronization and verify the IA completion date in Salesforce.'
      : 'CSM to confirm what remains for the IA, obtain the expected completion date, and verify completion in Salesforce or linked billing.',
    relevance: 11,
  });
  return true;
}
function addIncomplete(context: OperationalFactContext, signals: IaSignals): boolean {
  const { add } = context;
  const { explicitIaIncomplete } = signals;
  if (!explicitIaIncomplete) return false;
  add({
    type: 'ia-incomplete',
    summary:
      'The provider reported that the initial assessment is underway but has not been completed.',
    gateImpact: 'Initial assessment remains incomplete',
    owner: 'CSM',
    actionType: PROVIDER_OUTREACH,
    action:
      'CSM to confirm what remains for the IA, obtain a committed completion date, and verify completion in Salesforce or linked billing.',
    relevance: 10,
  });
  return true;
}
function addReportedCompletion(context: OperationalFactContext, signals: IaSignals): boolean {
  const { add } = context;
  const { explicitIaCompletion } = signals;
  if (!explicitIaCompletion) return false;
  add({
    type: 'ia-completed',
    summary:
      'The provider reported that the initial assessment occurred, but Salesforce or linked billing still needs to confirm the completion date.',
    gateImpact: 'Provider-reported IA completion requires structured verification',
    owner: 'CSM',
    actionType: 'Salesforce Update',
    action: 'CSM to verify the IA occurrence date and correct Salesforce.',
    relevance: 10,
    kind: 'IA_REPORTED_COMPLETED',
  });
  return true;
}
function addExpectedStep(context: OperationalFactContext, signals: IaSignals): boolean {
  const { date, datePassed, asOf, add } = context;
  const dateLabel = String(date);
  const { providerExpectedIaStep } = signals;
  if (!providerExpectedIaStep) return false;
  add({
    type: 'ia-planned-unconfirmed',
    summary: datePassed
      ? `The initial-assessment step was planned for ${dateLabel}, but no structured completion is recorded.`
      : `The initial-assessment step is planned for ${dateLabel}; structured scheduling or completion is not yet confirmed.`,
    gateImpact: datePassed
      ? `Expected IA step on ${dateLabel} passed without confirmation`
      : `Provider expects an IA step on ${dateLabel}`,
    owner: 'CSM',
    actionType: datePassed ? PROVIDER_OUTREACH : 'Monitor',
    action: datePassed
      ? `CSM to verify whether the ${dateLabel} IA step occurred and record the completion or replacement date.`
      : `CSM to monitor the ${dateLabel} IA step and verify completion in Salesforce or linked billing.`,
    milestoneDate: date,
    followUpDate: datePassed ? nextBusinessDay(asOf) : date,
    relevance: 10,
  });
  return true;
}
function addPlannedAssessment(context: OperationalFactContext, signals: IaSignals): boolean {
  const { value, date, datePassed, asOf, add } = context;
  const dateLabel = String(date);
  const { currentSlaContactAttempt } = signals;
  if (!(
    !currentSlaContactAttempt &&
    has(
      value,
      /\b(initial assessment|assessment|97151|\bia\b).{0,100}\b(schedule|scheduled|set up|set for|appointment|appt|plan(?:ned)?)\b/
    ) &&
    date
  ))
    return false;
  const tentative = has(value, /\b(tentative|tentatively|potential|possible|proposed)\b/);
  add({
    type: 'ia-planned',
    summary: datePassed
      ? `The provider's ${tentative ? 'tentative ' : ''}initial assessment date of ${dateLabel} passed without structured completion evidence.`
      : tentative
        ? `The provider tentatively planned the initial assessment for ${dateLabel}; the appointment is not yet confirmed in Salesforce.`
        : `The provider committed to an initial assessment date of ${dateLabel}; structured scheduling or completion is not yet confirmed.`,
    gateImpact: datePassed
      ? `${tentative ? 'Tentative' : 'Planned'} IA date of ${dateLabel} passed; completion remains unconfirmed`
      : tentative
        ? `Provider tentatively planned an IA date of ${dateLabel}`
        : `Provider committed to an IA date of ${dateLabel}`,
    owner: 'CSM',
    actionType: datePassed ? PROVIDER_OUTREACH : 'Monitor',
    action: datePassed
      ? `CSM to verify whether the ${dateLabel} IA occurred and record the completion or replacement date.`
      : `CSM to monitor the IA planned for ${dateLabel} and verify completion in Salesforce or linked billing.`,
    relevance: 10,
    kind: 'IA_PLANNED',
    plannedDate: date,
    milestoneDate: date,
    followUpDate: datePassed ? nextBusinessDay(asOf) : date,
  });
  return true;
}
function addObservation(context: OperationalFactContext, signals: IaSignals): boolean {
  const { date, datePassed, asOf, add } = context;
  const dateLabel = String(date);
  const { providerObservationPlanned } = signals;
  if (!providerObservationPlanned) return false;
  add({
    type: 'ia-observation-planned',
    summary: date
      ? `The provider planned an in-person observation for ${dateLabel}, but the initial-assessment appointment and completion remain unconfirmed.`
      : 'The provider planned an in-person observation, but the initial-assessment appointment and completion remain unconfirmed.',
    gateImpact: 'Provider observation is planned before IA completion can be confirmed',
    owner: 'CSM',
    actionType: datePassed ? PROVIDER_OUTREACH : 'Monitor',
    action: datePassed
      ? `CSM to confirm whether the ${dateLabel} observation occurred and document the IA appointment or completion date.`
      : 'CSM to confirm the observation date and document the committed IA appointment and completion plan.',
    milestoneDate: date,
    followUpDate: datePassed ? nextBusinessDay(asOf) : date,
    relevance: 11,
  });
  return true;
}
function addDeferredWindow(context: OperationalFactContext, signals: IaSignals): boolean {
  const { asOf, add } = context;
  const { deferredIaWindow, exactDeferredIaDate } = signals;
  if (!deferredIaWindow) return false;
  add({
    type: 'ia-deferred-window',
    summary: exactDeferredIaDate
      ? `The provider and family are targeting ${exactDeferredIaDate} for the initial-assessment step, but the appointment is not confirmed in Salesforce.`
      : 'The provider and family agreed to defer the initial assessment to a later window, but no exact appointment date is confirmed.',
    gateImpact: 'Initial assessment is deferred without a confirmed appointment',
    owner: 'CSM',
    actionType: exactDeferredIaDate ? 'Monitor' : PROVIDER_OUTREACH,
    action: exactDeferredIaDate
      ? `CSM to confirm the ${exactDeferredIaDate} IA appointment is entered and verify completion afterward.`
      : 'CSM to obtain the exact IA appointment date from the provider and family and confirm it is recorded in Salesforce.',
    milestoneDate: exactDeferredIaDate,
    followUpDate: exactDeferredIaDate ?? nextBusinessDay(asOf),
    relevance: 11,
  });
  return true;
}
function addFamilyHandoff(context: OperationalFactContext, signals: IaSignals): boolean {
  const { add } = context;
  const { familyResponseProviderHandoff } = signals;
  if (!familyResponseProviderHandoff) return false;
  add({
    type: IA_OUTREACH,
    summary:
      'The family responded and Intake contacted the provider, but no committed initial-assessment date is confirmed.',
    gateImpact: 'Family contact is restored; provider scheduling remains unconfirmed',
    owner: 'CSM',
    actionType: PROVIDER_OUTREACH,
    action:
      "CSM to obtain the provider's committed initial-assessment date and confirm it is recorded in Salesforce.",
    relevance: 11,
  });
  return true;
}
function addCoordination(context: OperationalFactContext, signals: IaSignals): boolean {
  const { add } = context;
  const { iaSchedulingCoordination } = signals;
  if (!iaSchedulingCoordination) return false;
  add({
    type: IA_OUTREACH,
    summary:
      'The provider is coordinating with the family to schedule the initial assessment, but no committed IA date is confirmed.',
    gateImpact: 'Initial-assessment scheduling is underway with no confirmed date',
    owner: 'CSM',
    actionType: PROVIDER_OUTREACH,
    action:
      'CSM to obtain the committed initial-assessment date from the provider and family and confirm it is recorded in Salesforce.',
    relevance: 11,
  });
  return true;
}
function addOutreach(context: OperationalFactContext, signals: IaSignals): boolean {
  const { add } = context;
  const { iaSchedulingOutreach, currentSlaContactAttempt } = signals;
  if (!(iaSchedulingOutreach || currentSlaContactAttempt)) return false;
  add({
    type: IA_OUTREACH,
    summary:
      'Family contact and initial-assessment scheduling outreach are underway, but no committed IA date is confirmed.',
    gateImpact: 'Initial-assessment scheduling outreach is ongoing with no confirmed date',
    owner: 'CSM',
    actionType: PROVIDER_OUTREACH,
    action:
      'CSM to obtain a committed initial-assessment date from the provider and confirm it is recorded in Salesforce.',
    relevance: 10,
  });
  return true;
}
function addReschedule(context: OperationalFactContext): void {
  const { value, add } = context;
  if (
    has(
      value,
      /\b(cancel|cancelled|canceled|reschedule|rescheduled|out of town|couldn t make|could not make)\b/
    ) &&
    has(value, /\b(assessment|97151|\bia\b|appointment)\b/)
  ) {
    add({
      type: 'ia-reschedule',
      summary:
        'The planned initial assessment was canceled or needs to be rescheduled; no replacement date is confirmed.',
      gateImpact: 'Initial assessment must be rescheduled',
      owner: 'CSM',
      actionType: PROVIDER_OUTREACH,
      action: 'CSM to confirm a replacement IA date with the provider and family.',
      relevance: 10,
    });
  }
}
export function addIaOperationalFacts(context: OperationalFactContext): void {
  if (context.category !== 'intakeScheduling') return;
  const signals = iaSignals(context);
  const rules = [
    addInboundMeeting,
    addFamilyConsult,
    addUnderway,
    addIncomplete,
    addReportedCompletion,
    addExpectedStep,
    addPlannedAssessment,
    addObservation,
    addDeferredWindow,
    addFamilyHandoff,
    addCoordination,
    addOutreach,
  ];
  for (const rule of rules) {
    if (rule(context, signals)) break;
  }
  addReschedule(context);
}
