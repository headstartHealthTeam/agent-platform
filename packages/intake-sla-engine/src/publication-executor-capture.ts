import path from 'node:path';

import { requireContract as check } from './connector-checkpoint.js';
import { sha256Json } from './json-fingerprint.js';
import { writeIdenticalOrNew, writePrivateJson } from './private-run-storage.js';
import type {
  CapturedPublicationActual,
  ExecutionManifest,
  PublicationReadAdapter,
} from './publication-executor-types.js';
import type { PublicationAssertion } from './publication-readback-types.js';

export async function retainPublicationCapture(
  runDirectory: string,
  name: string,
  actual: unknown
): Promise<void> {
  await writeIdenticalOrNew(
    path.join(runDirectory, `publication_capture_${sha256Json(actual)}.json`),
    actual
  );
  await writePrivateJson(path.join(runDirectory, name), actual);
}
export async function capturePublicationActual(
  adapter: PublicationReadAdapter,
  manifest: ExecutionManifest,
  assertions: readonly PublicationAssertion[] | null | undefined,
  runDirectory: string
): Promise<CapturedPublicationActual> {
  if (assertions === undefined || assertions === null)
    throw new TypeError('Missing publication assertions');
  const actual = await adapter.readAssertions({
    runId: manifest.runId,
    spreadsheetId: manifest.spreadsheetId,
    assertions: assertions.map(({ expectedHash: _private, ...request }) => request),
    onIncompleteCapture: async (partial) => {
      check(
        partial.runId === manifest.runId &&
          partial.spreadsheetId === manifest.spreadsheetId &&
          partial.complete === false,
        'Incomplete capture target mismatch'
      );
      await retainPublicationCapture(runDirectory, 'publication_readback_incomplete.json', partial);
    },
  });
  check(
    actual.runId === manifest.runId && actual.spreadsheetId === manifest.spreadsheetId,
    'Connector readback returned a different target'
  );
  return actual;
}
