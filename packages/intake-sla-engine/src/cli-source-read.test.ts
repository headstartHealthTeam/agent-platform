import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  createGoogleAdcTokenProvider,
  GoogleReaderError,
} from '@headstart-health/google-read-transport';
import type * as GoogleTransport from '@headstart-health/google-read-transport';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runGoogleReadCommand, runProductionDriftCommand } from './cli-source-read.js';
import { sha256Json } from './json-fingerprint.js';
import { readPrivateJson, writePrivateJson } from './private-run-storage.js';
import { finalizePublication } from './publication-executor.js';
import { publicationPlanHash } from './publication-plan.js';
import { connectIntakeSalesforce } from './salesforce-reader.js';
import type * as SalesforceReader from './salesforce-reader.js';

vi.mock('@headstart-health/google-read-transport', async (original) => ({
  ...(await original<typeof GoogleTransport>()),
  createGoogleAdcTokenProvider: vi.fn(),
}));
vi.mock('./salesforce-reader.js', async (original) => ({
  ...(await original<typeof SalesforceReader>()),
  connectIntakeSalesforce: vi.fn(),
}));
vi.mock('./publication-executor.js', () => ({ finalizePublication: vi.fn() }));
let root: string;
const fetch = vi.fn<typeof globalThis.fetch>();
const sheet = 'synthetic-sheet';
const runId = 'synthetic-run';
function flags(action: string): string[] {
  return [
    '--action',
    action,
    '--run-dir',
    root,
    '--spreadsheet-id',
    sheet,
    '--config-dir',
    path.join(root, 'adc'),
    '--client-id-file',
    path.join(root, 'client.json'),
    '--expected-email',
    'operator@example.test',
  ];
}
async function write(name: string, value: unknown): Promise<void> {
  await writePrivateJson(path.join(root, name), value);
}
async function binding(
  extra: Readonly<Record<string, unknown>> = {},
  finalAssertions?: unknown
): Promise<void> {
  const assertions = [
    {
      id: 'values',
      kind: 'values',
      title: 'Review Queue',
      sheetId: 1,
      startRowIndex: 0,
      endRowIndex: 1,
      startColumnIndex: 0,
      endColumnIndex: 1,
      expectedHash: sha256Json([[{ stringValue: 'synthetic' }]]),
      ...extra,
    },
  ];
  const stages = [{ id: '02-review-queue', assertions }];
  const manifest = {
    runId,
    spreadsheetId: sheet,
    stages,
    planHash: publicationPlanHash(stages),
    finalAssertions,
  };
  await write('publication_stages_manifest.json', manifest);
  await write('publication-gate.json', { ...manifest, passed: true, evaluatedAt: '2020-01-01' });
}
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'intake-source-read-'));
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetch);
  vi.mocked(createGoogleAdcTokenProvider).mockReturnValue(async () => 'synthetic-token');
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await fs.rm(root, { recursive: true });
});
describe('source read command composition', () => {
  it('does not inspect unrelated stage/final fields or mask a target mismatch with gate failures', async () => {
    await binding({ dimension: null }, null);
    fetch.mockResolvedValueOnce(
      Response.json({
        spreadsheetId: sheet,
        sheets: [
          {
            properties: { sheetId: 1 },
            data: [{ rowData: [{ values: [{ userEnteredValue: { stringValue: 'synthetic' } }] }] }],
          },
        ],
      })
    );
    const stage = [...flags('stage'), '--stage-id', '02-review-queue'];
    expect((await runGoogleReadCommand(stage)).exitCode).toBe(0);
    const filter = { range: { sheetId: 1 } };
    await binding(
      {
        kind: 'basic-filter',
        startRowIndex: null,
        endRowIndex: null,
        startColumnIndex: null,
        endColumnIndex: null,
        rowCount: { unused: true },
        dimension: null,
        blankBooleanCellsAsFalse: 'unused',
        expectedHash: sha256Json(filter),
      },
      null
    );
    fetch.mockResolvedValueOnce(
      Response.json({
        spreadsheetId: sheet,
        sheets: [{ properties: { sheetId: 1 }, basicFilter: filter }],
      })
    );
    expect((await runGoogleReadCommand(stage)).exitCode).toBe(0);
    expect(
      await readPrivateJson(path.join(root, 'publication_actual_02-review-queue.json'))
    ).toMatchObject({ assertions: [{ startRowIndex: null, basicFilter: filter }] });
    const wrong = [...stage, '--spreadsheet-id', 'wrong-target'];
    for (const gate of [null, { passed: false }, { passed: true, planHash: 'wrong' }]) {
      await write('publication-gate.json', gate);
      expect((await runGoogleReadCommand(wrong)).stderr).toContain('TARGET_MISMATCH');
    }
    await fs.unlink(path.join(root, 'publication-gate.json'));
    expect((await runGoogleReadCommand(wrong)).stderr).toContain('TARGET_MISMATCH');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('verifies actual filter metadata with the bound read-only adapter and saves its raw receipt', async () => {
    const response = {
      spreadsheetId: sheet,
      sheets: ['Review Queue', 'On-Hold Review'].map((title, index) => ({
        properties: { title, sheetId: index },
        basicFilter: { range: { sheetId: index } },
      })),
    };
    fetch.mockResolvedValueOnce(Response.json(response));
    const checked = await runGoogleReadCommand(flags('preflight'));
    expect(checked.exitCode).toBe(0);
    expect(JSON.parse(checked.stdout)).toMatchObject({ readOnly: true, queueFiltersVerified: 2 });
    expect(await readPrivateJson(path.join(root, 'google_reader_preflight.json'))).toMatchObject({
      response,
    });
    expect(fetch.mock.calls[0]?.[1]?.method).toBe('GET');
    expect(createGoogleAdcTokenProvider).toHaveBeenCalledWith(
      expect.objectContaining({ expectedEmail: 'operator@example.test' })
    );
    fetch.mockResolvedValueOnce(Response.json({ spreadsheetId: sheet, sheets: [] }));
    expect((await runGoogleReadCommand(flags('preflight'))).stderr).toContain(
      'FILTER_METADATA_MISSING'
    );
  });
  it('saves and verifies an exact stage sample after write-lease expiry; retains mismatching samples', async () => {
    await binding();
    const response = (value: string): Response =>
      Response.json({
        spreadsheetId: sheet,
        sheets: [
          {
            properties: { sheetId: 1 },
            data: [{ rowData: [{ values: [{ userEnteredValue: { stringValue: value } }] }] }],
          },
        ],
      });
    fetch.mockResolvedValueOnce(response('synthetic'));
    const args = [...flags('stage'), '--stage-id', '02-review-queue'];
    expect(JSON.parse((await runGoogleReadCommand(args)).stdout)).toEqual({
      stageId: '02-review-queue',
      readOnly: true,
      verifiedAssertions: 1,
    });
    fetch.mockResolvedValueOnce(response('mismatch'));
    expect((await runGoogleReadCommand(args)).exitCode).toBe(1);
    expect(
      await readPrivateJson(path.join(root, 'publication_actual_02-review-queue.json'))
    ).toMatchObject({
      assertions: [{ values: [[{ stringValue: 'mismatch' }]] }],
    });
    expect(fetch.mock.calls.every((call) => call[1]?.method === 'GET')).toBe(true);
  });
  it('routes final readback and stops invalid targets, stages, immutable runs and private failures', async () => {
    await binding();
    vi.mocked(finalizePublication).mockResolvedValue({ published: true, verifiedAssertions: 3 });
    expect(JSON.parse((await runGoogleReadCommand(flags('final'))).stdout)).toEqual({
      published: true,
      verifiedAssertions: 3,
    });
    expect(finalizePublication).toHaveBeenCalledWith(expect.objectContaining({ runDir: root }));
    expect((await runGoogleReadCommand(flags('stage'))).stderr).toContain('STAGE_REQUIRED');
    expect(
      (await runGoogleReadCommand([...flags('stage'), '--spreadsheet-id', 'another'])).stderr
    ).toContain('TARGET_MISMATCH');
    expect((await runGoogleReadCommand(flags('wrong'))).stderr).toContain('ARGUMENTS_REQUIRED');
    vi.mocked(createGoogleAdcTokenProvider).mockImplementationOnce(() => {
      throw new GoogleReaderError('GOOGLE_READER_ACCOUNT_MISMATCH', 403);
    });
    expect(JSON.parse((await runGoogleReadCommand(flags('preflight'))).stderr)).toMatchObject({
      code: 'GOOGLE_READER_ACCOUNT_MISMATCH',
      status: 403,
    });
    vi.mocked(createGoogleAdcTokenProvider).mockImplementationOnce(() => {
      throw new Error('private-value');
    });
    expect((await runGoogleReadCommand(flags('preflight'))).stderr).not.toContain('private-value');
    await write('publication-readback.json', {});
    expect((await runGoogleReadCommand(flags('preflight'))).exitCode).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('uses the verified Salesforce reader and private baseline, preserving drift exit status and receipt', async () => {
    const baseline = { apex: {}, flows: {}, slaMetadata: [], capturedAt: null };
    await write('baseline.json', baseline);
    const organization = { orgId: `00D${'0'.repeat(11)}1AAA`, isSandbox: false };
    vi.mocked(connectIntakeSalesforce).mockResolvedValue({
      organization,
      query: async () => [],
      organizationPreflight: () => {
        throw new Error('Unexpected synthetic preflight');
      },
    });
    const env = {
      SF_TARGET_ORG: 'synthetic-target',
      SF_EXPECTED_ORG_ID: organization.orgId,
      SLA_PRODUCTION_FINGERPRINT_PATH: path.join(root, 'baseline.json'),
    };
    const args = ['--run-dir', root];
    expect((await runProductionDriftCommand(args, env)).exitCode).toBe(0);
    expect(await readPrivateJson(path.join(root, 'production-drift-check.json'))).toMatchObject({
      result: { publishable: true },
      expectedCapturedAt: null,
    });
    await write('baseline.json', { ...baseline, apex: { Missing: 'expected' } });
    expect((await runProductionDriftCommand(args, env)).exitCode).toBe(2);
    expect((await runProductionDriftCommand(args, {})).stderr).toContain('configuration');
    vi.mocked(connectIntakeSalesforce).mockRejectedValueOnce(new Error('private-provider-value'));
    const failed = await runProductionDriftCommand(args, env);
    expect(failed.stderr).toContain('verified-salesforce-read');
    expect(failed.stderr).not.toContain('private-provider-value');
  });
});
