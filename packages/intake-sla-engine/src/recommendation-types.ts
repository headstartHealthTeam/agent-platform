import type { DateValue } from './dates.js';
import type { DelayHistory } from './delay-history-types.js';
import type { GateContext } from './gate-context.js';
import type { SlaStory, StoryEvent, StoryIssueView, StorySourceResult } from './story-types.js';

export interface RecommendationEvent extends StoryEvent {
  readonly text: string;
  readonly opportunityId?: string | undefined;
  readonly fact?: string | null | undefined;
  readonly rawText?: string | null | undefined;
  readonly denialReason?: string | null | undefined;
  readonly appealKind?: string | null | undefined;
  readonly candidateStep?: string | null | undefined;
  readonly assumedIdentityMatch?: boolean | undefined;
  readonly assumedIdentityNote?: string | null | undefined;
  readonly matchedAs?: string | null | undefined;
  readonly milestoneKind?: string | null | undefined;
  readonly plannedDate?: DateValue;
  readonly lifecycleState?: string | null | undefined;
  readonly narrativeContribution?: string | undefined;
  readonly preWindowContext?: boolean | undefined;
}

export interface RecommendationFact {
  readonly id: string;
  readonly sourceRecordId: string;
  readonly date: string | null;
  readonly source: string;
  readonly fact: string;
  readonly milestoneDate: string | null;
  readonly gateImpact: string | null;
  readonly factType: string | null;
  readonly denialReason: string | null;
  readonly appealKind: string | null;
  readonly requestedInformation: string | null;
  readonly specificityMissing: boolean;
  readonly candidateStep: string | null;
  readonly candidateName: string | null;
  readonly candidateActive: boolean | null;
  readonly recommendedAction: string | null;
  readonly actionOwner: string | null;
  readonly actionType: string | null;
  readonly matchQuality: string;
  readonly relationship: string;
  readonly assumedIdentityMatch: boolean;
  readonly assumedIdentityNote: string | null;
  readonly matchedAs: string | null;
  readonly contribution: string;
}

export interface RecommendationOpportunity {
  readonly id: string;
  readonly name?: string | undefined;
  readonly stage: string | undefined;
  readonly csm?: string | null | undefined;
  readonly provider?: string | null | undefined;
  readonly stageEntryDate?: DateValue;
  readonly slaCreatedDate?: DateValue;
}

export interface RecommendationAction {
  readonly type: string;
  readonly owner: string | null | undefined;
  readonly text: string;
  readonly date: DateValue;
  readonly basis: string;
}

export interface RecommendationGate extends GateContext {
  readonly authorization?: RecommendationAuthorization | null | undefined;
  readonly recommendedAction?: string | null | undefined;
  readonly recommendedActionType?: string | null | undefined;
  readonly recommendedFollowUpDate?: DateValue;
  readonly contextualEvidenceId?: string | null | undefined;
  readonly readyToCopy?: string | null | undefined;
  readonly conflicts?: readonly string[];
  readonly occurrence?: {
    readonly owner?: string | null | undefined;
    readonly actionType: string;
    readonly followUpDate?: DateValue;
    readonly plannedMilestone?: DateValue;
  } | null;
}

export interface RecommendationAuthorization {
  readonly phase?: string | null | undefined;
  readonly state?: string | null | undefined;
  readonly satisfied?: boolean | undefined;
  readonly conflict?: boolean | undefined;
  readonly approvalDate?: DateValue;
  readonly denialOccurred?: boolean | undefined;
  readonly denialReason?: string | null | undefined;
  readonly denialExplanation?: string | null | undefined;
  readonly appealKind?: string | null | undefined;
}

export interface RecommendationSourceResult extends StorySourceResult {
  readonly required?: boolean;
}

export interface FactPacketInput<T extends RecommendationEvent = RecommendationEvent> {
  readonly opportunity: RecommendationOpportunity;
  readonly gate: RecommendationGate;
  readonly evidenceEvents: readonly T[];
  readonly sourceResults: readonly RecommendationSourceResult[];
  readonly asOf: DateValue;
}

export interface RecommendationIdentityReview {
  readonly source: string;
  readonly sourceRecordIds: string[];
  readonly note: string;
  readonly matchedAs: string[];
}

export interface RecommendationStartConflict {
  readonly reportedDate: string | null;
  readonly plannedDate: string | null;
}
export interface RecommendationDocumentConflict {
  readonly reportedDate: string | null;
  readonly requiredItem: string | null;
  readonly requiredItemDate: string | null;
}
export interface RecommendationTimelineFact extends RecommendationFact {
  readonly issueKey: string;
  readonly lifecycleState: string;
  readonly resolvedByEventId: string | null;
  readonly resolutionDate: string | null;
  readonly narrativeContribution: string;
  readonly preWindowContext: boolean;
}

