import { z } from 'zod';

import {
  availableAtCutoff,
  billingCutoff,
  firstText,
  normalizeBillingClaimAppointments,
} from './billing-normalization.js';
import type {
  BillingAppointment,
  BillingAssessmentInput,
  BillingOpportunity,
  BillingState,
  SelectedBillingAppointment,
} from './billing-types.js';
import { isoDate } from './dates.js';

const currentContractShape = z.array(
  z.object({
    reviewReasons: z.array(z.unknown()),
    explicitCompleted: z.boolean(),
    completed: z.boolean(),
    active: z.boolean(),
  })
);

function earliest(rows: readonly BillingAppointment[]): BillingAppointment | null {
  return (
    [...rows].sort(
      (a, b) =>
        String(a.serviceDate).localeCompare(String(b.serviceDate)) ||
        String(a.billingClaimId).localeCompare(String(b.billingClaimId))
    )[0] ?? null
  );
}

interface AssessmentState {
  readonly treatments: readonly BillingAppointment[];
  readonly activeCompleted: readonly BillingAppointment[];
  readonly firstAssessment: BillingAppointment | null;
  readonly firstTreatment: BillingAppointment | null;
  readonly outstanding: readonly BillingAppointment[];
  readonly nextScheduledAssessment: BillingAppointment | null;
  readonly pastUnverifiedAssessment: BillingAppointment | null;
  readonly transitionSupported: boolean;
}

function assessmentState(
  appointments: readonly BillingAppointment[],
  day: string,
  coverageComplete: boolean
): AssessmentState {
  const assessments = appointments.filter((row) => row.qualifyingAssessment);
  const treatments = appointments.filter((row) => row.qualifyingTreatment);
  const outstanding = assessments.filter((row) => row.active && !row.explicitCompleted);
  const nextScheduledAssessment =
    outstanding.length > 0 &&
    outstanding.every(
      (row) => row.serviceDate !== null && row.serviceDate >= day && row.reviewReasons.length === 0
    )
      ? earliest(outstanding)
      : null;
  const pastUnverifiedAssessment = earliest(
    outstanding.filter(
      (row) => row.serviceDate !== null && row.serviceDate < day && row.reviewReasons.length === 0
    )
  );
  const assessmentCompleted = assessments.filter((row) => row.assessmentSession && row.completed);
  const activeCompleted = assessmentCompleted.filter((row) => row.active);
  const firstAssessment = earliest(assessmentCompleted);
  const firstTreatment = earliest(treatments.filter((row) => row.active && row.completed));
  const transitionSupported =
    coverageComplete &&
    activeCompleted.length > 0 &&
    outstanding.length === 0 &&
    !assessments.some((row) => row.reviewReasons.length > 0 || (row.active && !row.completed));
  return {
    treatments,
    activeCompleted,
    firstAssessment,
    firstTreatment,
    outstanding,
    nextScheduledAssessment,
    pastUnverifiedAssessment,
    transitionSupported,
  };
}

function assessmentReviews(
  state: AssessmentState,
  opportunity: BillingOpportunity,
  coverageComplete: boolean
): string[] {
  const reasons: string[] = [];
  if (
    state.outstanding.length > 0 &&
    opportunity.IA_Scheduling_Status__c === 'Assessment Completed'
  ) {
    reasons.push(
      'Assessment Completed scheduling status conflicts with an incomplete active assessment session'
    );
  }
  if (state.firstAssessment !== null && !coverageComplete)
    reasons.push(
      'Completed session evidence is available, but complete linked-session coverage has not been proven'
    );
  if (state.firstAssessment !== null && state.activeCompleted.length === 0)
    reasons.push(
      'Completed inactive 97151 session evidence requires Salesforce-owner review; it does not establish the Active-only legacy catch-up transition'
    );
  if (state.treatments.some((row) => row.inactive && row.completed))
    reasons.push(
      'Completed inactive direct-care evidence requires Salesforce-owner review; it does not establish the Active-only first-treatment rule'
    );
  return reasons;
}

function milestoneReviews(
  iaDate: string | null,
  treatmentDate: string | null,
  day: string
): string[] {
  const reasons: string[] = [];
  for (const [value, label] of [
    [iaDate, '97151 Started Date'],
    [treatmentDate, 'First Day of Treatment'],
  ] as const) {
    const date = isoDate(value);
    if (value && (date === null || date > day))
      reasons.push(`Opportunity ${label} is invalid or after the frozen cutoff`);
  }
  return reasons;
}

function treatmentReviews(
  state: AssessmentState,
  treatmentDate: string | null,
  stage: string,
  coverageComplete: boolean
): string[] {
  if (state.firstTreatment === null || !treatmentDate || !coverageComplete) return [];
  const reasons: string[] = [];
  if (['TA Approved - Pending Scheduling', 'First Day of 97153 Scheduled'].includes(stage)) {
    reasons.push(
      'Completed direct-care evidence and First Day of Treatment are recorded while the Opportunity remains in treatment scheduling; Salesforce owner must verify the admission prerequisites and transition'
    );
  }
  if (isoDate(treatmentDate) !== state.firstTreatment.serviceDate) {
    reasons.push(
      'Opportunity First Day of Treatment differs from the earliest qualifying linked direct-care session; verify date provenance instead of overwriting it'
    );
  }
  return reasons;
}

