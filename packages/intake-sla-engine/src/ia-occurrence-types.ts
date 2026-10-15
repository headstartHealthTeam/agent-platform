import type { BillingAppointment, BillingOpportunity } from './billing-types.js';

export interface AssessmentAppointment {
  readonly qualifyingAssessment?: boolean;
  readonly status?: string;
  readonly source?: string | null;
  readonly serviceDate?: string | null;
  readonly plannedDate?: string | null;
}
export interface AssessmentProviderEvent {
  readonly kind: string;
  readonly matchQuality: string;
  readonly eventDate: string;
  readonly reportedOccurrenceDate?: string | null;
  readonly plannedDate?: string | null;
  readonly serviceDate?: string | null;
}
export interface AssessmentOpportunity extends BillingOpportunity {
  readonly iaScheduledFor?: string | null;
}
export interface IaOccurrenceInput {
  readonly asOf?: string;
  readonly opportunity?: AssessmentOpportunity;
  readonly billingClaimAppointments?: readonly BillingAppointment[];
  readonly billingCoverageComplete?: boolean;
  readonly alohaAppointments?: readonly AssessmentAppointment[];
  readonly providerEvents?: readonly AssessmentProviderEvent[];
}
export interface IaOccurrence {
  readonly completionState: string;
  readonly plannedMilestone: string | null;
  readonly evidenceQuality: 'Direct' | 'Likely' | 'Missing';
  readonly readyToCopy: 'Yes' | 'Review';
  readonly actionType: 'Monitor' | 'Salesforce Update' | 'Provider Outreach';
  readonly owner: 'CSM' | 'Intake Ops';
  readonly followUpDate: string | null;
  readonly reason: string;
}
