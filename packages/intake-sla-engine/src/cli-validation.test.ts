import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveArtifactRuntime } from './artifact-runtime.js';
import { isValidationCommand, runValidationCommand } from './cli-validation.js';
import { checkIntakeDistribution } from './distribution-safety.js';
import { prepareIntakePublication } from './publication-preparation.js';
import {
  validateSavedIntakeReport,
  type SavedIntakeValidationResult,
} from './report-validation.js';
import { validateIntakeRuntime } from './self-validation.js';

vi.mock('./artifact-runtime.js', () => ({ resolveArtifactRuntime: vi.fn() }));
vi.mock('./distribution-safety.js', () => ({ checkIntakeDistribution: vi.fn() }));
vi.mock('./self-validation.js', () => ({
  validateIntakeRuntime: vi.fn(),
  intakeRuntimePackageDirectory: (): string => 'synthetic-package',
}));
vi.mock('./report-validation.js', () => ({ validateSavedIntakeReport: vi.fn() }));
vi.mock('./publication-preparation.js', () => ({ prepareIntakePublication: vi.fn() }));
let root: string;
const successful: SavedIntakeValidationResult = {
  passed: true,
  runId: 'run',
  expectedRows: 1,
  processedRows: 1,
  qualityAudit: true,
  workbookVerification: true,
  denialContext: { passed: true, applicable: 0, complete: 0, blocked: 0, unmarked: 0 },
};
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'intake-validation-command-'));
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
  vi.mocked(validateSavedIntakeReport).mockResolvedValue(successful);
  vi.mocked(prepareIntakePublication).mockResolvedValue({
    schemaVersion: 1,
    evaluatedAt: '2026-01-01',
    preparedAt: '2026-01-01',
    runId: 'run',
    spreadsheetId: 'sheet',
    passed: true,
    planHash: 'hash',
    cohortDisposition: {
      mode: 'stable-live-cohort',
      sourceCutoff: '2026-01-01',
      liveCount: 1,
      deferredChangeCount: 0,
    },
    checks: [],
    publicationStatus: 'Prepared - Awaiting Authorized Write and Live Readback',
    requiredNextStep: 'synthetic',
  });
});
afterEach(async () => {
  await fs.rm(root, { recursive: true });
});
describe('validation and publication-preparation commands', () => {
  it('runs full self-validation before report validation and handles synthetic-only invocation', async () => {
    expect((await runValidationCommand('review:validate', [], {})).stdout).toContain('synthetic');
    expect(resolveArtifactRuntime).not.toHaveBeenCalled();
    const checked = await runValidationCommand('review:validate', ['--run-dir', root], {});
    expect(checked.exitCode).toBe(0);
    expect(validateIntakeRuntime).toHaveBeenCalledTimes(2);
    expect(vi.mocked(validateIntakeRuntime).mock.invocationCallOrder.at(-1)).toBeLessThan(
      vi.mocked(validateSavedIntakeReport).mock.invocationCallOrder[0] ?? 0
    );
    vi.mocked(validateSavedIntakeReport).mockResolvedValue({ ...successful, passed: false });
    expect((await runValidationCommand('review:validate', ['--run-dir', root], {})).exitCode).toBe(
      1
    );
  });
  it('passes explicit private configuration and supported rejection aliases to the existing preparation owner', async () => {
    const env = {
      SLA_SPREADSHEET_ID: 'sheet',
      SLA_PRODUCTION_FINGERPRINT_PATH: 'private-baseline',
    };
    for (const alias of ['replan-rejection', 'capacity-replan-rejection']) {
      const result = await runValidationCommand(
        'review:prepare-publish',
        ['--run-dir', root, `--${alias}`, 'rejection'],
        env
      );
      expect(result.exitCode).toBe(0);
      expect(prepareIntakePublication).toHaveBeenLastCalledWith(
        expect.objectContaining({
          runDirectory: root,
          expectedSpreadsheetId: 'sheet',
          approvedFingerprintFile: 'private-baseline',
          rejectionFile: 'rejection',
        })
      );
    }
    expect(validateSavedIntakeReport).not.toHaveBeenCalled();
    await runValidationCommand(
      'review:prepare-publish',
      ['--run-dir', root, '--fingerprint', 'explicit'],
      env
    );
    expect(prepareIntakePublication).toHaveBeenLastCalledWith(
      expect.objectContaining({ approvedFingerprintFile: 'explicit' })
    );
    for (const args of [[], ['--run-dir', root]])
      expect((await runValidationCommand('review:prepare-publish', args, {})).exitCode).toBe(1);
  });
  it('stops on runtime/self-test/report failures without leaking private diagnostic values', async () => {
    const flags = ['--run-dir', root];
    vi.mocked(validateIntakeRuntime).mockRejectedValueOnce(new Error('private diagnostic'));
    const failed = await runValidationCommand('review:validate', flags, {});
    expect(failed.stderr).toContain('distribution-and-synthetic-suite');
    expect(failed.stderr).not.toContain('private diagnostic');
    expect(resolveArtifactRuntime).not.toHaveBeenCalled();
    vi.mocked(resolveArtifactRuntime).mockRejectedValueOnce(new Error('private diagnostic'));
    expect((await runValidationCommand('review:validate', flags, {})).stderr).toContain(
      'workbook-runtime'
    );
    vi.mocked(validateSavedIntakeReport).mockRejectedValueOnce(new Error('private diagnostic'));
    expect((await runValidationCommand('review:validate', flags, {})).stderr).toContain(
      'saved-report-validation'
    );
    vi.mocked(prepareIntakePublication).mockRejectedValueOnce(new Error('private diagnostic'));
    expect(
      (
        await runValidationCommand('review:prepare-publish', flags, {
          SLA_SPREADSHEET_ID: 'sheet',
          SLA_PRODUCTION_FINGERPRINT_PATH: 'baseline',
        })
      ).stderr
    ).toContain('publication-preparation');
  });
  it('exposes the original distribution result and rejects unknown routes', async () => {
    expect(isValidationCommand('review:validate')).toBe(true);
    expect(isValidationCommand('wrong')).toBe(false);
    await expect(runValidationCommand('wrong', [])).rejects.toThrow('Unknown');
    for (const passed of [true, false]) {
      vi.mocked(checkIntakeDistribution).mockResolvedValue({
        passed,
        filesChecked: 1,
        findings: [],
      });
      expect((await runValidationCommand('check:distribution', [])).exitCode).toBe(passed ? 0 : 1);
    }
  });
});
