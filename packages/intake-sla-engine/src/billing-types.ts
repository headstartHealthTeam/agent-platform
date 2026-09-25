import type { EvidenceDate } from './evidence.js';

export interface BillingClaim {
  readonly Id?: string | null | undefined;
  readonly id?: string | null | undefined;
  readonly Appointment_ID__c?: string | null | undefined;
  readonly appointmentId?: string | null | undefined;
  readonly Billing_Code__c?: string | number | null | undefined;
  readonly procedureCode?: string | number | null | undefined;
  readonly cptCode?: string | number | null | undefined;
  readonly serviceCode?: string | number | null | undefined;
  readonly CPT_Code__c?: string | number | null | undefined;
  readonly Service_Name__c?: string | null | undefined;
  readonly serviceName?: string | null | undefined;
  readonly Appointment_Status__c?: string | null | undefined;
  readonly status?: string | null | undefined;
  readonly appointmentStatus?: string | null | undefined;
  readonly Completed__c?: string | null | undefined;
  readonly Appt_Date__c?: string | null | undefined;
  readonly serviceDate?: string | null | undefined;
  readonly appointmentDate?: string | null | undefined;
  readonly dateOfService?: string | null | undefined;
  readonly Service_Date__c?: string | null | undefined;
  readonly Completed_Date__c?: string | null | undefined;
  readonly completedDate?: string | null | undefined;
  readonly Client_Opportunity__c?: string | null | undefined;
  readonly Authorization__r?:
    { readonly Client_Opportunity_Record__c?: string | null | undefined } | null | undefined;
  readonly Claim_Id__c?: string | null | undefined;
  readonly claimId?: string | null | undefined;
  readonly Headstart_Provider_Profile__r?:
    { readonly Name?: string | null | undefined } | null | undefined;
  readonly Rendering_Provider__c?: string | null | undefined;
  readonly Staff_Name__c?: string | null | undefined;
  readonly RBT_Staffing__r?: { readonly Name?: string | null | undefined } | null | undefined;
  readonly Authorization__c?: string | null | undefined;
  readonly CreatedDate?: string | null | undefined;
  readonly createdDate?: string | null | undefined;
  readonly LastModifiedDate?: string | null | undefined;
  readonly lastModifiedDate?: string | null | undefined;
}

export interface BillingAppointment {
  readonly source: 'Linked Billing / Claims';
  readonly appointmentId: string | null | undefined;
  readonly billingClaimId: string | null | undefined;
  readonly claimId: string | null;
  readonly qualifyingAssessment: boolean;
  readonly qualifyingTreatment: boolean;
  readonly assessmentSession: boolean;
  readonly active: boolean;
  readonly inactive: boolean;
  readonly explicitCompleted: boolean;
  readonly completed: boolean;
  readonly disqualified: boolean;
  readonly reviewReasons: readonly string[];
  readonly status: 'Review' | 'Completed' | 'Cancelled' | 'Active';
  readonly rawStatus: string;
  readonly serviceDate: string | null;
  readonly billingCode: string;
  readonly serviceName: string;
  readonly provider: string | null;
  readonly rbt: string | null;
  readonly authorizationId: string | null;
  readonly directOpportunityId: string | null;
  readonly authorizationOpportunityId: string | null;
  readonly createdDate: string | null;
  readonly lastModifiedDate: string | null;
  readonly completedDate: string | null;
}

export interface BillingOpportunity {
  readonly StageName?: string | null | undefined;
  readonly stage?: string | null | undefined;
  readonly IA_Completed_Date__c?: string | null | undefined;
  readonly iaCompletedDate?: string | null | undefined;
  readonly First_day_of_Treatment__c?: string | null | undefined;
  readonly firstDayOfTreatment?: string | null | undefined;
  readonly IA_Scheduling_Status__c?: string | null | undefined;
}

export interface BillingState {
  readonly appointments: readonly BillingAppointment[];
  readonly firstAssessment: BillingAppointment | null;
  readonly firstTreatment: BillingAppointment | null;
  readonly outstanding: readonly BillingAppointment[];
  readonly nextScheduledAssessment: BillingAppointment | null;
  readonly pastUnverifiedAssessment: BillingAppointment | null;
  readonly transitionSupported: boolean;
  readonly coverageComplete: boolean;
  readonly gaps: readonly string[];
  readonly reviewReasons: readonly string[];
}

export interface BillingAssessmentInput {
  readonly records?: readonly BillingClaim[];
  readonly appointments?: readonly BillingAppointment[];
  readonly opportunity?: BillingOpportunity;
  readonly asOf?: EvidenceDate;
  readonly coverageComplete?: boolean;
}

export interface SelectedBillingAppointment extends BillingAppointment {
  readonly assessmentPartial: boolean;
  readonly assessmentTransitionSupported: boolean;
  readonly reconciliationGaps: readonly string[];
  readonly reconciliationReviewReasons: readonly string[];
}
