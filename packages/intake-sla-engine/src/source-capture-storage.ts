import path from 'node:path';

import { z } from 'zod';

import { preserveCollectionRecord } from './collection-decoding.js';
import { normalizeFirefliesDiscovery } from './fireflies-discovery.js';
import { sha256Json } from './json-fingerprint.js';
import {
  optionalPrivateJson,
  privateDirectory,
  readPrivateJson,
  requireMutableRun,
  withCacheLock,
  withRunCheckpointLock,
  writeIdenticalOrNew,
  writePrivateJson,
} from './private-run-storage.js';
import { mergeSlackDelta } from './slack-delta.js';
import { materializeSlackSearchCapture } from './slack-search-capture.js';
import { extendSlackSearchCapture } from './slack-search-resume.js';

/** Retain original complete-output preflight: never fill one file before detecting a conflict. */
export async function saveNormalizedFirefliesDiscovery(runDirectory: string): Promise<object> {
  const directory = await privateDirectory(runDirectory);
  return withCacheLock(directory, async () => {
    const rawDiscovery = await readPrivateJson(
      path.join(directory, 'fireflies_discovery_raw.json')
    );
    const collectionPlan = preserveCollectionRecord(
      z.looseObject({ fromDate: z.string().nullable(), toDate: z.string().nullable() })
    ).parse(await readPrivateJson(path.join(directory, 'fireflies_run_inventory.json')));
    const { discovery, receipt } = normalizeFirefliesDiscovery({ rawDiscovery, collectionPlan });
    const outputs = new Map<string, unknown>([
      ['fireflies_discovery.json', discovery],
      ['fireflies_discovery_normalization.json', receipt],
    ]);
    const missing = new Map<string, unknown>();
    for (const [name, value] of outputs) {
      const existing = await optionalPrivateJson(path.join(directory, name));
      if (existing === undefined) missing.set(name, value);
      else if (sha256Json(existing) !== sha256Json(value))
        throw new Error('Existing output differs');
    }
    for (const [name, value] of missing) await writePrivateJson(path.join(directory, name), value);
    return { status: 'Normalized', adapterVersion: receipt.adapterVersion, ...receipt.counts };
  });
}

export async function saveSlackSearchCapture({
  runDirectory,
  inputFile,
  resume = false,
}: {
  readonly runDirectory: string;
  readonly inputFile: string;
  readonly resume?: boolean;
}): Promise<{ rows: number; blocked: number }> {
  const directory = await privateDirectory(runDirectory);
  const plan = await readPrivateJson(path.join(directory, 'slack_full_sweep_plan.json'));
  const addition = await readPrivateJson(inputFile);
  return withRunCheckpointLock(directory, async () => {
    await requireMutableRun(directory);
    const captureFile = path.join(directory, 'slack_search_capture.json');
    const rowsFile = path.join(directory, 'slack_full_sweep_exact_name.json');
    const prior = await optionalPrivateJson(captureFile);
    const resuming = resume && Boolean(prior);
    const capture = resuming ? extendSlackSearchCapture(prior, addition) : addition;
    const rows = materializeSlackSearchCapture({ plan, capture });
    if (resuming) {
      const previousRows = await optionalPrivateJson(rowsFile);
      const history = await privateDirectory(path.join(directory, 'slack-capture-history'));
      const original = { capture: prior, rows: previousRows ?? null };
      await writeIdenticalOrNew(path.join(history, `${sha256Json(original)}.json`), original);
      await writePrivateJson(captureFile, capture);
      await writePrivateJson(rowsFile, rows);
    } else {
      await writeIdenticalOrNew(captureFile, capture);
      await writeIdenticalOrNew(rowsFile, rows);
    }
    return { rows: rows.length, blocked: rows.filter((row) => row.blocked).length };
  });
}

export async function saveSlackDelta({
  runDirectory,
  baseFile,
  deltaFile,
  proofFile,
}: {
  readonly runDirectory: string;
  readonly baseFile: string;
  readonly deltaFile: string;
  readonly proofFile: string;
}): Promise<{ mergedRecords: number; sourceReadinessGranted: false }> {
  const directory = await privateDirectory(runDirectory);
  const result = mergeSlackDelta({
    base: await readPrivateJson(baseFile),
    delta: await readPrivateJson(deltaFile),
    proof: await readPrivateJson(proofFile),
  });
  await withCacheLock(directory, async () => {
    await requireMutableRun(directory);
    await writeIdenticalOrNew(path.join(directory, 'slack_bounded_delta.json'), result);
  });
  return { mergedRecords: result.records.length, sourceReadinessGranted: false };
}
