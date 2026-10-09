import { assessBillingClaims, selectBillingClaimAppointments } from './billing-claims.js';
import type { BillingAppointment, BillingAssessmentInput, BillingState } from './billing-types.js';
import { isoDate, nextBusinessDay } from './dates.js';
import { createEvidenceEvent, type EvidenceDate, type EvidenceEvent } from './evidence.js';
import type { GateContext } from './gate-context.js';
import type { IdentityProfile } from './identity-profile.js';

export interface BillingEvidenceInput extends Omit<BillingAssessmentInput, 'appointments'> {
  readonly profile: Pick<IdentityProfile, 'opportunityId'> &
    Partial<Pick<IdentityProfile, 'currentCsm'>>;
  readonly asOf: EvidenceDate;
  readonly gate?: GateContext | null;
}
export interface BillingEvidenceEvent extends EvidenceEvent {
  readonly plannedDate: string | null;
}
interface Narrative {
  readonly text: string;
  readonly gateImpact: string;
  readonly actionType: string;
  readonly recommendedAction: string;
  readonly factType: string;
}
interface Context {
  readonly appointment: BillingAppointment;
  readonly state: BillingState;
  readonly owner: string;
  readonly service: string;
  readonly sourceId: string | null | undefined;
  readonly scheduled: BillingAppointment | null;
  readonly past: BillingAppointment | null;
  readonly future: boolean;
}
const SALESFORCE_UPDATE = 'Salesforce Update';
const PROVIDER_OUTREACH = 'Provider Outreach';
function textOr<T>(value: string | null | undefined, fallback: T): string | T {
  return value === null || value === undefined || value === '' ? fallback : value;
}
function ownerName(profile: BillingEvidenceInput['profile']): string {
  const csm = profile.currentCsm;
  const name: unknown = typeof csm === 'object' && csm !== null ? csm['name'] : undefined;
  const hasName = Boolean(name);
  if (!hasName) return 'CSM';
  if (typeof name !== 'string') throw new Error('Evidence action owner must be text');
  return name;
}
function serviceName(appointment: BillingAppointment): string {
  if (!appointment.qualifyingAssessment) return 'direct-care session';
  if (appointment.assessmentSession) return '97151 assessment session';
  return appointment.billingCode === '97152'
    ? 'assessment-support appointment'
    : 'assessment appointment (billing code unverified)';
}
function completedAssessment(context: Context): Narrative {
  const { appointment, state, owner, service, scheduled } = context;
  const gaps = state.gaps.filter((gap) => /assessment|97151/.test(gap));
  const remaining = state.outstanding.length;
  const text =
    `Linked Billing / Claims explicitly confirms a completed ${service} on ${String(appointment.serviceDate)}.` +
    (remaining > 0
      ? ` ${String(remaining)} active assessment session(s) still lack explicit completion; whole-assessment completion is not established.`
      : ' A completed session is distinct from whole-assessment completion.');
  return {
    text,
    gateImpact:
      remaining > 0
        ? 'Assessment work remains; preserve the completed session without advancing the whole assessment'
        : state.transitionSupported
          ? 'Complete linked-session evidence supports the current Production assessment transition'
          : 'Completed session evidence requires lifecycle verification',
    actionType:
      gaps.length > 0
        ? SALESFORCE_UPDATE
        : remaining > 0 && scheduled === null
          ? PROVIDER_OUTREACH
          : 'Monitor',
    recommendedAction:
      gaps.length > 0
        ? `${owner} to route the supported assessment reconciliation gap to the Salesforce owner: ${gaps.join('; ')}.`
        : scheduled !== null
          ? `${owner} to monitor the next assessment session scheduled for ${String(scheduled.serviceDate)}; retain the completed session as evidence without asserting whole-assessment completion.`
          : remaining > 0
            ? `${owner} to confirm the remaining assessment session plan and completion status with the provider; retain the completed session as evidence.`
            : `${owner} to verify the current assessment workflow position using the linked sessions and recorded milestone meanings.`,
    factType: remaining > 0 ? 'ia-partial' : 'ia-session-completed',
  };
}
function completedTreatment({ appointment, state, owner, service }: Context): Narrative {
  return {
    text: `Linked Billing / Claims explicitly confirms a completed ${service} on ${String(appointment.serviceDate)}.`,
    gateImpact: appointment.active
      ? 'Completed Active nonfuture direct-care evidence is available'
      : 'Completed inactive direct-care evidence requires Salesforce-owner review before a lifecycle conclusion',
    actionType: state.gaps.some((gap) => /direct-care|Treatment/.test(gap))
      ? SALESFORCE_UPDATE
      : 'Monitor',
    recommendedAction: `${owner} to verify the recorded first-service milestone and route any supported mismatch to the Salesforce owner.`,
    factType: 'treatment-session-completed',
  };
}
function unverified({ appointment, owner, service, future, past }: Context): Narrative {
  const date = String(appointment.serviceDate);
  const factType = appointment.qualifyingAssessment
    ? 'ia-session-unverified'
    : 'treatment-start-unverified';
  const text = `Linked Billing / Claims records an active ${service} dated ${date}, but does not explicitly confirm completion.`;
  if (future && past !== null)
    return {
      text: `${text} The separate active assessment session dated ${String(past.serviceDate)} also lacks explicit completion.`,
      gateImpact: `The ${String(past.serviceDate)} assessment session requires completion verification; the ${date} appointment remains scheduled`,
      actionType: PROVIDER_OUTREACH,
      recommendedAction: `${owner} to verify the ${String(past.serviceDate)} assessment session outcome with the provider while preserving the ${date} appointment; do not infer completion or a Salesforce stage error.`,
      factType,
    };
  return {
    text,
    gateImpact: future
      ? `An appointment is planned for ${date}; completion is unverified`
      : 'Past activity requires completion verification',
    actionType: future ? 'Monitor' : PROVIDER_OUTREACH,
    recommendedAction: `${owner} to ${future ? 'monitor the planned appointment and verify' : 'ask the provider to verify'} the ${date} ${service} completion or replacement date.`,
    factType,
  };
}
function narrative(context: Context): Narrative {
  const { appointment, sourceId, service, owner } = context;
  if (appointment.reviewReasons.length > 0)
    return {
      text: `Linked Billing / Claims record ${String(sourceId)} has conflicting or insufficient ${service} evidence: ${appointment.reviewReasons.join('; ')}.`,
      gateImpact: 'Completion cannot be established from this conflicting appointment',
      actionType: SALESFORCE_UPDATE,
      recommendedAction: `${owner} to route record ${String(sourceId)} to the Salesforce owner to verify the source relationship, appointment status, and actual completion date; do not infer completion.`,
      factType: 'billing-completion-review',
    };
  if (appointment.completed)
    return appointment.qualifyingAssessment
      ? completedAssessment(context)
      : completedTreatment(context);
  if (appointment.status === 'Cancelled')
    return {
      text: `Linked Billing / Claims records the ${service} dated ${String(appointment.serviceDate)} as ${appointment.rawStatus}; it does not establish completion.`,
      gateImpact: 'Verify whether replacement appointment evidence is required',
      actionType: PROVIDER_OUTREACH,
      recommendedAction: `${owner} to verify the replacement ${service} plan with the provider.`,
      factType: appointment.qualifyingAssessment ? 'ia-reschedule' : 'treatment-start-unverified',
    };
  return unverified(context);
}
function required<T extends EvidenceDate>(value: T | null | undefined, field: string): T {
  if (value === null || value === undefined || value === '')
    throw new Error(`EvidenceEvent missing ${field}`);
  return value;
}
function followUp(context: Context, asOf: EvidenceDate): string | null {
  const { appointment, scheduled, past, future } = context;
  if (appointment.reviewReasons.length > 0) return nextBusinessDay(asOf);
  if (appointment.completed && appointment.qualifyingAssessment && scheduled !== null)
    return scheduled.serviceDate;
  if (!appointment.completed && future && past === null) return appointment.serviceDate;
  return nextBusinessDay(asOf);
}
function evidence(
  context: Context,
  opportunityId: string,
  asOf: EvidenceDate
): BillingEvidenceEvent {
  const { appointment, owner, sourceId, scheduled } = context;
  const assessment = appointment.qualifyingAssessment;
  const conflict = appointment.reviewReasons.length > 0;
  return createEvidenceEvent({
    opportunityId,
    source: 'Linked Billing / Claims',
    sourceRecordId: required(sourceId, 'sourceRecordId'),
    eventDate: required(
      appointment.completed
        ? appointment.serviceDate
        : textOr(appointment.lastModifiedDate, textOr(appointment.createdDate, asOf)),
      'eventDate'
    ),
    category: assessment ? 'intakeScheduling' : 'rbt',
    ...narrative(context),
    matchQuality: 'Direct',
    substantive: true,
    relationship: conflict ? 'Conflicts' : 'Supports',
    actionOwner: owner,
    processRelevance: conflict || appointment.completed ? 13 : 10,
    issueKey: conflict
      ? `billing-review:${String(sourceId)}`
      : assessment
        ? 'initial-assessment'
        : 'treatment-start',
    milestoneDate: conflict ? null : appointment.serviceDate,
    plannedDate:
      !conflict && appointment.completed && assessment ? (scheduled?.serviceDate ?? null) : null,
    followUpDate: followUp(context, asOf),
  });
}
/** Preserve completed sessions, outstanding work and owner-review exceptions from the approved billing resolver. */
export function adaptBillingClaims({
  profile,
  asOf,
  ...input
}: BillingEvidenceInput): BillingEvidenceEvent[] {
  const assessmentInput = {
    asOf,
    ...(input.opportunity === undefined ? {} : { opportunity: input.opportunity }),
    ...(input.coverageComplete === undefined ? {} : { coverageComplete: input.coverageComplete }),
  };
  const state = assessBillingClaims({
    ...assessmentInput,
    ...(input.records === undefined ? {} : { records: input.records }),
  });
  const scheduled =
    state.reviewReasons.length === 0 && state.gaps.length === 0
      ? state.nextScheduledAssessment
      : null;
  const selected = selectBillingClaimAppointments({
    appointments: state.appointments,
    ...assessmentInput,
  });
  if (selected.length === 0) return [];
  const owner = ownerName(profile);
  const day = isoDate(asOf);
  return selected.map((appointment) =>
    evidence(
      {
        appointment,
        state,
        owner,
        service: serviceName(appointment),
        sourceId: textOr(appointment.billingClaimId, appointment.appointmentId),
        scheduled,
        past: appointment.qualifyingAssessment ? state.pastUnverifiedAssessment : null,
        future: appointment.serviceDate !== null && day !== null && appointment.serviceDate >= day,
      },
      profile.opportunityId,
      asOf
    )
  );
}
