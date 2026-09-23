import path from 'node:path';

import { requireContract as check } from './connector-checkpoint.js';
import { captureGooglePublicationState } from './google-state-capture.js';
import { sha256Json } from './json-fingerprint.js';
import {
  privateDirectory,
  readPrivateJson,
  requireMutableRun,
  withCacheLock,
  writeIdenticalOrNew,
  writePrivateJson,
} from './private-run-storage.js';

export interface SaveGoogleStateCaptureInput {
  readonly runDirectory: string;
  readonly spreadsheetId: string;
  readonly runId: string;
  readonly inputFile?: string;
  readonly revalidateFile?: string;
}
export interface SavedGoogleStateCapture {
  readonly captured: true;
  readonly reviewerRows: number;
  readonly conflict: boolean;
}
/** Persist supplied evidence only. The caller owns provider reads and operational authorization. */
export async function saveGoogleStateCapture(
  input: SaveGoogleStateCaptureInput
): Promise<SavedGoogleStateCapture> {
  const runDirectory = await privateDirectory(input.runDirectory);
  const captureFile = path.join(runDirectory, 'google_state_capture.json');
  const previous = input.revalidateFile ? await readPrivateJson(captureFile) : null;
  const hasPrevious = Boolean(previous);
  let raw: unknown;
  if (hasPrevious) {
    check(
      typeof previous === 'object' && previous !== null,
      'Google state capture provenance is incomplete'
    );
    if (input.revalidateFile === undefined) throw new TypeError('Missing revalidation input');
    raw = { ...previous, revalidation: await readPrivateJson(input.revalidateFile) };
  } else {
    if (input.inputFile === undefined) throw new TypeError('Missing Google capture input');
    raw = await readPrivateJson(input.inputFile);
  }
  const result = captureGooglePublicationState(raw, input.spreadsheetId, input.runId);
  await withCacheLock(runDirectory, async () => {
    await requireMutableRun(runDirectory);
    if (hasPrevious) {
      if (sha256Json(previous) !== sha256Json(await readPrivateJson(captureFile)))
        throw new Error('Google capture changed');
      await writeIdenticalOrNew(
        path.join(runDirectory, `google_state_capture_${sha256Json(previous)}.json`),
        previous
      );
    }
    for (const [name, value] of Object.entries({
      google_sheet_metadata_current: result.metadata,
      google_publication_state: result.state,
      live_sheet_marker_current: result.marker,
      reviewer_state_current: result.reviewer,
      competing_run_state: result.competing,
    }))
      await writePrivateJson(path.join(runDirectory, `${name}.json`), value);
    // Raw capture is the final transaction marker, just as in the approved capture command.
    await writePrivateJson(captureFile, raw);
  });
  return {
    captured: true,
    reviewerRows: result.reviewer.rows.length,
    conflict: result.competing.conflict,
  };
}
