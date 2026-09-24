import type { DateValue } from './dates.js';
import type { DelayHistory } from './delay-history-types.js';
import type {
  RecommendationAction,
  RecommendationAuthorization,
  RecommendationDocumentConflict,
  RecommendationFact,
  RecommendationStartConflict,
} from './recommendation-types.js';
import type { StoryIssueView } from './story-types.js';

/** The smaller projection consumed by rendering, including existing manually assembled packets. */
type OptionalNarrativeFields = {
  readonly [K in keyof RecommendationFact]?: RecommendationFact[K] | undefined;
};
export interface NarrativeFact extends OptionalNarrativeFields {
  readonly fact: string;
  readonly issueKey?: string | null | undefined;
  readonly lifecycleState?: string | null | undefined;
  readonly resolvedByEventId?: string | null | undefined;
  readonly resolutionDate?: DateValue;
  readonly narrativeContribution?: string | undefined;
  readonly preWindowContext?: boolean | undefined;
  readonly substantive?: boolean | undefined;
  readonly eventDate?: DateValue;
}

export interface NarrativeRawFact extends Partial<Omit<NarrativeFact, 'fact'>> {
  readonly fact?: string | null | undefined;
  readonly text?: string | null | undefined;
  readonly rawText?: string | null | undefined;
}

export interface NarrativeIssue extends Partial<StoryIssueView> {
  readonly issueKey: string;
}

export interface NarrativeStory {
  readonly currentGateIssueKey?: string | undefined;
  readonly timeline?: readonly NarrativeFact[];
  readonly activeIssues?: readonly NarrativeIssue[];
  readonly resolvedIssues?: readonly NarrativeIssue[];
}

export interface NarrativeAction extends Partial<RecommendationAction> {
  readonly type: string;
  readonly text: string;
}

export interface NarrativePacket {
  readonly asOf?: DateValue;
  readonly opportunityName?: string | null | undefined;
  readonly provider?: string | null | undefined;
  readonly csm?: string | null | undefined;
  readonly stage: string;
  readonly slaCreatedDate?: DateValue;
  readonly stageEntryDate?: DateValue;
  readonly storyStartDate?: DateValue;
  readonly processPosition?: string | null | undefined;
  readonly unresolvedGate?: string | null | undefined;
  readonly gateCategory?: string | null | undefined;
  readonly authorization?: RecommendationAuthorization | null;
  readonly authoritativeEvidence?: NarrativeFact | null;
  readonly newestUpdate?: NarrativeFact | null;
  readonly structuredGateDetail?: NarrativeFact | null;
  readonly outstandingRequiredDocument?: NarrativeFact | null;
  readonly evidenceTimeline?: readonly NarrativeFact[];
  readonly supportingContext?: readonly NarrativeFact[];
  readonly priorContext?: readonly NarrativeFact[];
  readonly futureMilestones?: readonly NarrativeFact[];
  readonly approvedFacts?: readonly NarrativeRawFact[];
  readonly story?: NarrativeStory;
  readonly startEvidenceConflict?: RecommendationStartConflict | null;
  readonly iaCompletionDocumentationConflict?: RecommendationDocumentConflict | null;
  readonly freshness: string;
  readonly action: NarrativeAction;
  readonly conflicts: readonly string[];
  readonly delayHistory?: DelayHistory | null;
}

export interface NarrativeDenialContext {
  readonly reason: string;
  readonly event: NarrativeFact | undefined;
  readonly decisionEvent: NarrativeFact | undefined;
  readonly decisionDate: string | null;
  readonly appealKind: string | null;
  readonly overlap: boolean;
  readonly lifecycle: string;
}
