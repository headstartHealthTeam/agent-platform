import { sha256Json } from './json-fingerprint.js';
import type {
  PublicationAssertion,
  PublicationActualAssertion,
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
function valuesHash(expected: PublicationAssertion, actual: PublicationActualAssertion): string {
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
      Array.from({ length: columnCount }, (_, column) => captured.at(row)?.at(column) ?? null)
    );
  }
  normalizeCheckboxes(values, expected.blankBooleanCellsAsFalse ?? []);
  return sha256Json(values);
}
function normalizeCheckboxes(
  values: unknown[][],
  coordinates: readonly (readonly [number, number])[]
): void {
  for (const [row, column] of coordinates) {
    const cells: unknown = Reflect.get(values, String(row));
    if (cells === null || cells === undefined) continue;
    if (typeof cells !== 'object' && typeof cells !== 'function') continue;
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
}
function dimensionHash(expected: PublicationAssertion, actual: PublicationActualAssertion): string {
  const count =
    expected.dimension === 'ROWS'
      ? (expected.endRowIndex ?? Number.NaN) - (expected.startRowIndex ?? Number.NaN)
      : (expected.endColumnIndex ?? Number.NaN) - (expected.startColumnIndex ?? Number.NaN);
  const pixels = actual.pixels;
  if (
    actual.dimension !== expected.dimension ||
    !list(pixels) ||
    pixels.length !== count ||
    pixels.some((value) => !Number.isSafeInteger(value) || value <= 0)
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
function colorsHash(expected: PublicationAssertion, actual: PublicationActualAssertion): string {
  const captured = actual.backgroundColorStyles;
  if (!list(captured)) throw new Error(`${expected.id} requires actual background color styles`);
  const rowCount = Number(expected.rowCount),
    columnCount = Number(expected.columnCount);
  if (captured.length > rowCount || captured.some((row) => !list(row) || row.length > columnCount))
    throw new Error(`${expected.id} returned colors outside its exact range`);
  return sha256Json(
    Array.from({ length: rowCount }, (_, row) =>
      Array.from({ length: columnCount }, (_, column) =>
        colorStyle(captured.at(row)?.at(column) ?? null)
      )
    )
  );
}
function requiredHash(value: unknown, id: string, label: string): string {
  const present = Boolean(value);
  if (!present) throw new Error(`${id} requires ${label}`);
  return sha256Json(value);
}
export function actualHashForPublicationAssertion(
  expected: PublicationAssertion,
  actual: PublicationActualAssertion
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
      if (!actual.gridProperties) throw new Error(`${expected.id} requires actual grid properties`);
      return sha256Json({
        rowCount: Number(actual.gridProperties.rowCount),
        columnCount: Number(actual.gridProperties.columnCount),
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
