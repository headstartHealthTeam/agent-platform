import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveArtifactRuntime } from './artifact-runtime.js';
import { runWorkbookRuntimeSmokeCommand } from './cli-runtime.js';
import { smokeIntakeWorkbookRuntime } from './workbook-smoke.js';
import type { IntakeWorkbookVerification } from './workbook-verification.js';

vi.mock('./artifact-runtime.js', () => ({
  resolveArtifactRuntime: vi.fn(),
  recordArtifactRuntimePreflight: vi.fn(),
}));
vi.mock('./workbook-smoke.js', () => ({ smokeIntakeWorkbookRuntime: vi.fn() }));
const identity = {
  nodeVersion: '22.1.0',
  package: '@oai/artifact-tool',
  resolution: 'explicit',
  contractVersion: 1,
} as const;
const verification: IntakeWorkbookVerification = {
  verifiedAt: '2026-01-01',
  workbookPath: 'synthetic.xlsx',
  sheetsRendered: [],
  formulaErrorCount: 0,
  formulaErrorScan: [],
  overview: [],
  passed: true,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveArtifactRuntime).mockResolvedValue({
    identity,
    module: {
      FileBlob: {},
      Workbook: { create: (): unknown => null },
      SpreadsheetFile: { exportXlsx: (): unknown => null },
    },
  });
  vi.mocked(smokeIntakeWorkbookRuntime).mockResolvedValue(verification);
});
describe('manual workbook runtime acceptance command', () => {
  it('requires an explicit synthetic output directory before resolving the runtime', async () => {
    await expect(runWorkbookRuntimeSmokeCommand([])).rejects.toThrow('--output-dir');
    expect(resolveArtifactRuntime).not.toHaveBeenCalled();
    expect(smokeIntakeWorkbookRuntime).not.toHaveBeenCalled();
  });
  it('composes the selected module and reports only readiness identity and aggregate results', async () => {
    const result = await runWorkbookRuntimeSmokeCommand(['--output-dir', 'synthetic']);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      passed: true,
      runtime: identity,
      sheetsRendered: 0,
      formulaErrorCount: 0,
    });
    const call = vi.mocked(smokeIntakeWorkbookRuntime).mock.calls[0];
    expect(typeof call?.[0].create).toBe('function');
    expect(typeof call?.[0].openXlsx).toBe('function');
    expect(call?.[1]).toBe('synthetic');
    expect(result.stderr).toBe('');
  });
  it('retains failed-verification status and propagates setup errors without reporting success', async () => {
    vi.mocked(smokeIntakeWorkbookRuntime).mockResolvedValue({
      ...verification,
      passed: false,
      formulaErrorCount: 1,
    });
    expect((await runWorkbookRuntimeSmokeCommand(['--output-dir', 'synthetic'])).exitCode).toBe(2);
    vi.mocked(resolveArtifactRuntime).mockRejectedValue(new Error('unavailable'));
    await expect(runWorkbookRuntimeSmokeCommand(['--output-dir', 'synthetic'])).rejects.toThrow(
      'unavailable'
    );
    expect(smokeIntakeWorkbookRuntime).toHaveBeenCalledTimes(1);
  });
});
