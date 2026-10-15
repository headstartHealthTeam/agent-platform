import type {
  GooglePublicationColor,
  GooglePublicationFragment,
  GooglePublicationRows,
  GooglePublicationRange,
} from './google-publication-types.js';
import { publicationItem, publicationText } from './google-publication-values.js';
import { sha256Json } from './json-fingerprint.js';

function rgb(hex: string): GooglePublicationColor {
  const value = hex.replace('#', '');
  return {
    red: Math.fround(Number.parseInt(value.slice(0, 2), 16) / 255),
    green: Math.fround(Number.parseInt(value.slice(2, 4), 16) / 255),
    blue: Math.fround(Number.parseInt(value.slice(4, 6), 16) / 255),
  };
}
function colorRange(
  sheetId: number,
  column: number,
  startRowIndex: number,
  endRowIndex: number
): GooglePublicationRange {
  return {
    sheetId,
    startRowIndex,
    endRowIndex,
    startColumnIndex: column,
    endColumnIndex: column + 1,
  };
}
function addColor(
  output: GooglePublicationFragment,
  range: GooglePublicationRange,
  color: string
): void {
  output.requests.push({
    repeatCell: {
      range,
      cell: { userEnteredFormat: { backgroundColorStyle: { rgbColor: rgb(color) } } },
      fields: 'userEnteredFormat.backgroundColorStyle',
    },
  });
}
function freshnessColors(
  output: GooglePublicationFragment,
  title: string,
  sheetId: number,
  rows: GooglePublicationRows,
  column: number,
  usedRowCount: number
): void {
  const end = Math.max(rows.length, usedRowCount);
  if (column < 0 || end <= 1) return;
  addColor(output, colorRange(sheetId, column, 1, end), '#FFFFFF');
  const styles = Array.from({ length: end - 1 }, () => [{ rgbColor: rgb('#FFFFFF') }]);
  const colors = {
    Missing: '#FECACA',
    Stale: '#FED7AA',
    'Semi-Stale': '#FEF3C7',
    Current: '#DCFCE7',
  };
  rows.slice(1).forEach((row, index) => {
    const color: unknown = Reflect.get(colors, publicationText(publicationItem(row, column)));
    const hasColor = Boolean(color);
    if (!hasColor) return;
    if (typeof color !== 'string') throw new TypeError('Invalid freshness color');
    styles.splice(index, 1, [{ rgbColor: rgb(color) }]);
    addColor(output, colorRange(sheetId, column, index + 1, index + 2), color);
  });
  output.assertions.push({
    id: `${title}:background-colors:${String(column)}`,
    kind: 'background-color-styles',
    title,
    ...colorRange(sheetId, column, 1, end),
    rowCount: end - 1,
    columnCount: 1,
    expectedHash: sha256Json(styles),
  });
}
export function reviewStyle(
  title: string,
  sheetId: number,
  rows: GooglePublicationRows,
  headers: readonly unknown[],
  usedRowCount: number
): GooglePublicationFragment {
  const output: GooglePublicationFragment = { requests: [], assertions: [] };
  const column = headers.indexOf('Needs CSM Review');
  const rule = { condition: { type: 'BOOLEAN' }, strict: true } as const;
  if (rows.length > 1) {
    const range = colorRange(sheetId, column, 1, rows.length);
    output.requests.push({ setDataValidation: { range, rule } });
    output.assertions.push({
      id: `${title}:data-validation:${String(column)}`,
      kind: 'data-validation',
      title,
      ...range,
      expectedHash: sha256Json(rule),
    });
  }
  const filter = {
    range: {
      sheetId,
      startRowIndex: 0,
      endRowIndex: rows.length,
      startColumnIndex: 0,
      endColumnIndex: headers.length,
    },
  };
  output.requests.push({ setBasicFilter: { filter } });
  output.assertions.push({
    id: `${title}:basic-filter`,
    kind: 'basic-filter',
    title,
    sheetId,
    expectedHash: sha256Json(filter),
  });
  freshnessColors(output, title, sheetId, rows, headers.indexOf('Freshness'), usedRowCount);
  return output;
}