export interface FactPacket<T extends RecommendationEvent = RecommendationEvent> {
  readonly asOf: DateValue;
  readonly delayHistory: DelayHistory;
  readonly opportunityId: string;
  readonly opportunityName: string | undefined;
  readonly provider: string | null;
  readonly csm: string | null;
  readonly stage: string | undefined;
  readonly slaCreatedDate: string | null;
  readonly stageEntryDate: string | null;
  readonly storyStartDate: string | null;
  readonly processPosition: string | null | undefined;
  readonly unresolvedGate: string | null | undefined;
  readonly authorization: RecommendationAuthorization | null;
  readonly authoritativeEvidence: RecommendationFact | null;
  readonly newestUpdate: RecommendationFact | null;
  readonly structuredGateDetail: RecommendationFact | null;
  readonly outstandingRequiredDocument: RecommendationFact | null;
  readonly evidenceTimeline: RecommendationFact[];
  readonly supportingContext: RecommendationFact[];
  readonly priorContext: RecommendationFact[];
  readonly futureMilestones: RecommendationFact[];
  readonly story: Omit<SlaStory<T>, 'latestSubstantiveEvent' | 'timeline'> & {
    readonly latestSubstantiveEvent: RecommendationFact | null;
    readonly timeline: RecommendationTimelineFact[];
  };
  readonly startEvidenceConflict: RecommendationStartConflict | null;
  readonly iaCompletionDocumentationConflict: RecommendationDocumentConflict | null;
  readonly freshness: string;
  readonly action: RecommendationAction;
  readonly confidence: string | null | undefined;
  readonly readyToCopy: string;
  readonly conflicts: string[];
  readonly gaps: string[];
  readonly identityMatchReview: RecommendationIdentityReview[];
  readonly sourceCoverage: {
    readonly found: string[];
    readonly primaryFound: string[];
    readonly supportingFound: string[];
    readonly searchedNotFound: string[];
    readonly failures: string[];
    readonly checkedCount: number;
  };
  readonly approvedFacts: (Omit<T, 'rawText'> & { readonly contribution: string })[];
  readonly latestFact: string;
}

export interface FactPacketState<T extends RecommendationEvent = RecommendationEvent> {
  readonly input: FactPacketInput<T>;
  readonly gate: RecommendationGate;
  readonly story: SlaStory<T>;
  readonly narrative: RecommendationEvent[];
  readonly supporting: RecommendationEvent[];
  readonly timeline: RecommendationEvent[];
  readonly priorContext: RecommendationEvent[];
  readonly structuredDetailEvent: RecommendationEvent | null;
  readonly newest: RecommendationEvent | null;
  readonly authoritative: RecommendationEvent | null;
  readonly sameDayAuthorizationProgress: RecommendationEvent | null;
  readonly requiredDocumentationEvent: RecommendationEvent | null;
  readonly assignedRbt: string | null;
  readonly newerStaffingPathSupersedesAssignment: boolean;
  readonly freshness: string;
  readonly gateCategory: string;
  action: RecommendationAction;
  readonly materialFailure: boolean;
  readonly supplementaryFailure: boolean;
  readonly conflicts: string[];
  readonly gaps: string[];
  readonly sourceCoverage: FactPacket<T>['sourceCoverage'];
  readonly identityMatchReview: RecommendationIdentityReview[];
  readonly specificityMissingEvents: RecommendationEvent[];
  readonly assumedIdentityEvents: T[];
  readonly futureMilestones: RecommendationFact[];
  startEvidenceConflict: RecommendationStartConflict | null;
  iaCompletionDocumentationConflict: RecommendationDocumentConflict | null;
}

export interface RecommendationRawStory {
  readonly currentGateIssueKey?: string | undefined;
  readonly narrativeEvents?: readonly RecommendationEvent[];
  readonly timeline?: readonly RecommendationEvent[];
  readonly activeIssues?: readonly StoryIssueView[];
}

/** Shared by raw evidence and the intentionally smaller report projection. */
export interface RecommendationCandidate {
  readonly source?: string | undefined;
  readonly factType?: string | null | undefined;
  readonly candidateName?: string | null | undefined;
  readonly candidateStep?: string | null | undefined;
  readonly text?: string | null | undefined;
  readonly fact?: string | null | undefined;
  readonly requestedInformation?: string | null | undefined;
}
