import { GoogleReaderError } from '@headstart-health/google-read-transport';
import {
  GoogleSheetsCaptureReader,
  googleBoundedA1,
  googleSheetTitleA1,
} from '@headstart-health/google-sheets-data';
import type { GoogleGridCapture, GoogleGridRead } from '@headstart-health/google-sheets-data';

import { requireContract as check } from './connector-checkpoint.js';
import { googleAssertionCapture } from './google-assertion-capture.js';
import { captureProperty } from './google-capture-property.js';
import { createGooglePublicationHttp } from './google-publication-http.js';
import type { GooglePublicationHttpOptions } from './google-publication-http.js';
import { planGoogleAssertionReads } from './google-read-plan.js';
import type { GoogleReadAssertion } from './google-read-plan.js';
import { sha256Json } from './json-fingerprint.js';
import type {
  CapturedPublicationActual,
  PublicationReadRequest,
  PublicationWriteAdapter,
} from './publication-executor-types.js';
import type {
  PublicationActualAssertion,
  PublicationAssertion,
  PublicationManifest,
} from './publication-readback-types.js';

type ReadAssertion = Omit<PublicationAssertion, 'expectedHash'> & GoogleReadAssertion;
type Range = Omit<PublicationAssertion, 'expectedHash' | 'id'>;
function metadataOnly(assertion: Range): boolean {
  return assertion.kind === 'basic-filter' || assertion.kind === 'grid-properties';
}
function boundedCoordinates(assertion: Range): GoogleGridRead['range'] {
  const { startRowIndex, endRowIndex, startColumnIndex, endColumnIndex } = assertion;
  check(
    startRowIndex !== undefined &&
      Number.isSafeInteger(startRowIndex) &&
      startRowIndex >= 0 &&
      endRowIndex !== undefined &&
      Number.isSafeInteger(endRowIndex) &&
      endRowIndex > startRowIndex &&
      startColumnIndex !== undefined &&
      Number.isSafeInteger(startColumnIndex) &&
      startColumnIndex >= 0 &&
      endColumnIndex !== undefined &&
      Number.isSafeInteger(endColumnIndex) &&
      endColumnIndex > startColumnIndex,
    'Google read range must be bounded'
  );
  check(
    (assertion.rowCount === undefined || assertion.rowCount === endRowIndex - startRowIndex) &&
      (assertion.columnCount === undefined ||
        assertion.columnCount === endColumnIndex - startColumnIndex),
    'Google assertion dimensions disagree with its exact coordinates'
  );
  return { startRowIndex, endRowIndex, startColumnIndex, endColumnIndex };
}
export function assertionA1(assertion: Range): string {
  check(
    typeof assertion.title === 'string' && assertion.title.length > 0,
    'Google read requires a metadata-resolved title'
  );
  if (metadataOnly(assertion)) return googleSheetTitleA1(assertion.title);
  return googleBoundedA1(assertion.title, boundedCoordinates(assertion));
}
function assertRequests(
  assertions: PublicationReadRequest['assertions']
): asserts assertions is readonly ReadAssertion[] {
  for (const assertion of assertions) {
    assertionA1(assertion);
    check(
      typeof assertion.kind === 'string' &&
        typeof assertion.sheetId === 'number' &&
        typeof assertion.title === 'string',
      'Google assertion requires resolved sheet identity'
    );
  }
}
export interface GooglePublicationAdapterOptions extends Omit<
  GooglePublicationHttpOptions,
  'spreadsheetId'
> {
  readonly manifest: Pick<PublicationManifest, 'spreadsheetId' | 'runId' | 'stages'>;
  readonly checkConcurrency: PublicationWriteAdapter['checkConcurrency'];
  readonly maxCoalescedCells?: number;
}
export interface GooglePublicationAdapter extends PublicationWriteAdapter {
  readonly readMetadata: () => Promise<GoogleGridCapture>;
  readonly readAssertions: (
    input: GooglePublicationReadRequest
  ) => Promise<CapturedPublicationActual>;
}
export interface GooglePublicationReadRequest extends Omit<
  PublicationReadRequest,
  'onIncompleteCapture'
