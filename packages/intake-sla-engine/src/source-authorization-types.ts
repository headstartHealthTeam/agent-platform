import type { AuthorizationGate } from './authorization-types.js';

type SourceDates =
  | 'CreatedDate'
  | 'LastModifiedDate'
  | 'Master_Submission_Date__c'
  | 'Initial_Auth_Submission_Date__c'
  | 'Treatment_Auth_Submission_Date__c'
  | 'Master_Approval_Date__c'
  | 'Initial_Auth_Approval_Date__c'
  | 'Treatment_Auth_Approval_Date__c'
  | 'Auth_start_date__c'
  | 'Auth_expiration_date__c';
type SourceStrings = 'Id';
type NullableStrings =
  | 'Insurance_Determination__c'
  | 'Auth_Status__c'
  | 'Name'
  | 'Authorization__c'
  | 'Client_Opportunity_Record__c'
  | 'Authorization_Type__c'
  | 'Authorization_Number__c'
  | 'Notes__c'
  | 'Client_Insurance__c'
  | 'Payor_Name__c'
  | 'Denial_Reason__c'
  | 'Denial_Reason_Explanation__c';
/** Workflow-owned Salesforce field projection, not a provider transport contract. */
export type SourceAuthorizationRecord = Readonly<
  Partial<Record<SourceDates | NullableStrings, string | null | undefined>>
> &
  Readonly<Partial<Record<SourceStrings, string | undefined>>> & {
    readonly No_Auth_Needed__c?: boolean | null;
    readonly Payor_Name__r?: { readonly Name?: string | null } | null;
  };
export interface SourceAuthorizationOpportunity {
  readonly Id?: string | undefined;
  readonly StageName?: string | null;
  readonly Current_SLA__r?: {
    readonly Stage__c?: string | null;
    readonly CreatedDate?: string | null;
  } | null;
  readonly Has_IA_Approved__c?: boolean | null;
  readonly Initial_Auth_Approval_Date__c?: string | null;
  readonly Treatment_Auth_Approval_Date__c?: string | null;
  readonly IA_Approval_Checked_Timestamp__c?: string | null;
  readonly TA_Approval_Checked_Timestamp__c?: string | null;
  readonly LastStageChangeDate?: string | null;
  readonly SLA_Entry_Date__c?: string | null;
}
export interface SourceAuthorizationGate<T extends SourceAuthorizationRecord> {
  readonly phase: string;
  readonly required: boolean;
  readonly satisfied: boolean;
  readonly status: 'Satisfied' | 'Unresolved';
  readonly state: AuthorizationGate['state'];
  readonly blocker: string;
  readonly reason: string;
  readonly recordId: string;
  readonly authorizationId: string;
  readonly blockingRecordId: string;
  readonly recordName: string;
  readonly authorizationNumber: string;
  readonly payer: string;
  readonly submissionDate: string;
  readonly approvalDate: string;
  readonly determination: string;
  readonly authStatus: string;
  readonly denialOccurred: boolean;
  readonly denialReason: string;
  readonly denialExplanation: string;
  readonly appealKind: string;
  readonly eventDate: string;
  readonly conflict: boolean;
  readonly conflictReason: string;
  readonly coverages: readonly AuthorizationGate[];
  readonly record: T | null;
}
export interface SourceAuthorizationNotRequired {
  readonly phase: '';
  readonly required: false;
  readonly satisfied: true;
  readonly status: 'Not Required';
  readonly state: 'Not Required';
  readonly blocker: '';
  readonly reason: string;
  readonly recordId: '';
  readonly conflict: false;
  readonly coverages: readonly [];
}
export interface SourceAuthorizationInput<T extends SourceAuthorizationRecord> {
  readonly opp: SourceAuthorizationOpportunity;
  readonly auths?: readonly T[];
  readonly authReviews?: readonly SourceAuthorizationRecord[];
  readonly asOf?: Date | string;
}
