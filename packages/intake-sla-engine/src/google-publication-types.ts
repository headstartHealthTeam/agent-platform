import type { GoogleGridCell } from '@headstart-health/google-sheets-data';

import type { GooglePresentationRequest } from './google-presentation.js';
import type { PublicationAssertion, PublicationStage } from './publication-readback-types.js';
import type { ReviewerSnapshot } from './publication-state.js';

export type GooglePublicationRows = readonly (readonly unknown[])[];
export type GooglePublicationCell = Pick<GoogleGridCell, 'userEnteredValue'>;
export interface GooglePublicationRange {
  readonly sheetId: number;
  readonly startRowIndex: number;
  readonly endRowIndex: number;
  readonly startColumnIndex: number;
  readonly endColumnIndex: number;
}
export interface GooglePublicationUpdate {
  readonly range: GooglePublicationRange;
  readonly rows: readonly { readonly values: readonly GooglePublicationCell[] }[];
  readonly fields: 'userEnteredValue';
}
export interface GooglePublicationColor {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}
export type GooglePublicationRequest =
  | GooglePresentationRequest
  | { readonly updateCells: GooglePublicationUpdate }
  | {
      readonly repeatCell: {
        readonly range: GooglePublicationRange;
        readonly cell: {
          readonly userEnteredFormat?: {
            readonly backgroundColorStyle: { readonly rgbColor: GooglePublicationColor };
          };
        };
        readonly fields: string;
      };
    }
  | {
      readonly updateSheetProperties: {
        readonly properties: {
          readonly sheetId: number;
          readonly gridProperties: { readonly rowCount?: number; readonly columnCount?: number };
        };
        readonly fields: string;
      };
    }
  | {
      readonly setDataValidation: {
        readonly range: GooglePublicationRange;
        readonly rule: { readonly condition: { readonly type: 'BOOLEAN' }; readonly strict: true };
      };
    }
  | { readonly setBasicFilter: { readonly filter: { readonly range: GooglePublicationRange } } };
export interface GooglePublicationPayload {
  readonly requests: readonly GooglePublicationRequest[];
  readonly include_spreadsheet_in_response: false;
  readonly response_include_grid_data: false;
}
export interface GooglePreparedStage extends PublicationStage {
  readonly dependsOn: string | null;
  readonly terminal: boolean;
  readonly alreadySatisfied: boolean;
  readonly payload: GooglePublicationPayload;
  readonly payloadHash: string;
  readonly assertions: readonly PublicationAssertion[];
}
export interface GooglePublicationFragment {
  readonly requests: GooglePublicationRequest[];
  readonly assertions: PublicationAssertion[];
}
export interface GooglePublicationMetadataSheet {
  readonly title: string;
  readonly sheetId?: unknown;
  readonly rowCount?: unknown;
  readonly columnCount?: unknown;
  readonly gridProperties?: { readonly rowCount?: unknown; readonly columnCount?: unknown } | null;
}
export interface GooglePublicationStateSheet {
  readonly title: string;
  readonly sheetId?: unknown;
  readonly usedRowCount?: unknown;
  readonly values?: GooglePublicationRows | null;
}
export interface GooglePublicationLiveSheet {
  readonly sheetId: number;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly usedRowCount: number;
  readonly values: unknown[][];
}
export type GoogleWorkbookSheets = Readonly<Record<string, readonly unknown[] | undefined>>;
/** Planner hashes metadata without interpreting freshness; freshness-owning consumers stay strict. */
export interface GooglePublicationReviewerState extends Pick<ReviewerSnapshot, 'rows'> {
  readonly capturedAt?: unknown;
  readonly revalidatedAt?: unknown;
  readonly revalidationHash?: unknown;
  readonly spreadsheetId?: unknown;
}
export interface GooglePublicationPlanInputs {
  readonly workbook: unknown;
  readonly manifest: { readonly runId: string };
  readonly metadata: {
    readonly spreadsheetId: string;
    readonly sheets?: readonly unknown[] | null;
  };
  readonly liveState: {
    readonly spreadsheetId: string;
    readonly sheets?: readonly unknown[] | null;
  };
  readonly currentReviewerState: GooglePublicationReviewerState;
  readonly maxRequestBytes?: number;
}
export interface ReviewerPreservationProof {
  readonly schemaVersion: 1;
  readonly passed: true;
  readonly basis: string;
  readonly currentReviewerStateHash: string;
  readonly counts: {
    rows: number;
    cells: number;
    blank: number;
    unchecked: number;
    populated: number;
    newRows: number;
    removedRows: number;
  };
  readonly queues: { title: string; rows: number; payloadHash: string; reviewerRowsHash: string }[];
}
export interface GooglePublicationPlan {
  readonly schemaVersion: 1;
  readonly spreadsheetId: string;
  readonly runId: string;
  readonly maxRequestBytes: number;
  readonly stages: GooglePreparedStage[];
  readonly finalAssertions: PublicationAssertion[];
  readonly planHash: string;
  readonly reviewerPreservation: ReviewerPreservationProof;
}
