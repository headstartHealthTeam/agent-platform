import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sha256Json } from './json-fingerprint.js';
import { readPrivateJson, withCacheLock, writePrivateJson } from './private-run-storage.js';
import { loadPublication } from './publication-executor-storage.js';
import type { ExecutionManifest, PublicationWriteAdapter } from './publication-executor-types.js';
import { advancePublication, finalizePublication } from './publication-executor.js';
import { publicationPlanHash } from './publication-plan.js';
import type { PublicationAssertion } from './publication-readback-types.js';

interface Fixture {
  runDir: string;
  write: (name: string, value: unknown) => Promise<void>;
  read: (name: string) => Promise<unknown>;
  manifest: ExecutionManifest;
  stages: {
    id: string;
    file: string;
    payloadHash: string;
    calls: { file: string; payloadHash: string }[];
    assertions: PublicationAssertion[];
  }[];
  applied: string[];
  adapter: PublicationWriteAdapter;
  authority: { approved: boolean; runId: string; spreadsheetId: string; planHash: string };
}

const directories: string[] = [];
const fixedTime = new Date('2026-01-01T00:00:00Z');
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(fixedTime);
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const directory of directories.splice(0))
    await fs.rm(directory, { recursive: true, force: true });
});
const noWait = async (): Promise<void> => {
  await Promise.resolve();
};
async function fixture(callCount = 1): Promise<Fixture> {
  const runDirectory = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'synthetic-publication-'))
  );
  directories.push(runDirectory);
  const stages = ['02-review-queue', '08-terminal-marker', '09-run-history'].map((id) => {
    const requests = Array.from({ length: callCount }, (_, index) => ({ synthetic: id, index }));
    return {
      id,
      file: `${id}.json`,
      payloadHash: sha256Json({ requests }),
      calls: requests.map((request, index) => ({
        file: `${id}-call-${String(index)}.json`,
        payloadHash: sha256Json({ requests: [request] }),
      })),
      assertions: [
        {
          id,
          kind: 'values',
          rowCount: 1,
          columnCount: 1,
          expectedHash: sha256Json([[{ stringValue: id }]]),
        },
      ],
    };
  });
  const finalAssertions = stages.flatMap((stage) => stage.assertions);
  const manifest: ExecutionManifest = {
    runId: 'synthetic-run',
    spreadsheetId: 'synthetic-sheet',
    runHistoryLast: true,
    stages,
    finalAssertions,
    planHash: publicationPlanHash(stages, finalAssertions),
  };
  const write = (name: string, value: unknown): Promise<void> =>
    writePrivateJson(path.join(runDirectory, name), value);
  const read = (name: string): Promise<unknown> => readPrivateJson(path.join(runDirectory, name));
  await write('publication_stages_manifest.json', manifest);
  await write('publication-gate.json', {
    ...manifest,
    passed: true,
    evaluatedAt: new Date().toISOString(),
  });
  for (const stage of stages) {
    const requests = stage.calls.map((_, index) => ({ synthetic: stage.id, index }));
    await write(stage.file, { requests });
    for (const [index, call] of stage.calls.entries())
      await write(call.file, { requests: [requests.at(index)] });
  }
  const applied: string[] = [];
  const adapter: PublicationWriteAdapter = {
    capabilities: {
      exactPreparedWrites: true,
      liveFilters: true,
      userEnteredValues: true,
      formats: true,
    },
    checkConcurrency: async () => ({
      passed: true,
      runId: manifest.runId,
      spreadsheetId: manifest.spreadsheetId,
      planHash: manifest.planHash,
      checkedAt: new Date().toISOString(),
      reviewerStateUnchanged: true,
      markerMatchesExpectedStage: true,
      noCompetingRun: true,
    }),
    apply: async ({ stageId }) => {
      applied.push(stageId);
      return { ok: true, spreadsheetId: manifest.spreadsheetId };
    },
    readAssertions: async ({ assertions }) => {
      expect(assertions.every((item) => !Object.hasOwn(item, 'expectedHash'))).toBe(true);
      return {
        runId: manifest.runId,
        spreadsheetId: manifest.spreadsheetId,
        assertions: assertions.map((item) => ({
          id: item.id,
          values: [[{ stringValue: applied.includes(item.id) ? item.id : 'not written' }]],
        })),
      };
    },
  };
  return {
    runDir: runDirectory,
    write,
    read,
    manifest,
    stages,
    applied,
    adapter,
    authority: {
      approved: true,
      runId: manifest.runId,
      spreadsheetId: manifest.spreadsheetId,
      planHash: manifest.planHash,
    },
  };
}
async function complete(f: Fixture): Promise<void> {
  for (const stage of f.stages)
    expect(await advancePublication(f)).toMatchObject({ stageId: stage.id });
}
describe('approved staged publication executor', () => {
  it('accepts only explicit false incomplete markers before retaining evidence or advancing', async () => {
    for (const marker of [undefined, null, 0, '', true, false]) {
      const f = await fixture();
      const adapter: PublicationWriteAdapter = {
        ...f.adapter,
        readAssertions: async (input) => {
          const actual = await f.adapter.readAssertions(input);
          await input.onIncompleteCapture({ ...actual, complete: marker, assertions: [] });
          return actual;
        },
      };
      const result = advancePublication({ ...f, adapter });
      if (marker === false) {
        await expect(result).resolves.toMatchObject({ verifiedAssertions: 1 });
        expect(await f.read('publication_readback_incomplete.json')).toMatchObject({
          complete: false,
        });
      } else {
        await expect(result).rejects.toThrow('Incomplete capture target mismatch');
        await expect(f.read('publication_readback_incomplete.json')).rejects.toMatchObject({
          code: 'ENOENT',
        });
        await expect(f.read('publication_stage_readbacks.json')).rejects.toMatchObject({
          code: 'ENOENT',
        });
      }
    }
  });
  it('treats an absent in-flight journal field as uncertain and never dispatches another write', async () => {
    const f = await fixture();
    const stage = f.stages.at(0);
    if (stage === undefined) throw new Error('Missing synthetic stage');
    await f.write(`publication_execution_${stage.id}.json`, {
      version: 1,
      runId: f.manifest.runId,
      planHash: f.manifest.planHash,
      stageId: stage.id,
      appliedCalls: [],
    });
    f.applied.push(stage.id);
    const apply = vi.fn(f.adapter.apply);
    expect(await advancePublication({ ...f, adapter: { ...f.adapter, apply } })).toMatchObject({
      recoveredFromReadback: true,
    });
    expect(apply).not.toHaveBeenCalled();
    expect(await f.read(`publication_execution_${stage.id}.json`)).not.toHaveProperty('inFlight');
  });
  it('preserves unused raw observation fields for already-satisfied stages', async () => {
    const f = await fixture();
    const stages = f.stages.map((stage, index) =>
      index === 0 ? { ...stage, alreadySatisfied: true } : stage
    );
    const manifest = {
      ...f.manifest,
      stages,
      planHash: publicationPlanHash(stages, f.manifest.finalAssertions),
    };
    const authority = { ...f.authority, planHash: manifest.planHash };
    const unused = {
      id: '02-review-queue',
      evidenceHash: 1,
      assertions: 'retained unused prior evidence',
    };
    await f.write('publication_stages_manifest.json', manifest);
    await f.write('publication-gate.json', {
      ...authority,
      passed: true,
      evaluatedAt: fixedTime.toISOString(),
    });
    await f.write('publication_stage_readbacks.json', { ...authority, stages: [unused] });
    const adapter: PublicationWriteAdapter = {
      ...f.adapter,
      checkConcurrency: async (input) => ({
        ...(await f.adapter.checkConcurrency(input)),
        planHash: manifest.planHash,
      }),
    };
    expect(await advancePublication({ ...f, authority, adapter })).toMatchObject({
      stageId: '08-terminal-marker',
    });
    expect(await f.read('publication_stage_readbacks.json')).toMatchObject({
      stages: [unused, {}],
    });
    expect(f.applied).toEqual(['08-terminal-marker']);
  });
  it('retains legacy observation metadata without making it a new execution requirement', async () => {
    const f = await fixture();
    await advancePublication(f);
    const { observations } = await loadPublication(f.runDir);
    await f.write('publication_stage_readbacks.json', {
      ...observations,
      schemaVersion: 'retained legacy metadata',
      stages: observations.stages?.map((stage) => ({
        ...stage,
        verifiedAt: 0,
        legacy: { preserved: true },
      })),
    });
    await advancePublication(f);
    await advancePublication(f);
    expect(await finalizePublication({ ...f, sleep: noWait })).toMatchObject({ published: true });
    expect(await f.read('publication-readback.json')).toMatchObject({
      stages: [{ verifiedAt: 0 }, {}, {}],
    });
    expect(await f.read('publication_stage_readbacks.json')).toMatchObject({
      stages: [{ verifiedAt: 0, legacy: { preserved: true } }, {}, {}],
    });
  });
  it('advances one stage, publishes history last and independently samples final state twice', async () => {
    const f = await fixture();
    await expect(finalizePublication({ ...f, sleep: noWait })).rejects.toThrow(
      'Every publication stage'
    );
    await complete(f);
    expect(f.applied).toEqual(f.stages.map((stage) => stage.id));
    expect(await advancePublication(f)).toEqual({
      stagesComplete: true,
      finalReadbackRequired: true,
    });
    const readAssertions = vi.fn(f.adapter.readAssertions),
      sleep = vi.fn(noWait);
    expect(await finalizePublication({ ...f, adapter: { readAssertions }, sleep })).toEqual({
      published: true,
      verifiedAssertions: 3,
    });
    expect(readAssertions).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(1000);
    expect(await f.read('publication-readback.json')).toMatchObject({
      complete: true,
      publicationStatus: 'Published',
      verifiedAt: fixedTime.toISOString(),
      quiescentReadback: { samples: 2, intervalMs: 1000 },
    });
    await expect(advancePublication(f)).rejects.toThrow('Published');
    await expect(finalizePublication(f)).rejects.toThrow('immutable');
  });
  it('rejects expired/future gates before each write but allows read-only final verification', async () => {
    const f = await fixture();
    for (const stage of f.stages) {
      const writes = f.applied.length;
      for (const offset of [-24, 24]) {
        await f.write('publication-gate.json', {
          ...f.authority,
          passed: true,
          evaluatedAt: new Date(Date.now() + offset * 3_600_000).toISOString(),
        });
        await expect(advancePublication(f)).rejects.toThrow('refresh all required checks');
        expect(f.applied.length).toBe(writes);
      }
      await f.write('publication-gate.json', {
        ...f.authority,
        passed: true,
        evaluatedAt: new Date().toISOString(),
      });
      expect(await advancePublication(f)).toMatchObject({ stageId: stage.id });
    }
    vi.setSystemTime(Date.now() + 24 * 3_600_000);
    expect(await finalizePublication({ ...f, sleep: noWait })).toMatchObject({ published: true });
    expect(f.applied).toHaveLength(3);
  });
  it('never repeats an uncertain append and verifies the whole stage on resume', async () => {
    const f = await fixture();
    const adapter = {
      ...f.adapter,
      apply: async (
        input: Parameters<PublicationWriteAdapter['apply']>[0]
      ): ReturnType<PublicationWriteAdapter['apply']> => {
        await f.adapter.apply(input);
        throw new Error('Synthetic interrupted response');
      },
    };
    await expect(advancePublication({ ...f, adapter })).rejects.toThrow('interrupted');
    expect(await f.read('publication_execution_02-review-queue.json')).toMatchObject({
      inFlight: 0,
      appliedCalls: [],
    });
    expect(await advancePublication(f)).toMatchObject({
      recoveredFromReadback: true,
      verifiedAssertions: 1,
    });
    expect(f.applied).toEqual(['02-review-queue']);
  });
  it('requires exact authority, capabilities, concurrency and readback targets', async () => {
    const f = await fixture();
    for (const authority of [
      undefined,
      null,
      { ...f.authority, approved: false },
      { ...f.authority, planHash: 'changed' },
    ])
      await expect(
        advancePublication({
          ...f,
          ...(authority === undefined ? { authority: null } : { authority }),
        })
      ).rejects.toThrow('authorization');
    await expect(
      advancePublication({ ...f, adapter: { ...f.adapter, capabilities: { liveFilters: false } } })
    ).rejects.toThrow('capabilities');
    for (const result of [
      undefined,
      null,
      { passed: false },
      {
        ...(await f.adapter.checkConcurrency({ manifest: f.manifest, observations: {} })),
        checkedAt: '1900-01-01',
      },
    ])
      await expect(
        advancePublication({
          ...f,
          adapter: { ...f.adapter, checkConcurrency: async () => result },
        })
      ).rejects.toThrow('concurrency');
    expect(f.applied).toEqual([]);
    await expect(
      advancePublication({
        ...f,
        adapter: { ...f.adapter, readAssertions: async () => ({ runId: 'wrong', assertions: [] }) },
      })
    ).rejects.toThrow('different target');
    await expect(f.read('publication_stage_readbacks.json')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
  it('retains a changed second sample without creating a published receipt', async () => {
    const f = await fixture();
    await complete(f);
    let samples = 0;
    const adapter = {
      readAssertions: async (
        input: Parameters<PublicationWriteAdapter['readAssertions']>[0]
      ): ReturnType<PublicationWriteAdapter['readAssertions']> => {
        const actual = await f.adapter.readAssertions(input);
        return ++samples === 2
          ? {
              ...actual,
              assertions: actual.assertions.map((item, index) =>
                index === 0 ? { ...item, values: [[null]] } : item
              ),
            }
          : actual;
      },
    };
    await expect(finalizePublication({ ...f, adapter, sleep: noWait })).rejects.toThrow(
      'does not match'
    );
    await expect(f.read('publication-readback.json')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await f.read('publication_final_actual.json')).toMatchObject({
      assertions: [{ id: '02-review-queue', values: [[null]] }, {}, {}],
    });
    expect(f.applied).toHaveLength(3);
  });
  it('retains partial capture privately, rejects wrong partial targets, and resumes read-only', async () => {
    const f = await fixture();
    await complete(f);
    for (const wrong of [true, false]) {
      const adapter = {
        readAssertions: async (
          input: Parameters<PublicationWriteAdapter['readAssertions']>[0]
        ): ReturnType<PublicationWriteAdapter['readAssertions']> => {
          const actual = await f.adapter.readAssertions(input);
          await input.onIncompleteCapture({
            ...actual,
            runId: wrong ? 'wrong' : f.manifest.runId,
            complete: false,
            expectedAssertions: actual.assertions.length,
            assertions: actual.assertions.slice(0, 1),
          });
          throw new Error('Synthetic read interrupted');
        },
      };
      await expect(finalizePublication({ ...f, adapter, sleep: noWait })).rejects.toThrow(
        wrong ? 'target mismatch' : 'read interrupted'
      );
    }
    expect(await f.read('publication_readback_incomplete.json')).toMatchObject({
      complete: false,
      expectedAssertions: 3,
      assertions: [{}],
    });
    await expect(f.read('publication-readback.json')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await finalizePublication({ ...f, sleep: noWait })).toMatchObject({ published: true });
    expect(f.applied).toHaveLength(3);
  });
  it('reconstructs every call, rejects changed journals and resumes only an exact completed prefix', async () => {
    const f = await fixture(2),
      stage = f.stages.at(0);
    if (stage === undefined) throw new Error('Missing synthetic stage');
    const file = `publication_execution_${stage.id}.json`;
    const journal = {
      version: 1,
      runId: f.manifest.runId,
      planHash: f.manifest.planHash,
      stageId: stage.id,
      appliedCalls: [stage.calls.at(0)?.payloadHash],
      inFlight: null,
    };
    for (const invalid of [
      { ...journal, version: 2 },
      { ...journal, runId: 'wrong' },
      { ...journal, appliedCalls: ['changed'] },
      { ...journal, appliedCalls: [1] },
    ]) {
      await f.write(file, invalid);
      await expect(advancePublication(f)).rejects.toThrow('journal changed');
    }
    await f.write(file, journal);
    const apply = vi.fn(f.adapter.apply);
    expect(await advancePublication({ ...f, adapter: { ...f.adapter, apply } })).toMatchObject({
      verifiedAssertions: 1,
    });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls.at(0)?.at(0)).toMatchObject({ callIndex: 1 });
    await f.write(stage.file, { requests: [] });
    await expect(advancePublication(f)).rejects.toThrow('payload hash changed');
  });
  it('rechecks local bindings after concurrency, before any external write', async () => {
    const f = await fixture();
    let checks = 0;
    const adapter = {
      ...f.adapter,
      checkConcurrency: async (
        input: Parameters<PublicationWriteAdapter['checkConcurrency']>[0]
      ): ReturnType<PublicationWriteAdapter['checkConcurrency']> => {
        const result = await f.adapter.checkConcurrency(input);
        if (++checks === 2)
          await f.write('publication-gate.json', {
            ...f.authority,
            planHash: 'changed',
            passed: true,
          });
        return result;
      },
    };
    await expect(advancePublication({ ...f, adapter })).rejects.toThrow('different prepared plan');
    expect(f.applied).toEqual([]);
    await expect(f.read('publication_execution_02-review-queue.json')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
  it('retains uncertain acknowledgments and enforces writer exclusion and settle bounds', async () => {
    const f = await fixture();
    await withCacheLock(f.runDir, async () => {
      await expect(advancePublication(f)).rejects.toThrow('locked');
    });
    for (const settleMs of [0, 999, 30_001, 1000.1, Number.NaN])
      await expect(finalizePublication({ ...f, settleMs })).rejects.toThrow('interval');
    await expect(
      advancePublication({ ...f, adapter: { ...f.adapter, apply: async () => ({ ok: false }) } })
    ).rejects.toThrow('uncertain');
    await expect(advancePublication(f)).rejects.toThrow('does not match');
    expect(f.applied).toEqual([]);
    expect(await fs.readdir(f.runDir)).not.toContain('.writer-lock');
  });
});
