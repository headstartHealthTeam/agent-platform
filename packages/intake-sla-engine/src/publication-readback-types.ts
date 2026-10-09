import type { PublicationPlanHashStage } from './publication-plan.js';

export interface PublicationCoordinates {
  readonly sheetId?: number | undefined;
  readonly startRowIndex?: number | undefined;
  readonly endRowIndex?: number | undefined;
  readonly startColumnIndex?: number | undefined;
  readonly endColumnIndex?: number | undefined;
}
export interface PublicationAssertionInput {
  readonly id: string;
  readonly expectedHash?: unknown;
  readonly kind?: unknown;
  readonly title?: unknown;
  readonly sheetId?: unknown;
  readonly startRowIndex?: unknown;
  readonly endRowIndex?: unknown;
  readonly startColumnIndex?: unknown;
  readonly endColumnIndex?: unknown;
  readonly rowCount?: unknown;
  readonly columnCount?: unknown;
  readonly dimension?: unknown;
  readonly blankBooleanCellsAsFalse?: unknown;
}
export interface PublicationAssertion
  extends Omit<PublicationAssertionInput, keyof PublicationCoordinates>, PublicationCoordinates {
  readonly id: string;
  readonly expectedHash: string;
  readonly kind?: string | undefined;
  readonly title?: string | undefined;
  readonly rowCount?: number | undefined;
  readonly columnCount?: number | undefined;
  readonly dimension?: string | undefined;
  readonly blankBooleanCellsAsFalse?: readonly (readonly [number, number])[] | null | undefined;
}
export interface PublicationStageInput extends PublicationPlanHashStage {
  readonly assertions?: readonly PublicationAssertionInput[] | null | undefined;
}
export interface PublicationStage extends PublicationStageInput {
  readonly assertions?: readonly PublicationAssertion[] | null | undefined;
}
export interface PublicationManifestInput {
  readonly runId: string;
  readonly spreadsheetId: string;
  readonly planHash: string;
  readonly stages: readonly PublicationStageInput[];
  readonly finalAssertions?: readonly PublicationAssertionInput[] | undefined;
}
export interface PublicationManifest extends PublicationManifestInput {
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
  readonly evidenceHash?: unknown;
  readonly verifiedAt?: unknown;
  readonly assertions?: unknown;
}
export interface PublicationObservations {
  readonly schemaVersion?: unknown;
  readonly runId?: string | undefined;
  readonly spreadsheetId?: string | undefined;
  readonly planHash?: string | undefined;
  readonly stages?: readonly PublicationStageObservation[] | null | undefined;
}
/** Input boundary: retain raw evidence; each assertion verifier narrows only what it consumes. */
export interface PublicationActualAssertionInput {
  readonly id: string;
  readonly sheetId?: unknown;
  readonly startRowIndex?: unknown;
  readonly endRowIndex?: unknown;
  readonly startColumnIndex?: unknown;
  readonly endColumnIndex?: unknown;
  readonly values?: unknown;
  readonly gridProperties?: unknown;
  readonly rule?: unknown;
  readonly basicFilter?: unknown;
  readonly format?: unknown;
  readonly dimension?: unknown;
  readonly pixels?: unknown;
  readonly backgroundColorStyles?: unknown;
}
export interface PublicationActualAssertion
  extends
    Omit<PublicationActualAssertionInput, keyof PublicationCoordinates>,
    PublicationCoordinates {
  readonly id: string;
  readonly values?: unknown[][] | null | undefined;
  readonly gridProperties?: unknown;
  readonly rule?: unknown;
  readonly basicFilter?: unknown;
  readonly format?: unknown;
  readonly dimension?: string | undefined;
  readonly pixels?: readonly number[] | null | undefined;
  readonly backgroundColorStyles?: readonly (readonly unknown[])[] | null | undefined;
}
export interface PublicationActual {
  readonly runId?: unknown;
  readonly spreadsheetId?: unknown;
  readonly assertions?: readonly PublicationActualAssertionInput[] | null | undefined;
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
      readonly verifiedAt: unknown;
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
