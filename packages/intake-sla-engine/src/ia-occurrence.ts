import { assessBillingClaims } from './billing-claims.js';
import type { BillingState } from './billing-types.js';
import { isoDate, nextBusinessDay, toDate } from './dates.js';
import type { DateValue } from './dates.js';
import type {
  AssessmentAppointment,
  AssessmentOpportunity,
  AssessmentProviderEvent,
  IaOccurrence,
  IaOccurrenceInput,
} from './ia-occurrence-types.js';

const SALESFORCE_UPDATE = 'Salesforce Update';
const PROVIDER_OUTREACH = 'Provider Outreach';

function instant(date: DateValue): number {
  return toDate(date)?.valueOf() ?? Number.NaN;
}
function futureOrToday(date: DateValue, asOf: string): boolean {
  return instant(date) >= instant(isoDate(asOf));
}
function past(date: DateValue, asOf: string): boolean {
  return instant(date) < instant(isoDate(asOf));
}

function billingOccurrence(billing: BillingState, asOf: string): IaOccurrence | null {
  if (
    billing.reviewReasons.length === 0 &&
    billing.gaps.length === 0 &&
    billing.outstanding.length === 0
  )
    return null;
  const reasons = [...billing.reviewReasons, ...billing.gaps];
  if (reasons.length === 0 && billing.nextScheduledAssessment !== null) {
    const date = billing.nextScheduledAssessment.serviceDate;
    return {
      completionState:
        billing.firstAssessment === null ? 'Scheduled' : 'Assessment Sessions Outstanding',
      plannedMilestone: date,
      evidenceQuality: 'Direct',
      readyToCopy: 'Yes',
      actionType: 'Monitor',
      owner: 'CSM',
      followUpDate: date,
      reason: `Linked Billing / Claims schedules the next assessment session for ${String(date)}; monitor the scheduled session without inferring whole-assessment completion.`,
    };
  }
  return {
    completionState:
      reasons.length > 0 ? 'Billing Reconciliation Review' : 'Assessment Sessions Outstanding',
    plannedMilestone: null,
    evidenceQuality: 'Direct',
    readyToCopy: 'Review',
    actionType: reasons.length > 0 ? SALESFORCE_UPDATE : PROVIDER_OUTREACH,
    owner: 'CSM',
    followUpDate: nextBusinessDay(asOf),
    reason:
      reasons.join('; ') ||
      'An active assessment session lacks explicit completion; preserve any completed-session evidence without asserting whole-assessment completion.',
  };
}

function opportunityOccurrence(
  opportunity: AssessmentOpportunity,
  asOf: string
): IaOccurrence | null {
  if (opportunity.iaCompletedDate || opportunity.IA_Completed_Date__c) {
    return {
      completionState: 'Assessment Start Recorded',
      plannedMilestone: null,
      evidenceQuality: 'Direct',
      readyToCopy: 'Review',
      actionType: 'Monitor',
      owner: 'CSM',
      followUpDate: nextBusinessDay(asOf),
      reason: `Salesforce records the 97151 Started Date as ${String(isoDate([opportunity.iaCompletedDate, opportunity.IA_Completed_Date__c].find(Boolean)))}; the date alone does not establish whole-assessment completion or a stage error.`,
    };
  }
  if (!opportunity.iaScheduledFor) return null;
  const date = isoDate(opportunity.iaScheduledFor);
  if (futureOrToday(opportunity.iaScheduledFor, asOf)) {
    return {
      completionState: 'Scheduled',
      plannedMilestone: date,
      evidenceQuality: 'Direct',
      readyToCopy: 'Yes',
      actionType: 'Monitor',
      owner: 'CSM',
      followUpDate: date,
      reason: `Salesforce schedules the initial assessment for ${String(date)}.`,
    };
  }
  return {
    completionState: 'Planned Date Passed - Completion Unconfirmed',
    plannedMilestone: date,
    evidenceQuality: 'Direct',
    readyToCopy: 'Review',
    actionType: PROVIDER_OUTREACH,
    owner: 'CSM',
    followUpDate: nextBusinessDay(asOf),
    reason: `Salesforce scheduled the initial assessment for ${String(date)}, but structured completion is not recorded.`,
  };
}

function completedOccurrence(
  appointments: readonly AssessmentAppointment[],
  asOf: string
): IaOccurrence | null {
  const day = isoDate(asOf);
  const completed = appointments
    .filter((appointment) => {
      const serviceDate = isoDate(appointment.serviceDate);
      return (
        appointment.qualifyingAssessment &&
        appointment.status === 'Completed' &&
        serviceDate !== null &&
        day !== null &&
        serviceDate <= day
      );
    })
    .sort((a, b) => instant(a.serviceDate) - instant(b.serviceDate))[0];
  if (completed === undefined) return null;
  return {
    completionState: 'Completed Assessment Session - Lifecycle Verification Required',
    plannedMilestone: null,
    evidenceQuality: 'Direct',
    readyToCopy: 'Review',
    actionType: SALESFORCE_UPDATE,
    owner: 'Intake Ops',
    followUpDate: nextBusinessDay(asOf),
    reason: `${[completed.source].find(Boolean) ?? 'Linked Billing / Claims'} confirms a completed assessment session on ${String(isoDate(completed.serviceDate))}, not whole-assessment completion by itself.`,
  };
}

