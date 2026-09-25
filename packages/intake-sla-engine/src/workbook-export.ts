import path from 'node:path';

import type { ArtifactWorkbookProvider } from '@headstart-health/artifact-workbook';

import { populateIntakeWorkbook, type IntakeWorkbookTables } from './workbook-layout.js';

export const INTAKE_WORKBOOK_FILENAME = 'intake_sla_review_queue.xlsx';
/** Caller owns the existing private run directory and upstream report validation. */
export async function exportIntakeWorkbook(
  provider: ArtifactWorkbookProvider,
  tables: IntakeWorkbookTables,
  runDirectory: string
): Promise<{ readonly workbookPath: string; readonly inspection: unknown }> {
  const workbook = provider.create();
  populateIntakeWorkbook(workbook, tables);
  const inspection = await workbook.inspect({
    kind: 'sheet,table',
    tableMaxRows: 5,
    tableMaxCols: 8,
    maxChars: 4000,
  });
  const workbookPath = path.join(runDirectory, INTAKE_WORKBOOK_FILENAME);
  await workbook.saveXlsx(workbookPath);
  return { workbookPath, inspection };
}
