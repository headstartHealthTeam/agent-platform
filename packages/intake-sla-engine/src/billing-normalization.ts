import type { BillingAppointment, BillingClaim } from './billing-types.js';
import { isoDate } from './dates.js';
import type { EvidenceDate } from './evidence.js';

export function billingCutoff(asOf?: EvidenceDate): {
  readonly day: string;
  readonly instant: number;
} {
  const day = isoDate(asOf);
  if (day === null || asOf === undefined)
    throw new Error('Billing evidence requires a valid frozen cutoff');
  return { day, instant: Date.parse(String(asOf)) };
}

export function availableAtCutoff(
  record: {
    readonly CreatedDate?: string | null | undefined;
    readonly createdDate?: string | null | undefined;
  },
  instant: number
): boolean {
  const createdAt = Date.parse(record.CreatedDate ?? record.createdDate ?? '');
  if (!Number.isFinite(createdAt)) {
    throw new Error(
      'Billing evidence requires a valid creation timestamp to establish cutoff eligibility'
    );
  }
  return createdAt <= instant;
}

export function firstText(...values: readonly (string | null | undefined)[]): string | null {
  return values.find((value) => Boolean(value)) ?? null;
}

function classification(record: BillingClaim): {
  readonly code: string;
  readonly serviceName: string;
  readonly assessment: boolean;
  readonly treatment: boolean;
} {
  const code = String(
    [
      record.Billing_Code__c,
      record.procedureCode,
      record.cptCode,
      record.serviceCode,
      record.CPT_Code__c,
    ].find((value) => Boolean(value)) ?? ''
  ).trim();
  const serviceName = firstText(record.Service_Name__c, record.serviceName) ?? '';
  return {
    code,
    serviceName,
    assessment: code === '97151' || /assessment/i.test(serviceName),
    treatment: code === '97153' || /direct care/i.test(serviceName),
  };
}

interface AppointmentFacts {
  readonly active: boolean;
  readonly inactive: boolean;
  readonly disqualified: boolean;
  readonly explicitCompleted: boolean;
  readonly serviceDate: string | null;
  readonly completedDate: string | null;
  readonly directOpportunityId: string | null;
  readonly authorizationOpportunityId: string | null;
  readonly qualifyingAssessment: boolean;
  readonly qualifyingTreatment: boolean;
}

function reviewReasons(
  facts: AppointmentFacts,
  cutoff: ReturnType<typeof billingCutoff>
): string[] {
  const reasons: string[] = [];
  if (
    facts.directOpportunityId &&
    facts.authorizationOpportunityId &&
    facts.directOpportunityId !== facts.authorizationOpportunityId
  ) {
    reasons.push(
      'Billing and Authorization point to different Opportunities; Salesforce-owner relationship review is required'
    );
  }
  if (facts.serviceDate === null) reasons.push('The linked appointment has no valid service date');
  if (facts.explicitCompleted && facts.disqualified)
    reasons.push(
      'The appointment is explicitly completed but also cancelled, deleted, void, or no-show'
    );
  if (facts.explicitCompleted && facts.serviceDate !== null && facts.serviceDate > cutoff.day)
    reasons.push(
      'The appointment is marked completed but its service date is after the frozen cutoff'
    );
  if (facts.completedDate && !facts.explicitCompleted)
    reasons.push(
      'A completion date is populated without the explicit Completed = Yes required by Production'
    );
  if (
    facts.explicitCompleted &&
    facts.completedDate &&
    (isoDate(facts.completedDate) === null || Date.parse(facts.completedDate) > cutoff.instant)
  ) {
    reasons.push('The recorded completion timestamp is invalid or after the frozen cutoff');
  }
  if (!facts.active && !facts.inactive && !facts.disqualified)
    reasons.push(
      'The appointment status does not establish Active or eligible historical completion'
    );
  if (facts.qualifyingAssessment && facts.qualifyingTreatment)
    reasons.push(
      'Billing code and service classification disagree between assessment and direct care'
    );
  return reasons;
}

function normalize(
  record: BillingClaim,
  kind: ReturnType<typeof classification>,
  cutoff: ReturnType<typeof billingCutoff>
): BillingAppointment {
  const rawStatus = (
    record.Appointment_Status__c ??
    record.status ??
    record.appointmentStatus ??
    ''
  ).trim();
  const facts: AppointmentFacts = {
    active: /^active$/i.test(rawStatus),
    inactive: /^inactive$/i.test(rawStatus),
    disqualified: /cancel|deleted|void|no[ -]?show/i.test(rawStatus),
    explicitCompleted: /^yes$/i.test((record.Completed__c ?? '').trim()),
    serviceDate: isoDate(
      firstText(
        record.Appt_Date__c,
        record.serviceDate,
        record.appointmentDate,
        record.dateOfService,
        record.Service_Date__c
      )
    ),
    completedDate: firstText(record.Completed_Date__c, record.completedDate),
    directOpportunityId: firstText(record.Client_Opportunity__c),
    authorizationOpportunityId: firstText(record.Authorization__r?.Client_Opportunity_Record__c),
    qualifyingAssessment: kind.assessment,
    qualifyingTreatment: kind.treatment,
  };
  const reasons = reviewReasons(facts, cutoff);
  const completed =
    facts.explicitCompleted &&
    facts.serviceDate !== null &&
    facts.serviceDate <= cutoff.day &&
    reasons.length === 0;
  let status: BillingAppointment['status'] = 'Active';
  if (reasons.length > 0) status = 'Review';
  else if (completed) status = 'Completed';
  else if (facts.disqualified || facts.inactive) status = 'Cancelled';
  return {
    ...facts,
    source: 'Linked Billing / Claims',
    appointmentId: firstText(record.Appointment_ID__c, record.appointmentId) ?? record.Id,
    billingClaimId: firstText(record.Id) ?? record.id,
    claimId: firstText(record.Claim_Id__c, record.claimId),
    assessmentSession: kind.code === '97151',
    completed,
    status,
    rawStatus,
    reviewReasons: reasons,
    billingCode: kind.code,
    serviceName: kind.serviceName,
    provider: firstText(
      record.Headstart_Provider_Profile__r?.Name,
      record.Rendering_Provider__c,
      record.Staff_Name__c
    ),
    rbt: firstText(record.RBT_Staffing__r?.Name),
    authorizationId: firstText(record.Authorization__c),
    createdDate: firstText(record.CreatedDate, record.createdDate),
    lastModifiedDate: firstText(record.LastModifiedDate, record.lastModifiedDate),
  };
}

export function normalizeBillingClaimAppointments(
  records: readonly BillingClaim[] = [],
  { asOf }: { readonly asOf?: EvidenceDate } = {}
): BillingAppointment[] {
  const cutoff = billingCutoff(asOf);
  return records.flatMap((record) => {
    const kind = classification(record);
    if ((!kind.assessment && !kind.treatment) || !availableAtCutoff(record, cutoff.instant))
      return [];
    return [normalize(record, kind, cutoff)];
  });
}