function reportedOccurrence(
  events: readonly AssessmentProviderEvent[],
  asOf: string
): IaOccurrence | null {
  const reported = events
    .filter(
      (event) =>
        event.kind === 'IA_REPORTED_COMPLETED' && ['Direct', 'Likely'].includes(event.matchQuality)
    )
    .sort((a, b) => instant(b.eventDate) - instant(a.eventDate))[0];
  if (reported === undefined) return null;
  return {
    completionState: 'Likely Completed - Verification Required',
    plannedMilestone: null,
    evidenceQuality: 'Likely',
    readyToCopy: 'Review',
    actionType: SALESFORCE_UPDATE,
    owner: 'CSM',
    followUpDate: nextBusinessDay(asOf),
    reason: `Provider reported the IA occurred on ${String(isoDate(reported.reportedOccurrenceDate ?? reported.eventDate))}, but Salesforce and linked billing/claims do not confirm completion.`,
  };
}

function scheduledOccurrence(
  appointments: readonly AssessmentAppointment[],
  asOf: string
): IaOccurrence | null {
  const appointment = appointments
    .filter(
      (item) =>
        item.qualifyingAssessment &&
        item.status === 'Active' &&
        futureOrToday(item.serviceDate, asOf)
    )
    .sort((a, b) => instant(a.serviceDate) - instant(b.serviceDate))[0];
  if (appointment === undefined) return null;
  const date = isoDate(appointment.serviceDate);
  return {
    completionState: 'Scheduled',
    plannedMilestone: date,
    evidenceQuality: 'Direct',
    readyToCopy: 'Yes',
    actionType: 'Monitor',
    owner: 'CSM',
    followUpDate: date,
    reason: `${[appointment.source].find(Boolean) ?? 'Linked Billing / Claims'} shows the IA scheduled for ${String(date)}.`,
  };
}

function providerPlanOccurrence(
  events: readonly AssessmentProviderEvent[],
  asOf: string
): IaOccurrence | null {
  const plan = events
    .filter(
      (event) =>
        event.kind === 'IA_PLANNED' &&
        Boolean(event.plannedDate) &&
        ['Direct', 'Likely'].includes(event.matchQuality)
    )
    .sort((a, b) => instant(b.eventDate) - instant(a.eventDate))[0];
  if (plan === undefined || !futureOrToday(plan.plannedDate, asOf)) return null;
  const date = isoDate(plan.plannedDate);
  return {
    completionState: 'Provider Plan',
    plannedMilestone: date,
    evidenceQuality: 'Likely',
    readyToCopy: 'Yes',
    actionType: 'Monitor',
    owner: 'CSM',
    followUpDate: date,
    reason: `Provider committed to an IA date of ${String(date)}; Salesforce and linked billing/claims do not yet confirm the appointment.`,
  };
}

function passedPlanOccurrence(
  appointments: readonly AssessmentAppointment[],
  events: readonly AssessmentProviderEvent[],
  asOf: string
): IaOccurrence | null {
  const passed = [...appointments, ...events]
    .filter((event) => {
      const date = event.serviceDate ?? event.plannedDate;
      return Boolean(date) && past(date, asOf);
    })
    .sort(
      (a, b) => instant(b.serviceDate ?? b.plannedDate) - instant(a.serviceDate ?? a.plannedDate)
    )[0];
  if (passed === undefined) return null;
  const date = isoDate(passed.serviceDate ?? passed.plannedDate);
  return {
    completionState: 'Planned Date Passed - Completion Unconfirmed',
    plannedMilestone: date,
    evidenceQuality: appointments.some((item) => item === passed) ? 'Direct' : 'Likely',
    readyToCopy: 'Review',
    actionType: PROVIDER_OUTREACH,
    owner: 'CSM',
    followUpDate: nextBusinessDay(asOf),
    reason: `The planned IA date of ${String(date)} passed without structured completion evidence.`,
  };
}

export function resolveIaOccurrence({
  asOf = new Date().toISOString(),
  opportunity = {},
  billingClaimAppointments = [],
  billingCoverageComplete = false,
  alohaAppointments = [],
  providerEvents = [],
}: IaOccurrenceInput): IaOccurrence {
  const billing = assessBillingClaims({
    appointments: billingClaimAppointments,
    opportunity,
    asOf,
    coverageComplete: billingCoverageComplete,
  });
  const appointments =
    billingClaimAppointments.length > 0 ? billing.appointments : alohaAppointments;
  return (
    billingOccurrence(billing, asOf) ??
    opportunityOccurrence(opportunity, asOf) ??
    completedOccurrence(appointments, asOf) ??
    reportedOccurrence(providerEvents, asOf) ??
    scheduledOccurrence(appointments, asOf) ??
    providerPlanOccurrence(providerEvents, asOf) ??
    passedPlanOccurrence(appointments, providerEvents, asOf) ?? {
      completionState: 'No Committed IA Milestone',
      plannedMilestone: null,
      evidenceQuality: 'Missing',
      readyToCopy: 'Review',
      actionType: PROVIDER_OUTREACH,
      owner: 'CSM',
      followUpDate: nextBusinessDay(asOf),
      reason: 'No committed IA date or completion evidence was found.',
    }
  );
}
