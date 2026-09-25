import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runFirefliesReplayCommand } from './cli-fireflies-replay.js';
import { FIREFLIES_BOUNDED_VERSION } from './fireflies-bounded-contract.js';
import { currentCandidateManifest } from './fireflies-bounded-files.js';
import { boundedFixture, first } from './fireflies-bounded-fixture.test-support.js';
import { readBoundedRunProof } from './fireflies-bounded-proof.js';
import {
  acceptCandidateBodies,
  finalizeBoundedCollection,
  planBoundedCollection,
} from './fireflies-bounded-storage.js';
import { cacheFixture, executeCache } from './fireflies-cache-fixture.test-support.js';
import { readCacheRunProof } from './fireflies-cache-replay-proof.js';
import { buildRunLevelFirefliesCollectionPlan } from './fireflies-collection.js';
import { buildIdentityProfile } from './identity-profile.js';
import { sha256Json } from './json-fingerprint.js';
import { readPrivateJson, writePrivateJson } from './private-run-storage.js';
import type { ReplayProgressEvent } from './replay-progress.js';

let root: string;
const cutoff = '2026-01-10T17:00:00.000Z';
const profile = {
  ...buildIdentityProfile({
    opportunityId: 'synthetic-client',
    opportunityName: 'Synthetic Client',
    stage: 'IA Scheduled',
    stageEntryDate: '2026-01-01',
    renderingProvider: { name: 'Synthetic Provider', email: 'provider@example.test' },
    asOf: new Date(cutoff),
  }),
  searchWindow: { fromDate: '2026-01-01', toDate: '2026-01-10' },
  sourceMetadata: { preserve: true },
};
const meeting = {
  transcriptId: 'synthetic-meeting',
  date: '2026-01-09T12:00:00.000Z',
  title: 'Synthetic Provider meeting',
  organizerEmail: 'provider@example.test',
  participants: ['provider@example.test'],
  meetingAttendees: [],
  fullTranscript: 'Synthetic Client completed the initial assessment.',
  retrievedAt: cutoff,
  retrievalEndpoint: 'synthetic-only',
};
const events: ReplayProgressEvent[] = [];
const file = (name: string): string => path.join(root, name);
async function write(name: string, value: unknown): Promise<void> {
  await writePrivateJson(file(name), value);
}
async function inventory(records: readonly unknown[]): Promise<void> {
  await fs.writeFile(
    file('fireflies_transcript_inventory.jsonl'),
    records.map((record) => JSON.stringify(record)).join('\n'),
    { mode: 0o600 }
  );
}
function call(
  environment: Readonly<NodeJS.ProcessEnv> = {}
): ReturnType<typeof runFirefliesReplayCommand> {
  return runFirefliesReplayCommand(
    [],
    { SLA_RUN_DIR: root, RUN_AT: cutoff, FIREFLIES_SEARCHED_AT: cutoff, ...environment },
    (event) => {
      events.push(event);
    }
  );
}
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'intake-replay-command-'));
  events.length = 0;
  await write('identity_profile_rows.json', [profile]);
  await inventory([meeting]);
});
afterEach(async () => {
  await fs.rm(root, { recursive: true });
});

