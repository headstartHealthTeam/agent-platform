import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildIdentityProfile } from './identity-profile.js';
import { sha256Json } from './json-fingerprint.js';
import { verifyDenialContext } from './slack-denial-context.js';
import type { DenialContextInputs, DenialMessage } from './slack-denial-context.js';
import { denialContextPublicationCheck } from './slack-denial-publication.js';
import { denialContextRequirements } from './slack-denial-requirements.js';
import type { DenialRequirementInputs } from './slack-denial-requirements.js';
import { readDenialContextCoverage } from './slack-denial-storage.js';
import { materializeSlackSearchCapture } from './slack-search-capture.js';
import type { SlackSearchPlan, SlackSearchRow } from './slack-search-capture.js';
import { normalizeSlackThread } from './slack-thread.js';

const asOf = '2026-09-01T12:00:00.000Z';
function inputs(): DenialRequirementInputs {
  return {
    asOf,
    opportunities: [{ Id: 'synthetic-opp', StageName: 'IA Requested' }],
    profiles: [
      {
        ...buildIdentityProfile({
          opportunityId: 'synthetic-opp',
          opportunityName: 'Synthetic Client',
          payer: 'Synthetic Payer',
          authorizationNumbers: ['SYNTHETIC-AUTH'],
        }),
        knownNameVariants: ['Synthetic C'],
        providers: [{ name: 'Synthetic Provider' }],
        providerIdentity: { names: ['Synthetic Provider Alias'] },
        practice: { name: 'Synthetic Practice' },
        searchWindow: { fromDate: '2026-08-01', toDate: '2026-09-01' },
      },
    ],
    auths: [
      {
        Id: 'synthetic-auth',
        Client_Opportunity_Record__c: 'synthetic-opp',
        Authorization_Type__c: 'Initial',
        Insurance_Determination__c: 'Denied',
        Auth_Status__c: 'Denied',
        Master_Submission_Date__c: '2026-08-10',
        CreatedDate: '2026-08-10T00:00:00Z',
        LastModifiedDate: '2026-08-20T00:00:00Z',
      },
    ],
    authReviews: [],
  };
}
const message = {
  channel: { id: 'synthetic-channel' },
  ts: '1788220800.000001',
  text: 'Synthetic denial context',
  reply_count: 0,
};
type DenialFixture = Omit<
  DenialContextInputs,
  'plan' | 'capture' | 'searchRows' | 'mergedRows' | 'threadRows'
> & {
  plan: SlackSearchPlan;
  capture: {
    version: number;
    runId: string;
    asOf: string;
    collectedAt: string;
    planHash: string;
    scopeHash: string;
    accessVerified: boolean;
    pages: unknown[];
  };
  searchRows: SlackSearchRow[];
  mergedRows: (Omit<SlackSearchRow, 'records'> & { records: DenialMessage[] })[];
  threadRows: readonly DenialMessage[];
};
function fixture(
  records: readonly unknown[] = [],
  threads: readonly DenialMessage[] = [],
  input = inputs()
): DenialFixture {
  const requirements = denialContextRequirements(input);
  const plan = {
    scope: ['public channels', 'private channels', 'group DMs', 'DMs'],
    targets: requirements.map((r) => ({ opportunityId: r.opportunityId, queries: [...r.queries] })),
  };
  const capture = {
    version: 1,
    runId: 'synthetic-run',
    asOf,
    collectedAt: '2026-09-01T12:01:00Z',
    planHash: sha256Json(plan),
    scopeHash: sha256Json(plan.scope),
    accessVerified: true,
    pages: plan.targets.flatMap((t) =>
      t.queries.map((q) => ({
        opportunityId: t.opportunityId,
        query: q.query,
        pageNumber: 1,
        requestCursor: '',
        complete: true,
        response: {
          ok: true,
          messages: { matches: records },
          response_metadata: { next_cursor: '' },
        },
      }))
    ),
  };
  const searchRows = materializeSlackSearchCapture({ plan, capture });
  const mergedRows = searchRows.map((row) => ({
    ...row,
    records: row.records.map((record) => {
      const thread = normalizeSlackThread(
        threads.find((t) => t.channelId === record.channelId && t.messageTs === record.messageTs),
        record.replyCount ?? 0,
        { sourceCutoff: asOf }
      );
      return {
        ...record,
        threadExpanded: thread.complete,
        threadText: thread.text,
        threadCompletionEvidence: thread.complete ? thread.completionEvidence : undefined,
      };
    }),
  }));
  return {
    requirements,
    plan,
    capture,
    searchRows,
    mergedRows,
    threadRows: threads,
    asOf,
    runId: capture.runId,
  };
}

