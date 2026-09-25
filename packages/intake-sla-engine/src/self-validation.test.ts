import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { intakeRuntimePackageDirectory, validateIntakeRuntime } from './self-validation.js';

const child = vi.hoisted(() => ({
  execFile:
    vi.fn<
      (
        file: string,
        args: readonly string[],
        options: object,
        callback: (error: Error | null) => void
      ) => void
    >(),
}));
vi.mock('node:child_process', () => child);

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'intake-self-validation-'));
  child.execFile.mockReset();
  child.execFile.mockImplementation((_file, _args, _options, callback) => {
    callback(null);
  });
});
afterEach(async () => {
  await fs.rm(root, { recursive: true });
});
describe('installed runtime self-validation', () => {
  it('runs bounded native Node self-tests using production package exports and sanitized failures', async () => {
    await validateIntakeRuntime(root);
    expect(child.execFile).toHaveBeenCalledWith(
      process.execPath,
      expect.arrayContaining(['run', '--silent']),
      expect.objectContaining({
        cwd: root,
        timeout: 180_000,
        maxBuffer: 4 * 1024 * 1024,
      }),
      expect.any(Function)
    );
    expect(child.execFile.mock.calls[0]?.[2]).toHaveProperty('env.NODE_ENV', 'production');
    child.execFile.mockImplementation((_file, _args, _options, callback) => {
      callback(new Error('private child diagnostic'));
    });
    await expect(validateIntakeRuntime(root)).rejects.toThrow(
      'Complete Intake synthetic suite failed'
    );
  });
  it('checks distribution before executing the full canonical suite every time', async () => {
    const command = vi.fn(async (): Promise<void> => undefined);
    await validateIntakeRuntime(root, command);
    await validateIntakeRuntime(root, command);
    expect(command).toHaveBeenCalledTimes(2);
    expect(command).toHaveBeenCalledWith(
      expect.stringContaining('vitest.mjs'),
      ['run', '--config', path.join(root, 'dist/self-tests/self-test-config.js'), '--silent'],
      root
    );
    await fs.writeFile(path.join(root, 'reviewer_state.json'), '{}');
    await expect(validateIntakeRuntime(root, command)).rejects.toThrow('distribution safety');
    expect(command).toHaveBeenCalledTimes(2);
  });
  it('retains suite failures and resolves source, bundled and compiled-test package roots', async () => {
    await expect(
      validateIntakeRuntime(root, async (): Promise<void> => {
        throw new Error('synthetic suite failed');
      })
    ).rejects.toThrow('synthetic suite failed');
    for (const file of [
      'src/self-validation.ts',
      'dist/chunk.js',
      'dist/self-tests/self-validation.js',
    ])
      expect(intakeRuntimePackageDirectory(pathToFileURL(path.join(root, file)).href)).toBe(root);
  });
});
