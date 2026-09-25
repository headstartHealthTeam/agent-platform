import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runSlackPlanningCommand } from './cli-slack-planning.js';
import { readPrivateJson, writePrivateJson } from './private-run-storage.js';
import { mergeSlackSweep } from './slack-sweep-merge.js';
import { buildSlackSweepPlan } from './slack-sweep-plan.js';

let root: string;
const cutoff = '2026-01-10T17:00:00.000Z';
const profile = {
  opportunityId: 'synthetic-client',
  opportunityName: 'Synthetic Client',
  stageEntryDate: '2026-01-01',
  searchWindow: { fromDate: '2026-01-01', toDate: '2026-01-10' },
};
const exact = {
  opportunityId: profile.opportunityId,
  searched: true,
  paginationComplete: true,
  searchedAt: cutoff,
  records: [],
};
const record = {
  opportunityId: profile.opportunityId,
  channelId: 'synthetic-channel',
  messageTs: '100.000000',
  time: '2026-01-09T12:00:00Z',
  text: 'Synthetic Client assessment scheduled.',
  replyCount: 0,
};
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'intake-slack-plan-'));
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(cutoff));
});
afterEach(async () => {
  vi.useRealTimers();
  await fs.rm(root, { recursive: true });
});
async function write(name: string, value: unknown): Promise<void> {
  await writePrivateJson(path.join(root, name), value);
}
function call(command: string): ReturnType<typeof runSlackPlanningCommand> {
  return runSlackPlanningCommand(command, ['--run-dir', root], {});
}
function merge(
  overrides: Partial<Parameters<typeof mergeSlackSweep>[0]> = {}
): ReturnType<typeof mergeSlackSweep> {
  return mergeSlackSweep({
    identityRows: [profile],
    exactRows: [exact],
    pageTwoRecords: [],
    threadRows: [],
    priorRows: [],
    sourceCutoff: cutoff,
    ...overrides,
  });
}
describe('Slack saved full-sweep commands', () => {
  it('does not inspect unrelated authorization/non-denied profile fields or an unused cutoff', async () => {
    await Promise.all([
      write('opportunity_rows.json', [{ Id: profile.opportunityId, StageName: 'IA Scheduled' }]),
      write('identity_profile_rows.json', [{ ...profile, providers: { saved: 'irrelevant' } }]),
      write('auth_rows.json', [
        { Client_Opportunity_Record__c: 'unrelated', Notes__c: { ignored: true } },
      ]),
      write('authorization_review_rows.json', []),
      write('run_manifest.json', { runId: 'synthetic-run', startedAt: cutoff }),
    ]);
    expect(JSON.parse((await call('review:slack-plan')).stdout)).toMatchObject({
      opportunityCount: 1,
      queryCount: 2,
    });
    await write('run_manifest.json', { startedAt: null });
    await write('slack_full_sweep_exact_name.json', [{ ...exact, records: [record] }]);
    expect(JSON.parse((await call('review:slack-merge')).stdout)).toMatchObject({
      cohortComplete: true,
      blocked: 0,
    });
  }, 30_000);
  it('keeps numeric story anchors as epoch milliseconds and never drops an unresolved thread through the fallback window', () => {
    const result = merge({
      identityRows: [{ ...profile, stageEntryDate: Date.parse('2025-01-01') }],
      exactRows: [{ ...exact, records: [{ ...record, time: '2025-06-01', replyCount: 1 }] }],
    });
    expect(result.execution).toMatchObject({
      threadCandidates: 1,
      blocked: 1,
      cohortComplete: false,
    });
  });
  it('preserves dated query order, denial context, authorization dedupe and immutable saved plans', async () => {
    const inputs = {
      opportunities: [{ Id: profile.opportunityId, StageName: 'IA Requested' }],
      profiles: [
        {
          ...profile,
          opportunityName: ' Synthetic "Client" ',
          authorizationNumbers: ['Auth-1', 'auth-1'],
          searchPathways: { directIdentifiers: { authorizationNumbers: ['Auth-2'] } },
        },
      ],
      auths: [],
      authReviews: [],
      asOf: cutoff,
    };
    const plan = buildSlackSweepPlan(inputs, 'synthetic-run', cutoff);
    expect(plan.targets[0]?.queries).toEqual([
      {
        tier: 'Direct',
        label: 'Exact client name',
        query: '"Synthetic Client" after:2026-01-01 before:2026-01-11',
      },
      {
        tier: 'Direct',
        label: 'Opportunity ID',
        query: 'synthetic-client after:2026-01-01 before:2026-01-11',
      },
      {
        tier: 'Context',
        label: 'Authorization number',
        query: '"Auth-1" after:2026-01-01 before:2026-01-11',
      },
      {
        tier: 'Context',
        label: 'Authorization number',
        query: '"Auth-2" after:2026-01-01 before:2026-01-11',
      },
    ]);
    await Promise.all([
      write('opportunity_rows.json', inputs.opportunities),
      write('identity_profile_rows.json', inputs.profiles),
      write('auth_rows.json', []),
      write('authorization_review_rows.json', []),
      write('run_manifest.json', { runId: 'synthetic-run', startedAt: cutoff }),
    ]);
    const result = await call('review:slack-plan');
    expect(await readPrivateJson(path.join(root, 'slack_full_sweep_plan.json'))).toEqual(plan);
    vi.setSystemTime(new Date('2026-01-12'));
    expect(
      (await runSlackPlanningCommand('review:slack-plan', [], { SLA_RUN_DIR: root })).stdout
    ).toBe(result.stdout);
    await write('identity_profile_rows.json', [
      { ...profile, opportunityName: 'Changed synthetic name' },
    ]);
    await expect(call('review:slack-plan')).rejects.toThrow('differs');
    await write('publication-readback.json', {});
    await expect(call('review:slack-plan')).rejects.toThrow('immutable');
  }, 30_000);
  it('preserves optional query defaults, stage fallback and existing malformed identity failures', () => {
    const inputs = {
      opportunities: [{ Id: 'synthetic' }],
      profiles: [{ opportunityId: 'synthetic', opportunityName: '', stage: 'IA Scheduled' }],
      auths: [],
      authReviews: [],
      asOf: cutoff,
    };
    expect(buildSlackSweepPlan(inputs, undefined, cutoff).targets[0]).toMatchObject({
      stage: 'IA Scheduled',
      searchWindow: null,
      queries: [{ query: 'synthetic' }],
    });
    expect(() =>
      buildSlackSweepPlan(
        {
          ...inputs,
          profiles: [
            { ...inputs.profiles[0], opportunityId: 'synthetic', authorizationNumbers: [1] },
          ],
        },
        '',
        ''
      )
    ).toThrow('string matching');
    expect(() => buildSlackSweepPlan({ ...inputs, profiles: [] }, '', '')).toThrow('cohort');
  });
  it('retains exact/name assignment, last-record dedupe and prior-message provenance without requiring nonexistent replies', async () => {
    const priorMessage = {
      channelId: 'synthetic-channel',
      threadTs: '100.000000',
      text: 'Earlier synthetic context',
      metadata: { retained: true },
    };
    const merged = merge({
      exactRows: [
        {
          ...exact,
          opportunityId: 'not-in-cohort',
          opportunityName: 'Sýnthetic Client',
          records: [{ ...record, text: 'superseded' }],
        },
      ],
      pageTwoRecords: [record],
      priorRows: [
        {
          opportunityId: profile.opportunityId,
          messages: [priorMessage, priorMessage],
          events: ['retained'],
        },
        { name: 'unrelated', messages: 'unused' },
      ],
    });
    expect(merged.merged[0]).toMatchObject({
      blocked: false,
      searched: true,
      candidateCount: 1,
      threadCandidates: 0,
      records: [{ text: record.text, replyCount: 0 }],
      messages: [priorMessage],
      events: ['retained'],
    });
    expect(merged.execution).toMatchObject({ cohortComplete: true, unassignedPriorRows: 1 });
    await Promise.all([
      write('identity_profile_rows.json', [profile]),
      write('slack_full_sweep_exact_name.json', [{ ...exact, records: [record] }]),
      write('run_manifest.json', { startedAt: cutoff }),
    ]);
    expect(JSON.parse((await call('review:slack-merge')).stdout)).toMatchObject({
      cohortComplete: true,
      recordsRetrieved: 1,
    });
    expect(await readPrivateJson(path.join(root, 'slack_rows.json'))).toMatchObject([
      { opportunityId: profile.opportunityId, blocked: false },
    ]);
  }, 30_000);
  it('keeps unknown current reply coverage blocked until a counted thread is captured', () => {
    const unknown = { ...record, replyCount: undefined };
    const missing = merge({ exactRows: [{ ...exact, records: [unknown] }] });
    expect(missing.merged[0]).toMatchObject({
      blocked: true,
      threadCandidates: 1,
      error: 'One or more current-story Slack threads were not expanded.',
      records: [
        {
          replyCount: null,
          threadError:
            'Slack reply coverage is unknown; a counted message/thread capture is required.',
        },
      ],
    });
    const thread = {
      channelId: record.channelId,
      messageTs: record.messageTs,
      text: '=== THREAD REPLIES (0 total) ===',
    };
    expect(
      merge({ exactRows: [{ ...exact, records: [unknown] }], threadRows: [thread] }).merged[0]
    ).toMatchObject({ blocked: false, threadsRetrieved: 1 });
    expect(() =>
      merge({ exactRows: [{ ...exact, records: [{ ...record, reply_count: 2 }] }] })
    ).toThrow('conflicting');
    expect(
      merge({ exactRows: [{ ...exact, records: [{ ...unknown, time: '2020-01-01' }] }] }).merged[0]
        ?.blocked
    ).toBe(false);
  });
  it('preserves missing/duplicate/search failures and does not hide unassigned source rows', () => {
    const cases = [
      { exactRows: [], error: 'missing' },
      { exactRows: [exact, exact], error: 'More than one' },
      {
        exactRows: [{ ...exact, blocked: true, error: 'synthetic source failure' }],
        error: 'synthetic source failure',
      },
      { exactRows: [{ ...exact, paginationComplete: false }], error: 'complete pagination' },
    ];
    for (const item of cases) {
      const result = merge({ exactRows: item.exactRows });
      expect(result.merged[0]?.error).toContain(item.error);
      expect(result.execution.cohortComplete).toBe(false);
    }
    expect(
      merge({
        exactRows: [exact, { opportunityName: 'unrelated' }],
        pageTwoRecords: [{ opportunityName: 'unrelated' }],
      }).execution
    ).toMatchObject({ cohortComplete: false, unassignedExactRows: 1, unassignedPageTwoRecords: 1 });
    expect(
      merge({
        identityRows: [profile, { ...profile, opportunityId: 'second' }],
        exactRows: [{ opportunityName: profile.opportunityName }],
      }).execution
    ).toMatchObject({ unassignedExactRows: 1, blocked: 2 });
    expect(
      merge({ identityRows: [{ opportunityId: '', opportunityName: '' }] }).execution.blocked
    ).toBe(1);
  });
  it('uses the original fallback story window and preserves missing-file defaults', async () => {
    const result = merge({
      identityRows: [{ ...profile, stageEntryDate: undefined }],
      exactRows: [
        {
          ...exact,
          records: [{ ...record, replyCount: undefined, time: 'Jan 9, 2026 12:00 EST' }],
        },
      ],
    });
    expect(result.merged[0]?.blocked).toBe(true);
    expect(JSON.parse((await call('review:slack-merge')).stdout)).toMatchObject({
      opportunities: 0,
      cohortComplete: true,
    });
    await expect(runSlackPlanningCommand('review:slack-plan', [], {})).rejects.toThrow('required');
    await expect(call('wrong')).rejects.toThrow('Unknown');
  }, 30_000);
});
