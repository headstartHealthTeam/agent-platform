import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { checkpointPlan, connectorCheckpoint } from './connector-checkpoint.js';
import { sha256Json } from './json-fingerprint.js';
import { readPrivateJson, withCacheLock, writePrivateJson } from './private-run-storage.js';

const roots: string[] = [];
async function directory(): Promise<string> {
  const value = await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), 'intake-checkpoint-test-')
  );
  roots.push(value);
  return value;
}
afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
const plan = checkpointPlan({
  version: 1,
  runId: 'synthetic',
  source: 'portal',
  asOf: '2026-01-01T00:00:00Z',
  inputHash: 'a'.repeat(64),
  requests: [{ requestKey: 'one', target: 'synthetic-one' }, { requestKey: 'two' }],
});
function capture(results: readonly unknown[]): object {
  return {
    version: 1,
    runId: plan.runId,
    planHash: plan.planHash,
    batchId: 'batch-one',
    expectedRequestCount: results.length,
    complete: true,
    results,
  };
}
function signal(): { promise: Promise<void>; resolve: () => void } {
  let release: () => void = () => {
    throw new Error('Signal not initialized');
  };
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, resolve: release };
}
describe('connector checkpoint recovery', () => {
  it('retains successful batches, rejects partial/conflicting input and finalizes in original plan order', async () => {
    const runDirectory = await directory();
    const call = (action: string, value?: unknown): ReturnType<typeof connectorCheckpoint> =>
      connectorCheckpoint({ runDir: runDirectory, action, plan, capture: value });
    expect((await call('plan')).pendingRequests).toEqual(plan.requests);
    const one = { requestKey: 'one', status: 'Complete', output: { messages: ['synthetic'] } };
    expect((await call('accept', capture([one]))).pending).toBe(1);
    await expect(call('accept', { ...capture([one]), complete: false })).rejects.toThrow(
      'Incomplete'
    );
    await expect(call('accept', capture([{ ...one, output: {} }]))).rejects.toThrow('Conflicting');
    await expect(call('finalize')).rejects.toThrow('incomplete');
    expect((await call('accept', capture([one]))).saved).toBe(1);
    await call(
      'accept',
      capture([{ requestKey: 'two', status: 'Blocked', output: { error: 'schema' } }])
    );
    expect((await call('finalize')).blocked).toBe(1);
    expect(
      await readPrivateJson(path.join(runDirectory, 'portal_checkpoint_inventory.json'))
    ).toMatchObject({
      results: [
        expect.objectContaining({ requestKey: 'one' }),
        expect.objectContaining({ requestKey: 'two' }),
      ],
      accounted: 2,
      blocked: 1,
    });
    expect((await call('status')).pending).toBe(0);
    await writePrivateJson(path.join(runDirectory, 'portal_pending_requests.json'), {
      tampered: true,
    });
    expect((await call('status')).pending).toBe(0);
  });
  it('serializes concurrent accept calls and retains each exact output', async () => {
    const runDirectory = await directory();
    await Promise.all(
      plan.requests.map(({ requestKey }) =>
        connectorCheckpoint({
          runDir: runDirectory,
          plan,
          action: 'accept',
          capture: capture([{ requestKey, status: 'Complete', output: { synthetic: requestKey } }]),
        })
      )
    );
    expect(
      (await connectorCheckpoint({ runDir: runDirectory, plan, action: 'finalize' })).saved
    ).toBe(2);
  });
  it('rechecks publication immutability after a queued operation acquires the lock', async () => {
    const runDirectory = await directory();
    const ready = signal();
    const release = signal();
    const holder = withCacheLock(runDirectory, async () => {
      ready.resolve();
      await release.promise;
      await writePrivateJson(path.join(runDirectory, 'publication-readback.json'), {
        complete: true,
      });
    });
    await ready.promise;
    const pending = connectorCheckpoint({ runDir: runDirectory, plan, action: 'plan' });
    const rejected = expect(pending).rejects.toThrow('immutable');
    release.resolve();
    await holder;
    await rejected;
    await expect(
      connectorCheckpoint({ runDir: runDirectory, plan, action: 'plan' })
    ).rejects.toThrow('immutable');
  });
  it('rejects altered plan and checkpoint bindings and unexpected files', async () => {
    const runDirectory = await directory();
    await expect(
      connectorCheckpoint({
        runDir: runDirectory,
        action: 'plan',
        plan: { ...plan, planHash: 'changed' },
      })
    ).rejects.toThrow('hash changed');
    await connectorCheckpoint({ runDir: runDirectory, action: 'plan', plan });
    await expect(
      connectorCheckpoint({ runDir: runDirectory, action: 'invalid', plan })
    ).rejects.toThrow('Unsupported');
    const itemFile = path.join(runDirectory, 'portal-checkpoints', `${sha256Json('one')}.json`);
    await writePrivateJson(itemFile, {
      planHash: plan.planHash,
      requestKey: 'one',
      outputHash: 'bad',
      output: {},
    });
    await expect(
      connectorCheckpoint({ runDir: runDirectory, action: 'status', plan })
    ).rejects.toThrow('binding changed');
    await fs.unlink(itemFile);
    const unknown = path.join(runDirectory, 'portal-checkpoints', 'unknown.json');
    await writePrivateJson(unknown, {});
    await expect(
      connectorCheckpoint({ runDir: runDirectory, action: 'status', plan })
    ).rejects.toThrow('Unexpected');
    await fs.unlink(unknown);
    await fs.writeFile(path.join(runDirectory, 'portal-checkpoints', 'unfinished.tmp'), 'partial');
    expect(
      (await connectorCheckpoint({ runDir: runDirectory, action: 'status', plan })).saved
    ).toBe(0);
  });
  it('validates request/capture identities and preserves terminal failed outcomes as accounted, not successful', async () => {
    for (const input of [
      null,
      { ...plan, source: '../escape' },
      { ...plan, requests: [{ requestKey: '' }] },
      { ...plan, requests: [{ requestKey: 'same' }, { requestKey: 'same' }] },
    ])
      expect(() => checkpointPlan(input)).toThrow();
    expect(checkpointPlan({ ...plan, planHash: 'ignored-old' })).toEqual(plan);
    const runDirectory = await directory();
    const valid = { requestKey: 'one', status: 'Complete', output: null };
    for (const value of [
      capture([]),
      capture([{ ...valid, requestKey: 'unknown' }]),
      capture([valid, valid]),
      capture([{ ...valid, status: 'Pending' }]),
      capture([{ requestKey: 'one', status: 'Complete' }]),
      { ...capture([valid]), expectedRequestCount: 2 },
      { ...capture([valid]), runId: 'other' },
      { ...capture([valid]), planHash: 'other' },
    ]) {
      await expect(
        connectorCheckpoint({ runDir: runDirectory, plan, action: 'accept', capture: value })
      ).rejects.toThrow();
    }
    await connectorCheckpoint({
      runDir: runDirectory,
      plan,
      action: 'accept',
      capture: capture([
        { ...valid, status: 'Timed Out' },
        { requestKey: 'two', status: 'Unsupported', output: {} },
      ]),
    });
    expect(
      await connectorCheckpoint({ runDir: runDirectory, plan, action: 'finalize' })
    ).toMatchObject({
      pending: 0,
      blocked: 2,
    });
  });
});
