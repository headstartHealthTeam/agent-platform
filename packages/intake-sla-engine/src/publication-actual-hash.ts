import { captureProperty } from './google-capture-property.js';
import { sha256Json } from './json-fingerprint.js';
import type {
  PublicationAssertionInput,
  PublicationActualAssertionInput,
} from './publication-readback-types.js';

const COORDINATES = [
  'sheetId',
  'startRowIndex',
  'startColumnIndex',
  'endRowIndex',
  'endColumnIndex',
] as const;
function list(value: unknown): value is unknown[] {
  return Array.isArray(value);
}
function valuesHash(
  expected: PublicationAssertionInput,
  actual: PublicationActualAssertionInput
): string {
  const captured = actual.values;
  if (!list(captured)) throw new Error(`${expected.id} requires actual values`);
  const rowCount = Number(expected.rowCount);
  const columnCount = Number(expected.columnCount);
  let values = captured;
  if (Number.isInteger(rowCount) && Number.isInteger(columnCount)) {
    if (
      captured.length > rowCount ||
      captured.some((row) => !list(row) || row.length > columnCount)
    )
      throw new Error(`${expected.id} returned values outside its exact range`);
    values = Array.from({ length: rowCount }, (_, row) =>
      Array.from({ length: columnCount }, (_, column) => {
        const cells = captured.at(row);
        return list(cells) ? (cells.at(column) ?? null) : null;
      })
    );
  }
  normalizeCheckboxes(values, expected.blankBooleanCellsAsFalse ?? []);
  return sha256Json(values);
}
function normalizeCheckboxes(values: unknown[], coordinates: unknown): void {
  if (!list(coordinates) && typeof coordinates !== 'string')
    throw new TypeError('Invalid checkbox coordinates');
  for (const pair of coordinates) {
    if (!list(pair) && typeof pair !== 'string') throw new TypeError('Invalid checkbox coordinate');
    const [row, column] = pair;
    normalizeCheckbox(values, row, column);
  }
}
function normalizeCheckbox(values: unknown[], row: unknown, column: unknown): void {
  const cells: unknown = Reflect.get(values, String(row));
  if (cells === null || cells === undefined) return;
  if (typeof cells !== 'object' && typeof cells !== 'function') return;
  const value: unknown = Reflect.get(cells, String(column));
  if (
    value === null ||
    (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)
  ) {
    // Only an explicitly listed unchecked cell is canonicalized, as in the approved verifier.
    if (!Reflect.set(cells, String(column), { boolValue: false }))
      throw new TypeError('Cannot normalize a read-only checkbox cell');
  }
}
function dimensionHash(
  expected: PublicationAssertionInput,
  actual: PublicationActualAssertionInput
): string {
  const count =
    expected.dimension === 'ROWS'
      ? Number(expected.endRowIndex) - Number(expected.startRowIndex)
      : Number(expected.endColumnIndex) - Number(expected.startColumnIndex);
  const pixels = actual.pixels;
  if (
    actual.dimension !== expected.dimension ||
    !list(pixels) ||
    pixels.length !== count ||
    pixels.some((value) => typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)
  )
    throw new Error(`${expected.id} requires exact dimension pixels`);
  return sha256Json(pixels);
}
function colorStyle(style: unknown): unknown {
  if (style === null || typeof style !== 'object') return style;
  const rgb: unknown = Reflect.get(style, 'rgbColor');
  const hasColor = Boolean(rgb);
  if (!hasColor || rgb === null || rgb === undefined) return style;
  const entries: [string, unknown][] = Object.entries(rgb);
  return {
    ...style,
    rgbColor: Object.fromEntries(
      entries.map(([component, value]) => [component, Math.fround(Number(value))])
    ),
  };
}
function colorsHash(
  expected: PublicationAssertionInput,
  actual: PublicationActualAssertionInput
): string {
  const captured = actual.backgroundColorStyles;
  if (!list(captured)) throw new Error(`${expected.id} requires actual background color styles`);
  const rowCount = Number(expected.rowCount),
    columnCount = Number(expected.columnCount);
  if (captured.length > rowCount || captured.some((row) => !list(row) || row.length > columnCount))
    throw new Error(`${expected.id} returned colors outside its exact range`);
  return sha256Json(
    Array.from({ length: rowCount }, (_, row) =>
      Array.from({ length: columnCount }, (_, column) => {
        const cells = captured.at(row);
        return colorStyle(list(cells) ? (cells.at(column) ?? null) : null);
      })
    )
  );
}
function requiredHash(value: unknown, id: string, label: string): string {
  const present = Boolean(value);
  if (!present) throw new Error(`${id} requires ${label}`);
  return sha256Json(value);
}
export function actualHashForPublicationAssertion(
  expected: PublicationAssertionInput,
  actual: PublicationActualAssertionInput
): string {
  for (const field of COORDINATES)
    if (
      Object.hasOwn(expected, field) &&
      Reflect.get(actual, field) !== Reflect.get(expected, field)
    )
      throw new Error(`${expected.id} was read from the wrong ${field}`);
  switch (expected.kind) {
    case 'values':
      return valuesHash(expected, actual);
    case 'grid-properties': {
      const present = Boolean(actual.gridProperties);
      if (!present) throw new Error(`${expected.id} requires actual grid properties`);
      return sha256Json({
        rowCount: Number(captureProperty(actual.gridProperties, 'rowCount')),
        columnCount: Number(captureProperty(actual.gridProperties, 'columnCount')),
      });
    }
    case 'data-validation':
      return requiredHash(actual.rule, expected.id, 'the actual data-validation rule');
    case 'basic-filter':
      return requiredHash(actual.basicFilter, expected.id, 'the actual basic filter');
    case 'text-layout':
      return requiredHash(actual.format, expected.id, 'actual text layout');
    case 'dimension-pixels':
      return dimensionHash(expected, actual);
    case 'background-color-styles':
      return colorsHash(expected, actual);
    case undefined:
    default:
      throw new Error(`Unsupported publication assertion kind: ${String(expected.kind)}`);
  }
}
