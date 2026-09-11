import { z } from 'zod';

export const primitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type ReportValue = z.infer<typeof primitiveSchema>;
export type ReportRows = ReportValue[][];
const coordinate = z.number().int().nonnegative();
export const rectangleSchema = z
  .object({
    row: coordinate,
    column: coordinate,
    rows: z.number().int().positive(),
    columns: z.number().int().positive(),
  })
  .strict();
export const workbookTemplateSchema = z
  .object({
    schemaVersion: z.literal('organic-workbook-template/v1'),
    version: z.string().min(1),
    sourceId: z.string().min(1),
    cleanTemplateId: z.string().min(1),
    sheets: z
      .array(
        z
          .object({
            title: z.string().min(1),
            columns: z.number().int().positive(),
            rows: z.number().int().positive(),
            chartSpecs: z.array(z.record(z.string(), z.unknown())).default([]),
            staticCells: z.array(
              z
                .object({
                  row: coordinate,
                  column: coordinate,
                  text: z.string(),
                  note: z.string().optional(),
                })
                .strict()
            ),
            bindings: z.array(
              z
                .object({
                  id: z.string().min(1),
                  owner: z.enum(['facts', 'narrative']),
                  range: rectangleSchema,
                  maxCharacters: z.number().int().positive().default(700),
                  preserveAlignment: z.boolean().default(false),
                  resetNumberFormat: z.boolean().default(false),
                  expandRows: z.number().int().positive().optional(),
                  numericColumns: z.array(coordinate).default([]),
                  percentColumns: z.array(coordinate).default([]),
                  decimalColumns: z.array(coordinate).default([]),
                })
                .strict()
            ),
            styleSha256: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict()
      )
      .min(1),
  })
  .strict();
export type WorkbookTemplate = z.infer<typeof workbookTemplateSchema>;
export type WorkbookBinding = WorkbookTemplate['sheets'][number]['bindings'][number];
export const narrativeSchema = z
  .object({
    schemaVersion: z.literal('organic-report-narrative/v1'),
    analysisSha256: z.string().regex(/^[a-f0-9]{64}$/),
    blocks: z.record(z.string(), z.array(z.array(z.string().max(1500)))),
    evidence: z.array(
      z
        .object({
          id: z.string().min(1),
          classification: z.enum(['observed', 'inferred', 'recommended']),
          text: z.string().min(1),
          sources: z.array(z.string().min(1)).min(1),
        })
        .strict()
    ),
  })
  .strict();
export type ReportNarrative = z.infer<typeof narrativeSchema>;

const rowData = z
  .object({
    values: z
      .array(
        z
          .object({
            userEnteredValue: z
              .object({
                stringValue: z.string().optional(),
                numberValue: z.number().optional(),
                boolValue: z.boolean().optional(),
                formulaValue: z.string().optional(),
              })
              .optional(),
            userEnteredFormat: z.record(z.string(), z.unknown()).optional(),
            note: z.string().optional(),
          })
          .loose()
      )
      .default([]),
  })
  .loose();
export const workbookSnapshotSchema = z
  .object({
    spreadsheetId: z.string().min(1),
    sheets: z.array(
      z
        .object({
          properties: z
            .object({
              sheetId: coordinate,
              title: z.string(),
              index: coordinate,
              gridProperties: z.object({ rowCount: coordinate, columnCount: coordinate }).loose(),
            })
            .loose(),
          data: z
            .array(
              z
                .object({
                  startRow: coordinate.default(0),
                  startColumn: coordinate.default(0),
                  rowData: z.array(rowData).default([]),
                  rowMetadata: z.array(z.record(z.string(), z.unknown())).optional(),
                  columnMetadata: z.array(z.record(z.string(), z.unknown())).optional(),
                })
                .loose()
            )
            .default([]),
          merges: z.array(z.record(z.string(), z.unknown())).default([]),
          charts: z.array(z.record(z.string(), z.unknown())).default([]),
          conditionalFormats: z.array(z.record(z.string(), z.unknown())).default([]),
        })
        .loose()
    ),
  })
  .loose();
export type WorkbookSnapshot = z.infer<typeof workbookSnapshotSchema>;
