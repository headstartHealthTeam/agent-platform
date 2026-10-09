import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { cacheFixture, executeCache } from './fireflies-cache-fixture.test-support.js';
import { loadCache, readFirefliesDiscovery, saveCache } from './fireflies-cache-storage.js';
import { normalizeFirefliesDiscovery } from './fireflies-discovery.js';
import { sha256Json } from './json-fingerprint.js';
import { privateDirectory, writePrivateJson } from './private-run-storage.js';

const roots: string[] = [];
async function directory(): Promise<string> {
  const root = await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), 'intake-cache-files-test-')
  );
  roots.push(root);
  return root;
}
afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
const INDEX_FILE = 'index.json';
const DISCOVERY_FILE = 'fireflies_discovery.json';
const RAW_FILE = 'fireflies_discovery_raw.json';
const RECEIPT_FILE = 'fireflies_discovery_normalization.json';

describe('content-addressed Fireflies cache files', () => {
  it('saves exact objects then index and loads only hash/identity-bound objects', async () => {
    const root = await directory();
    expect(await loadCache(root)).toEqual({ index: null, objects: new Map() });
    const result = executeCache(cacheFixture());
    await saveCache(root, result);
    const loaded = await loadCache(root);
    expect(loaded.index).toEqual(result.index);
    expect([...loaded.objects.values()]).toEqual(result.records);
    const first = result.records[0];
    if (first === undefined) throw new Error('Missing fixture');
    const objectFile = path.join(root, 'objects', `${sha256Json(first)}.json`);
    await writePrivateJson(objectFile, { ...first, fullTranscript: 'Tampered' });
    expect((await loadCache(root)).objects.size).toBe(0);
    await fs.writeFile(objectFile, 'invalid JSON');
    expect((await loadCache(root)).objects.size).toBe(0);
    await fs.unlink(objectFile);
    expect((await loadCache(root)).objects.size).toBe(0);
    await writePrivateJson(objectFile, first);
    await writePrivateJson(path.join(root, INDEX_FILE), {
      ...result.index,
      entries: result.index.entries.map((entry) => ({ ...entry, id: 'wrong' })),
    });
    expect((await loadCache(root)).objects.size).toBe(0);
    await writePrivateJson(path.join(root, INDEX_FILE), {
      entries: [null, { id: 'x', objectKey: '../escape' }, {}],
    });
    expect((await loadCache(root)).objects.size).toBe(0);
    await writePrivateJson(path.join(root, INDEX_FILE), {});
    expect((await loadCache(root)).objects.size).toBe(0);
    await fs.writeFile(path.join(root, INDEX_FILE), 'invalid JSON');
    expect(await loadCache(root)).toEqual({ index: null, objects: new Map() });
  }, 30_000);
  it('does not hide non-missing filesystem errors or accept non-regular object storage', async () => {
    const root = await directory();
    await writePrivateJson(path.join(root, INDEX_FILE), { entries: [] });
    expect((await loadCache(root)).objects.size).toBe(0);
    const objects = path.join(root, 'objects');
    await fs.writeFile(objects, 'not a directory');
    await expect(loadCache(root)).rejects.toThrow('real directory');
    await fs.unlink(objects);
    await fs.unlink(path.join(root, INDEX_FILE));
    await fs.mkdir(path.join(root, INDEX_FILE));
    await expect(loadCache(root)).rejects.toThrow('private regular file');
    await fs.rmdir(path.join(root, INDEX_FILE));
    const result = executeCache(cacheFixture());
    await saveCache(root, result);
    const first = result.index.entries[0];
    if (first === undefined) throw new Error('Missing fixture');
    const objectFile = path.join(objects, `${first.objectKey}.json`);
    await fs.unlink(objectFile);
    await fs.mkdir(objectFile);
    await expect(loadCache(root)).rejects.toThrow('private regular file');
    if (process.platform !== 'win32') {
      const linkedRoot = await privateDirectory(path.join(root, 'linked-cache'));
      await writePrivateJson(path.join(linkedRoot, INDEX_FILE), result.index);
      await fs.symlink(objects, path.join(linkedRoot, 'objects'));
      await expect(loadCache(linkedRoot)).rejects.toThrow('real directory');
    }
  }, 30_000);
});
describe('discovery normalization storage proof', () => {
  it('allows original discovery and verifies both raw capture and normalized receipt when present', async () => {
    const root = await directory();
    const input = cacheFixture();
    await writePrivateJson(path.join(root, DISCOVERY_FILE), input.discovery);
    expect(await readFirefliesDiscovery(root, input.collectionPlan)).toEqual(input.discovery);
    const normalized = normalizeFirefliesDiscovery({
      rawDiscovery: input.discovery,
      collectionPlan: input.collectionPlan,
    });
    await writePrivateJson(path.join(root, DISCOVERY_FILE), normalized.discovery);
    await expect(readFirefliesDiscovery(root, input.collectionPlan)).rejects.toThrow('incomplete');
    await writePrivateJson(path.join(root, RAW_FILE), input.discovery);
    await expect(readFirefliesDiscovery(root, input.collectionPlan)).rejects.toThrow('incomplete');
    await writePrivateJson(path.join(root, RECEIPT_FILE), normalized.receipt);
    expect(await readFirefliesDiscovery(root, input.collectionPlan)).toEqual(normalized.discovery);
    await writePrivateJson(path.join(root, RECEIPT_FILE), {
      ...normalized.receipt,
      rawDiscoveryHash: 'wrong',
    });
    await expect(readFirefliesDiscovery(root, input.collectionPlan)).rejects.toThrow(
      'does not match'
    );
    await writePrivateJson(path.join(root, RECEIPT_FILE), normalized.receipt);
    await writePrivateJson(path.join(root, DISCOVERY_FILE), {
      ...normalized.discovery,
      runId: 'other',
    });
    await expect(readFirefliesDiscovery(root, input.collectionPlan)).rejects.toThrow(
      'does not match'
    );
    await fs.unlink(path.join(root, RAW_FILE));
    await expect(readFirefliesDiscovery(root, input.collectionPlan)).rejects.toThrow('incomplete');
  }, 30_000);
});
