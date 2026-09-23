import type { GoogleGridCell } from '@headstart-health/google-sheets-data';

import type { PublicationCoordinates } from './publication-readback-types.js';

/** Native capture envelope: partial metadata is intentional; provider read results also compose. */
export interface GoogleCapturedCell {
  readonly userEnteredValue?: unknown;
  readonly userEnteredFormat?: GoogleGridCell['userEnteredFormat'] | null;
  readonly dataValidation?: GoogleGridCell['dataValidation'] | null;
}
export interface GoogleCapturedBlock {
  readonly startRow?: number | undefined;
  readonly startColumn?: number | undefined;
  readonly rowData?:
    readonly { readonly values?: readonly (GoogleCapturedCell | null)[] | undefined }[] | undefined;
  readonly rowMetadata?: readonly { readonly pixelSize?: number | undefined }[] | undefined;
  readonly columnMetadata?: readonly { readonly pixelSize?: number | undefined }[] | undefined;
}
export interface GoogleCapturedSheet {
  readonly properties?:
    | {
        readonly sheetId?: number | undefined;
        readonly gridProperties?:
          { readonly rowCount?: unknown; readonly columnCount?: unknown } | undefined;
      }
    | undefined;
  readonly basicFilter?: unknown;
  readonly data?: readonly GoogleCapturedBlock[] | undefined;
}
export interface GoogleAssertionCaptureInput<
  Response = {
    readonly spreadsheetId?: string | undefined;
    readonly sheets?: readonly GoogleCapturedSheet[] | undefined;
  },
> {
  readonly spreadsheetId?: string | undefined;
  readonly complete?: unknown;
  readonly range?: PublicationCoordinates | null | undefined;
  readonly response?: Response | undefined;
}
export interface GoogleStateSheet {
  readonly title: string;
  readonly sheetId?: number | undefined;
  readonly usedRowCount?: number | undefined;
  readonly rowCount?: number | undefined;
  readonly columnCount?: number | undefined;
  readonly rangeComplete?: unknown;
  readonly values?: readonly (readonly unknown[])[] | undefined;
}
export interface GoogleConcurrencyCapture {
  readonly currentRunId?: string | undefined;
  readonly checkedAt?: string | undefined;
  readonly conflict?: unknown;
  readonly operatorVerified?: unknown;
  readonly exactResumeVerified?: unknown;
}
export interface GoogleRevalidationCapture {
  readonly checkedAt?: string | undefined;
  readonly response?:
    | {
        readonly isError?: unknown;
        readonly structuredContent?:
          | {
              readonly id?: string | undefined;
              readonly mime_type?: string | undefined;
              readonly modified_time?: string | undefined;
            }
          | undefined;
      }
    | undefined;
  readonly concurrency?: GoogleConcurrencyCapture | undefined;
}
export interface GoogleStateCaptureInput {
  readonly version?: unknown;
  readonly spreadsheetId?: string | undefined;
  readonly capturedAt?: string | undefined;
  readonly valueRenderOption?: unknown;
  readonly extentsVerified?: unknown;
  readonly sheets?: readonly GoogleStateSheet[] | undefined;
  readonly revalidation?: GoogleRevalidationCapture | null | undefined;
  readonly concurrency?: GoogleConcurrencyCapture | undefined;
}
