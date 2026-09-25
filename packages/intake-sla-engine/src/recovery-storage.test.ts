import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { isRecoveryCommand, runRecoveryCommand } from './cli-recovery.js';
import {
  createGenerationLedgerRow,
  GENERATION_LEDGER_HEADERS,
  generationLedgerRows,
} from './generation-ledger.js';
import { googleCellValue } from './google-publication-values.js';
import { sha256Json } from './json-fingerprint.js';
import { normalizePortalAuthCapture } from './portal-auth-capture.js';
import { readPrivateJson, writePrivateJson } from './private-run-storage.js';
import { publicationPlanHash } from './publication-plan.js';
import { verifyRecoveryInputs } from './recovery-input-verification.js';
import {
  initializeSavedCorrection,
  savePortalAuthCapture,
  savePostCutoffCapture,
  saveStructuredCorrectionDelta,
} from './recovery-storage.js';
import { materializeSlackSearchCapture } from './slack-search-capture.js';
import { STRUCTURED_CORRECTION_ARTIFACTS } from './structured-correction.js';

const RUN = 'correction';
const CUTOFF = '2026-01-10T16:00:00Z';
const CHECKED = '2026-01-10T17:00:00Z';
const LEDGER = 'generation_ledger_state.json';
const PROVENANCE = 'correction_provenance.json';
const INITIALIZATION = 'correction_initialization.json';
const MANIFEST = 'run_manifest.json';
const REFRESH = 'salesforce_cohort_refresh.json';
const PORTAL_INVENTORY = 'portal_auth_request_inventory.json';
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
async function directory(): Promise<string> {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'intake-recovery-')));
  roots.push(root);
  return root;
}
async function write(root: string, name: string, value: unknown): Promise<void> {
  await writePrivateJson(path.join(root, name), value);
}
function portalCapture(): object {
  return {
    version: 1,
    runId: RUN,
    asOf: CUTOFF,
    collectedAt: CHECKED,
    readOnly: true,
    accessVerified: true,
    complete: true,
    mode: 'api',
    endpoint: '/authrequest/admin/all-requests',
    method: 'GET',
    paginationComplete: true,
    records: [],
    expectedCount: 0,
  };
}
async function publishedBase(): Promise<string> {
  const base = await directory();
  const row = createGenerationLedgerRow({
    runId: 'base',
    opportunityId: 'opp',
    slaId: 'sla',
    generatedSummary: 'Synthetic',
    generatedAt: '2026-01-10T15:00:00Z',
  });
  const cells = generationLedgerRows([{ ...row, publicationStatus: 'Published' }]).at(1);
  if (!cells) throw new Error('Fixture cells missing');
  const expectedHash = sha256Json([
    cells.map(
      (cell, index) =>
        googleCellValue(cell, GENERATION_LEDGER_HEADERS.at(index)).userEnteredValue ?? null
    ),
  ]);
  const finalAssertions = [
    {
      id: 'ledger',
      title: 'Generation Ledger',
      kind: 'values',
      rowCount: 1,
      columnCount: GENERATION_LEDGER_HEADERS.length,
      expectedHash,
    },
  ];
  const payload = { requests: [] };
  const stages = [
    {
      id: 'stage',
      file: 'stage.json',
      alreadySatisfied: true,
      payloadHash: sha256Json(payload),
      calls: [{ file: 'call.json', payloadHash: sha256Json(payload) }],
      assertions: [],
    },
  ];
  const stageManifest = {
    runId: 'base',
    spreadsheetId: 'sheet',
    stages,
    finalAssertions,
    planHash: publicationPlanHash(stages, finalAssertions),
  };
  const artifacts = {
    'publication_stages_manifest.json': stageManifest,
    'publication-gate.json': {
      ...stageManifest,
      passed: true,
      evaluatedAt: '2026-01-10T15:00:00Z',
    },
    'publication_stage_readbacks.json': { ...stageManifest, stages: [] },
    'publication-readback.json': {
      ...stageManifest,
      complete: true,
      publicationStatus: 'Published',
      finalReadback: {
        captureVersion: 1,
        evidenceHash: 'a'.repeat(64),
        assertions: [{ id: 'ledger', actualHash: expectedHash }],
      },
    },
    [MANIFEST]: {
      runId: 'base',
      startedAt: '2026-01-10T15:00:00Z',
      expectedRows: 1,
      processedRows: 1,
    },
    [LEDGER]: [row],
    'stage.json': payload,
    'call.json': payload,
  };
  for (const [name, value] of Object.entries(artifacts)) await write(base, name, value);
  return base;
}
describe('saved recovery command composition', () => {
  it('saves exact Portal capture/inventory idempotently and detects derived or raw tampering', async () => {
    const root = await directory();
    const input = path.join(root, 'input.json');
    const raw = portalCapture();
    await write(root, 'input.json', raw);
    expect(await savePortalAuthCapture(root, input)).toEqual({
      complete: true,
      total: 0,
      active: 0,
      inactive: 0,
    });
    expect(await readPrivateJson(path.join(root, PORTAL_INVENTORY))).toEqual(
      normalizePortalAuthCapture(raw)
    );
    await savePortalAuthCapture(root, input);
    await verifyRecoveryInputs(root, RUN, CUTOFF);
    await write(root, PORTAL_INVENTORY, {
      ...normalizePortalAuthCapture(raw),
      counts: { total: 1 },
    });
    await expect(verifyRecoveryInputs(root, RUN, CUTOFF)).rejects.toThrow('Portal capture');
    await expect(savePortalAuthCapture(root, input)).rejects.toThrow('do not overwrite');
    await write(root, PORTAL_INVENTORY, normalizePortalAuthCapture(raw));
    await fs.unlink(path.join(root, 'portal_auth_request_capture.json'));
    await expect(verifyRecoveryInputs(root, RUN, CUTOFF)).rejects.toThrow('Portal capture');
  }, 30_000);
  it('initializes a distinct correction without modifying its published base and permits idempotent resume', async () => {
    const baseDirectory = await publishedBase();
    const runDirectory = await directory();
    const names = await fs.readdir(baseDirectory);
    const before = await Promise.all(
      names.map((name) => fs.readFile(path.join(baseDirectory, name), 'utf8'))
    );
    const input = { baseDirectory, runDirectory, runId: RUN, asOf: CUTOFF };
    expect(await initializeSavedCorrection(input)).toEqual({
      initialized: true,
      ledgerRows: 1,
      sourceRowsReused: 0,
    });
    expect(await initializeSavedCorrection(input)).toEqual({
      initialized: true,
      ledgerRows: 1,
      sourceRowsReused: 0,
    });
    await verifyRecoveryInputs(runDirectory, RUN, CUTOFF);
    expect(
      await Promise.all(names.map((name) => fs.readFile(path.join(baseDirectory, name), 'utf8')))
    ).toEqual(before);
    const state = await readPrivateJson(path.join(runDirectory, LEDGER));
    expect(state).toMatchObject([{ publicationStatus: 'Published' }]);
    await write(runDirectory, LEDGER, []);
    await expect(verifyRecoveryInputs(runDirectory, RUN, CUTOFF)).rejects.toThrow('ledger changed');
    await expect(initializeSavedCorrection(input)).rejects.toThrow('do not overwrite');
  }, 30_000);
  it('rejects reused, published and base-descendant directories and tampered stage calls', async () => {
    const baseDirectory = await publishedBase();
    const runDirectory = await directory();
    const input = { baseDirectory, runDirectory, runId: RUN, asOf: CUTOFF };
    await expect(
      initializeSavedCorrection({ ...input, runDirectory: baseDirectory })
    ).rejects.toThrow('Base run is immutable');
    await expect(
      initializeSavedCorrection({ ...input, runDirectory: path.join(baseDirectory, 'child') })
    ).rejects.toThrow('Base run is immutable');
    await write(runDirectory, 'existing.json', {});
    await expect(initializeSavedCorrection(input)).rejects.toThrow('not new');
    await fs.unlink(path.join(runDirectory, 'existing.json'));
    await write(runDirectory, 'publication-readback.json', {});
    await expect(initializeSavedCorrection(input)).rejects.toThrow('immutable');
    await fs.unlink(path.join(runDirectory, 'publication-readback.json'));
    await write(baseDirectory, 'call.json', { requests: [{ changed: true }] });
    await expect(initializeSavedCorrection(input)).rejects.toThrow('payload hash changed');
    await expect(fs.access(path.join(runDirectory, PROVENANCE))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  }, 30_000);
  it('requires complete correction markers but excludes current draft rows from its inherited-ledger hash', async () => {
    const root = await directory();
    const provenance = { runId: RUN, asOf: CUTOFF, ledgerHash: sha256Json([]) };
    await verifyRecoveryInputs(root, RUN, CUTOFF);
    await write(root, PROVENANCE, provenance);
    await expect(verifyRecoveryInputs(root, RUN, CUTOFF)).rejects.toThrow('incomplete');
    await write(root, INITIALIZATION, { ...provenance, complete: true });
    await write(root, LEDGER, [{ runId: RUN, synthetic: true }]);
    await verifyRecoveryInputs(root, RUN, CUTOFF);
    await expect(verifyRecoveryInputs(root, RUN, CHECKED)).rejects.toThrow('another cutoff');
    await write(root, LEDGER, [{ runId: 'prior' }]);
    await expect(verifyRecoveryInputs(root, RUN, CUTOFF)).rejects.toThrow('ledger changed');
    await fs.unlink(path.join(root, PROVENANCE));
    await expect(verifyRecoveryInputs(root, RUN, CUTOFF)).rejects.toThrow('incomplete');
  }, 30_000);
  it('reads every structured artifact and saves the exact bounded delta without copying sources', async () => {
    const before = await directory();
    const after = await directory();
    for (const name of STRUCTURED_CORRECTION_ARTIFACTS) {
      await write(before, name, []);
      await write(after, name, []);
    }
    await write(before, 'opportunity_rows.json', [{ Id: 'a' }, { Id: 'b' }]);
    await write(after, 'opportunity_rows.json', [{ Id: 'a' }]);
    await write(after, 'task_rows.json', [{ Id: 'task', owner: 'a' }]);
    expect(await saveStructuredCorrectionDelta(before, after)).toEqual({
      changedRecords: 2,
      affected: 1,
      removed: 1,
      unchanged: 0,
    });
    expect(
      await readPrivateJson(path.join(after, 'structured_correction_delta.json'))
    ).toMatchObject({ affected: ['a'], removed: ['b'] });
    await write(after, 'publication-readback.json', {});
    await expect(saveStructuredCorrectionDelta(before, after)).rejects.toThrow('immutable');
    await fs.unlink(path.join(after, 'publication-readback.json'));
    await write(after, 'task_rows.json', {});
    await expect(saveStructuredCorrectionDelta(before, after)).rejects.toThrow(
      'structured correction artifact'
    );
  }, 30_000);
  it('adds the complete post-cutoff disposition to the exact refreshed cohort while retaining metadata', async () => {
    const root = await directory();
    const refresh = {
      organizationId: 'org',
      isSandbox: false,
      queriedAt: CHECKED,
      changes: { stage: ['a'] },
      material: true,
      extra: { retained: true },
    };
    const capture = {
      organizationId: 'org',
      isSandbox: false,
      checkedAt: CHECKED,
      salesforceReadOnly: true,
      records: [{ Id: 'a', LastModifiedDate: '2026-01-10T16:30:00Z', StageName: 'IA Scheduled' }],
    };
    await write(root, MANIFEST, { startedAt: CUTOFF });
    await write(root, REFRESH, refresh);
    await write(root, 'input.json', capture);
    expect(await savePostCutoffCapture(root, path.join(root, 'input.json'))).toEqual({
      deferredRecords: 1,
      salesforceWrites: 0,
    });
    expect(await readPrivateJson(path.join(root, REFRESH))).toMatchObject({
      ...refresh,
      postCutoffDisposition: { runCutoff: CUTOFF, disposition: 'defer-to-next-run' },
    });
    for (const patch of [
      { organizationId: 'other' },
      { isSandbox: true },
      { checkedAt: CUTOFF },
      { records: [] },
    ]) {
      await write(root, REFRESH, refresh);
      await write(root, 'input.json', { ...capture, ...patch });
      await expect(savePostCutoffCapture(root, path.join(root, 'input.json'))).rejects.toThrow();
      expect(await readPrivateJson(path.join(root, REFRESH))).toEqual(refresh);
    }
  }, 30_000);
  it('recomputes Slack raw capture bindings and rejects changed or absent derived proof', async () => {
    const root = await directory();
    const plan = {
      scope: ['all'],
      targets: [{ opportunityId: 'opp', queries: [{ query: 'synthetic' }] }],
    };
    const capture = {
      version: 1,
      runId: RUN,
      asOf: CUTOFF,
      collectedAt: CHECKED,
      planHash: sha256Json(plan),
      scopeHash: sha256Json(plan.scope),
      accessVerified: true,
      pages: [],
    };
    const rows = materializeSlackSearchCapture({ plan, capture });
    await write(root, 'slack_full_sweep_plan.json', plan);
    await write(root, 'slack_search_capture.json', capture);
    await write(root, 'slack_full_sweep_exact_name.json', rows);
    await verifyRecoveryInputs(root, RUN, CUTOFF);
    await write(root, 'slack_full_sweep_exact_name.json', []);
    await expect(verifyRecoveryInputs(root, RUN, CUTOFF)).rejects.toThrow('Slack capture');
    await write(root, 'slack_full_sweep_exact_name.json', rows);
    await fs.unlink(path.join(root, 'slack_search_capture.json'));
    await expect(verifyRecoveryInputs(root, RUN, CUTOFF)).rejects.toThrow('Slack capture');
  }, 30_000);
  it('routes saved commands with sanitized failures and no credential/provider dependency', async () => {
    for (const command of [
      'review:portal-auth-capture',
      'review:correction-init',
      'review:structured-delta',
      'review:post-cutoff-capture',
    ]) {
      expect(isRecoveryCommand(command)).toBe(true);
      const result = await runRecoveryCommand(command, []);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toMatch(/FAILED/);
      expect(result.stderr).not.toMatch(/file:| at |secret/);
    }
    expect(isRecoveryCommand('other')).toBe(false);
    await expect(runRecoveryCommand('other', [])).rejects.toThrow('Unknown');
    const root = await directory();
    await write(root, 'input.json', portalCapture());
    expect(
      await runRecoveryCommand('review:portal-auth-capture', [
        '--run-dir',
        root,
        '--input',
        path.join(root, 'input.json'),
      ])
    ).toEqual({
      exitCode: 0,
      stdout: '{"complete":true,"total":0,"active":0,"inactive":0}\n',
      stderr: '',
    });
    await write(root, 'publication-readback.json', {});
    expect(
      (
        await runRecoveryCommand('review:portal-auth-capture', [
          '--run-dir',
          root,
          '--input',
          path.join(root, 'input.json'),
        ])
      ).exitCode
    ).toBe(1);
  }, 30_000);
});
