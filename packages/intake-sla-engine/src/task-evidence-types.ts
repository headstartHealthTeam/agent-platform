import type { EvidenceDate } from './evidence.js';
import type { GateContext } from './gate-context.js';
import type { IdentityProfile } from './identity-profile.js';
import type { DatedTaskRecord } from './source-task-dates.js';
import type { TextMatch } from './text-match.js';

type TaskTextField =
  | 'Id'
  | 'TaskId'
  | 'ParentTaskId'
  | 'FeedItemId'
  | 'WhatId'
  | 'WhoId'
  | 'OpportunityId'
  | 'Subject'
  | 'TaskSubject'
  | 'Summary'
  | 'Source'
  | 'Body'
  | 'CommentBody'
  | 'Text'
  | 'Type'
  | 'TaskSubtype'
  | 'ActivityDate'
  | 'aircall__SMS_Direction__c'
  | 'HS_SMS_Direction__c'
  | 'CallType'
  | 'aircall__Number_Name__c'
  | 'aircall__Number_name__c'
  | 'HS_SMS_Line__c';
export type TaskEvidenceRecord = DatedTaskRecord &
  Partial<Readonly<Record<TaskTextField, string | null | undefined>>> & {
    readonly FeedItems?: readonly TaskEvidenceRecord[] | null | undefined;
    readonly TaskFeed?: readonly TaskEvidenceRecord[] | null | undefined;
    readonly ChatterPosts?: readonly TaskEvidenceRecord[] | null | undefined;
    readonly FeedComments?: readonly TaskEvidenceRecord[] | null | undefined;
    readonly ChatterComments?: readonly TaskEvidenceRecord[] | null | undefined;
  };
export type TaskEvidenceProfile = Pick<IdentityProfile, 'opportunityId' | 'opportunityName'> &
  Partial<IdentityProfile>;
export interface TasksEvidenceInput {
  readonly records?: readonly TaskEvidenceRecord[] | null | undefined;
  readonly profile: TaskEvidenceProfile;
  readonly gate: GateContext;
  readonly asOf: EvidenceDate;
}
export type TaskActivity = TaskEvidenceRecord & {
  readonly activityId: string;
  readonly activityType: string;
};
export interface TaskIdentityAssessment extends Omit<Partial<TextMatch>, 'assumedIdentityMatch'> {
  readonly quality: 'Direct' | 'Likely' | 'Weak';
  readonly assumedIdentityMatch?: boolean;
  readonly rejected?: boolean;
  readonly reason?: string;
}
export type MatchedTaskActivity = TaskActivity & {
  readonly identityAssessment: TaskIdentityAssessment;
};
export interface TaskEvidenceIdentity {
  readonly opportunityId: string;
  readonly opportunityName: string;
  readonly activityType: string;
  readonly taskSubject?: string | null | undefined;
}
