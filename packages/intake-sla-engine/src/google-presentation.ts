import { sha256Json } from './json-fingerprint.js';

export const OPERATOR_HEADER_HEIGHT_PX = 72;
export const OPERATOR_ROW_HEIGHT_PX = 240;
type Dimension = 'ROWS' | 'COLUMNS';
interface GridRange {
  readonly sheetId: number;
  readonly startRowIndex: number;
  readonly endRowIndex: number;
  readonly startColumnIndex: number;
  readonly endColumnIndex: number;
}
export interface GooglePresentationAssertion extends GridRange {
  readonly id: string;
  readonly kind: 'text-layout' | 'dimension-pixels';
  readonly title: string;
  readonly expectedHash: string;
  readonly dimension?: Dimension;
}
export type GooglePresentationRequest =
  | {
      readonly repeatCell: {
        readonly range: GridRange;
        readonly cell: {
          readonly userEnteredFormat: {
            readonly wrapStrategy: 'WRAP';
            readonly verticalAlignment: 'TOP';
          };
        };
        readonly fields: string;
      };
    }
  | {
      readonly updateDimensionProperties: {
        readonly range: {
          readonly sheetId: number;
          readonly dimension: Dimension;
          readonly startIndex: number;
          readonly endIndex: number;
        };
        readonly properties: { readonly pixelSize: number };
        readonly fields: 'pixelSize';
      };
    };
export interface GooglePresentationInput {
  readonly title: string;
  readonly sheetId: number;
  readonly headers: readonly unknown[];
  readonly startRowIndex?: number;
  readonly endRowIndex: number;
}
export interface GooglePresentation {
  readonly requests: GooglePresentationRequest[];
  readonly assertions: GooglePresentationAssertion[];
}
const SOURCE_NOTES_TITLE = 'Source & Run Notes';
const TITLES = [
  'Review Queue',
  'On-Hold Review',
  'Evidence Detail',
  SOURCE_NOTES_TITLE,
  'Run History',
];
const WIDTHS = new Map<string, number>([
  ['In-Depth Summary', 650],
  ['Suggested SLA Summary', 440],
  ['Suggested Action', 420],
  ['Why Review Needed', 400],
  ['Restart Condition', 360],
  ['Reviewer Notes', 320],
  ['On Hold Reason', 240],
]);
function dimension(
  output: GooglePresentation,
  title: string,
  sheetId: number,
  axis: Dimension,
  startIndex: number,
  endIndex: number,
  pixelSize: number
): void {
  output.requests.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: axis, startIndex, endIndex },
      properties: { pixelSize },
      fields: 'pixelSize',
    },
  });
  const coordinates =
    axis === 'ROWS'
      ? { startRowIndex: startIndex, endRowIndex: endIndex, startColumnIndex: 0, endColumnIndex: 1 }
      : {
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: startIndex,
          endColumnIndex: endIndex,
        };
  output.assertions.push({
    id: `${title}:${axis.toLowerCase()}-pixels:${String(startIndex)}:${String(endIndex)}`,
    kind: 'dimension-pixels',
    dimension: axis,
    title,
    sheetId,
    ...coordinates,
    expectedHash: sha256Json(Array<number>(endIndex - startIndex).fill(pixelSize)),
  });
}
function headerText(value: unknown): string {
  return String(value);
}
function width(title: string, header: unknown, index: number): number | undefined {
  if (['Review Queue', 'On-Hold Review'].includes(title))
    return typeof header === 'string' ? WIDTHS.get(header) : undefined;
  if (title === SOURCE_NOTES_TITLE) return index === 0 ? 240 : 720;
  return /notes|evidence|issues|timeline|coverage|conflict|interpretation|audit|quality|result|summary|gaps|sources checked/i.test(
    headerText(header)
  )
    ? 420
    : undefined;
}
/** Bounded operator presentation only; preserves values, validations, filters and historical rows. */
export function googlePresentation({
  title,
  sheetId,
  headers,
  startRowIndex = 0,
  endRowIndex,
}: GooglePresentationInput): GooglePresentation {
  const output: GooglePresentation = { requests: [], assertions: [] };
  if (!TITLES.includes(title) || endRowIndex <= startRowIndex) return output;
  const range = {
    sheetId,
    startRowIndex,
    endRowIndex,
    startColumnIndex: 0,
    endColumnIndex: headers.length,
  };
  const format = { wrapStrategy: 'WRAP', verticalAlignment: 'TOP' } as const;
  output.requests.push({
    repeatCell: {
      range,
      cell: { userEnteredFormat: format },
      fields: 'userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment',
    },
  });
  output.assertions.push({
    id: `${title}:text-layout:${String(startRowIndex)}:${String(endRowIndex)}`,
    kind: 'text-layout',
    title,
    ...range,
    expectedHash: sha256Json(format),
  });
  if (startRowIndex === 0)
    dimension(output, title, sheetId, 'ROWS', 0, 1, OPERATOR_HEADER_HEIGHT_PX);
  if (endRowIndex > Math.max(1, startRowIndex))
    dimension(
      output,
      title,
      sheetId,
      'ROWS',
      Math.max(1, startRowIndex),
      endRowIndex,
      title === SOURCE_NOTES_TITLE ? 144 : OPERATOR_ROW_HEIGHT_PX
    );
  if (title === 'Run History') return output;
  headers.forEach((header, index) => {
    const pixels = width(title, header, index);
    if (pixels !== undefined)
      dimension(output, title, sheetId, 'COLUMNS', index, index + 1, pixels);
  });
  return output;
}
