import fs from 'node:fs/promises';
import path from 'node:path';

import type { ArtifactWorkbookProvider } from '@headstart-health/artifact-workbook';
import { z } from 'zod';

import { prepareSavedGooglePublication } from './google-publication-storage.js';
import { verifyGoogleStateCapture } from './google-state-storage.js';
import { readPrivateJson, requireMutableRun, writePrivateJson } from './private-run-storage.js';
import { readSavedPublicationGateInputs } from './publication-gate-storage.js';
import type { PublicationGateResult } from './publication-gate-types.js';
import { evaluatePublicationGate } from './publication-gate.js';
import { validateSavedIntakeReport } from './report-validation.js';

const REQUIRED = [
  'google_sheet_metadata_current.json',
  'google_publication_state.json',
  'live_sheet_marker_initial.json',
  'live_sheet_marker_current.json',
  'reviewer_state.json',
  'reviewer_state_current.json',
  'salesforce_cohort_refresh.json',
  'competing_run_state.json',
  'production-drift-check.json',
] as const;
export interface SavedPublicationPreparationInput {
  readonly runDirectory: string;
  readonly expectedSpreadsheetId: string;
  readonly approvedFingerprintFile: string;
  readonly workbookProvider: ArtifactWorkbookProvider;
  readonly rejectionFile?: string;
}
export interface PreparedIntakePublicationGate extends PublicationGateResult {
  readonly preparedAt: string;
  readonly publicationStatus: 'Prepared - Awaiting Authorized Write and Live Readback';
  readonly requiredNextStep: string;
}
async function requireFile(file: string, label: string): Promise<void> {
  try {
    await fs.access(file);
  } catch {
    throw new Error(`${label} is required`);
  }
}

/** Local preparation only; command-level full self-validation remains a prerequisite. Never writes a Sheet. */
export async function prepareIntakePublication(
  input: SavedPublicationPreparationInput,
  now: () => Date = () => new Date()
): Promise<PreparedIntakePublicationGate> {
  if (!input.expectedSpreadsheetId)
    throw new Error('SLA_SPREADSHEET_ID is required before publication preparation');
  await requireMutableRun(input.runDirectory);
  await requireFile(input.approvedFingerprintFile, 'Approved Production automation fingerprint');
  for (const name of REQUIRED)
    await requireFile(
      path.join(input.runDirectory, name),
      `Current publication gate artifact ${name}`
    );
  const validation = await validateSavedIntakeReport(
    input.workbookProvider,
    input.runDirectory,
    now
  );
  if (!validation.passed) throw new Error('Saved report validation blocks publication preparation');
  const manifest = z
    .object({ runId: z.string() })
    .safeParse(await readPrivateJson(path.join(input.runDirectory, 'run_manifest.json')));
  if (!manifest.success) throw new Error('Invalid publication run manifest');
  await verifyGoogleStateCapture(
    input.runDirectory,
    input.expectedSpreadsheetId,
    manifest.data.runId
  );
  await prepareSavedGooglePublication({
    runDirectory: input.runDirectory,
    ...(input.rejectionFile === undefined ? {} : { rejectionFile: input.rejectionFile }),
  });
  const result = evaluatePublicationGate(
    await readSavedPublicationGateInputs(
      input.runDirectory,
      input.expectedSpreadsheetId,
      now().toISOString()
    )
  );
  const gate: PreparedIntakePublicationGate = {
    ...result,
    preparedAt: result.evaluatedAt,
    publicationStatus: 'Prepared - Awaiting Authorized Write and Live Readback',
    requiredNextStep:
      'Apply only the next authorized stage and capture its live assertions before advancing. After Run History, capture all final assertions and run review:verify-publish. Run History is last.',
  };
  await writePrivateJson(path.join(input.runDirectory, 'publication-gate.json'), gate);
  return gate;
}
