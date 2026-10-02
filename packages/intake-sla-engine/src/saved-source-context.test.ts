import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { billingCollectionReceipt } from './billing-collection.js';
import { sha256Json } from './json-fingerprint.js';
import { adaptPortalTreatmentAuthorizationRequests } from './portal-authorization-evidence.js';
import { buildReportIdentityProfiles } from './report-identity.js';
import { loadSavedReportSources } from './saved-source-context.js';
import { loadSavedTranscriptHealth } from './saved-source-health.js';
import type { SavedSourceArtifacts } from './saved-source-health.js';
import { loadSavedSourceRows, savedSourceJson } from './saved-source-rows.js';
import { savedSourceArtifacts } from './saved-source-storage.js';
import { collectStructuredEvidence } from './structured-collection.js';

const cutoff = '2026-09-24T16:00:00.000Z';
const opportunityId = ['006', '000000000001AAA'].join('');
function memory(
  files = new Map<string, unknown>(),
  inventory?: string
): {
  artifacts: SavedSourceArtifacts;
  operations: string[];
  writes: Map<string, unknown>;
} {
  const operations: string[] = [];
  const writes = new Map<string, unknown>();
  const artifacts: SavedSourceArtifacts = {
    read: (name): Promise<unknown> => {
      operations.push(`read:${name}`);
      return Promise.resolve(files.get(name));
    },
    write: (name, value): Promise<void> => {
      operations.push(`write:${name}`);
      writes.set(name, value);
      return Promise.resolve();
    },
    readText: (name): Promise<string | undefined> => {
      operations.push(`text:${name}`);
      return Promise.resolve(inventory);
    },
    boundedProof: (_records, _runAt, options) => {
      operations.push('bounded');
      expect(options.requireReplay).toBe(true);
      return Promise.resolve(null);
    },
    cacheProof: (_records, _runAt, options) => {
      operations.push('cache');
      expect(options.requireReplay).toBe(true);
      return Promise.resolve(null);
    },
  };
  return { artifacts, operations, writes };
}
async function context(
  files: Map<string, unknown>,
  artifacts: SavedSourceArtifacts,
  stage = 'IA Scheduled'
): Promise<Parameters<typeof loadSavedReportSources>[0]> {
  files.set('opportunity_rows.json', [
    { Id: opportunityId, Name: 'Synthetic Client', StageName: stage },
  ]);
  files.set(
    'billing_collection_contract.json',
    billingCollectionReceipt({ records: [], opportunityIds: [opportunityId], cutoff })
  );
  const collection = await collectStructuredEvidence({
    source: { mode: 'saved' },
    artifacts,
    cutoff,
  });
  return {
    artifacts,
    collection,
    profiles: buildReportIdentityProfiles(collection, cutoff),
    runId: 'synthetic',
    runAt: new Date(cutoff),
  };
}
describe('saved report source composition', () => {
  it('retains keyed raw rows, last-wins order and unique-name-only Slack association', async () => {
    const first = { opportunityId: 'a', opportunityName: 'Same', metadata: { exact: true } };
    const last = { opportunityId: 'a', opportunityName: 'Same', extra: undefined };
    const unique = { opportunityName: ' Unique Name ' };
    const ambiguous = { opportunityName: 'Same' };
    const files = new Map<string, unknown>([['rows', [first, unique, last, ambiguous, {}]]]);
    const { artifacts } = memory(files);
    const ordinary = await loadSavedSourceRows(artifacts, 'rows');
    expect([...ordinary.byOpportunity.keys()]).toEqual(['a', ' Unique Name ', 'Same']);
    expect(ordinary.byOpportunity.get('a')).toBe(last);
    expect(ordinary.rows[0]).toBe(first);
    const scoped = await loadSavedSourceRows(artifacts, 'rows', [
      { opportunityId: 'a', opportunityName: 'Same' },
      { opportunityId: 'b', opportunityName: 'Same' },
      { opportunityId: 'c', opportunityName: 'Unique Name' },
    ]);
    expect([...scoped.byOpportunity.keys()]).toEqual(['a', 'c']);
    expect(scoped.byOpportunity.get('c')).toBe(unique);
    files.set('rows', { unrelated: 'non-array source wrapper' });
    expect((await loadSavedSourceRows(artifacts, 'rows')).rows).toEqual([]);
    files.set('null', null);
    expect(await savedSourceJson(artifacts, 'null', [])).toBeNull();
    expect(await savedSourceJson(artifacts, 'absent', [])).toEqual([]);
  });
  it('composes exact retained snapshots and writes only the two source projections', async () => {
    const portal = {
      opportunityId,
      responses: { chats: [{ id: 'chat', content: 'Synthetic' }] },
      chats: { legacy: 'unused metadata' },
    };
    const fireflies = { opportunityId, meetings: [{ id: 'meeting' }] };
    const request = {
      opportunityId,
      requestNumber: '42',
      authType: 'Treatment',
      status: 'REVIEWING',
      submittedAt: '2026-09-23',
      custom: { retained: true },
    };
    const files = new Map<string, unknown>([
      ['portal_rows.json', [portal]],
      ['fireflies_rows.json', [fireflies]],
      [
        'portal_inventory_execution.json',
        { completed: '1', requests: 1, blocked: 0, sentinelFound: true },
      ],
      [
        'fireflies_inventory_execution.json',
        { searchBlocked: 0, transcripts: { requested: 1, complete: 1, blocked: 0 } },
      ],
      [
        'portal_auth_request_inventory.json',
        { collectedAt: cutoff, complete: true, rows: [request] },
      ],
      ['slack_rows.json', [{ opportunityName: 'Synthetic Client', records: [] }]],
      ['gmail_rows.json', [{ opportunityName: 'Synthetic Client', events: [] }]],
      ['escalation_file_rows.json', []],
    ]);
    const run = memory(
      files,
      `${JSON.stringify({ transcriptId: 'meeting', fullTranscript: 'Synthetic conversation.', retrievedAt: cutoff })}\r\n`
    );
    const input = await context(files, run.artifacts, '97151 Started');
    run.operations.length = 0;
    run.writes.clear();
    const before = structuredClone([...files]);
    const result = await loadSavedReportSources(input);
    expect(result.portal.byOpportunity.get(opportunityId)).toBe(portal);
    expect(result.fireflies.byOpportunity.get(opportunityId)).toBe(fireflies);
    expect(result.slack.byOpportunity.has(opportunityId)).toBe(true);
    expect(result.gmail.byOpportunity.has('Synthetic Client')).toBe(true);
    expect(result.health).toEqual({
      portal: { source: 'Portal', status: 'Complete', reason: null },
      fireflies: { source: 'Fireflies', status: 'Complete', reason: null },
    });
    expect(result.portalRequests.collection.byOpportunity.get(opportunityId)?.[0]?.['custom']).toBe(
      request.custom
    );
    const profile = input.profiles[0];
    if (!profile) throw new Error('Synthetic profile missing');
    expect(
      adaptPortalTreatmentAuthorizationRequests({
        records: result.portalRequests.collection.byOpportunity.get(opportunityId) ?? [],
        profile,
        asOf: cutoff,
        gate: { gateCategory: 'treatmentPlan' },
      })
    ).toHaveLength(1);
    expect([...run.writes.keys()]).toEqual([
      'portal_auth_request_rows.json',
      'slack_denial_coverage.json',
    ]);
    expect(run.operations).toEqual([
      'read:portal_rows.json',
      'read:fireflies_rows.json',
      'read:fireflies_inventory_execution.json',
      'text:fireflies_transcript_inventory.jsonl',
      'bounded',
      'cache',
      'read:portal_auth_request_inventory.json',
      'write:portal_auth_request_rows.json',
      'read:portal_inventory_execution.json',
      'read:fireflies_inventory_execution.json',
      'read:slack_rows.json',
      'read:slack_full_sweep_execution.json',
      'read:slack_full_sweep_plan.json',
      'read:slack_search_capture.json',
      'read:slack_full_sweep_exact_name.json',
      'read:slack_full_sweep_threads.json',
      'read:slack_rows.json',
      'write:slack_denial_coverage.json',
      'read:gmail_rows.json',
      'read:escalation_file_rows.json',
    ]);
    expect([...files]).toEqual(before);
  });
  it('keeps missing sources and denial coverage as existing report health/row outcomes', async () => {
    const files = new Map<string, unknown>([
      [
        'auth_rows.json',
        [
          {
            Id: 'auth',
            Client_Opportunity_Record__c: opportunityId,
            Authorization_Type__c: 'Treatment Auth Request',
            Auth_Status__c: 'Denied',
            Treatment_Auth_Submission_Date__c: '2026-09-20',
            CreatedDate: '2026-09-20',
          },
        ],
      ],
      ['slack_full_sweep_threads.json', null],
    ]);
    const run = memory(files);
    const result = await loadSavedReportSources(
      await context(files, run.artifacts, 'TA Requested')
    );
    expect(result.health.portal.status).toBe('Blocked');
    expect(result.health.fireflies.status).toBe('Blocked');
    expect(result.portalRequests.records).toEqual([]);
    expect(result.denialCoverage.incomplete).toBe(1);
    expect(result.denialCoverage.threadRowsHash).toBe(sha256Json(null));
    expect(result.denialByOpportunity.get(opportunityId)?.complete).toBe(false);
  });
  it('retains incomplete transcript reason and fails invalid JSON before proof/readback writes', async () => {
    const files = new Map<string, unknown>([
      ['fireflies_inventory_execution.json', { transcripts: { requested: 1 } }],
    ]);
    const missing = memory(files);
    const result = await loadSavedReportSources(await context(files, missing.artifacts));
    expect(result.health.fireflies.reason).toContain('Retained 0 of 1 requested transcripts.');
    const invalid = memory(files, '{not-json}\n');
    await expect(
      loadSavedTranscriptHealth(invalid.artifacts, [], [], new Date(cutoff))
    ).rejects.toThrow();
    expect(invalid.operations).not.toContain('bounded');
    expect(invalid.writes.size).toBe(0);
    const denied: SavedSourceArtifacts = {
      ...invalid.artifacts,
      read: () => Promise.reject(new Error('synthetic read denied')),
    };
    await expect(loadSavedSourceRows(denied, 'portal_rows.json')).rejects.toThrow(
      'synthetic read denied'
    );
  });
  it('uses the real private storage and proof readers without inventing absent proofs', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'intake-source-test-'));
    try {
      const artifacts = savedSourceArtifacts(directory);
      expect(await artifacts.read('missing.json')).toBeUndefined();
      expect(await artifacts.readText('missing.jsonl')).toBeUndefined();
      await artifacts.write('value.json', { preserved: [0, false, null, ' '] });
      expect(await fs.readFile(path.join(directory, 'value.json'), 'utf8')).toBe(
        JSON.stringify({ preserved: [0, false, null, ' '] }, null, 2)
      );
      expect(await artifacts.read('value.json')).toEqual({ preserved: [0, false, null, ' '] });
      expect((await loadSavedTranscriptHealth(artifacts, [], [], new Date(cutoff))).complete).toBe(
        true
      );
      await fs.writeFile(path.join(directory, 'bad.json'), '{invalid');
      await expect(artifacts.read('bad.json')).rejects.toThrow();
      await fs.mkdir(path.join(directory, 'not-file.jsonl'));
      await expect(artifacts.readText('not-file.jsonl')).rejects.toThrow(
        'Expected a private regular file'
      );
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
