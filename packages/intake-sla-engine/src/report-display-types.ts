import type { EvidenceDate } from './evidence.js';
import type {
  FreshnessCall,
  FreshnessInterview,
  FreshnessTask,
  FreshnessTicketMatch,
} from './freshness-source-types.js';

type TextFields<Key extends string> = Readonly<Partial<Record<Key, string | null | undefined>>>;
type NamedRelation = { readonly Name?: string | null | undefined } | null | undefined;
type ReportSourceDate = EvidenceDate | null | undefined;
export interface ReportSourceSummary {
  readonly text: string;
  readonly quality: 'Direct' | 'Not found';
  readonly best: string | null | undefined;
}
export type ReportCandidateMatch = FreshnessTicketMatch & {
  readonly Candidate__r?:
    (NonNullable<FreshnessTicketMatch['Candidate__r']> & TextFields<'Notes__c'>) | null | undefined;
  readonly Interview__r?: FreshnessInterview | null | undefined;
};
/** Superset of the collected Task and call projections used only by report display/matching. */
export type ReportCommunication = Omit<Partial<FreshnessCall>, 'Id' | 'CreatedDate'> &
  FreshnessTask &
  TextFields<
    | 'Name'
    | 'aircall__Type__c'
    | 'aircall__Subtype__c'
    | 'aircall__Description__c'
    | 'Status'
    | 'Category__c'
    | 'TaskStatus'
    | 'TaskActivityDate'
    | 'Author'
  > & {
    readonly IsClosed?: boolean | null | undefined;
    readonly Owner?: NamedRelation;
    readonly Owner__r?: NamedRelation;
  };
export interface ReportTaskFeed {
  readonly Id?: string | null | undefined;
  readonly ParentId?: string | null | undefined;
  readonly Type?: string | null | undefined;
  readonly Body?: unknown;
  readonly CreatedDate?: ReportSourceDate;
  readonly LastModifiedDate?: ReportSourceDate;
  readonly CreatedBy?: NamedRelation;
  readonly FeedTrackedChanges?:
    | {
        readonly records?:
          | readonly {
              readonly FieldName?: string | null | undefined;
              readonly OldValue?: unknown;
              readonly NewValue?: unknown;
            }[]
          | null
          | undefined;
      }
    | null
    | undefined;
  readonly FeedComments?:
    | {
        readonly records?:
          | readonly {
              readonly Id?: string | null | undefined;
              readonly CommentBody?: unknown;
              readonly CreatedDate?: ReportSourceDate;
              readonly CreatedBy?: NamedRelation;
            }[]
          | null
          | undefined;
      }
    | null
    | undefined;
}
export interface ReportTaskUpdate {
  readonly WhatId: string;
  readonly TaskId?: string | null | undefined;
  readonly FeedItemId?: string | null | undefined;
  readonly TaskSubject: string;
  readonly TaskDescription: string;
  readonly TaskStatus: string;
  readonly TaskActivityDate: string;
  readonly CreatedDate?: ReportSourceDate;
  readonly LastModifiedDate?: ReportSourceDate;
  readonly Author: string;
  readonly Source: 'Task update' | 'Task Chatter';
  readonly Summary: string;
  readonly FeedCommentId?: string | null | undefined;
}
export interface ReportOutstandingTasks {
  readonly count: number;
  readonly subjects: string;
  readonly owners: string;
  readonly statuses: string;
  readonly dueDates: string;
}
