import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type {
  ArtifactWorkbook,
  ArtifactWorkbookProvider,
} from '@headstart-health/artifact-workbook';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildDelayHistory, renderDelayHistory } from './delay-history.js';
import { sha256Json } from './json-fingerprint.js';
import { readPrivateJson } from './private-run-storage.js';
import { auditSavedIntakeReport, validateSavedIntakeReport } from './report-validation.js';

const runId = 'synthetic-run';
const cutoff = '2026-09-24T14:00:00.000Z';
const now = (): Date => new Date(cutoff);
const opportunityId = 'synthetic-opportunity';
const baseline = {
  'Opportunity Name': 'Synthetic Opportunity',
  Salesforce: `https://synthetic.invalid/Opportunity/${opportunityId}/view`,
  Stage: '97151 Started - Pending Treatment Plan',
  'Last Substantive Update Date': '2026-09-04',
  'Suggested SLA Summary':
    '9/4: Supporting assessments are complete while treatment-plan drafting continues.',
  'In-Depth Summary':
    'The initial assessment phase is complete. Supporting assessments were confirmed on 9/4. Treatment-plan drafting remains underway. No payer submission is yet confirmed.',
  'Suggested Action':
    'No separate action is needed for the completed assessments; continue monitoring treatment-plan submission.',
  'Action Type': 'No Action',
  'Action Owner': 'Synthetic CSM',
  'Ready to Copy': 'Review',
  'Why Review Needed': 'The latest substantive update should be reconfirmed.',
  'Evidence Status': 'Partial',
};
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => fs.rm(directory, { recursive: true }))
  );
});
async function write(directory: string, name: string, value: unknown): Promise<void> {
  await fs.writeFile(path.join(directory, name), JSON.stringify(value));
}
function workbookValues(overrides: Readonly<Record<string, unknown>> = {}): unknown {
  const row = { ...baseline, ...overrides };
  return {
    runId,
    sheets: {
      'Review Queue': [Object.keys(row), Object.values(row)],
      'On-Hold Review': [Object.keys(row)],
    },
  };
}
async function fixture(overrides: Readonly<Record<string, unknown>> = {}): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'intake-report-validation-'));
  directories.push(directory);
  for (const [name, value] of Object.entries({
    'run_manifest.json': { runId, startedAt: cutoff, expectedRows: 1, processedRows: 1 },
    'workbook-values.json': workbookValues(overrides),
    'reviewer_state.json': { capturedAt: '2020-01-01', rows: [] },
    'opportunity_rows.json': [
      { Id: opportunityId, StageName: '97151 Started - Pending Treatment Plan' },
    ],
    'identity_profile_rows.json': [
      { opportunityId, searchWindow: { fromDate: '2026-09-01', toDate: '2026-09-24' } },
    ],
    'auth_rows.json': [],
    'authorization_review_rows.json': [],
    'source_status_rows.json': [],
  }))
    await write(directory, name, value);
  await fs.writeFile(
    path.join(directory, 'intake_sla_review_queue.xlsx'),
    'synthetic-provider-input'
  );
  return directory;
}
function workbookProvider(formulaErrors = ''): {
  provider: ArtifactWorkbookProvider;
  open: ReturnType<typeof vi.fn<(file: string) => Promise<ArtifactWorkbook>>>;
  render: ReturnType<typeof vi.fn<() => Promise<Uint8Array>>>;
} {
  const render = vi.fn(async () => new Uint8Array([1, 2, 3]));
  const workbook: ArtifactWorkbook = {
    addWorksheet: () => {
      throw new Error('Validation must not create sheets');
    },
    worksheet: () => {
      throw new Error('Validation must not access cells');
    },
    inspect: async (request) => (request.kind === 'match' ? formulaErrors : '{"kind":"sheet"}'),
    render,
    saveXlsx: async () => {
      throw new Error('Validation must not overwrite workbook');
    },
  };
  const open = vi.fn(async (_file: string) => workbook);
  return {
    provider: {
      create: (): ArtifactWorkbook => {
        throw new Error('Validation must not create workbooks');
      },
      openXlsx: open,
    },
    open,
    render,
  };
}

