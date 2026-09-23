export interface BillingClaim {
  readonly Id?: string | null;
  readonly id?: string | null;
  readonly Appointment_ID__c?: string | null;
  readonly appointmentId?: string | null;
  readonly Billing_Code__c?: string | number | null;
  readonly procedureCode?: string | number | null;
  readonly cptCode?: string | number | null;
  readonly serviceCode?: string | number | null;
  readonly CPT_Code__c?: string | number | null;
  readonly Service_Name__c?: string | null;
  readonly serviceName?: string | null;
  readonly Appointment_Status__c?: string | null;
  readonly status?: string | null;
  readonly appointmentStatus?: string | null;
  readonly Completed__c?: string | null;
  readonly Appt_Date__c?: string | null;
  readonly serviceDate?: string | null;
  readonly appointmentDate?: string | null;
  readonly dateOfService?: string | null;
  readonly Service_Date__c?: string | null;
  readonly Completed_Date__c?: string | null;
  readonly completedDate?: string | null;
  readonly Client_Opportunity__c?: string | null;
  readonly Authorization__r?: { readonly Client_Opportunity_Record__c?: string | null } | null;
  readonly Claim_Id__c?: string | null;
  readonly claimId?: string | null;
  readonly Headstart_Provider_Profile__r?: { readonly Name?: string | null } | null;
  readonly Rendering_Provider__c?: string | null;
  readonly Staff_Name__c?: string | null;
  readonly RBT_Staffing__r?: { readonly Name?: string | null } | null;
  readonly Authorization__c?: string | null;
  readonly CreatedDate?: string | null;
  readonly createdDate?: string | null;
  readonly LastModifiedDate?: string | null;
  readonly lastModifiedDate?: string | null;
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
  readonly StageName?: string | null;
  readonly stage?: string | null;
  readonly IA_Completed_Date__c?: string | null;
  readonly iaCompletedDate?: string | null;
  readonly First_day_of_Treatment__c?: string | null;
  readonly firstDayOfTreatment?: string | null;
  readonly IA_Scheduling_Status__c?: string | null;
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
  readonly asOf?: string;
  readonly coverageComplete?: boolean;
}

export interface SelectedBillingAppointment extends BillingAppointment {
  readonly assessmentPartial: boolean;
  readonly assessmentTransitionSupported: boolean;
  readonly reconciliationGaps: readonly string[];
  readonly reconciliationReviewReasons: readonly string[];
}
