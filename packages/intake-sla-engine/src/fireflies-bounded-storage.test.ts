import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { CompleteFirefliesTranscript } from '@headstart-health/fireflies-data';
import { afterEach, describe, expect, it } from 'vitest';

import { FIREFLIES_BOUNDED_VERSION } from './fireflies-bounded-contract.js';
import {
  BODY_CHECKPOINT_DIRECTORY,
  BOUNDED_INVENTORY_FILE,
  BOUNDED_MANIFEST_FILE,
  BOUNDED_PROOF_FILE,
  bodyItemName,
  currentCandidateManifest,
} from './fireflies-bounded-files.js';
import {
  boundedFixture,
  first,
  replanBoundedFixture,
} from './fireflies-bounded-fixture.test-support.js';
import type { BoundedFixture } from './fireflies-bounded-fixture.test-support.js';
import { readBoundedRunProof } from './fireflies-bounded-proof.js';
import {
  acceptCandidateBodies,
  boundedCollectionStatus,
  captureCandidateResponse,
  finalizeBoundedCollection,
  planBoundedCollection,
} from './fireflies-bounded-storage.js';
import { sha256Json } from './json-fingerprint.js';
import { readPrivateJson, writePrivateJson } from './private-run-storage.js';

const roots: string[] = [];
const RAW = 'fireflies_body_raw_0.json';
const RECEIPT = 'fireflies_body_normalization_0.json';
const EXECUTION = 'fireflies_inventory_execution.json';
const REPLAY = 'fireflies_bounded_replay.json';
interface Harness {
  root: string;
  input: BoundedFixture;
  file: (name: string) => string;
}
async function harness(mutate?: (input: BoundedFixture) => void): Promise<Harness> {
  const root = await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), 'intake-bounded-storage-test-')
  );
  roots.push(root);
  const input = boundedFixture();
  mutate?.(input);
  const file = (name: string): string => path.join(root, name);
  for (const [name, value] of new Map<string, unknown>([
    ['fireflies_discovery.json', input.discovery],
    ['fireflies_run_inventory.json', input.collectionPlan],
    ['identity_profile_rows.json', input.profiles],
    ['fireflies_search_execution.json', input.searchExecution],
  ]))
    await writePrivateJson(file(name), value);
  return { root, input, file };
}
afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
async function capture(
  h: Harness,
  records: readonly unknown[] = [first(h.input.fetched)]
): Promise<object> {
  const { manifest } = await currentCandidateManifest(h.root);
  return {
    version: FIREFLIES_BOUNDED_VERSION,
    runId: manifest.runId,
    manifestHash: manifest.manifestHash,
    records,
  };
}
function envelope(record: CompleteFirefliesTranscript): object {
  return {
    retrievalEndpoint: record.retrievalEndpoint,
    retrievedAt: record.retrievedAt,
    response: {
      content: [
        {
          type: 'text',
          text: `Id: ${record.transcriptId}\nDateString: ${record.date}\nSentences: ${record.fullTranscript}\nTitle: ${record.title}\nOrganizer Email: ${record.organizerEmail}\nParticipants: ${record.participants.join(', ')}\nMeeting Attendees: No meeting attendees\nIs Live: false`,
        },
      ],
    },
  };
}
async function finalize(h: Harness): Promise<unknown[]> {
  await planBoundedCollection(h.root);
  await acceptCandidateBodies(h.root, await capture(h));
  await finalizeBoundedCollection(h.root);
  return (await fs.readFile(h.file(BOUNDED_INVENTORY_FILE), 'utf8'))
    .trim()
    .split('\n')
    .map((line): unknown => JSON.parse(line));
}
describe('bounded Fireflies checkpoint transactions', () => {
  it('plans, resumes only missing bodies, finalizes idempotently and keeps missing searches row-local', async () => {
    const h = await harness((input): void => {
      input.searchExecution.attempts.pop();
    });
    expect(await readBoundedRunProof(h.root, [], h.input.discovery.asOf)).toBeNull();
    expect(await planBoundedCollection(h.root)).toMatchObject({
      status: 'Planned',
      candidateBodies: 1,
      blockedRows: 1,
    });
    expect(await boundedCollectionStatus(h.root)).toMatchObject({ saved: 0, pending: 1 });
    await expect(finalizeBoundedCollection(h.root)).rejects.toThrow('incomplete');
    const accepted = await capture(h);
    expect(await acceptCandidateBodies(h.root, accepted)).toEqual({
      status: 'Checkpointed',
      accepted: 1,
    });
    expect(await acceptCandidateBodies(h.root, accepted)).toEqual({
      status: 'Checkpointed',
      accepted: 1,
    });
    expect(await boundedCollectionStatus(h.root)).toEqual({
      status: 'Ready to finalize',
      saved: 1,
      pending: 0,
      blockedRows: 1,
    });
    for (let index = 0; index < 2; index++)
      expect(await finalizeBoundedCollection(h.root)).toEqual({
        status: 'Finalized',
        transcripts: 1,
        blockedRows: 1,
      });
    const records = [first(h.input.fetched)];
    expect(
      await readBoundedRunProof(h.root, records, new Date(h.input.discovery.asOf))
    ).toMatchObject({ proof: { status: 'Complete' } });
    await expect(fs.access(h.file('fireflies_cache_plan.json'))).rejects.toThrow();
    expect(await readPrivateJson(h.file(EXECUTION))).toMatchObject({ searchBlocked: 1 });
  }, 30_000);
  it('rejects invalid batches before any checkpoint and refuses changed accepted evidence', async () => {
    const h = await harness();
    await planBoundedCollection(h.root);
    for (const records of [[], h.input.fetched, [first(h.input.fetched), first(h.input.fetched)]])
      await expect(acceptCandidateBodies(h.root, await capture(h, records))).rejects.toThrow();
    await expect(acceptCandidateBodies(h.root, {})).rejects.toThrow('not bound');
    expect((await boundedCollectionStatus(h.root)).saved).toBe(0);
    await acceptCandidateBodies(h.root, await capture(h));
    await expect(
      acceptCandidateBodies(
        h.root,
        await capture(h, [{ ...first(h.input.fetched), fullTranscript: 'changed' }])
      )
    ).rejects.toThrow('differs');
    expect((await boundedCollectionStatus(h.root)).saved).toBe(1);
  }, 30_000);
  it('captures raw response and receipt before checkpoint, resumes without input and never overwrites either', async () => {
    const h = await harness();
    await planBoundedCollection(h.root);
    const raw = envelope(first(h.input.fetched));
    await writePrivateJson(h.file(RAW), raw);
    await boundedCollectionStatus(h.root);
    expect(await readPrivateJson(h.file('fireflies_pending_fetches.json'))).toMatchObject({
      meetings: [{ action: 'Resume capture' }],
    });
    await expect(captureCandidateResponse(h.root, { index: 0, capture: null })).rejects.toThrow(
      'Raw capture differs'
    );
    expect(await captureCandidateResponse(h.root, { index: 0 })).toEqual({
      status: 'Checkpointed',
      accepted: 1,
    });
    expect(await readPrivateJson(h.file(RECEIPT))).toMatchObject({
      rawCaptureHash: sha256Json(raw),
    });
    await captureCandidateResponse(h.root, { index: 0, capture: raw });
    await expect(
      captureCandidateResponse(h.root, {
        index: 0,
        capture: envelope({ ...first(h.input.fetched), retrievedAt: '2026-01-10T18:00:00.000Z' }),
      })
    ).rejects.toThrow('Raw capture differs');
    for (const index of [-1, 0.5, 99])
      await expect(captureCandidateResponse(h.root, { index })).rejects.toThrow(
        'Invalid candidate'
      );
    expect(await readPrivateJson(h.file(RAW))).toEqual(raw);
    await writePrivateJson(h.file(RECEIPT), { changed: true });
    await expect(captureCandidateResponse(h.root, { index: 0 })).rejects.toThrow('receipt differs');
  }, 30_000);
  it('serializes concurrent capture and preserves published-run immutability', async () => {
    const h = await harness();
    await planBoundedCollection(h.root);
    const captures = [
      first(h.input.fetched),
      { ...first(h.input.fetched), retrievedAt: '2026-01-10T18:00:00.000Z' },
    ].map(envelope);
    const results = await Promise.allSettled(
      captures.map((raw) => captureCandidateResponse(h.root, { index: 0, capture: raw }))
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await boundedCollectionStatus(h.root)).saved).toBe(1);
    await writePrivateJson(h.file('publication-readback.json'), {});
    for (const operation of [
      (): Promise<unknown> => planBoundedCollection(h.root),
      (): Promise<unknown> => boundedCollectionStatus(h.root),
      (): Promise<unknown> => acceptCandidateBodies(h.root, {}),
      (): Promise<unknown> => captureCandidateResponse(h.root, { index: 0 }),
      (): Promise<unknown> => finalizeBoundedCollection(h.root),
    ])
      await expect(operation()).rejects.toThrow('immutable');
  }, 30_000);
  it('resumes interrupted finalization and rejects unowned or corrupted artifacts', async () => {
    const h = await harness();
    await planBoundedCollection(h.root);
    await fs.mkdir(h.file(BODY_CHECKPOINT_DIRECTORY), { mode: 0o700 });
    await fs.writeFile(h.file(`${BODY_CHECKPOINT_DIRECTORY}/unfinished.tmp`), 'unfinished');
    expect((await boundedCollectionStatus(h.root)).saved).toBe(0);
    await acceptCandidateBodies(h.root, await capture(h));
    await fs.writeFile(h.file(BOUNDED_INVENTORY_FILE), 'unowned');
    await expect(finalizeBoundedCollection(h.root)).rejects.toThrow('not owned');
    await writePrivateJson(h.file(BOUNDED_PROOF_FILE), {
      status: 'Pending',
      manifestHash: 'wrong',
    });
    await expect(finalizeBoundedCollection(h.root)).rejects.toThrow('different manifest');
    const { manifest } = await currentCandidateManifest(h.root);
    await writePrivateJson(h.file(BOUNDED_PROOF_FILE), {
      status: 'Pending',
      manifestHash: manifest.manifestHash,
    });
    await expect(
      readBoundedRunProof(h.root, [first(h.input.fetched)], manifest.asOf)
    ).rejects.toThrow('pending');
    await finalizeBoundedCollection(h.root);
    await writePrivateJson(
      h.file(`${BODY_CHECKPOINT_DIRECTORY}/${bodyItemName(first(h.input.fetched).transcriptId)}`),
      { wrong: true }
    );
    await expect(boundedCollectionStatus(h.root)).rejects.toThrow('corrupt');
  }, 30_000);
  it('binds exact consumed rows, execution receipts, cohort and cutoff', async () => {
    const h = await harness();
    const records = await finalize(h);
    const { manifest } = await currentCandidateManifest(h.root);
    const rows = [
      { opportunityId: first(h.input.profiles).opportunityId, evidence: { value: 'exact' } },
    ];
    const receipt = {
      manifestHash: manifest.manifestHash,
      inventoryHash: sha256Json(records),
      runAt: manifest.asOf,
      profilesHash: sha256Json(h.input.profiles),
      rowsHash: sha256Json(rows),
    };
    await writePrivateJson(h.file(REPLAY), receipt);
    expect(
      await readBoundedRunProof(h.root, records, manifest.asOf, {
        requireReplay: true,
        profiles: h.input.profiles,
        rows,
      })
    ).toMatchObject({ coverage: { resolutions: [] } });
    await expect(readBoundedRunProof(h.root, records, '2026-01-11')).rejects.toThrow('mismatched');
    await expect(
      readBoundedRunProof(h.root, records, manifest.asOf, { profiles: [] })
    ).rejects.toThrow('Consumed identities');
    await expect(
      readBoundedRunProof(h.root, records, manifest.asOf, {
        requireReplay: true,
        profiles: h.input.profiles,
        rows: [],
      })
    ).rejects.toThrow('not bound');
    await writePrivateJson(h.file(REPLAY), { ...receipt, coverageHash: 'wrong' });
    await expect(
      readBoundedRunProof(h.root, records, manifest.asOf, {
        requireReplay: true,
        profiles: h.input.profiles,
        rows,
      })
    ).rejects.toThrow('conditional coverage');
    await writePrivateJson(h.file(EXECUTION), { changed: true });
    await expect(readBoundedRunProof(h.root, records, manifest.asOf)).rejects.toThrow(
      'execution receipt'
    );
    await writePrivateJson(h.file(BOUNDED_MANIFEST_FILE), { ...manifest, meetings: [] });
    await expect(boundedCollectionStatus(h.root)).rejects.toThrow('manifest changed');
  }, 30_000);
  it('binds conditional CSM coverage separately without rewriting the original manifest', async () => {
    const h = await harness((input): void => {
      const role = first(first(input.profiles).providerRoles);
      role.csmNames = [];
      role.csmEmails = [];
      replanBoundedFixture(input);
    });
    const records = await finalize(h);
    const proof = await readBoundedRunProof(h.root, records, h.input.discovery.asOf);
    if (proof === null) throw new Error('Missing synthetic proof');
    expect(first(proof.manifest.rows).status).toBe('Blocked');
    expect(first(proof.coverage.rows).status).toBe('Complete');
    const rows = [{ opportunityId: first(h.input.profiles).opportunityId }];
    const receipt = {
      manifestHash: proof.manifest.manifestHash,
      inventoryHash: sha256Json(records),
      runAt: proof.manifest.asOf,
      profilesHash: sha256Json(h.input.profiles),
      rowsHash: sha256Json(rows),
    };
    const options = { requireReplay: true, profiles: h.input.profiles, rows };
    await writePrivateJson(h.file(REPLAY), receipt);
    await expect(
      readBoundedRunProof(h.root, records, proof.manifest.asOf, options)
    ).rejects.toThrow('conditional coverage');
    await writePrivateJson(h.file(REPLAY), {
      ...receipt,
      coverageHash: sha256Json(proof.coverage),
    });
    expect(await readBoundedRunProof(h.root, records, proof.manifest.asOf, options)).toEqual(proof);
  }, 30_000);
});
