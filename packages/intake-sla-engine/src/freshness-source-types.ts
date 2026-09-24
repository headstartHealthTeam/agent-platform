import type { VobEvidenceRecord } from './authorization-review-evidence.js';
import type { BillingClaim } from './billing-types.js';
import type { CallTextRecord } from './call-text-evidence.js';
import type { InterviewEvidenceRecord } from './candidate-evidence.js';
import type { ClinicalQualityEvidenceRecord } from './clinical-quality-evidence.js';
import type { DateValue } from './dates.js';
import type { EvidenceDate, EvidenceEvent } from './evidence.js';
import type { FreshnessAuthorizationSummary } from './freshness-candidate-types.js';
import type { OpportunityNoteRecord } from './opportunity-note-evidence.js';
import type { PortalReportResponses } from './portal-report-types.js';
import type { RbtRequestEvidenceRecord } from './rbt-request-evidence.js';
import type { SearchPathwayIdentity } from './search-pathway-types.js';
import type { SourceAuthorizationRecord } from './source-authorization-types.js';
import type { StaffingEvidenceRecord } from './staffing-evidence.js';
import type { TaskEvidenceRecord } from './task-evidence-types.js';
import type { TicketMatchEvidenceRecord } from './ticket-match-evidence.js';

type TextFields<Key extends string> = Readonly<Partial<Record<Key, string | null | undefined>>>;
type Named = TextFields<'Name'>;
type NamedRelation = Named | null | undefined;
type OpportunityField =
  | 'StageName'
  | 'IA_Completed_Date__c'
  | 'IA_Scheduled_For__c'
  | 'IA_Scheduled_Timestamp__c'
  | 'IA_Scheduled_On__c'
  | 'SLA_Entry_Date__c'
  | 'LastStageChangeDate'
  | 'First_day_of_Treatment__c'
  | 'X97153_Scheduled_For__c'
  | 'X53_Provider_Confirmed_First_Day_TS__c'
  | 'Current_TP_Sent_for_Signatures__c'
  | 'Current_Treatment_Plan_Status__c';
export type FreshnessOpportunity = Omit<OpportunityNoteRecord, 'Current_SLA__r'> &
  TextFields<OpportunityField> & {
    readonly Id: string;
    readonly Name: string;
    readonly Current_SLA__r?:
      | (NonNullable<OpportunityNoteRecord['Current_SLA__r']> &
          TextFields<'Stage__c' | 'CreatedDate'>)
      | null
      | undefined;
  };
export interface FreshnessAuthorizationGate extends FreshnessAuthorizationSummary {
  readonly required?: boolean | null | undefined;
  readonly satisfied?: boolean | null | undefined;
  readonly approvalDate?: string | null | undefined;
  readonly recordId?: string | null | undefined;
  readonly authorizationNumber?: string | null | undefined;
}
export type FreshnessAuthorization = SourceAuthorizationRecord &
  TextFields<'Portal_Submission_Date__c' | 'Review_Status__c'>;
export type FreshnessVob = VobEvidenceRecord &
  Named &
  TextFields<'Provider_Contacted_Date__c'> & { readonly Payor__r?: NamedRelation };
export type FreshnessClinicalQuality = ClinicalQualityEvidenceRecord &
  Named &
  TextFields<'CreatedDate'>;
export type FreshnessRbt = RbtRequestEvidenceRecord & Named;
export type FreshnessStaffing = StaffingEvidenceRecord & {
  readonly Supervising_Provider__r?: NamedRelation;
};
export type FreshnessTicketMatch = Omit<TicketMatchEvidenceRecord, 'Candidate__r'> & {
  readonly Candidate__r?:
    | (NonNullable<TicketMatchEvidenceRecord['Candidate__r']> &
        TextFields<'Earliest_Start_Date__c'>)
    | null
    | undefined;
};
export type FreshnessInterview = InterviewEvidenceRecord &
  Named & { readonly Interviewer__r?: NamedRelation };
interface CommunicationMatch {
  readonly _matchQuality?: string | null | undefined;
  readonly _matchScore?: number | null | undefined;
  readonly _matchReasons?: readonly string[] | null | undefined;
}
export type FreshnessTask = TaskEvidenceRecord & CommunicationMatch & TextFields<'FeedCommentId'>;
export type FreshnessCall = CallTextRecord &
  CommunicationMatch &
  TextFields<'aircall__AI_Key_Topics__c'>;
export type FreshnessBilling = BillingClaim &
  TextFields<'billingClaimId' | 'billingCode' | 'summary' | 'provider'> & {
    readonly evidenceDate?: EvidenceDate | null | undefined;
  };
export type FreshnessInterpretedEvent = Pick<
  EvidenceEvent,
  'source' | 'sourceRecordId' | 'eventDate' | 'text'
> &
  Partial<EvidenceEvent> & {
    readonly assumedIdentityMatch?: boolean | undefined;
    readonly assumedIdentityNote?: string | null | undefined;
    readonly matchedAs?: string | null | undefined;
    readonly milestoneKind?: string | null | undefined;
    readonly interpretationProvenance?: unknown;
    readonly supportSpan?: string | null | undefined;
    readonly denialReason?: string | null | undefined;
  };
export type FreshnessSupplemental = TextFields<
  | 'text'
  | 'summary'
  | 'name'
  | 'title'
  | 'category'
  | 'opportunityId'
  | 'sourceId'
  | 'id'
  | 'fileId'
  | 'quality'
  | 'date'
  | 'eventDate'
  | 'createdAt'
  | 'modifiedTime'
> & {
  readonly substantive?: boolean | null | undefined;
  readonly matchedEntities?: readonly unknown[] | null | undefined;
};
export interface FreshnessInput {
  readonly opp: FreshnessOpportunity;
  readonly identity?: SearchPathwayIdentity;
  readonly authorizationGate?: FreshnessAuthorizationGate | null;
  readonly auths?: readonly FreshnessAuthorization[];
  readonly authReviews?: readonly FreshnessAuthorization[];
  readonly vobs?: readonly FreshnessVob[];
  readonly clinicalQuality?: readonly FreshnessClinicalQuality[];
  readonly rbts?: readonly FreshnessRbt[];
  readonly staffing?: readonly FreshnessStaffing[];
  readonly ticketMatches?: readonly FreshnessTicketMatch[];
  readonly firstInterviews?: readonly FreshnessInterview[];
  readonly tasks?: readonly FreshnessTask[];
  readonly taskUpdates?: readonly FreshnessTask[];
  readonly aircalls?: readonly FreshnessCall[];
  readonly portalResponses?: PortalReportResponses;
  readonly interpretedConversationEvents?: readonly FreshnessInterpretedEvent[];
  readonly linkedBillingClaims?: readonly FreshnessBilling[];
  readonly gmail?: readonly FreshnessSupplemental[];
  readonly linkedFiles?: readonly FreshnessSupplemental[];
  readonly asOf?: DateValue;
}
