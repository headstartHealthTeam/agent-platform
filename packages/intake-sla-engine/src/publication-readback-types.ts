import type { PublicationPlanHashStage } from './publication-plan.js';

export interface PublicationCoordinates {
  readonly sheetId?: number | undefined;
  readonly startRowIndex?: number | undefined;
  readonly endRowIndex?: number | undefined;
  readonly startColumnIndex?: number | undefined;
  readonly endColumnIndex?: number | undefined;
}
export interface PublicationAssertion extends PublicationCoordinates {
  readonly id: string;
  readonly expectedHash: string;
  readonly kind?: string | undefined;
  readonly title?: string | undefined;
  readonly rowCount?: number | undefined;
  readonly columnCount?: number | undefined;
  readonly dimension?: string | undefined;
  readonly blankBooleanCellsAsFalse?: readonly (readonly [number, number])[] | null | undefined;
}
export interface PublicationStage extends PublicationPlanHashStage {
  readonly assertions?: readonly PublicationAssertion[] | null | undefined;
}
export interface PublicationManifest {
  readonly runId: string;
  readonly spreadsheetId: string;
  readonly planHash: string;
  readonly stages: readonly PublicationStage[];
  readonly finalAssertions?: readonly PublicationAssertion[] | undefined;
}
export interface VerifiedPublicationAssertion {
  readonly id: string;
  readonly actualHash: string;
}
export interface PublicationStageObservation {
  readonly id: string;
  readonly payloadHash?: unknown;
  readonly captureVersion?: unknown;
  readonly evidenceHash?: string | null | undefined;
  readonly verifiedAt?: string | null | undefined;
  readonly assertions?: readonly VerifiedPublicationAssertion[] | null | undefined;
}
export interface PublicationObservations {
  readonly schemaVersion?: number;
  readonly runId?: string | undefined;
  readonly spreadsheetId?: string | undefined;
  readonly planHash?: string | undefined;
  readonly stages?: readonly PublicationStageObservation[] | null | undefined;
}
export interface PublicationActualAssertion extends PublicationCoordinates {
  readonly id: string;
  readonly values?: unknown[][] | null | undefined;
  readonly gridProperties?:
    { readonly rowCount?: unknown; readonly columnCount?: unknown } | null | undefined;
  readonly rule?: unknown;
  readonly basicFilter?: unknown;
  readonly format?: unknown;
  readonly dimension?: string | undefined;
  readonly pixels?: readonly number[] | null | undefined;
  readonly backgroundColorStyles?: readonly (readonly unknown[])[] | null | undefined;
}
export interface PublicationActual {
  readonly runId?: string | undefined;
  readonly spreadsheetId?: string | undefined;
  readonly assertions?: readonly PublicationActualAssertion[] | null | undefined;
}
export type PublicationStageStatus =
  | { readonly id: string; readonly verified: true; readonly source: 'current-state' }
  | {
      readonly id: string;
      readonly verified: false;
      readonly reason: 'not-applied-or-not-read-back';
    }
  | {
      readonly id: string;
      readonly verified: true;
      readonly verifiedAt: string | null;
      readonly source: 'stage-readback';
    };
export interface PublicationReadback {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly spreadsheetId: string;
  readonly planHash: string;
  readonly publicationStatus: 'Published' | 'In Progress';
  readonly complete: boolean;
  readonly stages: PublicationStageStatus[];
  readonly nextStage: string | null;
}
export interface PublicationGateBinding {
  readonly passed?: unknown;
  readonly runId?: string | undefined;
  readonly spreadsheetId?: string | undefined;
  readonly planHash?: string | undefined;
}
export interface PublicationPayload {
  readonly requests?: readonly unknown[] | null | undefined;
}
export interface PublicationLoadedCall {
  readonly file?: unknown;
  readonly payload: PublicationPayload;
}
