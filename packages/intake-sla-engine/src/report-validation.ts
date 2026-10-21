import fs from 'node:fs/promises';
import path from 'node:path';

import type { ArtifactWorkbookProvider } from '@headstart-health/artifact-workbook';
import { z } from 'zod';

import { verifyNoteAdjudicationArtifacts } from './note-adjudication-storage.js';
import { optionalPrivateJson, readPrivateJson, writePrivateJson } from './private-run-storage.js';
import {
  denialContextPublicationCheck,
  type DenialPublicationResult,
} from './slack-denial-publication.js';
import { readDenialContextCoverage } from './slack-denial-storage.js';
import { INTAKE_WORKBOOK_FILENAME } from './workbook-export.js';
import type { WorkbookQualityReport } from './workbook-quality-types.js';
import { auditWorkbookQuality } from './workbook-quality.js';
import { verifyIntakeWorkbook } from './workbook-verification.js';

const nullableText = z.string().nullable();
const VALUES_FILE = 'workbook-values.json';
const MANIFEST_FILE = 'run_manifest.json';
const optionalText = nullableText.optional();
const referenceSchema = z.looseObject({
  source: z.string(),
  sourceRecordId: z.string(),
  date: nullableText,
  lifecycleState: optionalText,
  resolutionDate: nullableText,
  resolvedByEventId: nullableText,
});
const historySchema = z.looseObject({
  startDate: nullableText,
  asOf: nullableText,
  openingGap: z.string(),
  entries: z.array(
    z.looseObject({
      key: z.string(),
      issueKey: optionalText,
      factType: optionalText,
      fact: z.string(),
      firstDate: nullableText,
      lastDate: nullableText,
      beforeSla: z.boolean(),
      references: z.array(referenceSchema),
    })
  ),
});
const historiesSchema = z
  .array(
    z.looseObject({
      opportunityId: optionalText,
      history: historySchema.nullish(),
    })
  )
  .nullable();
const delayBindingSchema = z.looseObject({
  version: z.unknown().optional(),
  rows: z.unknown().optional(),
  artifactHash: z.unknown().optional(),
});
const manifestSchema = z.looseObject({
  runId: z.string(),
  expectedRows: z.number(),
  processedRows: z.number(),
  noteAdjudications: z
    .looseObject({ inputHash: z.string(), receiptsHash: z.string(), accepted: z.number() })
    .nullish(),
});
const auditManifestSchema = z.looseObject({ delayHistory: delayBindingSchema.nullish() });
const workbookSchema = z.looseObject({
  runId: z.unknown().optional(),
  sheets: z.record(z.string(), z.array(z.array(z.unknown()))),
});
const sourcesSchema = z.array(
  z.looseObject({
    opportunityId: z.string(),
    source: z.string(),
    required: z.boolean().optional(),
    status: z.string().optional(),
    detail: optionalText,
  })
);
function validated<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(`Invalid saved ${label}`);
  return result.data;
}

/** Recompute the existing audit from saved values and receipts, never a previous passed flag. */
export async function auditSavedIntakeReport(
  runDirectory: string,
  now: () => Date = () => new Date()
): Promise<WorkbookQualityReport> {
  const workbook = validated(
    workbookSchema,
    await readPrivateJson(path.join(runDirectory, VALUES_FILE)),
    'workbook values'
  );
  const rawHistories = await optionalPrivateJson(
    path.join(runDirectory, 'delay_history_rows.json')
  );
  const histories = validated(
    historiesSchema,
    rawHistories === undefined ? [] : rawHistories,
    'delay history'
  );
  const manifest = validated(
    auditManifestSchema,
    (await optionalPrivateJson(path.join(runDirectory, MANIFEST_FILE))) ?? {},
    'audit manifest'
  );
  const report = auditWorkbookQuality({
    workbook,
    binding: manifest.delayHistory,
    histories,
    auditedAt: now().toISOString(),
  });
  await writePrivateJson(path.join(runDirectory, 'quality-audit.json'), report);
  return report;
}

export interface SavedIntakeValidationResult {
  readonly passed: boolean;
  readonly runId: string;
  readonly expectedRows: number;
  readonly processedRows: number;
  readonly qualityAudit: boolean;
  readonly workbookVerification: boolean;
  readonly denialContext: DenialPublicationResult;
}

/** Saved-run portion of review:validate; the command must separately run full distribution/self tests. */
export async function validateSavedIntakeReport(
  provider: ArtifactWorkbookProvider,
  runDirectory: string,
  now: () => Date = () => new Date()
): Promise<SavedIntakeValidationResult> {
  for (const file of [
    MANIFEST_FILE,
    VALUES_FILE,
    INTAKE_WORKBOOK_FILENAME,
    'reviewer_state.json',
  ]) {
    try {
      await fs.access(path.join(runDirectory, file));
    } catch {
      throw new Error(`Required validation artifact is missing: ${file}`);
    }
  }
  const audit = await auditSavedIntakeReport(runDirectory, now);
  // The original child commands stop on these failures before later validation stages execute.
  if (!audit.passed) throw new Error('Saved report quality audit failed');
  const workbook = await verifyIntakeWorkbook(provider, runDirectory, now);
  if (!workbook.passed) throw new Error('Saved report workbook verification failed');
  const manifest = validated(
    manifestSchema,
    await readPrivateJson(path.join(runDirectory, MANIFEST_FILE)),
    'run manifest'
  );
  await verifyNoteAdjudicationArtifacts(runDirectory, manifest);
  const denialContext = denialContextPublicationCheck({
    coverage: await readDenialContextCoverage(runDirectory),
    workbook: validated(
      workbookSchema,
      await readPrivateJson(path.join(runDirectory, VALUES_FILE)),
      'workbook values'
    ),
    sourceStatuses: validated(
      sourcesSchema,
      await readPrivateJson(path.join(runDirectory, 'source_status_rows.json')),
      'source statuses'
    ),
  });
  return {
    passed: manifest.expectedRows === manifest.processedRows && denialContext.passed,
    runId: manifest.runId,
    expectedRows: manifest.expectedRows,
    processedRows: manifest.processedRows,
    qualityAudit: audit.passed,
    workbookVerification: workbook.passed,
    denialContext,
  };
}