describe('saved Fireflies replay command', () => {
  it('rematches the proven saved inventory, respects the cutoff and reports counts without identities', async () => {
    await inventory([
      meeting,
      { ...meeting, transcriptId: 'post-cutoff', date: '2026-01-10T18:00:00Z' },
    ]);
    expect(JSON.parse((await call()).stdout)).toMatchObject({
      opportunities: 1,
      transcriptInventory: 2,
      found: 1,
      relevantMeetings: 1,
    });
    expect(await readPrivateJson(file('fireflies_rows.json'))).toMatchObject([
      {
        opportunityId: profile.opportunityId,
        searched: true,
        blocked: false,
        recordsRetrieved: 1,
        meetings: [
          { id: meeting.transcriptId, fullTranscript: meeting.fullTranscript, quality: 'Direct' },
        ],
        searchCoverage: {
          status: 'Complete',
          candidateMeetingCount: 1,
          retainedInventoryCount: 2,
          transcriptsComplete: true,
        },
      },
    ]);
    expect(await readPrivateJson(file('fireflies_replay_execution.json'))).toMatchObject({
      sourceCutoff: cutoff,
      found: 1,
      notFound: 0,
      direct: 1,
    });
    expect(events.map((event) => event.phase)).toEqual([
      'waiting-for-run-lock',
      'validating-sources',
      'preparing-matching',
      'matching',
      'persisting',
      'complete',
    ]);
    expect(JSON.stringify(events)).not.toContain(profile.opportunityName);
    expect(JSON.stringify(events)).not.toContain(root);
    await expect(fs.access(file('.writer-lock'))).rejects.toThrow();
  });
  it('retains genuinely empty results and does not parse irrelevant matcher fields', async () => {
    await write('identity_profile_rows.json', [
      {
        opportunityId: 'empty',
        opportunityName: 'Absent Client',
        providerIdentity: 'unused',
        candidates: 42,
      },
    ]);
    expect(JSON.parse((await call()).stdout)).toMatchObject({ found: 0, relevantMeetings: 0 });
    expect(await readPrivateJson(file('fireflies_rows.json'))).toMatchObject([
      { searched: true, meetings: [], searchCoverage: { status: 'Complete', requestCount: 0 } },
    ]);
    await write('identity_profile_rows.json', []);
    await inventory([]);
    expect(JSON.parse((await call()).stdout)).toMatchObject({
      opportunities: 0,
      transcriptInventory: 0,
    });
  });
  it.each([
    { authorizationNumbers: null },
    { providerRoster: null },
    {
      providerRoles: [
        {
          role: 'Rendering',
          names: ['Synthetic Provider'],
          emails: ['provider@example.test'],
          primaryEmail: { unused: true },
        },
      ],
    },
  ])(
    'decodes partial/nullable matcher inputs without losing raw provenance: %j',
    async (change) => {
      const saved = [{ ...profile, ...change }];
      await write('identity_profile_rows.json', saved);
      expect(JSON.parse((await call()).stdout)).toMatchObject({ found: 1 });
      expect(await readPrivateJson(file('identity_profile_rows.json'))).toEqual(saved);
    }
  );
  it('retains a partial fallback competitor and the original weak disposition', async () => {
    await write('identity_profile_rows.json', [
      { ...profile, providerRoster: [{ name: 'Different Person' }] },
    ]);
    expect(JSON.parse((await call()).stdout)).toMatchObject({ found: 0 });
    // Approved source comparison: zero admitted segments, one weak match, not a decoder rejection.
    expect(await readPrivateJson(file('fireflies_rows.json'))).toMatchObject([
      { searched: true, meetings: [], weakMatches: [{ quality: 'Weak' }] },
    ]);
  });
  it('rejects incomplete, stale, malformed and immutable input without overwriting the prior rows', async () => {
    const prior = [{ retained: true }];
    await write('fireflies_rows.json', prior);
    await write('fireflies_inventory_execution.json', { transcripts: { requested: 2 } });
    await expect(call()).rejects.toThrow('incomplete');
    await write('fireflies_inventory_execution.json', { transcripts: { requested: 1 } });
    await inventory([{ ...meeting, retrievedAt: '2025-01-01' }]);
    await expect(call()).rejects.toThrow('incomplete');
    await inventory([meeting]);
    await fs.writeFile(file('fireflies_inventory_execution.json'), '{malformed');
    await expect(call()).rejects.toThrow();
    await write('publication-readback.json', {});
    await expect(call()).rejects.toThrow('immutable');
    expect(await readPrivateJson(file('fireflies_rows.json'))).toEqual(prior);
    await expect(runFirefliesReplayCommand([], {})).rejects.toThrow('required');
  });
  it('binds shadow-cache provenance to exact raw profiles, inventory and replay rows', async () => {
    const input = cacheFixture();
    const profiles = [profile];
    input.collectionPlan = buildRunLevelFirefliesCollectionPlan(
      profiles.map((row) => ({ ...row, asOf: cutoff }))
    );
    input.discovery.collectionPlanHash = sha256Json(input.collectionPlan);
    const result = executeCache(input);
    for (const [name, value] of new Map<string, unknown>([
      ['fireflies_run_inventory.json', input.collectionPlan],
      ['fireflies_discovery.json', input.discovery],
      ['fireflies_cache_plan.json', result.proof.plan],
      ['fireflies_cache_proof.json', result.proof],
    ]))
      await write(name, value);
    await inventory(result.records);
    await call();
    const rows = await readPrivateJson(file('fireflies_rows.json'));
    if (!Array.isArray(rows)) throw new Error('Expected replay rows');
    expect(
      await readCacheRunProof(root, result.records, cutoff, { profiles, rows, requireReplay: true })
    ).toEqual(result.proof);
    expect(rows).toMatchObject([
      { searchedAt: input.discovery.completedAt, searchCoverage: { fullTranscriptsRetrieved: 1 } },
    ]);
    await expect(call({ SOURCE_CUTOFF: '2026-01-09' })).rejects.toThrow('bound current-run cutoff');
  });
  it.each([false, true])(
    'keeps bounded missing-search state row-local (blocked=%s) and binds replay proof',
    async (blocked) => {
      const input = boundedFixture();
      // This fixture switches collection modes before finalization; no unrelated inventory is owned.
      await fs.unlink(file('fireflies_transcript_inventory.jsonl'));
      if (blocked) input.searchExecution.attempts.pop();
      for (const [name, value] of new Map<string, unknown>([
        ['identity_profile_rows.json', input.profiles],
        ['fireflies_run_inventory.json', input.collectionPlan],
        ['fireflies_discovery.json', input.discovery],
        ['fireflies_search_execution.json', input.searchExecution],
      ]))
        await write(name, value);
      await planBoundedCollection(root);
      const { manifest } = await currentCandidateManifest(root);
      const records = [first(input.fetched)];
      await acceptCandidateBodies(root, {
        version: FIREFLIES_BOUNDED_VERSION,
        runId: manifest.runId,
        manifestHash: manifest.manifestHash,
        records,
      });
      await finalizeBoundedCollection(root);
      await call();
      const rows = await readPrivateJson(file('fireflies_rows.json'));
      if (!Array.isArray(rows)) throw new Error('Expected replay rows');
      expect(rows).toMatchObject([
        {
          blocked,
          searched: !blocked,
          searchCoverage: {
            status: blocked ? 'Partial' : 'Complete',
            transcriptsComplete: true,
            paginationComplete: !blocked,
          },
        },
      ]);
      expect(
        await readBoundedRunProof(root, records, cutoff, {
          profiles: input.profiles,
          rows,
          requireReplay: true,
        })
      ).not.toBeNull();
      await expect(call({ SOURCE_CUTOFF: '2026-01-09' })).rejects.toThrow(
        'bound current-run cutoff'
      );
    }
  );
});
