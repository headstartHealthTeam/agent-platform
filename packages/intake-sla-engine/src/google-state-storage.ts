import path from 'node:path';

import { requireContract as check } from './connector-checkpoint.js';
import { captureProperty } from './google-capture-property.js';
import { captureGooglePublicationState } from './google-state-capture.js';
import { sha256Json } from './json-fingerprint.js';
import { optionalPrivateJson, readPrivateJson } from './private-run-storage.js';

/** Verify saved projections against their raw capture without rewriting or re-dating evidence. */
export async function verifyGoogleStateCapture(
  runDirectory: string,
  spreadsheetId: string,
  runId: string
): Promise<void> {
  const raw = await optionalPrivateJson(path.join(runDirectory, 'google_state_capture.json'));
  const metadata = await readPrivateJson(
    path.join(runDirectory, 'google_sheet_metadata_current.json')
  );
  if (raw === undefined) {
    if (metadata === null || metadata === undefined)
      throw new TypeError('Missing Google Sheet metadata');
    const claimsCapture = Boolean(captureProperty(metadata, 'captureHash'));
    if (!claimsCapture) return;
  }
  const result = captureGooglePublicationState(raw, spreadsheetId, runId);
  const outputs = {
    google_sheet_metadata_current: result.metadata,
    google_publication_state: result.state,
    live_sheet_marker_current: result.marker,
    reviewer_state_current: result.reviewer,
    competing_run_state: result.competing,
  };
  for (const [name, value] of Object.entries(outputs)) {
    check(
      sha256Json(await readPrivateJson(path.join(runDirectory, `${name}.json`))) ===
        sha256Json(value),
      'Google state capture transaction is incomplete or changed'
    );
  }
}
