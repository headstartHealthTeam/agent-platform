import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type {
  ArtifactWorkbook,
  ArtifactWorkbookProvider,
} from '@headstart-health/artifact-workbook';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { publicationStorageFixture } from './google-publication-fixture.test-helper.js';
import { readPrivateJson, writePrivateJson } from './private-run-storage.js';
import { readSavedPublicationGateInputs } from './publication-gate-storage.js';
import { evaluatePublicationGate } from './publication-gate.js';
import {
  prepareIntakePublication,
  type SavedPublicationPreparationInput,
} from './publication-preparation.js';

const checkedAt = '2026-09-24T16:00:00.000Z';
const cutoff = '2026-09-22T16:00:00.000Z';
const now = (): Date => new Date(checkedAt);
const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    directories.splice(0).map((directory) => fs.rm(directory, { recursive: true }))
  );
});
async function write(directory: string, name: string, value: unknown): Promise<void> {
  await writePrivateJson(path.join(directory, name), value);
}
function provider(): ArtifactWorkbookProvider {
  const workbook: ArtifactWorkbook = {
    addWorksheet: () => {
      throw new Error('Preparation cannot create sheets');
    },
    worksheet: () => {
      throw new Error('Preparation cannot access cells');
    },
    inspect: async () => '',
    render: async () => new Uint8Array([1, 2, 3]),
    saveXlsx: async () => {
      throw new Error('Preparation cannot overwrite the workbook');
    },
  };
  return {
    create: (): ArtifactWorkbook => {
      throw new Error('Preparation cannot create workbooks');
    },
    openXlsx: async () => workbook,
  };
}
async function fixture(): Promise<SavedPublicationPreparationInput> {
  const directory = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'intake-gated-preparation-'))
  );
  directories.push(directory);
  for (const [name, value] of Object.entries(publicationStorageFixture())) {
    const base = typeof value === 'object' && value !== null ? value : {};
    await write(directory, name, { ...base, capturedAt: checkedAt });
  }
  const marker = {
    capturedAt: cutoff,
    values: [
      ['Run ID', 'prior'],
      ['Last Refresh (ET)', 'prior'],
    ],
  };
  const reviewer = { capturedAt: checkedAt, spreadsheetId: 'sheet', rows: [] };
  for (const [name, value] of Object.entries({
    'run_manifest.json': { runId: 'run', startedAt: cutoff, expectedRows: 0, processedRows: 0 },
    'reviewer_state.json': reviewer,
    'reviewer_state_current.json': reviewer,
    'live_sheet_marker_initial.json': marker,
    'live_sheet_marker_current.json': { ...marker, capturedAt: checkedAt },
    'salesforce_cohort_refresh.json': {
      queriedAt: checkedAt,
      organizationId: 'synthetic-org',
      isSandbox: false,
      material: false,
      liveCount: 0,
    },
    'competing_run_state.json': { checkedAt, conflict: false, currentRunId: 'run' },
    'production-drift-check.json': { result: { publishable: true, checkedAt } },
    'source_status_rows.json': [],
    'opportunity_rows.json': [],
    'identity_profile_rows.json': [],
    'auth_rows.json': [],
    'authorization_review_rows.json': [],
    'approved-fingerprint.json': { synthetic: true },
  }))
    await write(directory, name, value);
  await fs.writeFile(path.join(directory, 'intake_sla_review_queue.xlsx'), 'synthetic');
  return {
    runDirectory: directory,
    expectedSpreadsheetId: 'sheet',
    approvedFingerprintFile: path.join(directory, 'approved-fingerprint.json'),
    workbookProvider: provider(),
  };
}
async function absent(directory: string, name: string): Promise<void> {
  await expect(fs.access(path.join(directory, name))).rejects.toMatchObject({ code: 'ENOENT' });
}

