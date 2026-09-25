import path from 'node:path';

import { optionalPrivateJson, writeIdenticalOrNew } from './private-run-storage.js';
const BOUNDED_FRESH = 'bounded-fresh';

export async function selectFirefliesCollectionMode(
  runDirectory: string,
  {
    mode,
    runId,
    asOf,
  }: {
    readonly mode: string;
    readonly runId: unknown;
    readonly asOf: unknown;
  }
): Promise<void> {
  if (![BOUNDED_FRESH, 'cache-shadow-experiment', 'cache-reuse'].includes(mode))
    throw new Error('Explicit Fireflies collection mode is required');
  const opposing =
    mode === BOUNDED_FRESH
      ? 'fireflies_cache_plan.json'
      : 'fireflies_candidate_fetch_manifest.json';
  if ((await optionalPrivateJson(path.join(runDirectory, opposing))) !== undefined)
    throw new Error('Conflicting Fireflies collection plans cannot share a run');
  await writeIdenticalOrNew(path.join(runDirectory, 'fireflies_collection_mode.json'), {
    version: '2026-09-11.1',
    mode,
    runId,
    asOf,
    cacheReuse: mode === 'cache-reuse',
    wholeInventoryBodies: mode !== BOUNDED_FRESH,
  });
}
