import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { cacheFixture, executeCache } from './fireflies-cache-fixture.test-support.js';
import { readCacheRunProof } from './fireflies-cache-replay-proof.js';
import { buildRunLevelFirefliesCollectionPlan } from './fireflies-collection.js';
import type { FirefliesProfile } from './fireflies-collection.js';
import { parseFirefliesProfiles } from './fireflies-profile.js';
import { sha256Json } from './json-fingerprint.js';
import { writePrivateJson } from './private-run-storage.js';

const roots: string[] = [];
async function directory(): Promise<string> {
  const root = await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), 'intake-replay-proof-test-')
  );
  roots.push(root);
  return root;
}
afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
const PROOF = 'fireflies_cache_proof.json';
const PLAN = 'fireflies_cache_plan.json';
const PROFILES = 'identity_profile_rows.json';
const RECEIPT = 'fireflies_cache_replay.json';
interface ReplayFixture {
  root: string;
  runAt: string;
  profiles: FirefliesProfile[];
  rows: { opportunityId: string; evidence: { value: string } }[];
  receipt: Record<string, string>;
  result: ReturnType<typeof executeCache>;
  files: Map<string, unknown>;
}
async function fixture(): Promise<ReplayFixture> {
  const root = await directory();
  const input = cacheFixture();
  const runAt = input.discovery.asOf;
  const profiles = [
    {
      opportunityId: 'synthetic-a',
      opportunityName: 'Synthetic Client',
      renderingProvider: { name: 'Synthetic Provider', email: 'provider@example.test' },
      stageEntryDate: '2026-01-01',
      asOf: runAt,
      untouchedMetadata: { extra: 'retain exactly' },
    },
  ];
  const collectionPlan = buildRunLevelFirefliesCollectionPlan(profiles);
  input.collectionPlan = collectionPlan;
  input.discovery.collectionPlanHash = sha256Json(collectionPlan);
  const result = executeCache(input);
  const rows = [{ opportunityId: 'synthetic-a', evidence: { value: 'exact consumed row' } }];
  const receipt = {
    runAt,
    cachePlanHash: result.proof.plan.planHash,
    inventoryHash: result.report.inventoryHash,
    profilesHash: sha256Json(profiles),
    rowsHash: sha256Json(rows),
  };
  const files = new Map<string, unknown>([
    [PROOF, result.proof],
    [PLAN, result.proof.plan],
    [PROFILES, profiles],
    [RECEIPT, receipt],
    ['fireflies_discovery.json', input.discovery],
    ['fireflies_run_inventory.json', collectionPlan],
  ]);
  for (const [name, value] of files) await writePrivateJson(path.join(root, name), value);
  return { root, runAt, profiles, rows, receipt, result, files };
}
describe('consumer-bound Fireflies replay proof', () => {
  it('retains extra profile metadata and verifies exact source-compatible plan and proof', async () => {
    const data = await fixture();
    expect(parseFirefliesProfiles(data.profiles)).toEqual(data.profiles);
    const nullable = [
      {
        ...data.profiles[0],
        providers: [null, false, 0, ''],
        csmNames: [null, false, 0, ''],
        knownNameVariants: null,
        stage: null,
        providerRoles: { Current: [null, { name: null }] },
      },
    ];
    expect(parseFirefliesProfiles(nullable)).toEqual(nullable);
    for (const runAt of [data.runAt, new Date(data.runAt)]) {
      expect(await readCacheRunProof(data.root, data.result.records, runAt)).toEqual(
        data.result.proof
      );
      expect(
        await readCacheRunProof(data.root, data.result.records, runAt, {
          requireReplay: true,
          profiles: data.profiles,
          rows: data.rows,
        })
      ).toEqual(data.result.proof);
    }
    expect(() => parseFirefliesProfiles([{}])).toThrow();
  });
  it('distinguishes unused cache from incomplete materialization and preserves filesystem failures', async () => {
    const root = await directory();
    expect(await readCacheRunProof(root, [], '2026-01-10')).toBeNull();
    await writePrivateJson(path.join(root, PLAN), {});
    await expect(readCacheRunProof(root, [], '2026-01-10')).rejects.toThrow('not completed');
    await fs.mkdir(path.join(root, PROOF));
    await expect(readCacheRunProof(root, [], '2026-01-10')).rejects.toThrow('private regular file');
  });
  it('rejects changed discovery, cache plan, disk identity and consumer snapshots', async () => {
    const data = await fixture();
    const check = (): ReturnType<typeof readCacheRunProof> =>
      readCacheRunProof(data.root, data.result.records, data.runAt);
    for (const [file, value, diagnostic] of [
      [
        'fireflies_discovery.json',
        { ...data.result.proof.discovery, runId: 'other' },
        'discovery changed',
      ],
      [PLAN, { ...data.result.proof.plan, runId: 'other' }, 'Cache plan changed'],
      [
        PROFILES,
        data.profiles.map((profile) => ({ ...profile, opportunityId: 'other' })),
        'Identity/cohort',
      ],
    ] as const) {
      await writePrivateJson(path.join(data.root, file), value);
      await expect(check()).rejects.toThrow(diagnostic);
      await writePrivateJson(path.join(data.root, file), data.files.get(file));
    }
    await expect(
      readCacheRunProof(data.root, data.result.records, data.runAt, {
        profiles: data.profiles.map((profile) => ({
          ...profile,
          untouchedMetadata: { extra: 'changed' },
        })),
      })
    ).rejects.toThrow('Consumer identity profiles changed');
  });
  it('requires exact builder snapshots, hashes all row fields, and rejects incomplete/duplicate/cohort-transplanted rows', async () => {
    const data = await fixture();
    const check = (rows: readonly unknown[] = data.rows): ReturnType<typeof readCacheRunProof> =>
      readCacheRunProof(data.root, data.result.records, data.runAt, {
        requireReplay: true,
        profiles: data.profiles,
        rows,
      });
    for (const options of [
      { requireReplay: true },
      { requireReplay: true, profiles: data.profiles },
      { requireReplay: true, rows: data.rows },
    ])
      await expect(
        readCacheRunProof(data.root, data.result.records, data.runAt, options)
      ).rejects.toThrow('exact rows and profiles');
    for (const field of ['runAt', 'cachePlanHash', 'inventoryHash', 'profilesHash', 'rowsHash']) {
      await writePrivateJson(path.join(data.root, RECEIPT), {
        ...data.receipt,
        [field]: 'changed',
      });
      await expect(check()).rejects.toThrow('not bound');
    }
    await writePrivateJson(path.join(data.root, RECEIPT), data.receipt);
    await expect(check([{ opportunityId: 'synthetic-a', evidence: 'changed' }])).rejects.toThrow(
      'not bound'
    );
    for (const rows of [[], [...data.rows, ...data.rows], [{ opportunityId: 'other' }]]) {
      await writePrivateJson(path.join(data.root, RECEIPT), {
        ...data.receipt,
        rowsHash: sha256Json(rows),
      });
      await expect(check(rows)).rejects.toThrow('not bound');
    }
    await writePrivateJson(path.join(data.root, RECEIPT), data.receipt);
    // A later disk file must not replace the exact rows already loaded by the consumer.
    await writePrivateJson(path.join(data.root, 'input_rows.json'), [{ opportunityId: 'other' }]);
    expect(await check()).toEqual(data.result.proof);
  });
});
