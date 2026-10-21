import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { FirefliesCacheError } from './fireflies-cache-contract.js';
import { sha256Json } from './json-fingerprint.js';

export function filesystemCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
export async function readPrivateJson(file: string): Promise<unknown> {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Expected a private regular file');
  const value: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
  return value;
}
export async function optionalPrivateJson(file: string): Promise<unknown> {
  try {
    return await readPrivateJson(file);
  } catch (error) {
    if (filesystemCode(error, 'ENOENT')) return undefined;
    throw error;
  }
}
async function absentPath(file: string): Promise<boolean> {
  try {
    await fs.lstat(file);
    return false;
  } catch (error) {
    if (filesystemCode(error, 'ENOENT')) return true;
    throw error;
  }
}
export async function privateDirectory(directory: string): Promise<string> {
  const absolute = path.resolve(directory);
  await fs.mkdir(absolute, { recursive: true, mode: 0o700 });
  const real = await fs.realpath(absolute);
  if (real !== absolute) throw new Error('Private storage must use its real path, not a symlink');
  const stat = await fs.lstat(real);
  if (!stat.isDirectory() || (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)) {
    throw new Error('Private storage must be owner-only');
  }
  for (let parent = real; ; parent = path.dirname(parent)) {
    if (!(await absentPath(path.join(parent, '.git'))))
      throw new Error('Private storage must be outside Git checkouts');
    if (path.dirname(parent) === parent) break;
  }
  return real;
}
export async function atomicPrivateWrite(file: string, text: string): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const handle = await fs.open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(text);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temporary, file);
  } finally {
    await fs.unlink(temporary).catch((error: unknown) => {
      if (!filesystemCode(error, 'ENOENT')) throw error;
    });
  }
}
export async function writePrivateJson(file: string, value: unknown): Promise<void> {
  await atomicPrivateWrite(file, `${JSON.stringify(value, null, 2)}\n`);
}
export async function writeIdenticalOrNew(file: string, value: unknown): Promise<void> {
  const existing = await optionalPrivateJson(file);
  if (existing !== undefined) {
    if (sha256Json(existing) !== sha256Json(value))
      throw new Error('An existing artifact differs; do not overwrite the checkpoint');
    return;
  }
  await writePrivateJson(file, value);
}
export interface WriterLockOptions {
  readonly waitMs?: number;
  readonly sleep?: (milliseconds: number) => Promise<unknown>;
  readonly now?: () => number;
}
async function validateExistingLock(lock: string): Promise<void> {
  const stat = await fs.lstat(lock).catch((error: unknown) => {
    if (filesystemCode(error, 'ENOENT')) return null;
    throw error;
  });
  if (stat !== null && (!stat.isDirectory() || stat.isSymbolicLink()))
    throw new Error('Invalid writer lock');
}
export async function withCacheLock<T>(
  cacheDirectory: string,
  operation: () => T | Promise<T>,
  { waitMs = 0, sleep = delay, now = Date.now }: WriterLockOptions = {}
): Promise<T> {
  if (!Number.isSafeInteger(waitMs) || waitMs < 0 || waitMs > 10_000)
    throw new Error('Invalid writer wait bound');
  const lock = path.join(cacheDirectory, '.writer-lock');
  const deadline = now() + waitMs;
  for (;;) {
    try {
      await fs.mkdir(lock, { mode: 0o700 });
      break;
    } catch (error) {
      if (!filesystemCode(error, 'EEXIST')) throw error;
      await validateExistingLock(lock);
      if (now() >= deadline)
        throw new FirefliesCacheError(
          'CACHE_LOCKED',
          'Cache is locked; writer wait exhausted, retain lock and resume later'
        );
      await sleep(Math.min(100, deadline - now()));
    }
  }
  try {
    return await operation();
  } finally {
    await fs.rmdir(lock);
  }
}
export async function withRunCheckpointLock<T>(
  runDirectory: string,
  operation: () => T | Promise<T>
): Promise<T> {
  return withCacheLock(runDirectory, operation, { waitMs: 10_000 });
}
export async function requireMutableRun(runDirectory: string): Promise<void> {
  for (let directory = path.resolve(runDirectory); ; directory = path.dirname(directory)) {
    if (!(await absentPath(path.join(directory, 'publication-readback.json'))))
      throw new Error('A run with a final publication receipt is immutable');
    if (path.dirname(directory) === directory) break;
  }
}
export function localArtifactPath(runDirectory: string, name: unknown): string {
  if (
    typeof name !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name) ||
    name.endsWith('.tmp')
  )
    throw new Error('Expected a simple artifact filename');
  return path.join(runDirectory, name);
}
