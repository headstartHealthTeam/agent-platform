import path from 'node:path';

import { z } from 'zod';

import { requireContract as check } from './connector-checkpoint.js';
import type { GooglePublicationPlanInputs } from './google-publication-types.js';
import { readPublicationJson } from './publication-command-storage.js';

const target = z.object({ spreadsheetId: z.string(), sheets: z.array(z.unknown()).nullish() });
const inputs = z.object({
  manifest: z.object({ runId: z.string() }),
  metadata: target,
  liveState: target,
  currentReviewerState: z.object({ rows: z.array(z.object({})).nullish() }),
});
function assertInputs(value: unknown): asserts value is GooglePublicationPlanInputs {
  check(inputs.safeParse(value).success, 'Invalid saved publication inputs');
}
/** Keep raw objects/hashes and narrow only planner-consumed fields, not unrelated workbook tabs. */
export async function readSavedGooglePublicationInputs(
  runDirectory: string
): Promise<GooglePublicationPlanInputs> {
  const [workbook, manifest, metadata, liveState, currentReviewerState] = await Promise.all(
    [
      'workbook-values.json',
      'run_manifest.json',
      'google_sheet_metadata_current.json',
      'google_publication_state.json',
      'reviewer_state_current.json',
    ].map((file) => readPublicationJson(path.join(runDirectory, file)))
  );
  const value = { workbook, manifest, metadata, liveState, currentReviewerState };
  assertInputs(value);
  return value;
}
