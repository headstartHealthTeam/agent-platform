import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runSourceCaptureCommand } from './cli-source-capture.js';
import { sha256Json } from './json-fingerprint.js';
import { readPrivateJson, writePrivateJson } from './private-run-storage.js';

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'intake-slack-command-'));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true });
});
function file(name: string): string {
  return path.join(root, name);
}
const plan = {
  scope: ['all-accessible'],
  targets: [{ opportunityId: 'synthetic', queries: [{ query: 'synthetic-query' }] }],
};
function page(pageNumber: number, requestCursor: string, nextCursor: string): object {
  return {
    opportunityId: 'synthetic',
    query: 'synthetic-query',
    complete: true,
    pageNumber,
    requestCursor,
    response: {
      ok: true,
      messages: {
        matches: [
          { channel: { id: 'channel' }, ts: '1767225600.001', text: 'Synthetic', reply_count: 0 },
        ],
      },
      response_metadata: { next_cursor: nextCursor },
    },
  };
}
function capture(pages: readonly unknown[]): object {
  return {
    version: 1,
    runId: 'synthetic',
    asOf: '2026-01-02T00:00:00Z',
    collectedAt: '2026-01-02T00:01:00Z',
    planHash: sha256Json(plan),
    scopeHash: sha256Json(plan.scope),
    accessVerified: true,
    pages,
  };
}
async function call(
  command: string,
  args: readonly string[]
): Promise<Awaited<ReturnType<typeof runSourceCaptureCommand>>> {
  return runSourceCaptureCommand(command, ['--run-dir', root, ...args]);
}
describe('saved Slack command persistence', () => {
  it('resumes incomplete captures, archives exact prior material and rejects silent replacement', async () => {
    await writePrivateJson(file('slack_full_sweep_plan.json'), plan);
    const prior = capture([page(1, '', 'next')]);
    await writePrivateJson(file('input.json'), prior);
    const flags = ['--input', file('input.json')];
    const first = await call('review:slack-capture', flags);
    expect(JSON.parse(first.stdout)).toEqual({ rows: 1, blocked: 1 });
    expect(await call('review:slack-capture', flags)).toEqual(first);
    const priorRows = await readPrivateJson(file('slack_full_sweep_exact_name.json'));
    const next = capture([page(2, 'next', '')]);
    await writePrivateJson(file('input.json'), next);
    expect((await call('review:slack-capture', flags)).exitCode).toBe(1);
    const resumed = await call('review:slack-capture', [...flags, '--resume']);
    expect(JSON.parse(resumed.stdout)).toEqual({ rows: 1, blocked: 0 });
    const original = { capture: prior, rows: priorRows };
    expect(
      await readPrivateJson(file(`slack-capture-history/${sha256Json(original)}.json`))
    ).toEqual(original);
    expect(await readPrivateJson(file('slack_search_capture.json'))).toEqual(
      capture([page(1, '', 'next'), page(2, 'next', '')])
    );
    expect((await call('review:slack-capture', [...flags, '--resume', 'false'])).exitCode).toBe(0);
    await writePrivateJson(file('publication-readback.json'), {});
    expect((await call('review:slack-capture', [...flags, '--resume'])).exitCode).toBe(1);
  });
  it('allows resume without a prior capture and archives absent prior rows as null', async () => {
    await writePrivateJson(file('slack_full_sweep_plan.json'), plan);
    const prior = capture([page(1, '', 'next')]);
    await writePrivateJson(file('input.json'), prior);
    const flags = ['--input', file('input.json'), '--resume'];
    expect((await call('review:slack-capture', flags)).exitCode).toBe(0);
    await fs.unlink(file('slack_full_sweep_exact_name.json'));
    await writePrivateJson(file('input.json'), capture([page(2, 'next', '')]));
    expect((await call('review:slack-capture', flags)).exitCode).toBe(0);
    const original = { capture: prior, rows: null };
    expect(
      await readPrivateJson(file(`slack-capture-history/${sha256Json(original)}.json`))
    ).toEqual(original);
  });
  it('persists only completeness-proven deltas without granting source readiness or replacing checkpoints', async () => {
    const base = {
      asOf: '2026-01-01',
      scope: [],
      identityHash: 'identity',
      records: [{ channelId: 'c', messageTs: '1.1', text: 'old' }],
    };
    const delta = {
      asOf: '2026-01-02',
      scope: [],
      identityHash: 'identity',
      records: [],
      deletedKeys: ['c:1.1'],
    };
    const proof = {
      version: 1,
      baseHash: sha256Json(base),
      deltaHash: sha256Json(delta),
      scopeHash: sha256Json([]),
      from: base.asOf,
      to: delta.asOf,
      paginationComplete: true,
      coversEdits: true,
      coversDeletions: true,
      identityHash: 'identity',
    };
    for (const [name, value] of new Map<string, unknown>([
      ['base.json', base],
      ['delta.json', delta],
      ['proof.json', proof],
    ]))
      await writePrivateJson(file(name), value);
    const flags = [
      '--base',
      file('base.json'),
      '--delta',
      file('delta.json'),
      '--proof',
      file('proof.json'),
    ];
    const result = await call('review:slack-delta', flags);
    expect(JSON.parse(result.stdout)).toEqual({ mergedRecords: 0, sourceReadinessGranted: false });
    expect(await call('review:slack-delta', flags)).toEqual(result);
    const saved = await readPrivateJson(file('slack_bounded_delta.json'));
    expect(saved).toMatchObject({
      records: [],
      provenance: { baseHash: sha256Json(base), proofHash: sha256Json(proof) },
    });
    await writePrivateJson(file('proof.json'), { ...proof, coversEdits: false });
    expect((await call('review:slack-delta', flags)).exitCode).toBe(1);
    expect(await readPrivateJson(file('slack_bounded_delta.json'))).toEqual(saved);
    await writePrivateJson(file('proof.json'), proof);
    await writePrivateJson(file('publication-readback.json'), {});
    expect((await call('review:slack-delta', flags)).exitCode).toBe(1);
  });
});