> {
  readonly onIncompleteCapture?: PublicationReadRequest['onIncompleteCapture'];
}
interface SampleOptions {
  readonly manifest: GooglePublicationAdapterOptions['manifest'];
  readonly spreadsheetId: string;
  readonly maxCoalescedCells: number;
}
async function readGroup(
  reader: GoogleSheetsCaptureReader,
  spreadsheetId: string,
  range: ReadAssertion
): Promise<GoogleGridCapture> {
  if (metadataOnly(range)) return reader.readMetadata(spreadsheetId, range.title);
  return reader.readGrid({
    spreadsheetId,
    sheet: { sheetId: range.sheetId, title: range.title },
    range: boundedCoordinates(range),
    fields: range.kind === 'dimension-pixels' ? 'dimensions' : 'cells',
  });
}
async function sample(
  input: GooglePublicationReadRequest,
  options: SampleOptions,
  reader: GoogleSheetsCaptureReader
): Promise<CapturedPublicationActual> {
  const { manifest, spreadsheetId, maxCoalescedCells } = options;
  check(
    input.spreadsheetId === spreadsheetId && input.runId === manifest.runId,
    'Google read target mismatch'
  );
  const assertions: PublicationActualAssertion[] = [];
  const responses = new Map<string, GoogleGridCapture>();
  try {
    assertRequests(input.assertions);
    for (const group of planGoogleAssertionReads(input.assertions, maxCoalescedCells)) {
      const family = metadataOnly(group.range)
        ? 'metadata'
        : group.range.kind === 'dimension-pixels'
          ? 'dimensions'
          : 'cells';
      const key = JSON.stringify([assertionA1(group.range), family]);
      let response = responses.get(key);
      if (response === undefined) {
        response = await readGroup(reader, spreadsheetId, group.range);
        responses.set(key, response);
      }
      for (const expected of group.assertions)
        assertions.push(
          googleAssertionCapture(expected, {
            spreadsheetId,
            complete: true,
            range: expected,
            response,
          })
        );
    }
  } catch (error) {
    await input.onIncompleteCapture?.({
      runId: manifest.runId,
      spreadsheetId,
      complete: false,
      expectedAssertions: input.assertions.length,
      assertions,
    });
    throw error;
  }
  return { runId: manifest.runId, spreadsheetId, assertions };
}
/** Construction performs no I/O; only exact prepared writes are exposed to the supervised executor. */
export function createGoogleRestAdapter(
  options: GooglePublicationAdapterOptions
): GooglePublicationAdapter {
  const {
    manifest,
    tokenProvider,
    checkConcurrency,
    fetchImpl = globalThis.fetch,
    maxCoalescedCells = 10_000,
  } = options;
  check(
    typeof tokenProvider === 'function' &&
      typeof checkConcurrency === 'function' &&
      typeof fetchImpl === 'function' &&
      typeof manifest.spreadsheetId === 'string' &&
      manifest.spreadsheetId.length > 0,
    'Explicit Google adapter capabilities are required'
  );
  const spreadsheetId = manifest.spreadsheetId;
  const sampleOptions = { manifest, spreadsheetId, maxCoalescedCells };
  const http = createGooglePublicationHttp({
    ...options,
    spreadsheetId,
    fetchImpl,
  });
  const reader = new GoogleSheetsCaptureReader(http.read);
  return {
    capabilities: {
      exactPreparedWrites: true,
      liveFilters: true,
      userEnteredValues: true,
      formats: true,
    },
    checkConcurrency,
    readMetadata: (): Promise<GoogleGridCapture> => reader.readMetadata(spreadsheetId),
    apply: async (call): Promise<{ ok: true; spreadsheetId: string }> => {
      check(call.spreadsheetId === spreadsheetId, 'Google write target mismatch');
      const stage = manifest.stages.find((item) => item.id === call.stageId);
      check(
        stage !== undefined &&
          sha256Json(call.payload) ===
            captureProperty(captureProperty(stage.calls, String(call.callIndex)), 'payloadHash'),
        'Google call is not an exact prepared payload'
      );
      check(
        Object.keys(call.payload).every((key) =>
          ['requests', 'include_spreadsheet_in_response', 'response_include_grid_data'].includes(
            key
          )
        ),
        'Unknown prepared Google control'
      );
      await http.write(call.payload);
      return { ok: true, spreadsheetId };
    },
    readAssertions: (input): Promise<CapturedPublicationActual> =>
      sample(input, sampleOptions, reader),
  };
}
export function createGoogleReadOnlyAdapter(
  options: Omit<GooglePublicationAdapterOptions, 'checkConcurrency'>
): Pick<GooglePublicationAdapter, 'readMetadata' | 'readAssertions'> & {
  readonly capabilities: {
    readonly liveFilters: true;
    readonly userEnteredValues: true;
    readonly formats: true;
    readonly readOnly: true;
    readonly exactPreparedWrites: false;
  };
} {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const adapter = createGoogleRestAdapter({
    ...options,
    checkConcurrency: (): Promise<never> =>
      Promise.reject(new GoogleReaderError('GOOGLE_READER_CANNOT_AUTHORIZE_WRITES')),
    fetchImpl: (url, init) => {
      if (init.method !== 'GET') throw new GoogleReaderError('GOOGLE_READER_GET_ONLY');
      return fetchImpl(url, init);
    },
  });
  return {
    capabilities: {
      liveFilters: true,
      userEnteredValues: true,
      formats: true,
      readOnly: true,
      exactPreparedWrites: false,
    },
    readMetadata: adapter.readMetadata,
    readAssertions: adapter.readAssertions,
  };
}
export { GoogleAdapterError } from './google-publication-http.js';
