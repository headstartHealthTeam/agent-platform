import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runFirefliesCacheCommand, runFirefliesPlanCommand } from './cli-fireflies-planning.js';
import { cacheFixture } from './fireflies-cache-fixture.test-support.js';
import {
  buildFirefliesCollectionPlan,
  buildRunLevelFirefliesCollectionPlan,
} from './fireflies-collection.js';
import { sha256Json } from './json-fingerprint.js';
import { readPrivateJson, writePrivateJson } from './private-run-storage.js';

let root: string;
let run: string;
let cache: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'intake-cache-command-'));
  run = path.join(root, 'run');
  cache = path.join(root, 'cache');
  await fs.mkdir(run, { mode: 0o700 });
});
afterEach(async () => {
  await fs.rm(root, { recursive: true });
});
async function inputs(ids?: string[]): Promise<void> {
  const input = cacheFixture(10, ids);
  await writePrivateJson(path.join(run, 'fireflies_run_inventory.json'), input.collectionPlan);
  await writePrivateJson(path.join(run, 'fireflies_discovery.json'), input.discovery);
  await writePrivateJson(path.join(run, 'fireflies_fetched_transcripts.json'), input.fetched);
  await writePrivateJson(path.join(root, 'policy.json'), input.policy);
}
function flags(action: string, mode = 'shadow'): string[] {
  return [
    '--action',
    action,
    '--run-dir',
    run,
    '--cache-dir',
    cache,
    '--policy',
    path.join(root, 'policy.json'),
    '--mode',
    mode,
    '--collection-mode',
    mode === 'shadow' ? 'cache-shadow-experiment' : 'cache-reuse',
  ];
}
describe('Fireflies saved planning and cache commands', () => {
  it('retains core cache diagnostic classifications instead of preempting them with wrapper schemas', async () => {
    const fixture = cacheFixture();
    for (const [discovery, collectionPlan, code] of [
      [{ ...fixture.discovery, runId: '' }, fixture.collectionPlan, 'CACHE_VALIDATION_FAILED'],
      [
        { ...fixture.discovery, query: { ...fixture.discovery.query, kind: 'filtered' } },
        fixture.collectionPlan,
        'INCOMPLETE_DISCOVERY',
      ],
      [
        {
          ...fixture.discovery,
          collectionPlanHash: sha256Json({ ...fixture.collectionPlan, fromDate: false }),
        },
        { ...fixture.collectionPlan, fromDate: false },
        'CACHE_VALIDATION_FAILED',
      ],
    ]) {
      await inputs();
      await writePrivateJson(path.join(run, 'fireflies_discovery.json'), discovery);
      await writePrivateJson(path.join(run, 'fireflies_run_inventory.json'), collectionPlan);
      expect(JSON.parse((await runFirefliesCacheCommand(flags('plan'))).stderr)).toMatchObject({
        code,
      });
      await expect(fs.stat(path.join(run, 'fireflies_cache_plan.json'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    }
  }, 30_000);
  it('preserves identity plan values, exact serialized bytes and explicit frozen date', async () => {
    const profiles = [
      {
        opportunityId: 'synthetic',
        opportunityName: 'Synthetic Client',
        providers: [{ name: 'Synthetic Provider', email: 'provider@example.test' }],
        stage: { saved: 'producer-metadata' },
        asOf: false,
      },
    ];
    await writePrivateJson(path.join(run, 'identity_profile_rows.json'), profiles);
    const cutoff = '2026-01-10T17:00:00.000Z';
    const result = await runFirefliesPlanCommand([], { SLA_RUN_DIR: run, RUN_AT: cutoff });
    const withDate = profiles.map((profile) => ({ ...profile, asOf: cutoff }));
    expect(result.exitCode).toBe(0);
    expect(await fs.readFile(path.join(run, 'fireflies_search_requests.json'), 'utf8')).toBe(
      JSON.stringify(withDate.map(buildFirefliesCollectionPlan), null, 2)
    );
    expect(await readPrivateJson(path.join(run, 'fireflies_run_inventory.json'))).toEqual(
      buildRunLevelFirefliesCollectionPlan(withDate)
    );
    expect(JSON.parse(result.stdout)).toMatchObject({ opportunities: 1 });
    await expect(runFirefliesPlanCommand([], {})).rejects.toThrow('required');
    expect((await runFirefliesPlanCommand(['--run-dir', run], { RUN_AT: cutoff })).stdout).toBe(
      result.stdout
    );
  }, 30_000);
  it('requires explicit shadow selection, then materializes current evidence with proof and cache index', async () => {
    await inputs();
    expect((await runFirefliesCacheCommand(['--action', 'plan'])).exitCode).toBe(1);
    expect(JSON.parse((await runFirefliesCacheCommand(flags('plan'))).stdout)).toMatchObject({
      status: 'Planned',
      mode: 'shadow',
      fetch: 1,
      reuse: 0,
    });
    const result = await runFirefliesCacheCommand(flags('materialize'));
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ mode: 'shadow' });
    expect(await readPrivateJson(path.join(run, 'fireflies_cache_proof.json'))).toMatchObject({
      plan: { mode: 'shadow' },
    });
    expect(await readPrivateJson(path.join(cache, 'index.json'))).toHaveProperty('entries');
    expect(
      await readPrivateJson(path.join(run, 'fireflies_inventory_execution.json'))
    ).toMatchObject({ transcripts: { requested: 1, complete: 1, blocked: 0 } });
    expect((await runFirefliesCacheCommand(flags('materialize'))).stderr).toContain(
      'STALE_CACHE_PLAN'
    );
  }, 30_000);
  it('retains explicit empty inventories and requires approved reuse policy', async () => {
    await inputs([]);
    expect((await runFirefliesCacheCommand(flags('plan', 'reuse'))).exitCode).toBe(0);
    expect((await runFirefliesCacheCommand(flags('materialize', 'reuse'))).exitCode).toBe(0);
    expect(await fs.readFile(path.join(run, 'fireflies_transcript_inventory.jsonl'), 'utf8')).toBe(
      '\n'
    );
    const other = path.join(root, 'unapproved');
    await fs.mkdir(other, { mode: 0o700 });
    run = other;
    await inputs([]);
    await writePrivateJson(path.join(root, 'policy.json'), {
      ...cacheFixture().policy,
      approvalReference: '',
    });
    expect((await runFirefliesCacheCommand(flags('plan', 'reuse'))).exitCode).toBe(1);
  }, 30_000);
  it('stops conflicting modes, changed prepared plans, unsafe paths and immutable parents without completion', async () => {
    await inputs();
    await runFirefliesCacheCommand(flags('plan'));
    expect((await runFirefliesCacheCommand(flags('materialize', 'reuse'))).exitCode).toBe(1);
    const planFile = path.join(run, 'fireflies_cache_plan.json');
    const text = await fs.readFile(planFile, 'utf8');
    await fs.writeFile(planFile, text.replace('full-revalidation', 'modified-reason'));
    expect((await runFirefliesCacheCommand(flags('materialize'))).stderr).toContain(
      'STALE_CACHE_PLAN'
    );
    expect((await runFirefliesCacheCommand([...flags('plan'), '--cache-dir', run])).exitCode).toBe(
      1
    );
    await fs.writeFile(planFile, '{');
    expect((await runFirefliesCacheCommand(flags('materialize'))).stderr).toContain(
      'INVALID_ARTIFACT_JSON'
    );
    await writePrivateJson(path.join(root, 'publication-readback.json'), {});
    expect((await runFirefliesCacheCommand(flags('plan'))).exitCode).toBe(1);
    await expect(fs.access(path.join(run, 'fireflies_cache_proof.json'))).rejects.toThrow();
  }, 30_000);
  it('sanitizes missing artifacts and rejects future discovery and invalid actions', async () => {
    expect((await runFirefliesCacheCommand(flags('plan'))).stderr).toContain('STORAGE_FAILURE');
    await inputs();
    await writePrivateJson(path.join(run, 'fireflies_discovery.json'), {
      ...cacheFixture().discovery,
      completedAt: '2999-01-01',
    });
    expect((await runFirefliesCacheCommand(flags('plan'))).stderr).toContain('INVALID_CACHE_INPUT');
    expect((await runFirefliesCacheCommand(flags('wrong'))).exitCode).toBe(1);
  }, 30_000);
});
