import path from 'node:path';

import { z } from 'zod';

import { requireContract as check } from './connector-checkpoint.js';
import type { GeneratedNoteLedgerEntry } from './generation-ledger.js';
import { sha256Json } from './json-fingerprint.js';
import {
  optionalPrivateJson,
  privateDirectory,
  readPrivateJson,
  requireMutableRun,
  withRunCheckpointLock,
  writeIdenticalOrNew,
  writePrivateJson,
} from './private-run-storage.js';

const baselineName = 'generation_ledger_baseline.json';
const outputName = 'generation_ledger_state.json';
const rowSchema = z.looseObject({
  runId: z.string().min(1),
  opportunityId: z.string().min(1),
  slaId: z.string().min(1),
});
export interface StoredGenerationLedgerRow extends GeneratedNoteLedgerEntry {
  readonly runId: string;
  readonly opportunityId: string;
  readonly slaId: string;
  readonly publicationStatus?: unknown;
}
const baselineSchema = z.looseObject({
  version: z.literal(1),
  runId: z.string(),
  rowsHash: z.string(),
  rows: z.array(rowSchema),
});
export interface GenerationLedgerBaseline {
  readonly version: 1;
  readonly runId: string;
  readonly rowsHash: string;
  readonly rows: readonly StoredGenerationLedgerRow[];
}
function key(row: StoredGenerationLedgerRow): string {
  return JSON.stringify([row.runId, row.opportunityId, row.slaId]);
}
function isLedgerRows(value: unknown): value is StoredGenerationLedgerRow[] {
  return z.array(rowSchema).safeParse(value).success;
}
function ledgerRows(payload: unknown): StoredGenerationLedgerRow[] {
  const rows: unknown = Array.isArray(payload)
    ? payload
    : z.object({ rows: z.unknown() }).safeParse(payload).data?.rows;
  check(isLedgerRows(rows), 'Invalid generation ledger input');
  return rows;
}
function priorRows(payload: unknown, runId: string): StoredGenerationLedgerRow[] {
  const rows = ledgerRows(payload);
  check(
    rows.every((row) => row.runId !== runId || row.publicationStatus === 'Built - Pending Publish'),
    'Cannot rebuild a ledger containing published or unclassified current-run rows'
  );
  return rows.filter((row) => row.runId !== runId);
}
function isBaseline(value: unknown): value is GenerationLedgerBaseline {
  return baselineSchema.safeParse(value).success;
}
function verifyBaseline(value: unknown, runId: string): asserts value is GenerationLedgerBaseline {
  check(
    isBaseline(value) &&
      value.runId === runId &&
      sha256Json(ledgerRows(value.rows)) === value.rowsHash &&
      value.rows.every((row) => row.runId !== runId),
    'Generation ledger baseline changed or belongs to another run'
  );
}
export async function loadGenerationLedgerBaseline({
  runDir,
  runId,
  inputPath,
}: {
  readonly runDir: string;
  readonly runId: string;
  readonly inputPath?: string | null | undefined;
}): Promise<GenerationLedgerBaseline> {
  runDir = await privateDirectory(runDir);
  check(runId.length > 0, 'Generation ledger run identity required');
  return withRunCheckpointLock(runDir, async () => {
    await requireMutableRun(runDir);
    const file = path.join(runDir, baselineName);
    const existing = await optionalPrivateJson(file);
    const hasExisting = Boolean(existing);
    if (hasExisting) {
      verifyBaseline(existing, runId);
      if (inputPath)
        check(
          sha256Json(priorRows(await readPrivateJson(path.resolve(inputPath)), runId)) ===
            existing.rowsHash,
          'Explicit generation ledger input differs from the frozen baseline'
        );
      return existing;
    }
    const payload = inputPath
      ? await readPrivateJson(path.resolve(inputPath))
      : ((await optionalPrivateJson(path.join(runDir, outputName))) ?? []);
    const rows = priorRows(payload, runId);
    const baseline = { version: 1 as const, runId, rowsHash: sha256Json(rows), rows };
    await writeIdenticalOrNew(file, baseline);
    return baseline;
  });
}
export async function writeGenerationLedgerState({
  runDir,
  baseline,
  currentRows,
}: {
  readonly runDir: string;
  readonly baseline: GenerationLedgerBaseline;
  readonly currentRows: unknown;
}): Promise<StoredGenerationLedgerRow[]> {
  runDir = await privateDirectory(runDir);
  return withRunCheckpointLock(runDir, async () => {
    await requireMutableRun(runDir);
    verifyBaseline(baseline, baseline.runId);
    check(
      sha256Json(await readPrivateJson(path.join(runDir, baselineName))) === sha256Json(baseline),
      'Frozen generation ledger baseline changed during build'
    );
    const current = ledgerRows(currentRows);
    check(
      current.every(
        (row) => row.runId === baseline.runId && row.publicationStatus === 'Built - Pending Publish'
      ) && new Set(current.map(key)).size === current.length,
      'Generated rows must be unique drafts for the current run'
    );
    const combined = [...baseline.rows, ...current];
    await writePrivateJson(path.join(runDir, outputName), combined);
    return combined;
  });
}
