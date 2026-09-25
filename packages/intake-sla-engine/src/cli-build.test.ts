import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveArtifactRuntime, recordArtifactRuntimePreflight } from './artifact-runtime.js';
import { runBuildReportCommand } from './cli-build.js';
import { writePrivateJson } from './private-run-storage.js';
import { buildIntakeReport } from './report-build.js';
import { prepareReportInterpreter } from './report-interpreter-setup.js';
import { loadReportIdentityRegistries, loadReportInterpreter } from './report-runtime-inputs.js';
import { connectIntakeSalesforce } from './salesforce-reader.js';
import type * as SalesforceReader from './salesforce-reader.js';

vi.mock('./artifact-runtime.js', () => ({
  resolveArtifactRuntime: vi.fn(),
  recordArtifactRuntimePreflight: vi.fn(),
}));
vi.mock('./report-build.js', () => ({ buildIntakeReport: vi.fn() }));
vi.mock('./report-runtime-inputs.js', () => ({
  loadReportIdentityRegistries: vi.fn(),
  loadReportInterpreter: vi.fn(),
}));
vi.mock('./salesforce-reader.js', async (importOriginal) => ({
  ...(await importOriginal<typeof SalesforceReader>()),
  connectIntakeSalesforce: vi.fn(),
}));
let directory: string;
const cutoff = '2026-09-24T16:00:00.000Z';
const environment = {
  SLA_CLIENT_IDENTITY_ALIASES_PATH: 'private-client-path',
  SLA_PROVIDER_IDENTITY_ALIASES_PATH: 'private-provider-path',
  RUN_AT: cutoff,
};
beforeEach(async () => {
  directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'intake-build-cli-')));
  vi.resetAllMocks();
  vi.mocked(resolveArtifactRuntime).mockResolvedValue({
    identity: {
      nodeVersion: '22.1.0',
      package: '@oai/artifact-tool',
      resolution: 'explicit',
      contractVersion: 1,
    },
    module: {
      FileBlob: {},
      Workbook: { create: (): unknown => null },
      SpreadsheetFile: { exportXlsx: (): unknown => null },
    },
  });
  vi.mocked(loadReportIdentityRegistries).mockResolvedValue({
    clients: { version: '1', clients: [] },
    providers: { version: '1', providers: [] },
  });
  vi.mocked(loadReportInterpreter).mockResolvedValue(
    prepareReportInterpreter({ setting: 'off', environment: {}, client: null, artifact: {} })
  );
  vi.mocked(buildIntakeReport).mockResolvedValue({
    workbook: { runId: 'synthetic', generatedAt: cutoff, sheets: {} },
    report: {
      entries: [],
      rows: [],
      onHoldRows: [],
      evidenceRows: [],
      ledgerRows: [],
      runHistoryRows: [],
      runManifest: {
        runId: 'synthetic',
        startedAt: cutoff,
        expectedRows: 0,
        expectedActiveRows: 0,
        expectedOnHoldRows: 0,
        processedRows: 0,
        blockedRows: 0,
        sourceCounts: {},
        publishStatus: 'Built - Pending Publish',
        delayHistory: { version: 1, rows: 0, artifactHash: 'synthetic' },
        noteAdjudications: { inputHash: 'synthetic', receiptsHash: 'synthetic', accepted: 0 },
      },
    },
  });
});
afterEach(async () => {
  await fs.rm(directory, { recursive: true });
});
describe('report build command', () => {
  it('loads explicit configuration and selects frozen saved inputs without connecting Salesforce', async () => {
    const result = await runBuildReportCommand(
      ['--run-dir', directory, '--use-existing-structured'],
      environment
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ built: true, runDir: directory });
    const input = vi.mocked(buildIntakeReport).mock.calls[0]?.[0];
    expect(input).toMatchObject({
      runDirectory: directory,
      source: { mode: 'saved' },
      requireReviewerState: true,
      runAt: new Date(cutoff),
    });
    expect(typeof input?.workbookProvider?.create).toBe('function');
    expect(loadReportIdentityRegistries).toHaveBeenCalledWith({
      clientRegistryPath: 'private-client-path',
      providerRegistryPath: 'private-provider-path',
    });
    expect(recordArtifactRuntimePreflight).toHaveBeenCalledOnce();
    expect(connectIntakeSalesforce).not.toHaveBeenCalled();
    await runBuildReportCommand(
      [
        '--run-dir',
        directory,
        '--run-at',
        '2026-09-23T16:00:00Z',
        '--client-registry',
        'explicit-client',
        '--provider-registry',
        'explicit-provider',
      ],
      {
        ...environment,
        SLA_USE_EXISTING_STRUCTURED: '1',
        SLA_GENERATION_LEDGER_PATH: 'private-ledger',
      }
    );
    expect(vi.mocked(buildIntakeReport).mock.calls[1]?.[0]).toMatchObject({
      ledgerInputPath: 'private-ledger',
      runAt: new Date('2026-09-23T16:00:00Z'),
      source: { mode: 'saved' },
    });
  });
  it('uses the configured Production reader for live mode without changing its authority', async () => {
    const reader = {
      organization: { orgId: '00D000000000001AAA', isSandbox: false },
      query: vi.fn(),
      organizationPreflight: vi.fn(),
    };
    vi.mocked(connectIntakeSalesforce).mockResolvedValue(reader);
    const result = await runBuildReportCommand(['--run-dir', directory], {
      ...environment,
      SF_TARGET_ORG: 'explicit',
      SF_EXPECTED_ORG_ID: '00D000000000001AAA',
    });
    expect(result.exitCode).toBe(0);
    expect(connectIntakeSalesforce).toHaveBeenCalledWith({
      targetOrg: 'explicit',
      expectedOrgId: '00D000000000001AAA',
    });
    expect(vi.mocked(buildIntakeReport).mock.calls[0]?.[0].source).toEqual({
      mode: 'live',
      reader,
    });
    expect(reader.query).not.toHaveBeenCalled();
  });
  it('reports a sanitized failure phase and does not claim a completed report', async () => {
    vi.mocked(loadReportInterpreter).mockRejectedValue(new Error('private-record-content'));
    const result = await runBuildReportCommand(
      ['--run-dir', directory, '--use-existing-structured'],
      environment
    );
    expect(result).toMatchObject({ exitCode: 1, stdout: '' });
    expect(JSON.parse(result.stderr)).toEqual({
      code: 'INTAKE_REPORT_BUILD_FAILED',
      phase: 'interpretation-setup',
      checkpointsRetained: true,
    });
    expect(result.stderr).not.toContain('private-record-content');
    expect(buildIntakeReport).not.toHaveBeenCalled();
  });
  it('rejects missing configuration, invalid cutoff and an immutable run before provider setup', async () => {
    await expect(runBuildReportCommand([], {})).rejects.toThrow('--run-dir');
    await expect(runBuildReportCommand(['--run-dir', directory], {})).rejects.toThrow(
      'registry paths'
    );
    await expect(
      runBuildReportCommand(['--run-dir', directory, '--run-at', 'invalid'], environment)
    ).rejects.toThrow('cutoff');
    await writePrivateJson(path.join(directory, 'publication-readback.json'), { complete: true });
    await expect(runBuildReportCommand(['--run-dir', directory], environment)).rejects.toThrow(
      'immutable'
    );
    expect(resolveArtifactRuntime).not.toHaveBeenCalled();
  });
});
