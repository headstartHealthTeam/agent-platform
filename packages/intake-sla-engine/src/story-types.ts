import type { DateValue } from './dates.js';
import type { EvidenceEvent, RankedEvidence } from './evidence.js';

/** Fields consumed by lifecycle reasoning; provider-specific evidence remains on the input. */
export interface StoryFact extends Partial<
  Pick<
    EvidenceEvent,
    | 'factType'
    | 'gateImpact'
    | 'issueKey'
    | 'recommendedAction'
    | 'actionOwner'
    | 'actionType'
    | 'followUpDate'
    | 'milestoneDate'
  >
> {
  readonly source?: string | undefined;
  readonly category?: string | null | undefined;
  readonly text?: string | undefined;
  readonly supportingOnly?: boolean | undefined;
  readonly candidateActive?: boolean | null | undefined;
  readonly candidateName?: string | null | undefined;
  readonly lifecycleRecordId?: string | null | undefined;
  readonly specificityMissing?: boolean | undefined;
  readonly requestedInformation?: string | null | undefined;
}

export type StoryEvent = StoryFact &
  RankedEvidence & {
    readonly sourceRecordId: string;
  };

export interface StoryGate {
  readonly gateCategory?: string | null | undefined;
  readonly processPosition?: string | null | undefined;
  readonly unresolvedGate?: string | null | undefined;
  readonly owner?: string | null | undefined;
  readonly authorization?:
    | {
        readonly satisfied?: boolean | undefined;
        readonly phase?: string | null | undefined;
        readonly conflict?: boolean | undefined;
      }
    | null
    | undefined;
}

export interface StoryWindowInput {
  readonly slaCreatedDate?: DateValue;
  readonly stageEntryDate?: DateValue;
  readonly asOf?: DateValue;
  readonly bufferDays?: number;
  readonly fallbackDays?: number;
}

export interface StoryWindow {
  readonly startDate: string;
  readonly anchorDate: string | null;
  readonly basis: string;
}

export interface StoryGateOverride {
  readonly issueKey: string;
  readonly processPosition?: string | null | undefined;
  readonly unresolvedGate: string | null | undefined;
  readonly owner: string | null | undefined;
  readonly recommendedAction: string | null;
  readonly recommendedActionType: string | null;
  readonly recommendedFollowUpDate?: string | null;
}

export type StoryIssueStatus =
  'Pending' | 'Appeal' | 'Denied' | 'Additional Details' | 'Partial Approval' | 'Resolved';

export type StoryLifecycle = 'Opened' | 'Progressed' | 'Resolved' | 'Conflicting' | 'Superseded';

export type AnnotatedStoryEvent<T extends StoryEvent = StoryEvent> = Omit<
  T,
  'issueKey' | 'lifecycleState' | 'resolvedByEventId' | 'resolutionDate' | 'narrativeContribution'
> &
  StoryEvent & {
    issueKey: string;
    lifecycleState: StoryLifecycle;
    resolvedByEventId: string | null;
    resolutionDate: DateValue;
    narrativeContribution: string;
    preWindowContext: boolean;
  };

export interface StoryIssue<T extends StoryEvent = StoryEvent> {
  issueKey: string;
  state: StoryLifecycle;
  openedDate: DateValue;
  lastUpdatedDate: DateValue;
  openedByEventId: string | null;
  resolvedDate: DateValue;
  resolvedByEventId: string | null;
  latestEventId: string | null;
  latestEvent: AnnotatedStoryEvent<T> | null;
  latestFact: string | null | undefined;
  latestSource?: string;
  latestSourceRecordId?: string;
  currentGate: boolean;
}

export interface StoryOpportunity {
  readonly stage: string | undefined;
  readonly slaCreatedDate?: DateValue;
  readonly stageEntryDate?: DateValue;
}
export interface StorySourceResult {
  readonly source: string;
  readonly status: string;
  readonly collectedAt?: string | undefined;
  readonly failureReason?: string | null | undefined;
}
export interface StoryInput<T extends StoryEvent = StoryEvent> {
  readonly opportunity: StoryOpportunity;
  readonly gate: StoryGate;
  readonly events?: readonly T[];
  readonly sourceResults?: readonly StorySourceResult[];
  readonly asOf?: DateValue;
}
export interface StoryState<T extends StoryEvent = StoryEvent> {
  readonly opportunity: StoryOpportunity;
  readonly gate: StoryGate;
  readonly window: StoryWindow;
  readonly asOfTime: number;
  readonly admitted: T[];
  readonly issues: Map<string, StoryIssue<T>>;
  readonly annotated: AnnotatedStoryEvent<T>[];
  readonly conflicts: Map<string, string>;
  currentGateIssueKey: string;
  currentGateOverride: StoryGateOverride | null;
  gateTransitionEventId: string | null;
}

export interface StoryIssueView {
  readonly issueKey: string;
  readonly state: StoryLifecycle;
  readonly openedDate: string | null;
  readonly lastUpdatedDate: string | null;
  readonly resolvedDate: string | null;
  readonly openedByEventId: string | null;
  readonly resolvedByEventId: string | null;
  readonly latestEventId: string | null;
  readonly latestFact: string | null | undefined;
  readonly currentGate: boolean;
}
export interface SlaStory<T extends StoryEvent = StoryEvent> {
  readonly version: string;
  readonly storyStartDate: string;
  readonly storyAnchorDate: string | null;
  readonly storyWindowBasis: string;
  readonly currentGateIssueKey: string;
  readonly currentGate: string | null | undefined;
  readonly currentGateOverride: StoryGateOverride | null;
  readonly latestSubstantiveEvent: AnnotatedStoryEvent<T> | null;
  readonly timeline: AnnotatedStoryEvent<T>[];
  readonly narrativeEvents: AnnotatedStoryEvent<T>[];
  readonly activeIssues: StoryIssueView[];
  readonly resolvedIssues: StoryIssueView[];
  readonly futureMilestones: AnnotatedStoryEvent<T>[];
  readonly conflicts: string[];
  readonly sourceCoverage: {
    readonly source: string;
    readonly status: string;
    readonly collectedAt: string | undefined;
    readonly failureReason: string | null | undefined;
  }[];
}
