import fs from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import type { FirefliesCollectionWindow } from './fireflies-cache-contract.js';
import type { FirefliesCacheMaterialization } from './fireflies-cache-materialize.js';
import { normalizeFirefliesDiscovery } from './fireflies-discovery.js';
import { sha256Json } from './json-fingerprint.js';
import {
  filesystemCode,
  optionalPrivateJson,
  privateDirectory,
  readPrivateJson,
  writePrivateJson,
} from './private-run-storage.js';

const CACHE_INDEX = 'index.json';
const OBJECTS = 'objects';
const entrySchema = z.object({ objectKey: z.string().regex(/^[a-f0-9]{64}$/), id: z.string() });
function entriesFromIndex(index: unknown): unknown[] {
  const parsed = z.object({ entries: z.array(z.unknown()) }).safeParse(index);
  return parsed.success ? parsed.data.entries : [];
}
export interface LoadedFirefliesCache {
  readonly index: unknown;
  readonly objects: Map<string, unknown>;
}
async function readCacheObject(
  cacheDirectory: string,
  entry: z.infer<typeof entrySchema>
): Promise<unknown> {
  try {
    const record = await readPrivateJson(
      path.join(cacheDirectory, OBJECTS, `${entry.objectKey}.json`)
    );
    const identity = z.object({ transcriptId: z.string() }).safeParse(record);
    if (
      sha256Json(record) === entry.objectKey &&
      identity.success &&
      identity.data.transcriptId === entry.id
    )
      return record;
  } catch (error) {
    if (!filesystemCode(error, 'ENOENT') && !(error instanceof SyntaxError)) throw error;
  }
  return undefined;
}
export async function loadCache(cacheDirectory: string): Promise<LoadedFirefliesCache> {
  let index: unknown;
  try {
    index = await readPrivateJson(path.join(cacheDirectory, CACHE_INDEX));
  } catch (error) {
    if (filesystemCode(error, 'ENOENT') || error instanceof SyntaxError)
      return { index: null, objects: new Map() };
    throw error;
  }
  const objects = new Map<string, unknown>();
  const objectStat = await fs.lstat(path.join(cacheDirectory, OBJECTS)).catch((error: unknown) => {
    if (filesystemCode(error, 'ENOENT')) return null;
    throw error;
  });
  if (objectStat !== null && (objectStat.isSymbolicLink() || !objectStat.isDirectory()))
    throw new Error('Cache object storage must be a real directory');
  for (const value of entriesFromIndex(index)) {
    const entry = entrySchema.safeParse(value);
    if (!entry.success) continue;
    const record = await readCacheObject(cacheDirectory, entry.data);
    if (record !== undefined) objects.set(entry.data.id, record);
  }
  return { index, objects };
}
export async function saveCache(
  cacheDirectory: string,
  result: FirefliesCacheMaterialization
): Promise<void> {
  const objectDirectory = await privateDirectory(path.join(cacheDirectory, OBJECTS));
  for (const record of result.records)
    await writePrivateJson(path.join(objectDirectory, `${sha256Json(record)}.json`), record);
  await writePrivateJson(path.join(cacheDirectory, CACHE_INDEX), result.index);
}
export async function readFirefliesDiscovery(
  runDirectory: string,
  collectionPlan: FirefliesCollectionWindow
): Promise<unknown> {
  const discovery = await readPrivateJson(path.join(runDirectory, 'fireflies_discovery.json'));
  const rawDiscovery = await optionalPrivateJson(
    path.join(runDirectory, 'fireflies_discovery_raw.json')
  );
  const receipt = await optionalPrivateJson(
    path.join(runDirectory, 'fireflies_discovery_normalization.json')
  );
  const envelope = z.object({ normalization: z.unknown().optional() }).safeParse(discovery);
  const normalized = Boolean(envelope.data?.normalization);
  if (rawDiscovery === undefined && receipt === undefined && !normalized) return discovery;
  if (rawDiscovery === undefined || receipt === undefined)
    throw new Error('Discovery normalization provenance is incomplete');
  const expected = normalizeFirefliesDiscovery({ rawDiscovery, collectionPlan });
  if (
    sha256Json(discovery) !== sha256Json(expected.discovery) ||
    sha256Json(receipt) !== sha256Json(expected.receipt)
  )
    throw new Error('Discovery normalization provenance does not match current inputs');
  return discovery;
}
