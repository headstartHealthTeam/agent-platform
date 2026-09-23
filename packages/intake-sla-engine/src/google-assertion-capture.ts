import { requireContract as check } from './connector-checkpoint.js';
import type {
  GoogleAssertionCaptureInput,
  GoogleCapturedBlock,
  GoogleCapturedCell,
  GoogleCapturedSheet,
} from './google-capture-types.js';
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
function coordinates(
  expected: Expected,
  capture: GoogleAssertionCaptureInput
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
  capture: GoogleAssertionCaptureInput | null | undefined
): GoogleCapturedSheet {
  check(
    capture?.response?.spreadsheetId === capture?.spreadsheetId && capture?.complete === true,
    'Google assertion capture is incomplete'
  );
  const matches =
    capture.response?.sheets?.filter((sheet) => sheet.properties?.sheetId === expected.sheetId) ??
    [];
  const sheet = matches[0];
  check(sheet !== undefined && matches.length === 1, 'Google assertion has wrong sheet identity');
  return sheet;
}
function dimensionPixels(expected: Expected, blocks: readonly GoogleCapturedBlock[]): number[] {
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
      const local = index - (rows ? (block.startRow ?? 0) : (block.startColumn ?? 0));
      const dimensions = rows ? block.rowMetadata : block.columnMetadata;
      return local >= 0 && local < (dimensions?.length ?? 0)
        ? [arrayProperty(dimensions, local)?.pixelSize]
        : [];
    });
    const pixels = matches[0];
    check(
      matches.length === 1 && pixels !== undefined && Number.isSafeInteger(pixels) && pixels > 0,
      'Missing, overlapping, or invalid Google dimension capture'
    );
    return pixels;
  });
}
function cellAt(
  blocks: readonly GoogleCapturedBlock[],
  row: number,
  column: number
): GoogleCapturedCell {
  const matches = blocks.filter(
    (block) =>
      row >= (block.startRow ?? 0) &&
      column >= (block.startColumn ?? 0) &&
      row < (block.startRow ?? 0) + (block.rowData?.length ?? 0) &&
      column <
        (block.startColumn ?? 0) +
          (arrayProperty(block.rowData, row - (block.startRow ?? 0))?.values?.length ?? 0)
  );
  check(matches.length <= 1, 'Overlapping Google grid captures');
  const block = matches[0];
  if (block === undefined) return {};
  return (
    arrayProperty(
      arrayProperty(block.rowData, row - (block.startRow ?? 0))?.values,
      column - (block.startColumn ?? 0)
    ) ?? {}
  );
}
function cellMatrix<T>(
  expected: Expected,
  blocks: readonly GoogleCapturedBlock[],
  select: (cell: GoogleCapturedCell) => T
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
function dataValidation(cell: GoogleCapturedCell): GoogleCapturedCell['dataValidation'] | null {
  if (!cell.dataValidation) return null;
  const rule = { ...cell.dataValidation };
  if (rule.condition?.type === 'BOOLEAN') delete rule.showCustomUi;
  return rule;
}
function rangeActual(
  expected: Expected,
  blocks: readonly GoogleCapturedBlock[]
): Partial<PublicationActualAssertion> {
  switch (expected.kind) {
    case 'values':
      return { values: cellMatrix(expected, blocks, (cell) => cell.userEnteredValue ?? null) };
    case 'background-color-styles':
      return {
        backgroundColorStyles: cellMatrix(
          expected,
          blocks,
          (cell) => cell.userEnteredFormat?.backgroundColorStyle ?? null
        ),
      };
    case 'text-layout': {
      const formats = cellMatrix(expected, blocks, (cell) => ({
        wrapStrategy: cell.userEnteredFormat?.wrapStrategy ?? null,
        verticalAlignment: cell.userEnteredFormat?.verticalAlignment ?? null,
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
  capture: GoogleAssertionCaptureInput
): PublicationActualAssertion {
  const sheet = capturedSheet(expected, capture);
  const base = { id: expected.id, ...coordinates(expected, capture) };
  if (expected.kind === 'grid-properties')
    return { ...base, gridProperties: sheet.properties?.gridProperties };
  if (expected.kind === 'basic-filter') {
    const filterPresent = Boolean(sheet.basicFilter);
    check(filterPresent, 'Connector does not expose live basic-filter metadata');
    return { ...base, basicFilter: sheet.basicFilter };
  }
  check(Array.isArray(sheet.data), 'Google grid data was not captured');
  const blocks: readonly GoogleCapturedBlock[] = sheet.data;
  if (expected.kind === 'dimension-pixels')
    return { ...base, dimension: expected.dimension, pixels: dimensionPixels(expected, blocks) };
  return { ...base, ...rangeActual(expected, blocks) };
}
