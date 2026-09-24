import type { DateValue } from './dates.js';

/** Already admitted findings; history does not interpret raw source content. */
export interface DelayHistoryEvent {
  readonly opportunityId?: string | undefined;
  readonly source: string;
  readonly sourceRecordId: string;
  readonly eventDate?: DateValue;
  readonly substantive: boolean;
  readonly matchQuality: string;
  readonly relationship: string;
  readonly text?: string | undefined;
  readonly issueKey?: string | null | undefined;
  readonly factType?: string | null | undefined;
  readonly lifecycleState?: string | null | undefined;
  readonly resolutionDate?: DateValue;
  readonly resolvedByEventId?: string | null | undefined;
}

export interface DelayHistoryInput {
  readonly opportunity: { readonly id: string; readonly slaCreatedDate?: DateValue };
  readonly story: {
    readonly storyAnchorDate?: DateValue;
    readonly timeline?: readonly DelayHistoryEvent[];
  };
  readonly asOf?: DateValue;
}

export interface DelayHistoryReference {
  readonly source: string;
  readonly sourceRecordId: string;
  readonly date: string | null;
  readonly lifecycleState: string | null | undefined;
  readonly resolutionDate: string | null;
  readonly resolvedByEventId: string | null;
}

export interface DelayHistoryEntry {
  readonly key: string;
  readonly issueKey: string | null | undefined;
  readonly factType: string | null | undefined;
  readonly fact: string;
  readonly firstDate: string | null;
  lastDate: string | null;
  readonly beforeSla: boolean;
  readonly references: DelayHistoryReference[];
}

export interface DelayHistory {
  readonly startDate: string | null;
  readonly asOf: string | null;
  readonly entries: DelayHistoryEntry[];
  readonly openingGap: string;
}

export interface DelayHistoryOmission {
  readonly issueKey: string | null | undefined;
  readonly date: string | null;
  readonly references: readonly DelayHistoryReference[];
}

export interface DelayHistoryReceipt {
  readonly opportunityId?: string | null | undefined;
  readonly history?: DelayHistory | null | undefined;
}

export interface DelayHistoryReceiptInput {
  readonly binding?: {
    readonly version?: unknown;
    readonly rows?: unknown;
    readonly artifactHash?: unknown;
  } | null;
  readonly histories?: readonly DelayHistoryReceipt[] | null;
  readonly rows: readonly {
    readonly Salesforce?: unknown;
    readonly 'In-Depth Summary'?: unknown;
  }[];
}

export interface DelayHistoryFinding {
  readonly severity: 'Critical';
  readonly rule: 'delay-history-omission';
  readonly detail: string;
}
