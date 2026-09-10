import {
  capabilityPreflightResultSchema,
  capabilityRequirementSchema,
  type CapabilityPreflightResult,
  type CapabilityRequirement,
} from '@headstart-health/capability-contracts';
import { z } from 'zod';

export const GOOGLE_SHEETS_RANGE_READ = 'google-sheets.range.read' as const;
const cellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const sheetRangeSchema = z
  .object({
    spreadsheetId: z.string().min(1),
    range: z.string().min(1),
    revision: z.string().min(1),
    values: z.array(z.array(cellSchema)),
  })
  .strict();

export type SheetRange = z.infer<typeof sheetRangeSchema>;
export interface GoogleSheetsReadProvider {
  getSpreadsheet(spreadsheetId: string): Promise<unknown>;
  readRange(spreadsheetId: string, range: string): Promise<unknown>;
}

export class GoogleSheetsDataError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'GoogleSheetsDataError';
  }
}

function normalizeHeader(value: z.infer<typeof cellSchema>): string {
  const normalized = String(value ?? '')
    .normalize('NFKC')
    .trim();
  if (normalized.length === 0) {
    throw new GoogleSheetsDataError('sheet headers must be non-empty');
  }
  return normalized;
}

export function rowsFromHeaderRange(input: unknown): readonly Readonly<Record<string, string>>[] {
  const range = sheetRangeSchema.parse(input);
  const headerRow = range.values[0];
  if (headerRow === undefined) {
    throw new GoogleSheetsDataError('sheet range must include a header row');
  }
  const headers = headerRow.map((value) => normalizeHeader(value));
  if (new Set(headers).size !== headers.length) {
    throw new GoogleSheetsDataError('sheet headers must be unique');
  }
  return range.values
    .slice(1)
    .map((row) =>
      Object.fromEntries(
        headers.map((header, index) => [header, String(row.at(index) ?? '').trim()])
      )
    );
}

function columnValue(row: Readonly<Record<string, string>>, column: string): string | undefined {
  return Object.entries(row).find(([key]) => key === column)?.[1];
}

export function requireColumns(
  rows: readonly Readonly<Record<string, string>>[],
  columns: readonly string[]
): void {
  for (const [index, row] of rows.entries()) {
    for (const column of columns) {
      const value = columnValue(row, column);
      if (value === undefined || value.trim().length === 0) {
        throw new GoogleSheetsDataError(
          `row ${String(index + 2)} is missing required column ${column}`
        );
      }
    }
  }
}

export function googleSheetsRangeRequirement(input: {
  readonly spreadsheetId: string;
  readonly range: string;
}): CapabilityRequirement {
  return capabilityRequirementSchema.parse({
    id: GOOGLE_SHEETS_RANGE_READ,
    sideEffect: 'read',
    requiredPermissions: ['spreadsheets.readonly'],
    targetAssertions: [
      { key: 'spreadsheetId', expected: input.spreadsheetId },
      { key: 'range', expected: input.range },
    ],
  });
}

export async function preflightGoogleSheets(
  provider: GoogleSheetsReadProvider,
  input: {
    readonly spreadsheetId: string;
    readonly range: string;
    readonly providerId: string;
    readonly adapterVersion: string;
  }
): Promise<CapabilityPreflightResult> {
  try {
    const metadata = z
      .object({ spreadsheetId: z.string().min(1) })
      .catchall(z.unknown())
      .parse(await provider.getSpreadsheet(input.spreadsheetId));
    const snapshot = sheetRangeSchema.parse(
      await provider.readRange(input.spreadsheetId, input.range)
    );
    const ready =
      metadata.spreadsheetId === input.spreadsheetId &&
      snapshot.spreadsheetId === input.spreadsheetId &&
      snapshot.range === input.range;
    return capabilityPreflightResultSchema.parse({
      capabilityId: GOOGLE_SHEETS_RANGE_READ,
      providerId: input.providerId,
      adapterVersion: input.adapterVersion,
      status: ready ? 'ready' : 'wrong-target',
      permissions: ready ? ['spreadsheets.readonly'] : [],
      targetIdentity: { spreadsheetId: snapshot.spreadsheetId, range: snapshot.range },
      message: ready ? 'verified readable spreadsheet range' : 'provider returned another range',
    });
  } catch (error: unknown) {
    return capabilityPreflightResultSchema.parse({
      capabilityId: GOOGLE_SHEETS_RANGE_READ,
      providerId: input.providerId,
      adapterVersion: input.adapterVersion,
      status: 'provider-unavailable',
      permissions: [],
      targetIdentity: { spreadsheetId: input.spreadsheetId, range: input.range },
      message: error instanceof Error ? error.message : 'Google Sheets preflight failed',
    });
  }
}
