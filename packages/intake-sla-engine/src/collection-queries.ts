import { billingClaimsQuery } from './billing-collection.js';

/** Exact approved cohort selection. Metadata policy and field ownership stay in Intake. */
export const INTAKE_OPPORTUNITY_QUERY = `
SELECT Id, Name, StageName, LastModifiedDate, CSM__c, Practice_Name__c,
       Rendering_Provider__c, Rendering_Provider__r.Name, Rendering_Provider__r.Practice_Name__c,
       Rendering_Provider__r.Practice_Name__r.Name, Rendering_Provider__r.Practice_Name__r.Business_Email__c,
       Rendering_Provider__r.Practice_Name__r.Business_Phone__c,
       IA_Rendering_Provider__c, IA_Rendering_Provider__r.Name, IA_Rendering_Provider__r.Practice_Name__c,
       IA_Rendering_Provider__r.Practice_Name__r.Name, IA_Rendering_Provider__r.Practice_Name__r.Business_Email__c,
       IA_Rendering_Provider__r.Practice_Name__r.Business_Phone__c,
       TA_Rendering_Provider__c, TA_Rendering_Provider__r.Name, TA_Rendering_Provider__r.Practice_Name__c,
       TA_Rendering_Provider__r.Practice_Name__r.Name, TA_Rendering_Provider__r.Practice_Name__r.Business_Email__c,
       TA_Rendering_Provider__r.Practice_Name__r.Business_Phone__c,
       ContactId,
       SLA_Status__c, SL_Due__c, On_Hold__c, Active_RBT__c, Has_IA_Approved__c,
       Notes__c, Admission_Probability__c, Current_Intake_Stage__c,
       On_Hold_Reason__c, On_Hold_Notes__c, On_Hold_Notes_Last_Updated__c,
       On_Hold_Start_Date__c, On_Hold_End_Date__c, On_Hold_Follow_Up_Date__c,
       Current_Days_on_Hold__c, Total_Days_on_Hold__c, Last_On_Hold_Reason__c, Off_Hold_Reason__c,
       Current_Treatment_Plan_Status__c, Current_TP_Sent_for_Signatures__c,
       IC_Scheduled_For__c, IC_Scheduled_On__c, IC_Completed_Date__c, IC_Scheduling_Status__c,
       IA_Scheduled_For__c, IA_Scheduled_On__c, IA_Scheduled_Timestamp__c, IA_Completed_Date__c,
       IA_Scheduling_Status__c, Has_IA_Completed__c,
       Intake_Packet_Status__c, Intake_Packet_Sent_Timestamp__c,
       Intake_Packet_Completed_Timestamp__c, Provider_Sends_Intake_Packet__c,
       Vineland_Status__c, Vineland_Sent__c, Vineland_Sent_Timestamp__c,
       Vineland_Awaiting_Send_Timestamp__c, Vineland_Completed_Timestamp__c,
       Vineland_Filed_Timestamp__c,
       BASC_Status__c, BASC_Sent__c, BASC_Sent_Timestamp__c,
       BASC_Awaiting_Send_Timestamp__c, BASC_Completed_Timestamp__c,
       BASC_Filed_Timestamp__c,
       X97153_Scheduled_For__c, X53_Provider_Confirmed_First_Day_TS__c,
       TA_Approved_Pending_Start__c,
       Est_First_Day_of_Treatment__c, Has_97153_Scheduled__c,
       Treatment_Auth_Approval_Date__c, TA_Approval_Checked_Timestamp__c,
       Active_RBT_Checked_At__c,
       SLA_Entry_Date__c, LastStageChangeDate, Current_Stage_Duration__c,
       SLA_Reason_for_Delay_Notes_Last_Updated__c, Close_Suggestion__c,
       Current_SLA__c, Current_SLA__r.Name, Current_SLA__r.Statuss__c, Current_SLA__r.LastModifiedDate,
       Current_SLA__r.CreatedDate,
       Current_SLA__r.Stage__c, Current_SLA__r.Team__c, Current_SLA__r.Reason_for_Delay__c,
       Current_SLA__r.Reason_for_Delay_Notes__c, Current_SLA__r.Reason_for_Delay_Notes_Last_Updated__c,
       Current_SLA__r.Action_Item_Update__c, Current_SLA__r.Action_Item__c,
       Current_SLA__r.Provider_Action_Items__c, Current_SLA__r.SLA_Days__c, Current_SLA__r.Due__c,
       Current_SLA__r.Due_Date_New__c
FROM Opportunity
WHERE RecordType.Name = 'Client Intake'
  AND SLA_Status__c = '⛔ Breached'
  AND Current_SLA__r.Statuss__c != 'Completed'
  AND StageName != 'Admitted'
  AND StageName != 'Pending Discharge'
ORDER BY Name ASC`;

