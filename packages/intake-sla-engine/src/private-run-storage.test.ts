import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { selectFirefliesCollectionMode } from './fireflies-collection-mode.js';
import {
  atomicPrivateWrite,
  filesystemCode,
  localArtifactPath,
  optionalPrivateJson,
  privateDirectory,
  readPrivateJson,
  requireMutableRun,
  withCacheLock,
  withRunCheckpointLock,
  writeIdenticalOrNew,
  writePrivateJson,
} from './private-run-storage.js';

const temporaryDirectories: string[] = [];
async function directory(): Promise<string> {
  const value = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'intake-storage-test-'));
  temporaryDirectories.push(value);
  return value;
}
afterEach(async () => {
  for (const value of temporaryDirectories.splice(0))
    await fs.rm(value, { recursive: true, force: true });
});
describe('private run files', () => {
  it('uses private regular files, atomic replacement and identical-or-new checkpoint protection', async () => {
    const root = await directory();
    expect(await privateDirectory(root)).toBe(root);
    const file = localArtifactPath(root, 'source.json');
    expect(await optionalPrivateJson(file)).toBeUndefined();
    await writeIdenticalOrNew(file, { value: 1 });
    await writeIdenticalOrNew(file, { value: 1 });
    expect(await readPrivateJson(file)).toEqual({ value: 1 });
    await expect(writeIdenticalOrNew(file, { value: 2 })).rejects.toThrow('do not overwrite');
    await writePrivateJson(file, { value: 2 });
    expect(await fs.readFile(file, 'utf8')).toBe('{\n  "value": 2\n}\n');
    expect((await fs.readdir(root)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    if (process.platform !== 'win32') expect((await fs.stat(file)).mode & 0o077).toBe(0);
    await expect(readPrivateJson(root)).rejects.toThrow('private regular file');
    await atomicPrivateWrite(file, 'invalid JSON');
    await expect(optionalPrivateJson(file)).rejects.toBeInstanceOf(SyntaxError);
    await expect(atomicPrivateWrite(root, 'cannot replace directory')).rejects.toThrow();
    expect((await fs.readdir(root)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    await expect(
      atomicPrivateWrite(path.join(root, 'missing', 'file'), 'value')
    ).rejects.toMatchObject({ code: 'ENOENT' });
    for (const name of ['', '.hidden', '../escape', 'a/b', 'x.tmp', null])
      expect(() => localArtifactPath(root, name)).toThrow('simple artifact');
    expect(filesystemCode(new Error('error'), 'ENOENT')).toBe(false);
    expect(filesystemCode(null, 'ENOENT')).toBe(false);
  });
  it('rejects checkout locations, symlinked storage and public directories', async () => {
    const root = await directory();
    const checkout = path.join(root, 'checkout');
    await fs.mkdir(path.join(checkout, '.git'), { recursive: true, mode: 0o700 });
    await expect(privateDirectory(checkout)).rejects.toThrow('outside Git');
    if (process.platform !== 'win32') {
      const linked = path.join(root, 'linked');
      const target = await privateDirectory(path.join(root, 'target'));
      await fs.symlink(target, linked);
      await expect(privateDirectory(linked)).rejects.toThrow('symlink');
      const file = path.join(root, 'record.json');
      await writePrivateJson(file, {});
      const fileLink = path.join(root, 'record-link.json');
      await fs.symlink(file, fileLink);
      await expect(readPrivateJson(fileLink)).rejects.toThrow('private regular file');
      await fs.chmod(target, 0o755);
      await expect(privateDirectory(target)).rejects.toThrow('owner-only');
    }
  });
  it('retains existing locks, bounds waits and propagates operation failures while releasing its own lock', async () => {
    const root = await directory();
    const lock = path.join(root, '.writer-lock');
    await fs.mkdir(lock);
    let time = 0;
    let ran = false;
    await expect(
      withCacheLock(
        root,
        () => {
          ran = true;
        },
        {
          waitMs: 300,
          now: () => time,
          sleep: (ms): Promise<void> => {
            time += ms;
            return Promise.resolve();
          },
        }
      )
    ).rejects.toMatchObject({ code: 'CACHE_LOCKED' });
    expect(time).toBe(300);
    expect(ran).toBe(false);
    expect((await fs.stat(lock)).isDirectory()).toBe(true);
    await fs.rmdir(lock);
    const failure = new Error('synthetic failure');
    await expect(
      withRunCheckpointLock(root, () => {
        throw failure;
      })
    ).rejects.toBe(failure);
    await expect(fs.stat(lock)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await withCacheLock(root, () => 4)).toBe(4);
    for (const waitMs of [-1, 10_001, 0.5, NaN])
      await expect(withCacheLock(root, () => 1, { waitMs })).rejects.toThrow('wait bound');
    await fs.writeFile(lock, 'not a directory');
    await expect(withCacheLock(root, () => 1)).rejects.toThrow('Invalid writer lock');
    await expect(withCacheLock(path.join(root, 'missing'), () => 1)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
  it('allows a queued writer after the current holder releases, without deleting somebody else’s lock', async () => {
    const root = await directory();
    const lock = path.join(root, '.writer-lock');
    await fs.mkdir(lock);
    let time = 0;
    const result = await withCacheLock(root, () => 'acquired', {
      waitMs: 100,
      now: () => time,
      sleep: async (ms): Promise<void> => {
        time += ms;
        await fs.rmdir(lock);
      },
    });
    expect(result).toBe('acquired');
    await expect(fs.stat(lock)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('checks publication receipts at every ancestor and retains explicit mutually exclusive collection modes', async () => {
    const root = await directory();
    const child = await privateDirectory(path.join(root, 'child'));
    await requireMutableRun(child);
    await writePrivateJson(path.join(root, 'publication-readback.json'), { complete: true });
    await expect(requireMutableRun(child)).rejects.toThrow('immutable');
    const args = { runId: 'synthetic', asOf: '2026-01-01', mode: 'bounded-fresh' };
    await selectFirefliesCollectionMode(child, args);
    await selectFirefliesCollectionMode(child, args);
    expect(await readPrivateJson(path.join(child, 'fireflies_collection_mode.json'))).toMatchObject(
      { cacheReuse: false, wholeInventoryBodies: false }
    );
    await expect(
      selectFirefliesCollectionMode(child, { ...args, mode: 'invalid' })
    ).rejects.toThrow('Explicit');
    await writePrivateJson(path.join(child, 'fireflies_cache_plan.json'), {});
    await expect(selectFirefliesCollectionMode(child, args)).rejects.toThrow('Conflicting');
    const reuse = await privateDirectory(path.join(root, 'reuse'));
    await selectFirefliesCollectionMode(reuse, { ...args, mode: 'cache-reuse' });
    expect(await readPrivateJson(path.join(reuse, 'fireflies_collection_mode.json'))).toMatchObject(
      { cacheReuse: true, wholeInventoryBodies: true }
    );
    await writePrivateJson(path.join(reuse, 'fireflies_candidate_fetch_manifest.json'), {});
    await expect(
      selectFirefliesCollectionMode(reuse, { ...args, mode: 'cache-reuse' })
    ).rejects.toThrow('Conflicting');
  });
});