describe('complete local publication preparation', () => {
  it('revalidates saved artifacts, prepares bounded payloads and writes the exact final gate without live calls', async () => {
    const input = await fixture();
    const manifestBefore = await fs.readFile(
      path.join(input.runDirectory, 'run_manifest.json'),
      'utf8'
    );
    const result = await prepareIntakePublication(input, now);
    const gateInputs = await readSavedPublicationGateInputs(input.runDirectory, 'sheet', checkedAt);
    expect(result).toEqual({
      ...evaluatePublicationGate(gateInputs),
      preparedAt: checkedAt,
      publicationStatus: 'Prepared - Awaiting Authorized Write and Live Readback',
      requiredNextStep:
        'Apply only the next authorized stage and capture its live assertions before advancing. After Run History, capture all final assertions and run review:verify-publish. Run History is last.',
    });
    expect(result.cohortDisposition.sourceCutoff).toBe(cutoff);
    expect(gateInputs.publicationPlan.stages).toHaveLength(9);
    expect(gateInputs.publicationPlan.stages.at(-1)?.id).toBe('09-run-history');
    expect(await readPrivateJson(path.join(input.runDirectory, 'publication-gate.json'))).toEqual(
      result
    );
    expect(await fs.readFile(path.join(input.runDirectory, 'run_manifest.json'), 'utf8')).toBe(
      manifestBefore
    );
    await absent(input.runDirectory, 'publication-readback.json');
  });
  it.each([
    '',
    'approved-fingerprint.json',
    'salesforce_cohort_refresh.json',
    'reviewer_state_current.json',
  ])(
    'stops before validation or payload preparation for missing configuration %s',
    async (missing) => {
      const input = await fixture();
      if (missing) await fs.unlink(path.join(input.runDirectory, missing));
      await expect(
        prepareIntakePublication({ ...input, expectedSpreadsheetId: missing ? 'sheet' : '' }, now)
      ).rejects.toThrow(missing ? 'required' : 'SLA_SPREADSHEET_ID');
      await absent(input.runDirectory, 'quality-audit.json');
      await absent(input.runDirectory, 'publication_stages_manifest.json');
    }
  );
  it('stops on validation failure before generating any write payloads', async () => {
    const input = await fixture();
    await write(input.runDirectory, 'run_manifest.json', {
      runId: 'run',
      startedAt: cutoff,
      expectedRows: 1,
      processedRows: 0,
    });
    await expect(prepareIntakePublication(input, now)).rejects.toThrow(
      'Saved report validation blocks'
    );
    await absent(input.runDirectory, 'publication_stages_manifest.json');
    await absent(input.runDirectory, 'publication-gate.json');
  });
  it('verifies Google capture before planning and leaves the saved capture unchanged', async () => {
    const input = await fixture();
    const metadata = await readPrivateJson(
      path.join(input.runDirectory, 'google_sheet_metadata_current.json')
    );
    if (metadata === null || typeof metadata !== 'object')
      throw new Error('Synthetic metadata missing');
    await write(input.runDirectory, 'google_sheet_metadata_current.json', {
      ...metadata,
      captureHash: 'a'.repeat(64),
    });
    await expect(prepareIntakePublication(input, now)).rejects.toThrow();
    await absent(input.runDirectory, 'publication_stages_manifest.json');
  });
  it.each(['2026-09-24T13:59:59.999Z', '2026-09-24T16:00:00.001Z'])(
    'does not bless stale or future concurrency evidence %s or overwrite a previous gate',
    async (queriedAt) => {
      const input = await fixture();
      await write(input.runDirectory, 'publication-gate.json', { previous: true });
      await write(input.runDirectory, 'salesforce_cohort_refresh.json', {
        queriedAt,
        organizationId: 'synthetic-org',
        isSandbox: false,
        material: false,
        liveCount: 0,
      });
      await expect(prepareIntakePublication(input, now)).rejects.toThrow();
      // Original command prepares a plan before gate evaluation, but never writes a passed gate on failure.
      await expect(
        fs.access(path.join(input.runDirectory, 'publication_stages_manifest.json'))
      ).resolves.toBeUndefined();
      expect(await readPrivateJson(path.join(input.runDirectory, 'publication-gate.json'))).toEqual(
        { previous: true }
      );
    }
  );
  it('permits an old frozen assessment with complete fresh post-cutoff deferral', async () => {
    const input = await fixture();
    await write(input.runDirectory, 'salesforce_cohort_refresh.json', {
      queriedAt: checkedAt,
      organizationId: 'synthetic-org',
      isSandbox: false,
      material: true,
      liveCount: 1,
      changes: { added: ['synthetic-added'], removed: [], stage: [], onHold: [], currentSla: [] },
      postCutoffDisposition: {
        schemaVersion: 1,
        disposition: 'defer-to-next-run',
        runCutoff: cutoff,
        salesforceReadOnly: true,
        nextRunRequired: true,
        records: [
          { opportunityId: 'synthetic-added', observedModifiedAt: '2026-09-23T10:00:00.000Z' },
        ],
      },
    });
    expect((await prepareIntakePublication(input, now)).cohortDisposition).toEqual({
      mode: 'frozen-snapshot-with-post-cutoff-delta',
      sourceCutoff: cutoff,
      liveCount: 1,
      deferredChangeCount: 1,
    });
  });
  it('retains all prepared assertion fields when reading gate inputs and rejects corrupt consumed data', async () => {
    const input = await fixture();
    await prepareIntakePublication(input, now);
    const rawPlan = await readPrivateJson(
      path.join(input.runDirectory, 'publication_stages_manifest.json')
    );
    expect(
      (await readSavedPublicationGateInputs(input.runDirectory, 'sheet', checkedAt)).publicationPlan
    ).toEqual(rawPlan);
    await write(input.runDirectory, 'salesforce_cohort_refresh.json', {
      changes: { added: 'invalid' },
    });
    await expect(
      readSavedPublicationGateInputs(input.runDirectory, 'sheet', checkedAt)
    ).rejects.toThrow('Invalid publication gate artifact');
  });
});
