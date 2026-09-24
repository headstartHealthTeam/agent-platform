import type { DateValue } from './dates.js';
import type { DelayHistory } from './delay-history-types.js';

export interface PublicationQualityInput {
  readonly delayHistory?: DelayHistory | null;
  readonly summary?: unknown;
  readonly operationalSummary?: string;
  readonly action?: unknown;
  readonly actionType?: string | null;
  readonly actionOwner?: unknown;
  readonly followUpDate?: DateValue;
  readonly readyToCopy?: unknown;
  readonly evidenceStatus?: unknown;
  readonly conflicts?: readonly unknown[];
  readonly rawEvidence?: readonly unknown[];
  readonly futureMilestoneDates?: readonly DateValue[];
  readonly latestUpdateDate?: DateValue;
  readonly identityConflict?: unknown;
  readonly unparsedAdmittedNote?: boolean;
  readonly asOf?: DateValue;
}

export interface PublicationQualityResult {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

export interface OperationalSummaryRow<TId = string, TName = string> {
  readonly opportunityId?: TId | null | undefined;
  readonly opportunityName?: TName | null | undefined;
  readonly operationalSummary?: unknown;
}

export interface DuplicateSummaryRow<TId = string, TName = string> {
  readonly opportunityId: NonNullable<TId> | '';
  readonly opportunityName: NonNullable<TName> | '';
  readonly operationalSummary: string;
}

export interface DuplicateSummary<TId = string, TName = string> {
  readonly operationalSummary: string;
  readonly rows: readonly DuplicateSummaryRow<TId, TName>[];
}
