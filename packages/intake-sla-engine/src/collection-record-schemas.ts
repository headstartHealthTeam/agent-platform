import { z } from 'zod';

const text = z.string().nullish();
const numeric = z.union([z.number(), z.string()]).nullish();
const flag = z.boolean().nullish();
const named = z.looseObject({ Name: text });

/** Consumed Salesforce fields are decoded; additional source metadata remains unchanged. */
export const collectedAuthorizationSchema = z.looseObject({
  Id: z.string(),
  Name: text,
  CreatedDate: text,
  LastModifiedDate: text,
  Authorization_Type__c: text,
  Authorization_Number__c: text,
  Insurance_Determination__c: text,
  Auth_start_date__c: text,
  Auth_expiration_date__c: text,
  Auth_Status__c: text,
  Client_Opportunity_Record__c: text,
  Client_Insurance__c: text,
  Reassessment_Submission_Date__c: text,
  Reassessment_Approval_Date__c: text,
  Initial_Auth_Submission_Date__c: text,
  Treatment_Auth_Submission_Date__c: text,
  Initial_Auth_Approval_Date__c: text,
  Treatment_Auth_Approval_Date__c: text,
  Portal_Submission_Date__c: text,
  Notes__c: text,
  Payor_Name__c: text,
  Denial_Reason__c: text,
  Denial_Reason_Explanation__c: text,
  Master_Approval_Date__c: text,
  Master_Submission_Date__c: text,
  TimeStamp_Pending_Status__c: text,
  Due_Date_Additional_Details_Needed__c: text,
  Review_Status__c: text,
  Existing_Auth__c: text,
  Authorization__c: text,
  No_Auth_Needed__c: flag,
  Requested_Auth_Hours_Week__c: numeric,
  Headstart_Provider_Record__r: named.nullish(),
  Payor_Name__r: named.nullish(),
});

export const collectedVobSchema = z.looseObject({
  Id: z.string(),
  Name: text,
  CreatedDate: text,
  LastModifiedDate: text,
  Client_Opportunity__c: text,
  Eligibility_Status__c: text,
  Verification_Date__c: text,
  Verification_Date_Entered_At__c: text,
  Verification_Status__c: text,
  Notes__c: text,
  Provider_Contacted_Date__c: text,
  Payor__c: text,
  Payor__r: named.nullish(),
});

export const collectedClinicalQualitySchema = z.looseObject({
  Id: z.string(),
  Name: text,
  CreatedDate: text,
  LastModifiedDate: text,
  Opportunity__c: text,
  Treatment_Plan_Status__c: text,
  Parent_Signature_Date__c: text,
  Provider_Signature_Date__c: text,
  TS_Edits_Sent_for_Review__c: text,
  TS_In_Review__c: text,
  Treatment_Barriers_Notes__c: text,
  Signatures_Notes__c: text,
  Authorization__c: text,
  Reviewer__r: named.nullish(),
});

export const collectedRbtRequestSchema = z.looseObject({
  Id: z.string(),
  Name: text,
  CreatedDate: text,
  LastModifiedDate: text,
  Client_Opportunity__c: text,
  Practice_Making_Request_Name__c: text,
  Recruiting_Launched_Status__c: text,
  Candidate_Source__c: text,
  RBT_Inactive_Date__c: text,
  Est_Care_Start_Date__c: text,
  RBT_Assigned__c: text,
  RBT_Recruitment_Funnel__c: text,
  RBT_Start_Date__c: text,
  Request_Cancellation_Reason__c: text,
  Client_Specific_Requirements__c: text,
  Client_Stage__c: text,
  Date_Closed__c: text,
  Inactive__c: flag,
  Active_Candidates__c: z.unknown().optional(),
  Proposed_Candidates__c: z.unknown().optional(),
  Matched_Candidates__c: z.unknown().optional(),
  Total_Screened_Candidates__c: z.unknown().optional(),
  RBT_Assigned__r: named.nullish(),
});

export const collectedStaffingSchema = z.looseObject({
  Id: z.string(),
  Name: text,
  CreatedDate: text,
  LastModifiedDate: text,
  Client_Opportunity_Record__c: text,
  First_Billable_Date__c: text,
  Headstart_Practice_Name__c: text,
  In_active_Reason__c: text,
  Billable_Start_Date__c: text,
  Name__c: text,
  Aloha_Staff_Name__c: text,
  Status__c: text,
  In_active_Date__c: text,
  Notes__c: text,
  Resigned_Terminated_Reason__c: text,
  Hire_Date__c: text,
});

export const collectedBillingSchema = z.looseObject({
  Id: z.string(),
  Name: text,
  CreatedDate: text,
  LastModifiedDate: text,
  Appointment_ID__c: text,
  Client_Opportunity__c: text,
  Appt_Date__c: text,
  Appt_Start_Time__c: text,
  Appt_End_Time__c: text,
  Appointment_Status__c: text,
  Completed__c: text,
  Completed_Date__c: text,
  Service_Name__c: text,
  Staff_Name__c: text,
  Rendering_Provider__c: text,
  Authorization__c: text,
  Claim_Id__c: text,
  Date_Billed__c: text,
  Notes__c: text,
  Billing_Code__c: numeric,
  Authorization__r: z.looseObject({ Client_Opportunity_Record__c: text }).nullish(),
  Headstart_Provider_Profile__r: named.nullish(),
  RBT_Staffing__r: named.nullish(),
});