export const APPROVED_COMMUNICATION_LINES = [
  'Intake',
  'Insurance Ops Other',
  'Insurance Ops VOB',
  'Customer Success',
  'Scheduling Pilot',
  'RBT',
] as const;
function soqlString(value: string): string {
  return "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}
export interface InitialCollectionQueries {
  readonly authorizations: string;
  readonly authorizationReviews: string;
  readonly vobs: string;
  readonly clinicalQuality: string;
  readonly rbtRequests: string;
  readonly directStaffing: string;
  readonly directTasks: string;
  readonly directAircalls: string;
  readonly opportunityHistory: string;
  readonly contactRoles: string;
  readonly contacts: string | null;
  readonly csmUsers: string | null;
  readonly billingClaims: string;
}
export function initialCollectionQueries({
  opportunityIds,
  primaryContactIds,
  csmNames,
}: {
  readonly opportunityIds: readonly string[];
  readonly primaryContactIds: readonly string[];
  readonly csmNames: readonly string[];
}): InitialCollectionQueries {
  const inList = opportunityIds.map((id) => `'${id}'`).join(', ');
  return {
    authorizations: `SELECT Id, Name, CreatedDate, LastModifiedDate, Authorization_Type__c, Authorization_Number__c, Insurance_Determination__c, Auth_start_date__c, Auth_expiration_date__c, Auth_Status__c, Client_Opportunity_Record__c, No_Auth_Needed__c, Client_Insurance__c, Requested_Auth_Hours_Week__c, Reassessment_Submission_Date__c, Reassessment_Approval_Date__c, Initial_Auth_Submission_Date__c, Treatment_Auth_Submission_Date__c, Initial_Auth_Approval_Date__c, Treatment_Auth_Approval_Date__c, Portal_Submission_Date__c, Notes__c, Headstart_Provider_Record__r.Name, Payor_Name__c, Payor_Name__r.Name, Denial_Reason__c, Denial_Reason_Explanation__c, Master_Approval_Date__c, Master_Submission_Date__c, TimeStamp_Pending_Status__c, Due_Date_Additional_Details_Needed__c FROM Authorization__c WHERE Client_Opportunity_Record__c IN (${inList}) ORDER BY LastModifiedDate DESC`,
    authorizationReviews: `SELECT Id, Name, CreatedDate, LastModifiedDate, Client_Opportunity_Record__c, Authorization_Type__c, Auth_Status__c, Insurance_Determination__c, Review_Status__c, Notes__c, Initial_Auth_Submission_Date__c, Treatment_Auth_Approval_Date__c, Authorization_Number__c, Existing_Auth__c, Authorization__c FROM Authorization_Review__c WHERE Client_Opportunity_Record__c IN (${inList}) ORDER BY CreatedDate DESC`,
    vobs: `SELECT Id, Name, CreatedDate, LastModifiedDate, Client_Opportunity__c, Eligibility_Status__c, Verification_Date__c, Verification_Date_Entered_At__c, Verification_Status__c, Notes__c, Provider_Contacted_Date__c, Payor__c, Payor__r.Name FROM VOB__c WHERE Client_Opportunity__c IN (${inList}) ORDER BY Verification_Date__c DESC`,
    clinicalQuality: `SELECT Id, Name, CreatedDate, LastModifiedDate, Opportunity__c, Treatment_Plan_Status__c, Parent_Signature_Date__c, Provider_Signature_Date__c, TS_Edits_Sent_for_Review__c, TS_In_Review__c, Reviewer__r.Name, Treatment_Barriers_Notes__c, Signatures_Notes__c, Authorization__c FROM Clinical_Quality__c WHERE Opportunity__c IN (${inList}) ORDER BY CreatedDate DESC`,
    rbtRequests: `SELECT Id, Name, CreatedDate, LastModifiedDate, Client_Opportunity__c, Practice_Making_Request_Name__c, Recruiting_Launched_Status__c, Candidate_Source__c, Active_Candidates__c, Proposed_Candidates__c, Matched_Candidates__c, Total_Screened_Candidates__c, Inactive__c, RBT_Inactive_Date__c, Est_Care_Start_Date__c, RBT_Assigned__c, RBT_Assigned__r.Name, RBT_Recruitment_Funnel__c, RBT_Start_Date__c, Request_Cancellation_Reason__c, Client_Specific_Requirements__c, Client_Stage__c FROM RBT_Request__c WHERE Client_Opportunity__c IN (${inList}) ORDER BY CreatedDate DESC`,
    directStaffing: `SELECT Id, Name, CreatedDate, LastModifiedDate, Client_Opportunity_Record__c, First_Billable_Date__c, Headstart_Practice_Name__c, In_active_Reason__c FROM Staffing__c WHERE Client_Opportunity_Record__c IN (${inList}) ORDER BY CreatedDate DESC`,
    billingClaims: billingClaimsQuery(opportunityIds),
    directTasks: `SELECT Id, WhatId, WhoId, Subject, Type, TaskSubtype, Status, ActivityDate, CreatedDate, LastModifiedDate, Description, Owner.Name, IsClosed, Priority, Category__c, Subcategory__c, Overdue__c, CallType, CallDisposition, aircall__Number_Name__c, aircall__SMS_Direction__c FROM Task WHERE WhatId IN (${inList}) ORDER BY LastModifiedDate DESC LIMIT 2000`,
    directAircalls: `SELECT Id, Name, CreatedDate, aircall__Opportunity__c, aircall__Number_name__c, aircall__Call_Type__c, aircall__Type__c, aircall__Subtype__c, aircall__Call_Start_Date_Time__c, aircall__Call_summary__c, aircall__AI_Key_Topics__c, aircall__Customer_Mood__c, aircall__Description__c, aircall__SMS_Direction__c, aircall__Status__c FROM aircall__Aircall_AI__c WHERE aircall__Opportunity__c IN (${inList}) ORDER BY CreatedDate DESC LIMIT 1000`,
    opportunityHistory: `SELECT Id, OpportunityId, Field, OldValue, NewValue, CreatedDate FROM OpportunityFieldHistory WHERE OpportunityId IN (${inList}) AND Field IN ('StageName','CSM__c','Rendering_Provider__c','IA_Rendering_Provider__c','TA_Rendering_Provider__c') ORDER BY CreatedDate DESC`,
    contactRoles: `SELECT Id, OpportunityId, IsPrimary, Role, ContactId, Contact.Name, Contact.Email, Contact.Phone, Contact.MobilePhone FROM OpportunityContactRole WHERE OpportunityId IN (${inList}) ORDER BY IsPrimary DESC, CreatedDate ASC`,
    contacts:
      primaryContactIds.length > 0
        ? `SELECT Id, Name, Email, Phone, MobilePhone FROM Contact WHERE Id IN (${primaryContactIds.map((id) => `'${id}'`).join(', ')})`
        : null,
    csmUsers:
      csmNames.length > 0
        ? `SELECT Id, Name, Email, IsActive FROM User WHERE Name IN (${csmNames.map(soqlString).join(', ')})`
        : null,
  };
}

export function approvedLineCollectionQueries(): {
  readonly tasks: string;
  readonly aircalls: string;
} {
  const approvedLineList = APPROVED_COMMUNICATION_LINES.map(soqlString).join(', ');
  return {
    tasks: `SELECT Id, WhatId, WhoId, Subject, Type, TaskSubtype, Status, ActivityDate, CreatedDate, LastModifiedDate, Description, Owner.Name, IsClosed, Priority, Category__c, Subcategory__c, Overdue__c, CallType, CallDisposition, aircall__Number_Name__c, aircall__SMS_Direction__c FROM Task WHERE LastModifiedDate = LAST_N_DAYS:120 AND aircall__Number_Name__c IN (${approvedLineList}) ORDER BY LastModifiedDate DESC LIMIT 5000`,
    aircalls: `SELECT Id, Name, CreatedDate, aircall__Opportunity__c, aircall__Number_name__c, aircall__Call_Type__c, aircall__Type__c, aircall__Subtype__c, aircall__Call_Start_Date_Time__c, aircall__Call_summary__c, aircall__AI_Key_Topics__c, aircall__Customer_Mood__c, aircall__Description__c, aircall__SMS_Direction__c, aircall__Status__c FROM aircall__Aircall_AI__c WHERE CreatedDate = LAST_N_DAYS:120 AND aircall__Number_name__c IN (${approvedLineList}) ORDER BY CreatedDate DESC LIMIT 5000`,
  };
}

export function assignedStaffingCollectionQuery(ids: readonly string[]): string {
  return `SELECT Id, Name, CreatedDate, LastModifiedDate, Client_Opportunity_Record__c, First_Billable_Date__c, Headstart_Practice_Name__c, In_active_Reason__c FROM Staffing__c WHERE Id IN (${ids.map((id) => `'${id}'`).join(', ')}) ORDER BY CreatedDate DESC`;
}

export function taskFeedCollectionQuery(taskIdChunk: readonly string[]): string {
  return `SELECT Id, ParentId, Type, CreatedDate, LastModifiedDate, Body, Title, CreatedBy.Name, CommentCount, (SELECT Id, CreatedDate, CommentBody, CreatedBy.Name FROM FeedComments), (SELECT FieldName, OldValue, NewValue FROM FeedTrackedChanges) FROM TaskFeed WHERE ParentId IN (${taskIdChunk.map((id) => `'${id}'`).join(', ')}) AND (Type != 'CreateRecordEvent' OR CommentCount > 0) ORDER BY CreatedDate DESC LIMIT 2000`;
}

export function ticketMatchCollectionQuery(ids: readonly string[]): string {
  return `SELECT Id, Name, CreatedDate, LastModifiedDate, RBT_Request__c, Candidate__c, Candidate__r.Name, Candidate__r.Applicant_Status__c, Candidate__r.Earliest_Start_Date__c, Candidate__r.Provider_Rejection_Reason__c, Candidate__r.HDS_Rejection_Reason__c, Ticket_Match_Status__c, Reason_for_Decline__c, Rejection_Reason__c, Interview__c, Interview__r.Status__c, Interview__r.Date_of_First_Interview__c, Interview_Notes__c, Provider_Notes__c FROM Ticket_Match__c WHERE RBT_Request__c IN (${ids.map((id) => `'${id}'`).join(', ')}) ORDER BY LastModifiedDate DESC`;
}

export function firstInterviewCollectionQuery(ids: readonly string[]): string {
  return `SELECT Id, Name, CreatedDate, LastModifiedDate, Candidate__c, Candidate__r.Name, Date_of_First_Interview__c, Status__c, Interviewer__r.Name, Notes_for_BT_Stage__c, Background_Screening_Notes__c FROM RBT_First_Interview__c WHERE Candidate__c IN (${ids.map((id) => `'${id}'`).join(', ')}) ORDER BY Date_of_First_Interview__c DESC`;
}

export function talentAcquisitionCollectionQuery(ids: readonly string[]): string {
  return `SELECT Id, Name, CreatedDate, LastModifiedDate, Applicant_Status__c, Earliest_Start_Date__c, Provider_Rejection_Reason__c, HDS_Rejection_Reason__c FROM Talent_Acquisition__c WHERE Id IN (${ids.map((id) => `'${id}'`).join(', ')}) ORDER BY LastModifiedDate DESC`;
}
