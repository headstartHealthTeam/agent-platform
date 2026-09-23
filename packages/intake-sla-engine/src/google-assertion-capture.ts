import { requireContract as check } from './connector-checkpoint.js';
import { captureProperty as property } from './google-capture-property.js';
import type { GoogleAssertionCaptureInput } from './google-capture-types.js';
import { sha256Json } from './json-fingerprint.js';
import type {
  PublicationActualAssertion,
  PublicationAssertion,
  PublicationCoordinates,
} from './publication-readback-types.js';

const COORDINATES = [
  'sheetId',
  'startRowIndex',
  'endRowIndex',
  'startColumnIndex',
  'endColumnIndex',
] as const;
type Expected = Omit<PublicationAssertion, 'expectedHash'>;
function arrayProperty<T>(array: readonly T[] | undefined, index: number): T | undefined {
  // eslint-disable-next-line security/detect-object-injection -- Numeric read-only array lookup must preserve property semantics, including fractional indices; .at would truncate them.
  return array?.[index];
}
function list(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}
function optionalList(value: unknown): readonly unknown[] {
  if (value === undefined || value === null) return [];
  if (!list(value)) throw new TypeError('Google capture array is invalid');
  return value;
}
function blockOffset(block: unknown, field: string): number {
  if (block === null || block === undefined) throw new TypeError('Missing Google grid block');
  return Number(property(block, field) ?? 0);
}
function sheetIdentity(sheet: unknown): unknown {
  if (sheet === null || sheet === undefined) throw new TypeError('Missing Google sheet');
  return property(property(sheet, 'properties'), 'sheetId');
}
function coordinates(
  expected: Expected,
  capture: GoogleAssertionCaptureInput<unknown>
): PublicationCoordinates {
  for (const key of COORDINATES.filter((field) => Object.hasOwn(expected, field))) {
    const value: unknown = Reflect.get(expected, key);
    const captured: unknown =
      capture.range === undefined || capture.range === null
        ? undefined
        : Reflect.get(capture.range, key);
    check(captured === value, 'Google read request range mismatch');
  }
  return {
    ...(Object.hasOwn(expected, 'sheetId') ? { sheetId: expected.sheetId } : {}),
    ...(Object.hasOwn(expected, 'startRowIndex') ? { startRowIndex: expected.startRowIndex } : {}),
    ...(Object.hasOwn(expected, 'endRowIndex') ? { endRowIndex: expected.endRowIndex } : {}),
    ...(Object.hasOwn(expected, 'startColumnIndex')
      ? { startColumnIndex: expected.startColumnIndex }
      : {}),
    ...(Object.hasOwn(expected, 'endColumnIndex')
      ? { endColumnIndex: expected.endColumnIndex }
      : {}),
  };
}
function capturedSheet(
  expected: Expected,
  capture: GoogleAssertionCaptureInput<unknown> | null | undefined
): unknown {
  check(
    property(capture?.response, 'spreadsheetId') === capture?.spreadsheetId &&
      capture?.complete === true,
    'Google assertion capture is incomplete'
  );
  const matches = optionalList(property(capture.response, 'sheets')).filter(
    (sheet) => sheetIdentity(sheet) === expected.sheetId
  );
  const sheet = matches[0];
  check(sheet !== undefined && matches.length === 1, 'Google assertion has wrong sheet identity');
  return sheet;
}
function dimensionPixels(expected: Expected, blocks: readonly unknown[]): number[] {
  check(
    ['ROWS', 'COLUMNS'].some((dimension) => dimension === expected.dimension),
    'Invalid dimension assertion'
  );
  const rows = expected.dimension === 'ROWS';
  const start = (rows ? expected.startRowIndex : expected.startColumnIndex) ?? Number.NaN;
  const end = (rows ? expected.endRowIndex : expected.endColumnIndex) ?? Number.NaN;
  return Array.from({ length: end - start }, (_, offset) => {
    const index = start + offset;
    const matches = blocks.flatMap((block) => {
      const local = index - blockOffset(block, rows ? 'startRow' : 'startColumn');
      const dimensions = optionalList(property(block, rows ? 'rowMetadata' : 'columnMetadata'));
      return local >= 0 && local < dimensions.length
        ? [property(arrayProperty(dimensions, local), 'pixelSize')]
        : [];
    });
    const pixels = matches[0];
    check(
      matches.length === 1 &&
        typeof pixels === 'number' &&
        Number.isSafeInteger(pixels) &&
        pixels > 0,
      'Missing, overlapping, or invalid Google dimension capture'
    );
    return pixels;
  });
}
function cellAt(blocks: readonly unknown[], row: number, column: number): unknown {
  const matches = blocks.filter(
    (block) =>
      row >= blockOffset(block, 'startRow') &&
      column >= blockOffset(block, 'startColumn') &&
      row < blockOffset(block, 'startRow') + optionalList(property(block, 'rowData')).length &&
      column < blockOffset(block, 'startColumn') + blockCells(block, row).length
  );
  check(matches.length <= 1, 'Overlapping Google grid captures');
  const block = matches[0];
  if (block === undefined) return {};
  return arrayProperty(blockCells(block, row), column - blockOffset(block, 'startColumn')) ?? {};
}
function blockCells(block: unknown, row: number): readonly unknown[] {
  return optionalList(
    property(
      arrayProperty(optionalList(property(block, 'rowData')), row - blockOffset(block, 'startRow')),
      'values'
    )
  );
}
function cellMatrix<T>(
  expected: Expected,
  blocks: readonly unknown[],
  select: (cell: unknown) => T
): T[][] {
  const rows =
    expected.rowCount ??
    (expected.endRowIndex ?? Number.NaN) - (expected.startRowIndex ?? Number.NaN);
  const columns =
    expected.columnCount ??
    (expected.endColumnIndex ?? Number.NaN) - (expected.startColumnIndex ?? Number.NaN);
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) =>
      select(
        cellAt(
          blocks,
          (expected.startRowIndex ?? 0) + row,
          (expected.startColumnIndex ?? 0) + column
        )
      )
    )
  );
}
function dataValidation(cell: unknown): unknown {
  const value = property(cell, 'dataValidation');
  const present = Boolean(value);
  if (!present) return null;
  // Object spread preserves all own enumerable fields, including unknown provider metadata.
  const entries: [string, unknown][] =
    value === null || value === undefined ? [] : Object.entries(value);
  const rule = Object.fromEntries(entries);
  if (property(rule['condition'], 'type') === 'BOOLEAN') delete rule['showCustomUi'];
  return rule;
}
function rangeActual(
  expected: Expected,
  blocks: readonly unknown[]
): Partial<PublicationActualAssertion> {
  switch (expected.kind) {
    case 'values':
      return {
        values: cellMatrix(expected, blocks, (cell) => property(cell, 'userEnteredValue') ?? null),
      };
    case 'background-color-styles':
      return {
        backgroundColorStyles: cellMatrix(
          expected,
          blocks,
          (cell) => property(property(cell, 'userEnteredFormat'), 'backgroundColorStyle') ?? null
        ),
      };
    case 'text-layout': {
      const formats = cellMatrix(expected, blocks, (cell) => ({
        wrapStrategy: property(property(cell, 'userEnteredFormat'), 'wrapStrategy') ?? null,
        verticalAlignment:
          property(property(cell, 'userEnteredFormat'), 'verticalAlignment') ?? null,
      })).flat();
      check(
        formats.length > 0 &&
          formats.every((format) => sha256Json(format) === sha256Json(formats[0])),
        'Google text layout differs within its exact range'
      );
      return { format: formats[0] };
    }
    case 'data-validation': {
      const rules = cellMatrix(expected, blocks, dataValidation).flat();
      check(
        rules.length > 0 &&
          Boolean(rules[0]) &&
          rules.every((rule) => sha256Json(rule) === sha256Json(rules[0])),
        'Google validation is missing or differs within the range'
      );
      return { rule: rules[0] };
    }
    case undefined:
    default:
      throw new Error('Unsupported Google assertion kind');
  }
}
export function googleAssertionCapture(
  expected: Expected,
  capture: GoogleAssertionCaptureInput<unknown>
): PublicationActualAssertion {
  const sheet = capturedSheet(expected, capture);
  const base = { id: expected.id, ...coordinates(expected, capture) };
  if (expected.kind === 'grid-properties')
    return { ...base, gridProperties: property(property(sheet, 'properties'), 'gridProperties') };
  if (expected.kind === 'basic-filter') {
    const basicFilter = property(sheet, 'basicFilter');
    const filterPresent = Boolean(basicFilter);
    check(filterPresent, 'Connector does not expose live basic-filter metadata');
    return { ...base, basicFilter };
  }
  const blocks = property(sheet, 'data');
  check(list(blocks), 'Google grid data was not captured');
  if (expected.kind === 'dimension-pixels')
    return { ...base, dimension: expected.dimension, pixels: dimensionPixels(expected, blocks) };
  return { ...base, ...rangeActual(expected, blocks) };
}