describe('saved report audit and validation composition', () => {
  it('recomputes quality and passes a legitimate Review without inventing a new reviewer-age gate', async () => {
    const directory = await fixture();
    await write(directory, 'quality-audit.json', { passed: false });
    const original = await fs.readFile(path.join(directory, 'workbook-values.json'), 'utf8');
    const vendor = workbookProvider();
    expect(await validateSavedIntakeReport(vendor.provider, directory, now)).toEqual({
      passed: true,
      runId,
      expectedRows: 1,
      processedRows: 1,
      qualityAudit: true,
      workbookVerification: true,
      denialContext: { passed: true, applicable: 0, complete: 0, blocked: 0, unmarked: 0 },
    });
    expect(vendor.open).toHaveBeenCalledWith(path.join(directory, 'intake_sla_review_queue.xlsx'));
    expect(vendor.render).toHaveBeenCalledTimes(16);
    expect(await readPrivateJson(path.join(directory, 'quality-audit.json'))).toMatchObject({
      passed: true,
      auditedAt: cutoff,
      rowCount: 1,
    });
    expect(await fs.readFile(path.join(directory, 'workbook-values.json'), 'utf8')).toBe(original);
  });
  it('stops after a recomputed Critical audit and does not trust a stale success', async () => {
    const directory = await fixture({ 'Suggested SLA Summary': '' });
    await write(directory, 'quality-audit.json', { passed: true });
    const vendor = workbookProvider();
    await expect(validateSavedIntakeReport(vendor.provider, directory, now)).rejects.toThrow(
      'quality audit failed'
    );
    expect(vendor.open).not.toHaveBeenCalled();
    const audit = await readPrivateJson(path.join(directory, 'quality-audit.json'));
    expect(audit).toMatchObject({ passed: false });
    expect(audit).toHaveProperty(
      'findings',
      expect.arrayContaining([
        expect.objectContaining({ rule: 'missing-summary', severity: 'Critical' }),
      ])
    );
  });
  it('keeps Warning findings nonblocking and stops on formula errors before later note checks', async () => {
    const directory = await fixture({
      'Suggested SLA Summary': '9/4: Treatment plan remains underway',
    });
    await write(directory, 'note_adjudications.json', { changed: true });
    const vendor = workbookProvider('{"kind":"match","value":"#REF!"}');
    await expect(validateSavedIntakeReport(vendor.provider, directory, now)).rejects.toThrow(
      'workbook verification failed'
    );
    expect(vendor.render).toHaveBeenCalledTimes(16);
    expect(await readPrivateJson(path.join(directory, 'quality-audit.json'))).toMatchObject({
      passed: true,
      counts: { Warning: 1 },
    });
    expect(await readPrivateJson(path.join(directory, 'workbook-verification.json'))).toMatchObject(
      { passed: false, formulaErrorCount: 1 }
    );
  });
  it('rejects changed adjudication inputs only after the audit and workbook stages', async () => {
    const directory = await fixture();
    await write(directory, 'note_adjudications.json', { changed: true });
    const vendor = workbookProvider();
    await expect(validateSavedIntakeReport(vendor.provider, directory, now)).rejects.toThrow(
      'Note adjudication inputs changed after build'
    );
    expect(vendor.render).toHaveBeenCalledTimes(16);
  });
  it('retains count equality as a final failure without changing the other acceptance results', async () => {
    const directory = await fixture();
    await write(directory, 'run_manifest.json', {
      runId,
      startedAt: cutoff,
      expectedRows: 2,
      processedRows: 1,
    });
    expect(
      await validateSavedIntakeReport(workbookProvider().provider, directory, now)
    ).toMatchObject({
      passed: false,
      qualityAudit: true,
      workbookVerification: true,
      expectedRows: 2,
      processedRows: 1,
    });
  });
  it.each([
    'run_manifest.json',
    'workbook-values.json',
    'intake_sla_review_queue.xlsx',
    'reviewer_state.json',
  ])('requires the original %s artifact before any validation side effects', async (name) => {
    const directory = await fixture();
    await fs.unlink(path.join(directory, name));
    const vendor = workbookProvider();
    await expect(validateSavedIntakeReport(vendor.provider, directory, now)).rejects.toThrow(name);
    expect(vendor.open).not.toHaveBeenCalled();
  });
  it('permits the exact marked denial-context exception and rejects an unmarked one', async () => {
    const directory = await fixture({
      'Ready to Copy': 'Blocked',
      'Evidence Status': 'Blocked',
      'Why Review Needed': 'Required denial-context coverage is incomplete.',
    });
    await write(directory, 'opportunity_rows.json', [
      { Id: opportunityId, StageName: 'TA Requested' },
    ]);
    await write(directory, 'auth_rows.json', [
      {
        Id: 'synthetic-auth',
        Client_Opportunity_Record__c: opportunityId,
        Authorization_Type__c: 'Treatment',
        Insurance_Determination__c: 'Denied',
        LastModifiedDate: '2026-09-22',
      },
    ]);
    await write(directory, 'source_status_rows.json', [
      {
        opportunityId,
        source: 'Slack',
        required: true,
        status: 'Blocked',
        detail: 'Required denial-context coverage is incomplete.',
      },
    ]);
    expect(
      await validateSavedIntakeReport(workbookProvider().provider, directory, now)
    ).toMatchObject({
      passed: true,
      denialContext: { applicable: 1, complete: 0, blocked: 1, unmarked: 0 },
    });
    await write(directory, 'source_status_rows.json', []);
    expect(
      await validateSavedIntakeReport(workbookProvider().provider, directory, now)
    ).toMatchObject({ passed: false, denialContext: { blocked: 1, unmarked: 1 } });
  });
  it('accepts actual serialized delay history with omitted optional metadata and binds its complete bytes', async () => {
    const history = buildDelayHistory({
      opportunity: { id: opportunityId, slaCreatedDate: '2026-09-01' },
      story: {
        timeline: [
          {
            opportunityId,
            source: 'Synthetic',
            sourceRecordId: 'event',
            eventDate: '2026-09-04',
            substantive: true,
            matchQuality: 'Direct',
            relationship: 'Supports',
            text: 'Supporting assessments are complete.',
          },
        ],
      },
      asOf: cutoff,
    });
    const directory = await fixture({
      'In-Depth Summary': `${baseline['In-Depth Summary']}\n\nDelay history:\n${renderDelayHistory(history)}`,
    });
    const histories = [{ opportunityId, history }];
    await write(directory, 'delay_history_rows.json', histories);
    await write(directory, 'run_manifest.json', {
      runId,
      startedAt: cutoff,
      expectedRows: 1,
      processedRows: 1,
      delayHistory: { version: 1, rows: 1, artifactHash: sha256Json(histories) },
    });
    expect((await auditSavedIntakeReport(directory, now)).passed).toBe(true);
    await write(directory, 'delay_history_rows.json', []);
    expect((await auditSavedIntakeReport(directory, now)).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'delay-history-omission', severity: 'Critical' }),
      ])
    );
  });
  it('allows only absent optional audit artifacts, not malformed or unreadable ones', async () => {
    const directory = await fixture();
    await fs.unlink(path.join(directory, 'run_manifest.json'));
    expect((await auditSavedIntakeReport(directory, now)).passed).toBe(true);
    await write(directory, 'delay_history_rows.json', { invalid: true });
    await expect(auditSavedIntakeReport(directory, now)).rejects.toThrow(
      'Invalid saved delay history'
    );
    await fs.writeFile(path.join(directory, 'delay_history_rows.json'), '{broken');
    await expect(auditSavedIntakeReport(directory, now)).rejects.toBeInstanceOf(SyntaxError);
  });
});