export const collectedCommunicationSchema = z.looseObject({
  Id: z.string(),
  Name: text,
  WhatId: text,
  WhoId: text,
  Subject: text,
  Type: text,
  TaskSubtype: text,
  Status: text,
  ActivityDate: text,
  CreatedDate: text,
  LastModifiedDate: text,
  Description: text,
  Priority: text,
  Category__c: text,
  Subcategory__c: text,
  CallType: text,
  CallDisposition: text,
  aircall__Number_Name__c: text,
  aircall__SMS_Direction__c: text,
  aircall__Opportunity__c: text,
  aircall__Number_name__c: text,
  aircall__Call_Type__c: text,
  aircall__Type__c: text,
  aircall__Subtype__c: text,
  aircall__Call_Start_Date_Time__c: text,
  aircall__Call_summary__c: text,
  aircall__AI_Key_Topics__c: text,
  aircall__Customer_Mood__c: text,
  aircall__Description__c: text,
  aircall__Status__c: text,
  aircall__Message_Content__c: text,
  Headstart_Full_Transcript__c: text,
  IsClosed: flag,
  Owner: named.nullish(),
});

export const collectedHistorySchema = z.looseObject({
  Id: z.string(),
  OpportunityId: text,
  Field: text,
  CreatedDate: text,
  OldValue: z.union([z.string(), z.number(), z.boolean()]).nullish(),
  NewValue: z.union([z.string(), z.number(), z.boolean()]).nullish(),
});

export const collectedContactSchema = z.looseObject({
  Id: z.string(),
  Name: text,
  Email: text,
  Phone: text,
  MobilePhone: text,
});

export const collectedUserSchema = z.looseObject({
  Id: text,
  Name: text,
  Email: text,
  IsActive: flag,
});

export const collectedContactRoleSchema = z.looseObject({
  Id: z.string(),
  OpportunityId: text,
  Role: text,
  ContactId: text,
  IsPrimary: flag,
  Contact: collectedContactSchema.partial({ Id: true }).nullish(),
});

export const collectedInterviewSchema = z.looseObject({
  Id: z.string(),
  Name: text,
  CreatedDate: text,
  LastModifiedDate: text,
  Candidate__c: text,
  Date_of_First_Interview__c: text,
  Status__c: text,
  Notes_for_BT_Stage__c: text,
  Background_Screening_Notes__c: text,
  Important_Notes__c: text,
  Candidate__r: named.nullish(),
  Interviewer__r: named.nullish(),
});

export const collectedCandidateSchema = z.looseObject({
  Id: z.string(),
  Name: text,
  CreatedDate: text,
  LastModifiedDate: text,
  Applicant_Status__c: text,
  Earliest_Start_Date__c: text,
  Provider_Rejection_Reason__c: text,
  HDS_Rejection_Reason__c: text,
  Notes__c: text,
});

export const collectedTicketMatchSchema = z.looseObject({
  Id: z.string(),
  Name: text,
  CreatedDate: text,
  LastModifiedDate: text,
  RBT_Request__c: text,
  Candidate__c: text,
  Ticket_Match_Status__c: text,
  Reason_for_Decline__c: text,
  Rejection_Reason__c: text,
  Interview__c: text,
  Interview_Notes__c: text,
  Provider_Notes__c: text,
  Candidate__r: collectedCandidateSchema.partial({ Id: true }).nullish(),
  Interview__r: collectedInterviewSchema.partial({ Id: true }).nullish(),
});

export const collectedTaskFeedSchema = z.looseObject({
  Id: text,
  ParentId: text,
  Type: text,
  CreatedDate: text,
  LastModifiedDate: text,
  Body: z.unknown().optional(),
  Title: text,
  CommentCount: numeric,
  CreatedBy: named.nullish(),
  FeedComments: z
    .looseObject({
      records: z
        .array(
          z.looseObject({
            Id: text,
            CreatedDate: text,
            CommentBody: z.unknown().optional(),
            CreatedBy: named.nullish(),
          })
        )
        .nullish(),
    })
    .nullish(),
  FeedTrackedChanges: z
    .looseObject({
      records: z
        .array(
          z.looseObject({
            FieldName: text,
            OldValue: z.unknown().optional(),
            NewValue: z.unknown().optional(),
          })
        )
        .nullish(),
    })
    .nullish(),
});
export const collectedTaskUpdateSchema = z.looseObject({
  WhatId: z.string(),
  TaskId: text,
  FeedItemId: text,
  TaskSubject: z.string(),
  TaskDescription: z.string(),
  TaskStatus: z.string(),
  TaskActivityDate: z.string(),
  CreatedDate: text,
  LastModifiedDate: text,
  Author: z.string(),
  Source: z.enum(['Task update', 'Task Chatter']),
  Summary: z.string(),
  FeedCommentId: text,
});