describe('approved denial-context coverage', () => {
  it('composes real identity profiles into broad identity searches, not payer-keyword restrictions', () => {
    const [requirement] = denialContextRequirements(inputs());
    expect(requirement?.required).toBe(true);
    for (const term of [
      'synthetic client',
      'synthetic c',
      'synthetic-opp',
      'SYNTHETIC-AUTH',
      'Synthetic Provider',
      'Synthetic Provider Alias',
      'Synthetic Practice',
    ]) {
      expect(
        requirement?.queries.some(
          (q) => q.query === `in:C083BNXBH6F "${term}" after:2026-08-01 before:2026-09-02`
        )
      ).toBe(true);
    }
    expect(requirement?.payerRefinements).toEqual(['Synthetic Payer']);
    expect(requirement?.queries.some((q) => q.query.includes('"Synthetic Payer"'))).toBe(false);
    expect(() => denialContextRequirements({ ...inputs(), profiles: [] })).toThrow(/cohort/);
    expect(() => denialContextRequirements({ ...inputs(), asOf: 'invalid' })).toThrow(
      /structured inputs/
    );
    expect(() =>
      denialContextRequirements({ ...inputs(), profiles: [{ opportunityId: 'synthetic-opp' }] })
    ).toThrow(/cutoff/);
  });

  it('binds only the selected standalone Review number and leaves other stages not applicable', () => {
    const input = inputs();
    const base = input.auths[0];
    if (!base) throw new Error('Missing synthetic source');
    for (const phase of ['Initial', 'Treatment']) {
      const requirements = denialContextRequirements({
        ...input,
        auths: [],
        opportunities: [
          { Id: 'synthetic-opp', StageName: phase === 'Initial' ? 'IA Requested' : 'TA Requested' },
        ],
        authReviews: [
          {
            ...base,
            Id: 'selected-review',
            Authorization__c: null,
            Authorization_Type__c: phase,
            Authorization_Number__c: 'SYNTHETIC-REVIEW-ONLY',
          },
          {
            ...base,
            Id: 'other-client',
            Client_Opportunity_Record__c: 'other',
            Authorization_Number__c: 'EXCLUDED',
          },
        ],
      });
      expect(requirements[0]?.queries.some((q) => q.query.includes('SYNTHETIC-REVIEW-ONLY'))).toBe(
        true
      );
      expect(requirements[0]?.queries.some((q) => q.query.includes('EXCLUDED'))).toBe(false);
    }
    for (const variant of [
      { ...input, auths: [] },
      { ...input, opportunities: [{ Id: 'synthetic-opp', StageName: 'IA Scheduled' }] },
    ]) {
      const requirements = denialContextRequirements(variant);
      expect(verifyDenialContext({ requirements, runId: 'synthetic-run', asOf }).applicable).toBe(
        0
      );
    }
  });

  it('accepts terminal empty results and ignores post-cutoff messages without additional reads', () => {
    expect(verifyDenialContext(fixture())).toMatchObject({
      applicable: 1,
      complete: 1,
      incomplete: 0,
    });
    expect(
      verifyDenialContext(fixture([{ ...message, ts: '1788393600.000001', reply_count: 3 }]))
    ).toMatchObject({ complete: 1, rows: [{ recordCount: 0 }] });
    expect(verifyDenialContext(fixture([message])).complete).toBe(1);
  });

  it('detects missing plans, raw pages, exact derived rows and merged evidence independently', () => {
    const data = fixture([message]);
    expect(() =>
      verifyDenialContext({ ...data, plan: { targets: [{ opportunityId: 'synthetic-opp' }] } })
    ).toThrow(/consumed denial-context artifact rows/);
    const variants = [
      { ...data, plan: null },
      { ...data, capture: null },
      { ...data, capture: { ...data.capture, pages: [] } },
      { ...data, capture: { ...data.capture, runId: 'other' } },
      { ...data, capture: { ...data.capture, asOf: '2026-09-02T00:00:00Z' } },
      { ...data, searchRows: [] },
      { ...data, mergedRows: [] },
      { ...data, mergedRows: data.mergedRows.map((row) => ({ ...row, records: [] })) },
      {
        ...data,
        mergedRows: data.mergedRows.map((row) => ({
          ...row,
          records: row.records.map((record) => ({ ...record, text: 'Changed' })),
        })),
      },
    ];
    for (const variant of variants) expect(verifyDenialContext(variant).incomplete).toBe(1);
  });

  it('requires retained complete thread evidence for unknown or positive reply counts', () => {
    const thread = {
      channelId: message.channel.id,
      messageTs: message.ts,
      text: '=== THREAD REPLIES (1 total) ===\n--- Reply 1 of 1 ---\nSynthetic explanation.',
    };
    const data = fixture([{ ...message, reply_count: 1 }], [thread]);
    expect(verifyDenialContext(data).complete).toBe(1);
    for (const threads of [[], [thread, thread], [{ ...thread, text: 'Incomplete' }]]) {
      expect(verifyDenialContext({ ...data, threadRows: threads }).incomplete).toBe(1);
    }
    expect(verifyDenialContext(fixture([{ ...message, reply_count: undefined }])).incomplete).toBe(
      1
    );
  });

  it('preserves partial publication only when every missing required row is explicitly marked', () => {
    const data = fixture();
    const coverage = verifyDenialContext({ ...data, capture: null });
    const headers = ['Salesforce', 'Ready to Copy', 'Evidence Status', 'Why Review Needed'];
    const row = [
      'https://synthetic.invalid/Opportunity/synthetic-opp/view',
      'Blocked',
      'Blocked',
      'Required denial-context coverage is incomplete.',
    ];
    const source = {
      opportunityId: 'synthetic-opp',
      source: 'Slack',
      required: true,
      status: 'Blocked',
      detail: 'Required denial-context coverage is incomplete.',
    };
    const check = (rows = [row], sources = [source]): boolean =>
      denialContextPublicationCheck({
        coverage,
        workbook: { sheets: { 'Review Queue': [headers, ...rows] } },
        sourceStatuses: sources,
      }).passed;
    expect(check()).toBe(true);
    expect(check([], [source])).toBe(false);
    expect(check([row, row])).toBe(false);
    expect(check([row], [])).toBe(false);
    expect(check([row], [{ ...source, required: false }])).toBe(false);
    for (const ready of ['Yes', 'Review'])
      expect(check([[row[0] ?? '', ready, 'Blocked', row[3] ?? '']])).toBe(false);
    expect(check([[row[0] ?? '', 'Blocked', 'Blocked', 'Unrelated gap']])).toBe(false);
  });

  it('recomputes private coverage without trusting a success receipt or modifying saved bytes', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'intake-denial-'));
    const input = inputs();
    const data = fixture();
    const write = async (name: string, value: unknown): Promise<void> => {
      await fs.writeFile(path.join(directory, name), JSON.stringify(value), { mode: 0o600 });
    };
    const files = new Map<string, unknown>([
      ['run_manifest.json', { runId: data.runId, startedAt: asOf }],
      ['opportunity_rows.json', input.opportunities],
      ['identity_profile_rows.json', input.profiles],
      ['auth_rows.json', input.auths],
      ['authorization_review_rows.json', input.authReviews],
      ['slack_full_sweep_plan.json', data.plan],
      ['slack_search_capture.json', data.capture],
      ['slack_full_sweep_exact_name.json', data.searchRows],
      ['slack_rows.json', data.mergedRows],
      ['slack_denial_coverage.json', { complete: 999 }],
    ]);
    try {
      for (const [name, value] of files) await write(name, value);
      expect(await readDenialContextCoverage(directory)).toEqual(verifyDenialContext(data));
      for (const [name, value] of files)
        expect(await fs.readFile(path.join(directory, name), 'utf8')).toBe(JSON.stringify(value));
      await write('slack_full_sweep_threads.json', null);
      expect(await readDenialContextCoverage(directory)).toMatchObject({
        complete: 1,
        threadRowsHash: sha256Json(null),
      });
      const noReplies = fixture([message]);
      await write('slack_search_capture.json', noReplies.capture);
      await write('slack_full_sweep_exact_name.json', noReplies.searchRows);
      await write('slack_rows.json', noReplies.mergedRows);
      expect(await readDenialContextCoverage(directory)).toMatchObject({
        complete: 1,
        threadRowsHash: sha256Json(null),
      });
      for (const invalidPlan of [false, 'invalid-plan']) {
        await write('slack_full_sweep_plan.json', invalidPlan);
        expect((await readDenialContextCoverage(directory)).incomplete).toBe(1);
      }
      await write('slack_full_sweep_plan.json', data.plan);
      await write('slack_search_capture.json', { ...data.capture, pages: [] });
      expect((await readDenialContextCoverage(directory)).incomplete).toBe(1);
      await write('slack_search_capture.json', ['invalid-capture']);
      expect((await readDenialContextCoverage(directory)).incomplete).toBe(1);
      await fs.unlink(path.join(directory, 'slack_search_capture.json'));
      expect((await readDenialContextCoverage(directory)).incomplete).toBe(1);
      await write('run_manifest.json', {});
      await expect(readDenialContextCoverage(directory)).rejects.toThrow(/manifest/);
      await write('run_manifest.json', { runId: data.runId, startedAt: asOf });
      await write('identity_profile_rows.json', 'invalid');
      await expect(readDenialContextCoverage(directory)).rejects.toThrow(/structured inputs/);
      await write('identity_profile_rows.json', input.profiles);
      await write('slack_rows.json', 'invalid');
      await expect(readDenialContextCoverage(directory)).rejects.toThrow(
        /consumed denial-context artifact rows/
      );
      await write('opportunity_rows.json', [{ Id: 'synthetic-opp', StageName: 'IA Scheduled' }]);
      await write('slack_full_sweep_plan.json', 'unused-plan');
      await write('slack_full_sweep_threads.json', { unused: true });
      expect(await readDenialContextCoverage(directory)).toMatchObject({
        applicable: 0,
        complete: 0,
        incomplete: 0,
        rows: [],
        planHash: sha256Json('unused-plan'),
        mergedRowsHash: sha256Json('invalid'),
        threadRowsHash: sha256Json({ unused: true }),
      });
      await fs.writeFile(path.join(directory, 'slack_rows.json'), '{invalid-json');
      await expect(readDenialContextCoverage(directory)).rejects.toThrow(SyntaxError);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
