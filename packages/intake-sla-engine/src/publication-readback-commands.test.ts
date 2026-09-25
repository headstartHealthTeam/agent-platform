import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sha256Json } from './json-fingerprint.js';
import { readPrivateJson, writePrivateJson } from './private-run-storage.js';
import { publicationPlanHash } from './publication-plan.js';
import {
  capturePreparedStageReadback,
  verifyPreparedPublication,
} from './publication-readback-commands.js';
import type { PublicationManifest, PublicationStage } from './publication-readback-types.js';

interface Stage extends PublicationStage {
  readonly file: string;
  readonly calls: { file: string; payloadHash: string }[];
}
interface Fixture {
  readonly runDirectory: string;
  readonly actualFile: string;
  readonly manifest: PublicationManifest & { readonly stages: Stage[] };
  readonly write: (name: string, value: unknown) => Promise<void>;
  readonly read: (name: string) => Promise<unknown>;
  readonly actual: (stageId: string) => Promise<void>;
}
const directories: string[] = [];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-01-02T00:00:00Z'));
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const directory of directories.splice(0))
    await fs.rm(directory, { recursive: true, force: true });
});
async function fixture(): Promise<Fixture> {
  const runDirectory = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'synthetic-publish-capture-'))
  );
  directories.push(runDirectory);
  const write = (name: string, value: unknown): Promise<void> =>
    writePrivateJson(path.join(runDirectory, name), value);
  const read = (name: string): Promise<unknown> => readPrivateJson(path.join(runDirectory, name));
  const stages: Stage[] = [];
  for (const id of ['02-review-queue', '08-terminal-marker', '09-run-history']) {
    const payload = { requests: [{ synthetic: id }] };
    const call = { file: `${id}-call.json`, payloadHash: sha256Json(payload) };
    stages.push({
      id,
      file: `${id}.json`,
      payloadHash: sha256Json(payload),
      calls: [call],
      assertions: [
        { id, kind: 'values', rowCount: 1, columnCount: 1, expectedHash: sha256Json([[id]]) },
      ],
    });
    await write(`${id}.json`, payload);
    await write(call.file, payload);
  }
  const finalAssertions = stages.flatMap((stage) => stage.assertions ?? []);
  const manifest = {
    runId: 'run',
    spreadsheetId: 'sheet',
    stages,
    finalAssertions,
    planHash: publicationPlanHash(stages, finalAssertions),
  };
  await write('publication_stages_manifest.json', manifest);
  await write('publication-gate.json', {
    passed: true,
    runId: manifest.runId,
    spreadsheetId: manifest.spreadsheetId,
    planHash: manifest.planHash,
    evaluatedAt: '2026-01-01T00:00:00Z',
  });
  return {
    runDirectory,
    actualFile: path.join(runDirectory, 'actual.json'),
    manifest,
    write,
    read,
    actual: (stageId): Promise<void> =>
      write('actual.json', {
        assertions: [{ id: stageId, values: [[stageId]], pixels: 'ignored' }],
        retainedMetadata: { synthetic: true },
      }),
  };
}
async function complete(f: Fixture): Promise<void> {
  for (const stage of f.manifest.stages) {
    await f.actual(stage.id);
    await capturePreparedStageReadback({ ...f, stageId: stage.id });
  }
}
describe('manual captured publication readback commands', () => {
  it('does not replace a newer receipt written while prepared payloads are being read', async () => {
    const f = await fixture();
    await complete(f);
    const completed = await f.read('publication_stage_readbacks.json');
    await f.write('publication_stage_readbacks.json', {
      runId: f.manifest.runId,
      spreadsheetId: f.manifest.spreadsheetId,
      planHash: f.manifest.planHash,
      stages: [],
    });
    await f.actual('02-review-queue');
    const read = fs.readFile;
    let interleaved = false;
    vi.spyOn(fs, 'readFile').mockImplementation(async (file, options) => {
      const value = await read(file, options);
      if (!interleaved && typeof file === 'string' && file.endsWith('02-review-queue.json')) {
        interleaved = true;
        await f.write('publication_stage_readbacks.json', completed);
      }
      return value;
    });
    await expect(
      capturePreparedStageReadback({ ...f, stageId: '02-review-queue' })
    ).rejects.toThrow('already complete');
    expect(interleaved).toBe(true);
    expect(await f.read('publication_stage_readbacks.json')).toEqual(completed);
  }, 30_000);
  it('samples receipts after all payloads for final verification, not before them', async () => {
    const f = await fixture();
    await complete(f);
    const empty = {
      runId: f.manifest.runId,
      spreadsheetId: f.manifest.spreadsheetId,
      planHash: f.manifest.planHash,
      stages: [],
    };
    const read = fs.readFile;
    vi.spyOn(fs, 'readFile').mockImplementation(async (file, options) => {
      const value = await read(file, options);
      if (typeof file === 'string' && file.endsWith('09-run-history-call.json'))
        await f.write('publication_stage_readbacks.json', empty);
      return value;
    });
    expect(await verifyPreparedPublication(f)).toMatchObject({
      exitCode: 2,
      result: { nextStage: '02-review-queue' },
    });
    await expect(
      fs.access(path.join(f.runDirectory, 'publication-readback.json'))
    ).rejects.toThrow();
  }, 30_000);
  it('retains hashed nullable metadata unused by a values assertion', async () => {
    const f = await fixture();
    const stages = f.manifest.stages.map((stage) => ({
      ...stage,
      assertions: stage.assertions?.map((assertion) => ({
        ...assertion,
        title: null,
        dimension: null,
      })),
    }));
    const manifest = {
      ...f.manifest,
      stages,
      planHash: publicationPlanHash(stages, f.manifest.finalAssertions),
    };
    await f.write('publication_stages_manifest.json', manifest);
    await f.write('publication-gate.json', { ...manifest, passed: true });
    await f.actual('02-review-queue');
    expect(await capturePreparedStageReadback({ ...f, stageId: '02-review-queue' })).toMatchObject({
      recorded: '02-review-queue',
      verifiedAssertions: 1,
    });
  }, 30_000);
  it('records exact hashes, stage order and final receipt while remaining usable after lease expiry', async () => {
    const f = await fixture();
    const expectedStages: unknown[] = [];
    for (const [index, stage] of f.manifest.stages.entries()) {
      await f.actual(stage.id);
      const actual = await f.read('actual.json');
      expect(await capturePreparedStageReadback({ ...f, stageId: stage.id })).toEqual({
        recorded: stage.id,
        verifiedAssertions: 1,
        nextStage: f.manifest.stages.at(index + 1)?.id ?? null,
      });
      expectedStages.push({
        id: stage.id,
        payloadHash: stage.payloadHash,
        verifiedAt: new Date().toISOString(),
        captureVersion: 1,
        evidenceHash: sha256Json(actual),
        assertions: [{ id: stage.id, actualHash: sha256Json([[stage.id]]) }],
      });
      expect(await f.read('publication_stage_readbacks.json')).toEqual({
        schemaVersion: 1,
        runId: f.manifest.runId,
        spreadsheetId: f.manifest.spreadsheetId,
        planHash: f.manifest.planHash,
        stages: expectedStages,
      });
    }
    const final = {
      runId: f.manifest.runId,
      spreadsheetId: f.manifest.spreadsheetId,
      assertions: f.manifest.stages.map((stage) => ({
        id: stage.id,
        values: [[stage.id]],
        format: false,
      })),
      retainedMetadata: 'exact',
    };
    await f.write('actual.json', final);
    const result = await verifyPreparedPublication(f);
    expect(result.exitCode).toBe(0);
    expect(result.result).toMatchObject({
      complete: true,
      publicationStatus: 'Published',
      nextStage: null,
      finalReadback: {
        evidenceHash: sha256Json(final),
        assertions: f.manifest.stages.map((stage) => ({
          id: stage.id,
          actualHash: sha256Json([[stage.id]]),
        })),
      },
    });
    expect(await f.read('publication-readback.json')).toEqual({
      ...result.result,
      verifiedAt: new Date().toISOString(),
    });
    for (const name of ['publication-readback.json', 'publication_stage_readbacks.json']) {
      const stat = await fs.stat(path.join(f.runDirectory, name));
      expect(stat.isFile()).toBe(true);
      if (process.platform !== 'win32') expect(stat.mode & 0o777).toBe(0o600);
    }
    expect(await fs.readdir(f.runDirectory)).not.toContain('publication_stage_readbacks.json.tmp');
  }, 30_000);
  it('does not parse or accept a final sample while stages are incomplete', async () => {
    const f = await fixture();
    await f.actual('02-review-queue');
    await capturePreparedStageReadback({ ...f, stageId: '02-review-queue' });
    await fs.writeFile(f.actualFile, 'not JSON', { mode: 0o600 });
    expect(await verifyPreparedPublication(f)).toMatchObject({
      exitCode: 2,
      result: { complete: false, nextStage: '08-terminal-marker' },
    });
    await expect(
      fs.access(path.join(f.runDirectory, 'publication-readback.json'))
    ).rejects.toThrow();
  }, 30_000);
  it('rejects wrong order, changed payloads and mismatched evidence before recording anything', async () => {
    const f = await fixture();
    await f.actual('09-run-history');
    await expect(capturePreparedStageReadback({ ...f, stageId: '09-run-history' })).rejects.toThrow(
      'Expected readback'
    );
    await expect(
      capturePreparedStageReadback({ ...f, stageId: '02-review-queue' })
    ).rejects.toThrow('missing');
    await expect(capturePreparedStageReadback({ ...f, stageId: 'unknown' })).rejects.toThrow(
      'Unknown publication stage'
    );
    await f.actual('02-review-queue');
    await f.write('02-review-queue-call.json', { requests: [] });
    await expect(
      capturePreparedStageReadback({ ...f, stageId: '02-review-queue' })
    ).rejects.toThrow('hash changed');
    await expect(
      fs.access(path.join(f.runDirectory, 'publication_stage_readbacks.json'))
    ).rejects.toThrow();
  }, 30_000);
  it('requires every saved payload and an exact final target after all stage receipts exist', async () => {
    const f = await fixture();
    await complete(f);
    await f.write('actual.json', {
      runId: 'wrong',
      spreadsheetId: f.manifest.spreadsheetId,
      assertions: [],
    });
    await expect(verifyPreparedPublication(f)).rejects.toThrow('different run or spreadsheet');
    await f.write('actual.json', {
      runId: f.manifest.runId,
      spreadsheetId: f.manifest.spreadsheetId,
      assertions: f.manifest.stages.map((stage) => ({ id: stage.id, values: [['changed']] })),
    });
    await expect(verifyPreparedPublication(f)).rejects.toThrow('does not match');
    await f.write('09-run-history.json', { requests: [] });
    await expect(verifyPreparedPublication(f)).rejects.toThrow('stage payload hash changed');
    await expect(
      fs.access(path.join(f.runDirectory, 'publication-readback.json'))
    ).rejects.toThrow();
  }, 30_000);
  it('requires saved observations and an actual file even when the publication is incomplete', async () => {
    const f = await fixture();
    await expect(verifyPreparedPublication(f)).rejects.toThrow();
    await f.actual('02-review-queue');
    await capturePreparedStageReadback({ ...f, stageId: '02-review-queue' });
    await fs.unlink(f.actualFile);
    await expect(verifyPreparedPublication(f)).rejects.toThrow();
  }, 30_000);
});
