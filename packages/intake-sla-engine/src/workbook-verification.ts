import fs from 'node:fs/promises';
import path from 'node:path';

import type {
  ArtifactWorkbook,
  ArtifactWorkbookProvider,
} from '@headstart-health/artifact-workbook';

import { INTAKE_WORKBOOK_FILENAME } from './workbook-export.js';

const REVIEW = 'Review Queue';
const HOLD = 'On-Hold Review';
const EVIDENCE = 'Evidence Detail';
const RENDER_RANGES = [
  [REVIEW, 'A1:J15', 'review-identity'],
  [REVIEW, 'K1:T15', 'review-summary'],
  [REVIEW, 'U1:AE15', 'review-action'],
  [REVIEW, 'AF1:AK15', 'review-audit'],
  [HOLD, 'A1:J15', 'on-hold-identity'],
  [HOLD, 'K1:T15', 'on-hold-summary'],
  [HOLD, 'U1:AE15', 'on-hold-action'],
  [HOLD, 'AF1:AO15', 'on-hold-audit'],
  [EVIDENCE, 'A1:J12', 'evidence-story'],
  [EVIDENCE, 'K1:T12', 'evidence-identity'],
  [EVIDENCE, 'U1:AE12', 'evidence-sources'],
  [EVIDENCE, 'AF1:AI12', 'evidence-qa'],
  ['Source & Run Notes', 'A1:B40', 'source-run-notes'],
  ['Data Dictionary', 'A1:B40', 'data-dictionary'],
  ['Run History', 'A1:L10', 'run-history'],
  ['Generation Ledger', 'A1:L12', 'generation-ledger'],
] as const;
export interface IntakeWorkbookVerification {
  readonly verifiedAt: string;
  readonly workbookPath: string;
  readonly sheetsRendered: readonly {
    readonly sheetName: string;
    readonly range: string;
    readonly file: string;
  }[];
  readonly formulaErrorCount: number;
  readonly formulaErrorScan: readonly unknown[];
  readonly overview: readonly unknown[];
  readonly passed: boolean;
}
function inspectionText(value: unknown): string {
  return String(value);
}
function records(ndjson: unknown): unknown[] {
  return inspectionText(ndjson ?? '')
    .split('\n')
    .filter(Boolean)
    .map((line): unknown => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    });
}
function formulaMatch(record: unknown): boolean {
  if (record === null || record === undefined)
    throw new TypeError('Invalid workbook inspection record');
  return (
    typeof record === 'object' &&
    'kind' in record &&
    record.kind === 'match' &&
    /#REF!|#DIV\/0!|#VALUE!|#NAME\?|#N\/A/.test(JSON.stringify(record))
  );
}
async function renderWorkbook(
  workbook: ArtifactWorkbook,
  directory: string
): Promise<IntakeWorkbookVerification['sheetsRendered']> {
  const rendered = [];
  for (const [sheetName, range, slug] of RENDER_RANGES) {
    const preview = await workbook.render({ sheetName, range, scale: 0.75, format: 'png' });
    const file = path.join(directory, `preview-${slug}.png`);
    await fs.writeFile(file, preview);
    rendered.push({ sheetName, range, file });
  }
  return rendered;
}
/** Same sixteen previews and formula-error acceptance as the approved shadow verifier. */
export async function verifyIntakeWorkbook(
  provider: ArtifactWorkbookProvider,
  runDirectory: string,
  now: () => Date = () => new Date()
): Promise<IntakeWorkbookVerification> {
  const workbookPath = path.join(runDirectory, INTAKE_WORKBOOK_FILENAME);
  const workbook = await provider.openXlsx(workbookPath);
  const rendered = await renderWorkbook(workbook, runDirectory);
  const errors = await workbook.inspect({
    kind: 'match',
    searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A',
    options: { useRegex: true, maxResults: 300 },
    summary: 'shadow workbook formula error scan',
    maxChars: 8000,
  });
  const overview = await workbook.inspect({
    kind: 'sheet,table',
    tableMaxRows: 3,
    tableMaxCols: 8,
    maxChars: 8000,
  });
  const errorRecords = records(errors);
  const formulaErrorCount = errorRecords.filter(formulaMatch).length;
  const verification = {
    verifiedAt: now().toISOString(),
    workbookPath,
    sheetsRendered: rendered,
    formulaErrorCount,
    formulaErrorScan: errorRecords,
    overview: records(overview),
    passed: rendered.length === RENDER_RANGES.length && formulaErrorCount === 0,
  };
  await fs.writeFile(
    path.join(runDirectory, 'workbook-verification.json'),
    JSON.stringify(verification, null, 2)
  );
  return verification;
}
