import type { GoogleJsonReader } from '@headstart-health/google-read-transport';
import { z } from 'zod';

import { GoogleSheetsDataError } from './google-sheets.js';

const indexSchema = z.number().int().nonnegative();
const idSchema = z.string().regex(/^[A-Za-z0-9_-]+$/);
const sheetIdentitySchema = z.object({ sheetId: indexSchema, title: z.string().min(1) });
const coordinatesSchema = z
  .object({
    startRowIndex: indexSchema,
    endRowIndex: indexSchema,
    startColumnIndex: indexSchema,
    endColumnIndex: indexSchema,
  })
  .refine(
    (value) =>
      value.endRowIndex > value.startRowIndex && value.endColumnIndex > value.startColumnIndex
  );

export const googleGridReadSchema = z.object({
  spreadsheetId: idSchema,
  sheet: sheetIdentitySchema,
  range: coordinatesSchema,
  fields: z.enum(['cells', 'dimensions']),
});
export type GoogleGridRead = z.infer<typeof googleGridReadSchema>;

export const googleEnteredValueSchema = z.union([
  z.object({ stringValue: z.string() }).strict(),
  z.object({ numberValue: z.number() }).strict(),
  z.object({ boolValue: z.boolean() }).strict(),
  z.object({ formulaValue: z.string() }).strict(),
  z.object({}).strict(),
]);
const colorSchema = z
  .object({
    red: z.number().optional(),
    green: z.number().optional(),
    blue: z.number().optional(),
    alpha: z.number().optional(),
  })
  .catchall(z.json());
const colorStyleSchema = z
  .object({ rgbColor: colorSchema.optional(), themeColor: z.string().optional() })
  .catchall(z.json());
const formatSchema = z
  .object({
    wrapStrategy: z.string().optional(),
    verticalAlignment: z.string().optional(),
    backgroundColorStyle: colorStyleSchema.optional(),
  })
  .catchall(z.json());
const validationSchema = z
  .object({
    condition: z
      .object({
        type: z.string(),
        values: z.array(z.object({ userEnteredValue: z.string() }).catchall(z.json())).optional(),
      })
      .catchall(z.json())
      .optional(),
    strict: z.boolean().optional(),
    showCustomUi: z.boolean().optional(),
    inputMessage: z.string().optional(),
  })
  .catchall(z.json());
export const googleGridCellSchema = z
  .object({
    userEnteredValue: googleEnteredValueSchema.optional(),
    userEnteredFormat: formatSchema.optional(),
    dataValidation: validationSchema.optional(),
  })
  .catchall(z.json());
const dimensionSchema = z
  .object({ pixelSize: z.number().int().positive().optional() })
  .catchall(z.json());
const blockSchema = z
  .object({
    startRow: indexSchema.optional(),
    startColumn: indexSchema.optional(),
    rowData: z
      .array(z.object({ values: z.array(googleGridCellSchema).optional() }).catchall(z.json()))
      .optional(),
    rowMetadata: z.array(dimensionSchema).optional(),
    columnMetadata: z.array(dimensionSchema).optional(),
  })
  .catchall(z.json());
const gridPropertiesSchema = z
  .object({
    rowCount: z.number().int().positive().optional(),
    columnCount: z.number().int().positive().optional(),
    frozenRowCount: indexSchema.optional(),
    frozenColumnCount: indexSchema.optional(),
  })
  .catchall(z.json());
export const googleGridSnapshotSchema = z
  .object({
    spreadsheetId: idSchema,
    sheets: z
      .array(
        z
          .object({
            properties: sheetIdentitySchema
              .extend({ gridProperties: gridPropertiesSchema.optional() })
              .catchall(z.json()),
            basicFilter: z.object({}).catchall(z.json()).optional(),
            data: z.array(blockSchema).optional(),
          })
          .catchall(z.json())
      )
      .default([]),
  })
  .catchall(z.json());
export type GoogleGridSnapshot = z.infer<typeof googleGridSnapshotSchema>;
export type GoogleGridCell = z.infer<typeof googleGridCellSchema>;

function column(index: number): string {
  let text = '';
  for (let position = index + 1; position > 0; position = Math.floor((position - 1) / 26)) {
    text = String.fromCharCode(65 + ((position - 1) % 26)) + text;
  }
  return text;
}

export function googleGridA1(input: GoogleGridRead): string {
  const parsed = googleGridReadSchema.safeParse(input);
  if (!parsed.success) throw new GoogleSheetsDataError('A bounded Google grid read is required');
  const { sheet, range } = parsed.data;
  const title = `'${sheet.title.replaceAll("'", "''")}'`;
  return `${title}!${column(range.startColumnIndex)}${String(range.startRowIndex + 1)}:${column(range.endColumnIndex - 1)}${String(range.endRowIndex)}`;
}

function snapshot(value: unknown, spreadsheetId: string): GoogleGridSnapshot {
  const parsed = googleGridSnapshotSchema.safeParse(value);
  if (!parsed.success || parsed.data.spreadsheetId !== spreadsheetId) {
    throw new GoogleSheetsDataError(
      'Google grid response is invalid or belongs to another spreadsheet'
    );
  }
  return parsed.data;
}

/** Single exact reads; sampling, retries and acceptance remain with the consumer. */
export class GoogleSheetsGridReader {
  readonly #http: GoogleJsonReader;
  constructor(http: GoogleJsonReader) {
    this.#http = http;
  }

  async readMetadata(spreadsheetId: string): Promise<GoogleGridSnapshot> {
    if (!idSchema.safeParse(spreadsheetId).success)
      throw new GoogleSheetsDataError('Invalid spreadsheet identity');
    const query = new URLSearchParams({ fields: 'spreadsheetId,sheets(properties,basicFilter)' });
    return snapshot(
      await this.#http.request(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?${query.toString()}`
      ),
      spreadsheetId
    );
  }

  async readGrid(input: GoogleGridRead): Promise<GoogleGridSnapshot> {
    const range = googleGridA1(input);
    const fields =
      input.fields === 'dimensions'
        ? 'spreadsheetId,sheets(properties,data(startRow,startColumn,rowMetadata(pixelSize),columnMetadata(pixelSize)))'
        : 'spreadsheetId,sheets(properties,data(startRow,startColumn,rowData(values(userEnteredValue,dataValidation,userEnteredFormat))))';
    const query = new URLSearchParams({ ranges: range, fields });
    const result = snapshot(
      await this.#http.request(
        `https://sheets.googleapis.com/v4/spreadsheets/${input.spreadsheetId}?${query.toString()}`
      ),
      input.spreadsheetId
    );
    const matching = result.sheets.filter(
      (sheet) => sheet.properties.sheetId === input.sheet.sheetId
    );
    if (matching.length !== 1 || matching[0]?.properties.title !== input.sheet.title) {
      throw new GoogleSheetsDataError(
        'Google grid response has a missing, duplicate or mismatched sheet identity'
      );
    }
    return result;
  }
}
