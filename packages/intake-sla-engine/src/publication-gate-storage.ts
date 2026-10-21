import path from 'node:path';

import { z } from 'zod';

import { captureProperty } from './google-capture-property.js';
import { readPrivateJson } from './private-run-storage.js';
import { assertCommandManifest } from './publication-command-storage.js';
import type { PublicationGateInputs } from './publication-gate-types.js';

const text = z.string().nullish();
const capture = z.looseObject({
  capturedAt: text,
  revalidatedAt: text,
  revalidationHash: text,
  spreadsheetId: z.string().optional(),
});
const marker = capture.extend({ values: z.array(z.array(z.unknown())).nullish() });
const reviewer = capture.extend({ rows: z.array(z.looseObject({})).nullish() });
const change = z.union([z.string(), z.looseObject({ id: text }), z.null()]);
const cohort = z.looseObject({
  queriedAt: text,
  organizationId: text,
  isSandbox: z.unknown().optional(),
  material: z.unknown().optional(),
  liveCount: z.number().optional(),
  changes: z
    .looseObject({
      added: z.array(change).nullish(),
      removed: z.array(change).nullish(),
      stage: z.array(change).nullish(),
      onHold: z.array(change).nullish(),
      currentSla: z.array(change).nullish(),
    })
    .optional(),
  postCutoffDisposition: z
    .looseObject({
      schemaVersion: z.unknown().optional(),
      disposition: z.unknown().optional(),
      runCutoff: z.string().optional(),
      salesforceReadOnly: z.unknown().optional(),
      nextRunRequired: z.unknown().optional(),
      records: z
        .array(z.looseObject({ opportunityId: z.string(), observedModifiedAt: text }))
        .nullish(),
    })
    .nullish(),
});
const manifest = z.looseObject({
  runId: z.string(),
  startedAt: z.string().optional(),
  expectedRows: z.number().optional(),
  processedRows: z.number().optional(),
});
const quality = z.looseObject({ passed: z.unknown().optional(), auditedAt: text });
const workbook = z.looseObject({ passed: z.unknown().optional(), verifiedAt: text });
const drift = z.looseObject({
  result: z.looseObject({ publishable: z.unknown().optional(), checkedAt: text }).nullish(),
});
const metadata = capture.extend({ captureHash: text });
const competing = z.looseObject({
  checkedAt: text,
  conflict: z.unknown().optional(),
  currentRunId: text,
});

/** Read the current local observations without refreshing, re-dating or replacing their proofs. */
export async function readSavedPublicationGateInputs(
  runDirectory: string,
  expectedSpreadsheetId: string,
  now: string
): Promise<PublicationGateInputs> {
  const read = async <T>(name: string, schema: z.ZodType<T>): Promise<T> => {
    const result = schema.safeParse(await readPrivateJson(path.join(runDirectory, name)));
    if (!result.success) throw new Error(`Invalid publication gate artifact: ${name}`);
    return result.data;
  };
  const plan = await readPrivateJson(path.join(runDirectory, 'publication_stages_manifest.json'));
  assertCommandManifest(plan);
  return {
    now,
    expectedSpreadsheetId,
    runManifest: await read('run_manifest.json', manifest),
    qualityAudit: await read('quality-audit.json', quality),
    workbookVerification: await read('workbook-verification.json', workbook),
    productionDrift: await read('production-drift-check.json', drift),
    metadata: await read('google_sheet_metadata_current.json', metadata),
    publicationState: await read('google_publication_state.json', capture),
    baselineMarker: await read('live_sheet_marker_initial.json', marker),
    currentMarker: await read('live_sheet_marker_current.json', marker),
    baselineReviewerState: await read('reviewer_state.json', reviewer),
    currentReviewerState: await read('reviewer_state_current.json', reviewer),
    cohortRefresh: await read('salesforce_cohort_refresh.json', cohort),
    competingRunState: await read('competing_run_state.json', competing),
    publicationPlan: { ...plan, runHistoryLast: captureProperty(plan, 'runHistoryLast') },
  };
}
