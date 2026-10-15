import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sha256Json } from './json-fingerprint.js';
import { writePrivateJson } from './private-run-storage.js';
import { readNextPublicationStage } from './publication-next-command.js';
import { publicationPlanHash } from './publication-plan.js';
import type {
  PublicationManifest,
  PublicationObservations,
  PublicationStage,
} from './publication-readback-types.js';
import { recordPublicationStageReadback } from './publication-readback.js';

const directories: string[] = [];
const time = Date.parse('2026-01-01T12:00:00Z');
interface Stage extends PublicationStage {
  readonly file: string;
  readonly calls: { file: string; payloadHash: string }[];
}
interface Fixture {
  readonly directory: string;
  readonly manifest: PublicationManifest;
  readonly first: Stage;
  readonly write: (name: string, value: unknown) => Promise<void>;
  readonly gate: (evaluatedAt: unknown) => Promise<void>;
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(time);
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const directory of directories.splice(0))
    await fs.rm(directory, { recursive: true, force: true });
});
async function fixture(progress = 'new'): Promise<Fixture> {
  const directory = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'synthetic-publish-next-'))
  );
  directories.push(directory);
  const write = (name: string, value: unknown): Promise<void> =>
    writePrivateJson(path.join(directory, name), value);
  const stages: Stage[] = [];
  for (const id of ['02-review-queue', '08-terminal-marker', '09-run-history']) {
    const calls = [];
    const requests = [];
    for (const index of [0, 1]) {
      const payload = { requests: [{ synthetic: `${id}-${String(index)}` }] };
      const file = `${id}-call-${String(index)}.json`;
      calls.push({ file, payloadHash: sha256Json(payload) });
      requests.push(...payload.requests);
      await write(file, payload);
    }
    const payload = { requests };
    stages.push({
      id,
      file: `${id}.json`,
      payloadHash: sha256Json(payload),
      calls,
      assertions: [
        { id, kind: 'values', rowCount: 1, columnCount: 1, expectedHash: sha256Json([[id]]) },
      ],
    });
    await write(`${id}.json`, payload);
  }
  const manifest = {
    runId: 'synthetic-run',
    spreadsheetId: 'synthetic-sheet',
    runHistoryLast: true,
    stages,
    planHash: publicationPlanHash(stages),
  };
  await write('publication_stages_manifest.json', manifest);
  let observations: PublicationObservations = {
    runId: manifest.runId,
    spreadsheetId: manifest.spreadsheetId,
    planHash: manifest.planHash,
    stages: [],
  };
  for (const stage of progress === 'complete'
    ? stages
    : progress === 'verified-stage'
      ? stages.slice(0, 1)
      : []) {
    const appliedPayload: unknown = JSON.parse(
      await fs.readFile(path.join(directory, stage.file), 'utf8')
    );
    observations = recordPublicationStageReadback({
      manifest,
      observations,
      stageId: stage.id,
      appliedPayload,
      actual: { assertions: [{ id: stage.id, values: [[stage.id]] }] },
    });
  }
  await write('publication_stage_readbacks.json', observations);
  const first = stages[0];
  if (first === undefined) throw new Error('Fixture requires stages');
  if (progress === 'call-prefix')
    await write('publication_stage_resume.json', {
      version: 1,
      runId: manifest.runId,
      spreadsheetId: manifest.spreadsheetId,
      planHash: manifest.planHash,
      stageId: first.id,
      appliedCalls: first.calls.slice(0, 1),
      rejectionHash: 'a'.repeat(64),
    });
  const gate = (evaluatedAt: unknown): Promise<void> =>
    write('publication-gate.json', {
      passed: true,
      runId: manifest.runId,
      spreadsheetId: manifest.spreadsheetId,
      planHash: manifest.planHash,
      evaluatedAt,
    });
  return { directory, manifest, write, gate, first };
}
describe('saved publication next-stage command', () => {
  it('does not validate assertion fields unused by next-stage inspection', async () => {
    const f = await fixture();
    const stages = f.manifest.stages.map((stage) => ({
      ...stage,
      assertions: stage.assertions?.map((assertion) => ({
        ...assertion,
        title: null,
        dimension: null,
      })),
    }));
    const finalAssertions = [{ id: 'unused-final', title: null, expectedHash: false }];
    const manifest = {
      ...f.manifest,
      stages,
      finalAssertions,
      planHash: publicationPlanHash(stages, finalAssertions),
    };
    await f.write('publication_stages_manifest.json', manifest);
    await f.write('publication-gate.json', {
      passed: true,
      runId: manifest.runId,
      spreadsheetId: manifest.spreadsheetId,
      planHash: manifest.planHash,
      evaluatedAt: new Date(time).toISOString(),
    });
    await f.write('publication_stage_readbacks.json', {
      runId: manifest.runId,
      spreadsheetId: manifest.spreadsheetId,
      planHash: manifest.planHash,
      stages: [],
    });
    expect(await readNextPublicationStage(f.directory)).toMatchObject({
      complete: false,
      stageId: f.first.id,
      calls: f.first.calls,
    });
  }, 30_000);
  it.each(['new', 'verified-stage', 'call-prefix'])(
    'withholds calls from expired/future/invalid gates: %s',
    async (progress) => {
      const f = await fixture(progress);
      const observationsPath = path.join(f.directory, 'publication_stage_readbacks.json');
      const before = await fs.readFile(observationsPath, 'utf8');
      for (const evaluatedAt of [
        new Date(time - 24 * 3_600_000).toISOString(),
        new Date(time + 24 * 3_600_000).toISOString(),
        'invalid',
        undefined,
      ]) {
        await f.gate(evaluatedAt);
        await expect(readNextPublicationStage(f.directory)).rejects.toThrow(
          'refresh all required checks'
        );
        expect(await fs.readFile(observationsPath, 'utf8')).toBe(before);
      }
      await f.gate(new Date(time).toISOString());
      const next = await readNextPublicationStage(f.directory);
      expect(next).toMatchObject({
        complete: false,
        stageId: progress === 'verified-stage' ? '08-terminal-marker' : f.first.id,
      });
      if (next.complete) throw new Error('Fixture requires next stage');
      expect(next.calls).toHaveLength(progress === 'call-prefix' ? 1 : 2);
      if (progress === 'call-prefix') expect(next.calls?.[0]?.file).toBe(f.first.calls[1]?.file);
    },
    30_000
  );
  it('inspects complete publication after lease expiry without loading stale payloads or returning calls', async () => {
    const f = await fixture('complete');
    await f.gate(new Date(time - 24 * 3_600_000).toISOString());
    await fs.unlink(path.join(f.directory, f.first.file));
    expect(await readNextPublicationStage(f.directory)).toEqual({ complete: true });
  }, 30_000);
  it('accepts missing observations, ignores unrelated resume fields and rejects changed prepared calls', async () => {
    const f = await fixture();
    await f.gate(new Date(time).toISOString());
    await fs.unlink(path.join(f.directory, 'publication_stage_readbacks.json'));
    await f.write('publication_stage_resume.json', {
      stageId: 'unrelated',
      runId: false,
      appliedCalls: 'unused',
    });
    expect(await readNextPublicationStage(f.directory)).toMatchObject({
      complete: false,
      calls: f.first.calls,
    });
    const firstCall = f.first.calls[0];
    if (firstCall === undefined) throw new Error('Fixture requires call');
    await f.write(firstCall.file, { requests: [{ synthetic: 'changed' }] });
    await expect(readNextPublicationStage(f.directory)).rejects.toThrow(
      'Prepared call payload hash changed'
    );
  }, 30_000);
  it('refreshes the same gate lease again after reading the selected payloads', async () => {
    const f = await fixture();
    await f.gate(new Date(time - 2 * 3_600_000).toISOString());
    const read = fs.readFile;
    vi.spyOn(fs, 'readFile').mockImplementation(async (file, options) => {
      const value = await read(file, options);
      if (typeof file === 'string' && file.endsWith(f.first.file)) vi.setSystemTime(time + 1);
      return value;
    });
    await expect(readNextPublicationStage(f.directory)).rejects.toThrow(
      'refresh all required checks'
    );
  }, 30_000);
});
