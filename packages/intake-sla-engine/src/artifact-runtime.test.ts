import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { preflightArtifactRuntime, resolveArtifactRuntime } from './artifact-runtime.js';
import { syntheticCliArguments } from './cli-launch.test-support.js';
import { runArtifactPreflightCommand } from './cli-runtime.js';
import { readPublicationJson } from './publication-command-storage.js';

const module = {
  FileBlob: {},
  Workbook: { create: (): unknown => null },
  SpreadsheetFile: { exportXlsx: (): unknown => null },
};
let directory: string;
beforeEach(async () => {
  directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'intake-runtime-')));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(directory, { recursive: true, force: true });
});
const synthetic = 'synthetic.mjs';
describe('operator-provisioned workbook runtime preflight', () => {
  it('preserves package fallback and explicit entry binding without recording paths', async () => {
    const entry = path.join(directory, synthetic);
    const resolve = vi.fn(() => entry);
    const load = vi.fn(() => Promise.resolve(module));
    const result = await resolveArtifactRuntime({ env: {}, nodeVersion: '22.1.0', resolve, load });
    expect(result.module).toBe(module);
    expect(result.identity).toEqual({
      nodeVersion: '22.1.0',
      package: '@oai/artifact-tool',
      resolution: 'package',
      contractVersion: 1,
    });
    expect(resolve).toHaveBeenCalledWith('@oai/artifact-tool');
    expect(load).toHaveBeenCalledWith(pathToFileURL(entry).href);
    resolve.mockClear();
    expect(
      (await resolveArtifactRuntime({ env: { SLA_ARTIFACT_TOOL_PATH: entry }, resolve, load }))
        .identity.resolution
    ).toBe('explicit');
    expect(resolve).not.toHaveBeenCalled();
    expect(JSON.stringify(result.identity)).not.toContain(directory);
    await resolveArtifactRuntime({ env: { SLA_ARTIFACT_TOOL_PATH: '' }, resolve, load });
    expect(resolve).toHaveBeenCalledOnce();
  });
  it('does not strengthen the source preflight into a full workbook contract', async () => {
    const minimallyCompatible = {
      FileBlob: 'truthy',
      Workbook: { create: (): undefined => undefined },
      SpreadsheetFile: { exportXlsx: (): undefined => undefined },
      extra: null,
    };
    expect(
      (
        await resolveArtifactRuntime({
          env: {},
          resolve: () => 'synthetic',
          load: () => Promise.resolve(minimallyCompatible),
        })
      ).module
    ).toBe(minimallyCompatible);
  });
  it('fails old Node before resolution and sanitizes loader, module and resolver failures', async () => {
    const resolve = vi.fn(() => synthetic);
    await expect(resolveArtifactRuntime({ nodeVersion: '20.0.0', resolve })).rejects.toThrow(
      'Node 22'
    );
    expect(resolve).not.toHaveBeenCalled();
    const loads = [
      null,
      {},
      { ...module, FileBlob: false },
      { ...module, Workbook: { create: true } },
      { ...module, SpreadsheetFile: { exportXlsx: null } },
    ];
    for (const value of loads)
      await expect(
        resolveArtifactRuntime({ env: {}, resolve, load: () => Promise.resolve(value) })
      ).rejects.toThrow('unavailable or incompatible');
    await expect(
      resolveArtifactRuntime({
        env: {},
        resolve: () => {
          throw new Error('sensitive-path');
        },
      })
    ).rejects.toThrow('no machine path was recorded');
    await expect(
      resolveArtifactRuntime({
        env: {},
        resolve,
        load: () => Promise.reject(new Error('sensitive-module-content')),
      })
    ).rejects.not.toThrow('sensitive-module-content');
  });
  it('writes only the approved private identity receipt and preserves immutable runs', async () => {
    const options = {
      env: {},
      resolve: (): string => synthetic,
      load: (): Promise<typeof module> => Promise.resolve(module),
    };
    const result = await preflightArtifactRuntime({ ...options, runDirectory: directory });
    const file = path.join(directory, 'runtime_preflight.json');
    expect(await readPublicationJson(file)).toEqual(result);
    if (process.platform !== 'win32') expect((await fs.stat(file)).mode & 0o777).toBe(0o600);
    const before = await fs.readFile(file, 'utf8');
    await fs.writeFile(path.join(directory, 'publication-readback.json'), '{}');
    await expect(preflightArtifactRuntime({ ...options, runDirectory: directory })).rejects.toThrow(
      'immutable'
    );
    expect(await fs.readFile(file, 'utf8')).toBe(before);
    expect(await preflightArtifactRuntime(options)).toEqual(result);
  });
  it('uses the actual module loader and CLI without an installed workbook dependency', async () => {
    const entry = path.join(directory, synthetic);
    await fs.writeFile(
      entry,
      'export const FileBlob = {}; export const Workbook = { create() {} }; export const SpreadsheetFile = { exportXlsx() {} };'
    );
    vi.stubEnv('SLA_ARTIFACT_TOOL_PATH', entry);
    const command = await runArtifactPreflightCommand(['--run-dir', directory]);
    expect(command.exitCode).toBe(0);
    expect(command.stderr).toBe('');
    expect(JSON.parse(command.stdout)).toMatchObject({
      passed: true,
      resolution: 'explicit',
      package: '@oai/artifact-tool',
    });
    const result = await new Promise<{ readonly stdout: string; readonly stderr: string }>(
      (resolve, reject) => {
        execFile(
          process.execPath,
          [...syntheticCliArguments(import.meta.url), 'review:runtime-preflight'],
          { cwd: directory, encoding: 'utf8', timeout: 15_000, maxBuffer: 1024 * 1024 },
          (error, stdout, stderr) => {
            if (error !== null)
              reject(
                error instanceof Error ? error : new Error('Synthetic runtime command failed')
              );
            else resolve({ stdout, stderr });
          }
        );
      }
    );
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toHaveProperty('resolution', 'explicit');
    vi.stubEnv('SLA_ARTIFACT_TOOL_PATH', path.join(directory, 'missing.mjs'));
    const failed = await runArtifactPreflightCommand([]);
    expect(failed.exitCode).toBe(1);
    expect(failed.stdout).toBe('');
    expect(failed.stderr).not.toContain(directory);
    expect(failed.stderr).toContain('Artifact runtime unavailable');
  }, 20_000);
});
