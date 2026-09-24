import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { prepareGooglePublicationArtifacts } from './google-publication-artifacts.js';
import { readSavedGooglePublicationInputs } from './google-publication-inputs.js';
import { prepareSavedGooglePublication } from './google-publication-storage.js';
import { buildGooglePublicationPlan } from './google-publication.js';
import { sha256Json } from './json-fingerprint.js';
import { readPublicationJson } from './publication-command-storage.js';
import type { ReviewerSnapshot } from './publication-state.js';

const MANIFEST = 'publication_stages_manifest.json';
const OBSERVATIONS = 'publication_stage_readbacks.json';
const LEGACY = 'google_batch_request.json';
const GATE = 'publication-gate.json';
const REJECTION = 'rejection.json';
const EVIDENCE = 'Evidence Detail';
const REVIEW = [
  'Salesforce',
  'Freshness',
  'Needs CSM Review',
  'Reviewer Notes',
  'Copied to Salesforce?',
  'Reviewed By',
  'Reviewed At',
];
function fixture(): Record<string, unknown> {
  const sheets: Record<string, unknown[][]> = {
    'Review Queue': [REVIEW],
    'On-Hold Review': [REVIEW],
    [EVIDENCE]: [['Evidence'], ['before']],
    'Data Dictionary': [['Field']],
    'Source & Run Notes': [
      ['Field', 'Value'],
      ['Run ID', 'run'],
      ['Last Refresh (ET)', 'new'],
    ],
    'Generation Ledger': [
      ['Run ID', 'Publication Status'],
      ['run', 'Pending'],
    ],
    'Run History': [
      ['Run ID', 'Publish Status'],
      ['run', 'Pending'],
    ],
  };
  const metadata = Object.keys(sheets).map((title, sheetId) => ({
    title,
    sheetId,
    rowCount: 1,
    columnCount: 1,
  }));
  const live = Object.entries(sheets).map(([title, rows], sheetId) => {
    const values =
      title === 'Source & Run Notes'
        ? [rows[0], ['Run ID', 'old'], ['Last Refresh (ET)', 'old']]
        : rows.slice(0, 1);
    return { title, sheetId, usedRowCount: values.length, values };
  });
  return {
    'workbook-values.json': { sheets },
    'run_manifest.json': { runId: 'run' },
    'google_sheet_metadata_current.json': { spreadsheetId: 'sheet', sheets: metadata },
    'google_publication_state.json': { spreadsheetId: 'sheet', sheets: live },
    'reviewer_state_current.json': { rows: [], capturedAt: 123, unrelated: null },
  };
}
let runDirectory: string;
async function write(name: string, value: unknown): Promise<void> {
  await fs.writeFile(path.join(runDirectory, name), `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
}
async function prepare(): Promise<ReturnType<typeof prepareGooglePublicationArtifacts>> {
  return prepareGooglePublicationArtifacts(
    buildGooglePublicationPlan(await readSavedGooglePublicationInputs(runDirectory))
  );
}
async function changedEvidence(): Promise<void> {
  const input = fixture();
  const workbook = input['workbook-values.json'];
  if (typeof workbook !== 'object' || workbook === null || !('sheets' in workbook))
    throw new Error('Fixture workbook missing');
  if (typeof workbook.sheets !== 'object' || workbook.sheets === null)
    throw new Error('Fixture sheets missing');
  Reflect.set(workbook.sheets, EVIDENCE, [['Evidence'], ['after']]);
  await write('workbook-values.json', workbook);
}
async function startPublication(
  stageCount = 1
): Promise<ReturnType<typeof prepareGooglePublicationArtifacts>> {
  await prepareSavedGooglePublication({ runDirectory });
  const prepared = await prepare();
  await write(GATE, { passed: true, planHash: prepared.manifest.planHash, untouched: 'gate' });
  await write(OBSERVATIONS, {
    runId: 'run',
    spreadsheetId: 'sheet',
    planHash: prepared.manifest.planHash,
    stages: prepared.manifest.stages.slice(0, stageCount).map((stage) => ({
      id: stage.id,
      payloadHash: stage.payloadHash,
      captureVersion: 1,
      evidenceHash: 'a'.repeat(64),
      assertions: stage.assertions.map((assertion) => ({
        id: assertion.id,
        actualHash: assertion.expectedHash,
      })),
    })),
  });
  return prepared;
}
function rejection(planHash: string): unknown {
  return {
    priorPlanHash: planHash,
    stageId: '02-review-queue',
    callIndex: 0,
    response: {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'Automatic approval review failed: Guardian action exceeds the 200000-byte review limit',
        },
      ],
      structuredContent: null,
    },
    unused: { preserved: true },
  };
}
beforeEach(async () => {
  runDirectory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'intake-preparation-')));
  for (const [name, value] of Object.entries(fixture())) await write(name, value);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(runDirectory, { recursive: true, force: true });
});
describe('saved publication preparation', () => {
  it('accepts existing typed and inline reviewer snapshots without changing their metadata', async () => {
    const inputs = await readSavedGooglePublicationInputs(runDirectory);
    const snapshot: ReviewerSnapshot = {
      rows: [],
      capturedAt: '2026-01-01T00:00:00Z',
      spreadsheetId: 'sheet',
    };
    const typed = buildGooglePublicationPlan({ ...inputs, currentReviewerState: snapshot });
    const inline = buildGooglePublicationPlan({
      ...inputs,
      currentReviewerState: {
        rows: [],
        capturedAt: '2026-01-01T00:00:00Z',
        spreadsheetId: 'sheet',
      },
    });
    expect(inline).toEqual(typed);
    expect(typed.reviewerPreservation.currentReviewerStateHash).toBe(sha256Json(snapshot));
    expect(
      buildGooglePublicationPlan({
        ...inputs,
        currentReviewerState: {
          rows: [],
          capturedAt: 123,
          revalidatedAt: false,
          revalidationHash: null,
        },
      }).reviewerPreservation.currentReviewerStateHash
    ).toBe(sha256Json({ rows: [], capturedAt: 123, revalidatedAt: false, revalidationHash: null }));
  });
  it('writes exact staged payloads and reviewer proof, with the manifest last and private modes', async () => {
    await write(LEGACY, { obsolete: true });
    const expected = await prepare();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(expected.manifest.preparedAt);
    try {
      const writes = vi.spyOn(fs, 'writeFile');
      expect(await prepareSavedGooglePublication({ runDirectory })).toEqual(expected.summary);
      expect(writes.mock.calls.at(-1)?.[0]).toBe(path.join(runDirectory, MANIFEST));
      expect(await readPublicationJson(path.join(runDirectory, MANIFEST))).toEqual(
        expected.manifest
      );
      for (const [name, value] of expected.payloads) {
        expect(await fs.readFile(path.join(runDirectory, name), 'utf8')).toBe(
          `${JSON.stringify(value, null, 2)}\n`
        );
        if (process.platform !== 'win32')
          expect((await fs.stat(path.join(runDirectory, name))).mode & 0o777).toBe(0o600);
      }
      expect(
        await readPublicationJson(
          path.join(runDirectory, 'reviewer_payload_preservation_proof.json')
        )
      ).toEqual(expected.reviewerProof);
      await expect(fs.access(path.join(runDirectory, LEGACY))).rejects.toThrow();
      expect(expected.manifest.stages.at(-1)?.id).toBe('09-run-history');
    } finally {
      vi.useRealTimers();
    }
  });
  it('leaves legacy payloads alone if workbook validation fails', async () => {
    await write(LEGACY, { retained: true });
    await write('workbook-values.json', { sheets: {} });
    await expect(prepareSavedGooglePublication({ runDirectory })).rejects.toThrow(
      'Workbook is missing'
    );
    expect(await readPublicationJson(path.join(runDirectory, LEGACY))).toEqual({ retained: true });
  });
  it('does not inspect unused prior artifacts when no changed started plan consumes them', async () => {
    await write(MANIFEST, { unconsumed: true });
    await write(OBSERVATIONS, { stages: [] });
    await expect(
      prepareSavedGooglePublication({ runDirectory, rejectionFile: 'unused-missing' })
    ).resolves.toHaveProperty('runId', 'run');
    expect(await readPublicationJson(path.join(runDirectory, OBSERVATIONS))).toEqual({
      stages: [],
    });
  });
  it('preserves started same-plan readbacks and does not require a rejection file', async () => {
    await startPublication();
    const before = await fs.readFile(path.join(runDirectory, OBSERVATIONS), 'utf8');
    await prepareSavedGooglePublication({ runDirectory });
    expect(await fs.readFile(path.join(runDirectory, OBSERVATIONS), 'utf8')).toBe(before);
  });
  it('does not erase a malformed nonempty prior stage list as though publication never started', async () => {
    await write(MANIFEST, { planHash: 'prior' });
    await write(OBSERVATIONS, { stages: 'nonempty' });
    await expect(prepareSavedGooglePublication({ runDirectory })).rejects.toThrow(
      'Started publication'
    );
    expect(await readPublicationJson(path.join(runDirectory, MANIFEST))).toEqual({
      planHash: 'prior',
    });
  });
  it('retains unused source metadata and ignores ungoverned tabs without changing prepared hashes', async () => {
    const before = await prepare();
    const input = fixture();
    const metadata = input['google_sheet_metadata_current.json'];
    if (
      typeof metadata !== 'object' ||
      metadata === null ||
      !('sheets' in metadata) ||
      !Array.isArray(metadata.sheets)
    )
      throw new Error('Fixture metadata missing');
    const sheets: unknown[] = metadata.sheets;
    sheets.push({ title: null, gridProperties: false }, false);
    await write('google_sheet_metadata_current.json', metadata);
    expect((await prepare()).summary).toEqual(before.summary);
    const reviewer = await readPublicationJson(
      path.join(runDirectory, 'reviewer_state_current.json')
    );
    expect(before.reviewerProof.currentReviewerStateHash).toBe(sha256Json(reviewer));
  });
  it('archives every exact prior artifact before retaining capacity and committing the new manifest', async () => {
    const prior = await startPublication();
    const priorRaw = await fs.readFile(path.join(runDirectory, MANIFEST), 'utf8');
    await changedEvidence();
    await write(REJECTION, rejection(prior.manifest.planHash));
    const writes = vi.spyOn(fs, 'writeFile');
    const summary = await prepareSavedGooglePublication({
      runDirectory,
      rejectionFile: path.join(runDirectory, REJECTION),
    });
    const archive = path.join(runDirectory, `publication-superseded-${prior.manifest.planHash}`);
    expect(await fs.readFile(path.join(archive, MANIFEST), 'utf8')).toBe(priorRaw);
    for (const [name, payload] of prior.payloads)
      expect(await readPublicationJson(path.join(archive, name))).toEqual(payload);
    expect(await readPublicationJson(path.join(archive, GATE))).toHaveProperty('untouched', 'gate');
    expect(await readPublicationJson(path.join(archive, REJECTION))).toEqual(
      rejection(prior.manifest.planHash)
    );
    expect(await readPublicationJson(path.join(runDirectory, OBSERVATIONS))).toMatchObject({
      planHash: summary.planHash,
      capacityReplan: {
        priorPlanHash: prior.manifest.planHash,
        rejectionHash: sha256Json(rejection(prior.manifest.planHash)),
      },
    });
    const paths = writes.mock.calls.map(([file]) => (typeof file === 'string' ? file : ''));
    const firstReplacement = paths.findIndex((file) => path.dirname(file) === runDirectory);
    expect(paths.slice(0, firstReplacement).every((file) => path.dirname(file) === archive)).toBe(
      true
    );
    expect(paths.at(-1)).toBe(path.join(runDirectory, MANIFEST));
    if (process.platform !== 'win32') expect((await fs.stat(archive)).mode & 0o777).toBe(0o700);
  });
  it('retains only a definitive rejected-cell prefix, including the exact resume receipt', async () => {
    const prior = await startPublication(3);
    await changedEvidence();
    const failure = {
      priorPlanHash: prior.manifest.planHash,
      stageId: '04-evidence-detail',
      callIndex: 0,
      appliedCalls: [],
      response: {
        isError: true,
        content: 'unused',
        structuredContent: {
          error_code: 'INVALID_ARGUMENT',
          error: 'maximum of 50000 characters in a single cell',
        },
      },
    };
    await write(REJECTION, failure);
    const summary = await prepareSavedGooglePublication({
      runDirectory,
      rejectionFile: path.join(runDirectory, REJECTION),
    });
    expect(
      await readPublicationJson(path.join(runDirectory, 'publication_stage_resume.json'))
    ).toEqual({
      version: 1,
      runId: 'run',
      spreadsheetId: 'sheet',
      planHash: summary.planHash,
      stageId: '04-evidence-detail',
      appliedCalls: [],
      rejectionHash: sha256Json(failure),
    });
    expect(await readPublicationJson(path.join(runDirectory, OBSERVATIONS))).toHaveProperty(
      'rejectedCellReplan'
    );
  });
  it.each([
    'missing rejection',
    'uncertain rejection',
    'corrupt stage',
    'corrupt call',
    'missing gate',
  ])('rejects %s without replacing the prior manifest or receipts', async (scenario) => {
    const prior = await startPublication();
    await changedEvidence();
    const before = await fs.readFile(path.join(runDirectory, MANIFEST), 'utf8');
    const observations = await fs.readFile(path.join(runDirectory, OBSERVATIONS), 'utf8');
    await write(
      REJECTION,
      scenario === 'uncertain rejection'
        ? { response: { isError: true } }
        : rejection(prior.manifest.planHash)
    );
    const stage = prior.manifest.stages[0];
    const call = stage?.calls[0];
    if (stage === undefined || call === undefined) throw new Error('Missing synthetic capacity');
    if (scenario === 'corrupt stage') await write(stage.file, { requests: [] });
    if (scenario === 'corrupt call') await write(call.file, { requests: [] });
    if (scenario === 'missing gate') await fs.unlink(path.join(runDirectory, GATE));
    const options =
      scenario === 'missing rejection'
        ? { runDirectory }
        : { runDirectory, rejectionFile: path.join(runDirectory, REJECTION) };
    await expect(prepareSavedGooglePublication(options)).rejects.toThrow();
    expect(await fs.readFile(path.join(runDirectory, MANIFEST), 'utf8')).toBe(before);
    expect(await fs.readFile(path.join(runDirectory, OBSERVATIONS), 'utf8')).toBe(observations);
    expect(
      (await fs.readdir(runDirectory)).some((name) => name.startsWith('publication-superseded-'))
    ).toBe(false);
  });
  it('retains archive evidence and the old manifest if writing new payloads fails', async () => {
    const prior = await startPublication();
    await changedEvidence();
    await write(REJECTION, rejection(prior.manifest.planHash));
    const before = await fs.readFile(path.join(runDirectory, MANIFEST), 'utf8');
    const original = fs.writeFile;
    vi.spyOn(fs, 'writeFile').mockImplementation(async (file, data, options) => {
      if (file === path.join(runDirectory, 'google_batch_stage_04-evidence-detail.json'))
        throw new Error('synthetic disk failure');
      await original(file, data, options);
    });
    await expect(
      prepareSavedGooglePublication({
        runDirectory,
        rejectionFile: path.join(runDirectory, REJECTION),
      })
    ).rejects.toThrow('synthetic disk');
    expect(await fs.readFile(path.join(runDirectory, MANIFEST), 'utf8')).toBe(before);
    expect(
      await fs.readFile(
        path.join(runDirectory, `publication-superseded-${prior.manifest.planHash}`, MANIFEST),
        'utf8'
      )
    ).toBe(before);
  });
  it('refuses immutable runs and private-artifact symlinks before writes', async () => {
    await write('publication-readback.json', {});
    const writes = vi.spyOn(fs, 'writeFile');
    await expect(prepareSavedGooglePublication({ runDirectory })).rejects.toThrow('immutable');
    expect(writes).not.toHaveBeenCalled();
    await fs.unlink(path.join(runDirectory, 'publication-readback.json'));
    await fs.symlink(
      path.join(runDirectory, 'run_manifest.json'),
      path.join(runDirectory, MANIFEST)
    );
    await expect(prepareSavedGooglePublication({ runDirectory })).rejects.toThrow('regular file');
    expect(writes).not.toHaveBeenCalled();
  });
});
