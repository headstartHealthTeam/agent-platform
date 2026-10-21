import { z } from 'zod';

import { preserveCollectionRecord } from './collection-decoding.js';
import type {
  FirefliesPrecomputed,
  FirefliesSuppliedInterpretation,
} from './fireflies-evidence-types.js';
import type { PreparedReportInterpreter } from './report-interpreter-setup.js';
import { reportInterpreterRows } from './report-interpreter-setup.js';
import { savedFields } from './saved-report-fields.js';

export interface SavedReportInterpretations {
  readonly raw: unknown;
  readonly rows: readonly unknown[];
  readonly executionProvenance: unknown;
}
/** Retain raw records. Startup only consumes the row list and execution metadata. */
export function decodeReportPrecomputedArtifact(value: unknown): SavedReportInterpretations {
  return {
    raw: value,
    rows: reportInterpreterRows(value),
    executionProvenance: savedFields(value)['executionProvenance'],
  };
}
const suppliedSchema = z.looseObject({ sourceRecordId: z.string() });
function selectedInterpretations(
  value: unknown
): readonly FirefliesSuppliedInterpretation[] | null | undefined {
  if (value === undefined || value === null) return value;
  if (!Array.isArray(value)) throw new Error('Invalid consumed report interpretations');
  const result: FirefliesSuppliedInterpretation[] = [];
  for (const item of value) {
    if (item === null || item === undefined)
      throw new Error('Invalid consumed report interpretation record');
    // The original map cannot match a missing/nonstring source ID to a generated string segment ID.
    if (typeof savedFields(item)['sourceRecordId'] !== 'string') continue;
    result.push(preserveCollectionRecord(suppliedSchema).parse(item));
  }
  return result;
}
/** Index last-write row identity first; decode its records only when the Fireflies adapter uses it. */
export function indexSavedReportInterpretations(
  artifact: SavedReportInterpretations,
  selection: Pick<
    PreparedReportInterpreter<FirefliesSuppliedInterpretation>,
    'requested' | 'execution' | 'config'
  >
): ReadonlyMap<string, FirefliesPrecomputed<FirefliesSuppliedInterpretation>> {
  const rawRows = new Map<string, Readonly<Record<string, unknown>>>();
  for (const value of artifact.rows) {
    if (value === null || value === undefined)
      throw new Error('Invalid saved report interpretation row');
    const row = savedFields(value);
    const id = row['opportunityId'];
    if (typeof id === 'string' && id) rawRows.set(id, row);
  }
  const result = new Map<string, FirefliesPrecomputed<FirefliesSuppliedInterpretation>>();
  // Disabled/API execution never consumes precomputed row contents. Keep their raw artifact counts.
  if (!selection.requested || selection.execution.apiEnabled) return result;
  const meta = savedFields(artifact.raw);
  for (const [id, row] of rawRows) {
    result.set(id, {
      ...row,
      model: selection.config?.model,
      provider: selection.config?.provider,
      engineVersion: typeof meta['engineVersion'] === 'string' ? meta['engineVersion'] : undefined,
      apiEnabled: meta['apiEnabled'] === true,
      currentRunPrecomputed: meta['currentRunPrecomputed'],
      executionProvenance: meta['executionProvenance'],
      store: meta['currentRunPrecomputed'] === true ? undefined : false,
      get interpretations(): readonly FirefliesSuppliedInterpretation[] | null | undefined {
        return selectedInterpretations(row['interpretations']);
      },
      get usage(): Readonly<Record<string, unknown>> | null | undefined {
        const value = row['usage'];
        return value === undefined || value === null ? value : savedFields(value);
      },
    });
  }
  return result;
}