function reconciliationGaps(
  state: AssessmentState,
  stage: string,
  iaDate: string | null,
  treatmentDate: string | null
): string[] {
  const gaps: string[] = [];
  if (state.transitionSupported) {
    if (!iaDate)
      gaps.push(
        'Completed 97151 session evidence and no incomplete active assessment remain, but the Opportunity 97151 Started Date is blank'
      );
    if (stage === 'IA Scheduled')
      gaps.push(
        'Completed 97151 session evidence and no incomplete active assessment remain, but the Opportunity remains IA Scheduled under the current Production transition rule'
      );
  }
  if (state.firstTreatment !== null && !treatmentDate)
    gaps.push(
      'Explicitly completed Active nonfuture direct-care evidence exists, but Opportunity First Day of Treatment is blank'
    );
  return gaps;
}

export function assessBillingClaims({
  records = [],
  appointments,
  opportunity = {},
  asOf,
  coverageComplete = false,
}: BillingAssessmentInput): BillingState {
  const cutoff = billingCutoff(asOf);
  const supplied =
    appointments ?? normalizeBillingClaimAppointments(records, asOf === undefined ? {} : { asOf });
  if (!currentContractShape.safeParse(supplied).success)
    throw new Error(
      'Billing appointments require current-contract normalization from explicit source fields'
    );
  // Eligibility applies before every aggregate, including the normalized-appointment path.
  const normalized = supplied.filter((row) => availableAtCutoff(row, cutoff.instant));
  const state = assessmentState(normalized, cutoff.day, coverageComplete);
  const stage = firstText(opportunity.StageName, opportunity.stage) ?? '';
  const iaDate = firstText(opportunity.IA_Completed_Date__c, opportunity.iaCompletedDate);
  const treatmentDate = firstText(
    opportunity.First_day_of_Treatment__c,
    opportunity.firstDayOfTreatment
  );
  const reviewReasons = normalized.flatMap((row) =>
    row.reviewReasons.map(
      (reason) => `${String(firstText(row.billingClaimId) ?? row.appointmentId)}: ${reason}`
    )
  );
  reviewReasons.push(
    ...assessmentReviews(state, opportunity, coverageComplete),
    ...milestoneReviews(iaDate, treatmentDate, cutoff.day),
    ...treatmentReviews(state, treatmentDate, stage, coverageComplete)
  );
  return {
    appointments: normalized,
    firstAssessment: state.firstAssessment,
    firstTreatment: state.firstTreatment,
    outstanding: state.outstanding,
    nextScheduledAssessment: state.nextScheduledAssessment,
    pastUnverifiedAssessment: state.pastUnverifiedAssessment,
    transitionSupported: state.transitionSupported,
    coverageComplete,
    gaps: reconciliationGaps(state, stage, iaDate, treatmentDate),
    reviewReasons: [...new Set(reviewReasons)],
  };
}

function selectSession(
  relevant: readonly BillingAppointment[],
  day: string
): BillingAppointment | null {
  const future = relevant.filter(
    (row) => row.status === 'Active' && row.serviceDate !== null && row.serviceDate >= day
  );
  const past = relevant.filter(
    (row) => row.status === 'Active' && row.serviceDate !== null && row.serviceDate < day
  );
  return (
    earliest(future) ??
    [...past].sort((a, b) => String(b.serviceDate).localeCompare(String(a.serviceDate)))[0] ??
    null
  );
}

export function selectBillingClaimAppointments(
  input: Omit<BillingAssessmentInput, 'records'>
): SelectedBillingAppointment[] {
  const state = assessBillingClaims({ ...input, appointments: input.appointments ?? [] });
  const day = billingCutoff(input.asOf).day;
  const selected = new Map<string | null | undefined, BillingAppointment>();
  const add = (row: BillingAppointment | null): void => {
    if (row !== null) selected.set(firstText(row.billingClaimId) ?? row.appointmentId, row);
  };
  for (const row of state.appointments.filter((item) => item.reviewReasons.length > 0)) add(row);
  add(state.firstAssessment);
  add(state.firstTreatment);
  for (const assessment of [true, false]) {
    const relevant = state.appointments.filter(
      (row) =>
        (assessment ? row.qualifyingAssessment : row.qualifyingTreatment) &&
        row.reviewReasons.length === 0
    );
    if ((assessment ? state.firstAssessment : state.firstTreatment) === null)
      add(earliest(relevant.filter((row) => row.completed)));
    add(selectSession(relevant, day));
    if (assessment) add(state.pastUnverifiedAssessment);
    if (!relevant.some((row) => row.status === 'Active' || row.completed)) add(earliest(relevant));
  }
  return [...selected.values()].map((row) => ({
    ...row,
    assessmentPartial: state.outstanding.length > 0,
    assessmentTransitionSupported: state.transitionSupported,
    reconciliationGaps: state.gaps,
    reconciliationReviewReasons: state.reviewReasons,
  }));
}
