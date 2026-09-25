import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  loadGenerationLedgerBaseline,
  writeGenerationLedgerState,
} from './generation-ledger-storage.js';
import {
  classifyCurrentSlaNote,
  createGenerationLedgerRow,
  generationLedgerRows,
  type GenerationLedgerRow,
} from './generation-ledger.js';
import { sha256Json } from './json-fingerprint.js';
import { readPrivateJson, writePrivateJson } from './private-run-storage.js';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await fs.rm(directory, { recursive: true, force: true });
});
async function harness(): Promise<{
  runDir: string;
  runId: string;
  file: (name: string) => string;
}> {
  const runDirectory = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'synthetic-intake-ledger-'))
  );
  directories.push(runDirectory);
  return { runDir: runDirectory, runId: 'current', file: (name) => path.join(runDirectory, name) };
}
function row(
  runId: string,
  text: string,
  opportunityId = 'synthetic-opportunity'
): GenerationLedgerRow<string> {
  return createGenerationLedgerRow({
    runId,
    opportunityId,
    slaId: 'synthetic-sla',
    engineVersion: 'synthetic',
    sourceCutoff: '2026-01-01T00:00:00Z',
    generatedAt: '2026-01-01T00:00:00Z',
    generatedSummary: text,
    operationalSummary: text,
    publicationStatus: runId === 'prior' ? 'Published' : 'Built - Pending Publish',
  });
}
describe('frozen generation ledger input and replaceable current-run drafts', () => {
  it('formats actual stored output without imposing new historical cell types', async () => {
    const h = await harness();
    const historical = {
      runId: 'prior',
      opportunityId: 'legacy-opp',
      slaId: 'legacy-sla',
      generatedSummary: 123,
      summaryHash: false,
      operationalSummary: null,
      publicationStatus: 0,
      extra: { retained: true },
    };
    await writePrivateJson(h.file('generation_ledger_state.json'), [historical]);
    const baseline = await loadGenerationLedgerBaseline(h);
    const generated = row('current', 'Current generated summary.');
    const combined = await writeGenerationLedgerState({ ...h, baseline, currentRows: [generated] });
    const formatted = generationLedgerRows(combined);
    expect(formatted[1]).toEqual([
      'prior',
      'legacy-sla',
      'legacy-opp',
      undefined,
      undefined,
      undefined,
      123,
      false,
      '',
      undefined,
      0,
    ]);
    expect(formatted[2]).toEqual(generationLedgerRows([generated])[1]);
    expect(combined[0]).toEqual(historical);
  });
  it('rebuilds only current drafts while preserving every historical value and provenance input', async () => {
    const h = await harness();
    const prior = {
      ...row('prior', 'Historical published sentence.'),
      auditMetadata: { retained: true },
    };
    await writePrivateJson(h.file('generation_ledger_state.json'), [prior]);
    const baseline = await loadGenerationLedgerBaseline(h);
    await writeGenerationLedgerState({
      ...h,
      baseline,
      currentRows: [
        row('current', 'Preliminary summary.'),
        row('current', 'Exited cohort.', 'synthetic-exited'),
      ],
    });
    const reread = await loadGenerationLedgerBaseline(h);
    expect(reread.rows).toEqual([prior]);
    expect(
      classifyCurrentSlaNote({ note: 'Preliminary summary.', ledgerRows: reread.rows }).provenance
    ).toBe('Human');
    expect(
      classifyCurrentSlaNote({ note: prior.generatedSummary, ledgerRows: reread.rows }).provenance
    ).toBe('Generated - Exact');
    const final = [row('current', 'Corrected final summary.')];
    const output = await writeGenerationLedgerState({ ...h, baseline: reread, currentRows: final });
    expect(output).toEqual([prior, ...final]);
    expect(output[1]).toBe(final[0]);
    expect(
      await writeGenerationLedgerState({ ...h, baseline: reread, currentRows: final })
    ).toEqual(output);
    expect(await readPrivateJson(h.file('generation_ledger_baseline.json'))).toEqual(baseline);
    expect(await readPrivateJson(h.file('generation_ledger_state.json'))).toEqual(output);
  });
  it('excludes legacy same-run drafts without mutating the historical input', async () => {
    const h = await harness();
    const prior = row('prior', 'Retain exactly.');
    await writePrivateJson(h.file('generation_ledger_state.json'), {
      rows: [prior, row('current', 'Old draft.')],
    });
    const baseline = await loadGenerationLedgerBaseline(h);
    expect(baseline.rows).toEqual([prior]);
    await writeGenerationLedgerState({ ...h, baseline, currentRows: [] });
    expect(await readPrivateJson(h.file('generation_ledger_state.json'))).toEqual([prior]);
  });
  it('keeps explicit input protected and rejects silent rebasing, missing input or changed saved baseline', async () => {
    const h = await harness();
    const inputPath = h.file('protected-input.json');
    const prior = [row('prior', 'Original.')];
    await writePrivateJson(inputPath, prior);
    const baseline = await loadGenerationLedgerBaseline({ ...h, inputPath });
    expect(await loadGenerationLedgerBaseline({ ...h, inputPath })).toEqual(baseline);
    await writeGenerationLedgerState({ ...h, baseline, currentRows: [row('current', 'Output.')] });
    expect(await readPrivateJson(inputPath)).toEqual(prior);
    await writePrivateJson(inputPath, [row('prior', 'Changed.')]);
    await expect(loadGenerationLedgerBaseline({ ...h, inputPath })).rejects.toThrow('differs');
    await expect(
      loadGenerationLedgerBaseline({ ...h, inputPath: h.file('missing.json') })
    ).rejects.toThrow('ENOENT');
    expect((await loadGenerationLedgerBaseline(h)).rows).toEqual(prior);
    await writePrivateJson(h.file('generation_ledger_baseline.json'), { ...baseline, extra: true });
    await expect(writeGenerationLedgerState({ ...h, baseline, currentRows: [] })).rejects.toThrow(
      'changed during build'
    );
  });
  it('rejects invalid or published current inputs, duplicate drafts, wrong runs and corrupt hashes', async () => {
    for (const input of [
      {},
      { rows: 'bad' },
      [{ runId: 'prior' }],
      [{ ...row('current', 'Published.'), publicationStatus: 'Published' }],
    ]) {
      const h = await harness();
      await writePrivateJson(h.file('generation_ledger_state.json'), input);
      await expect(loadGenerationLedgerBaseline(h)).rejects.toThrow();
      await expect(fs.access(h.file('generation_ledger_baseline.json'))).rejects.toThrow();
    }
    const h = await harness();
    await expect(loadGenerationLedgerBaseline({ ...h, runId: '' })).rejects.toThrow('identity');
    const baseline = await loadGenerationLedgerBaseline(h);
    await expect(loadGenerationLedgerBaseline({ ...h, runId: 'another' })).rejects.toThrow(
      'another run'
    );
    await expect(
      writeGenerationLedgerState({ ...h, baseline, currentRows: [row('prior', 'Wrong.')] })
    ).rejects.toThrow('unique drafts');
    const current = row('current', 'Repeated.');
    await expect(
      writeGenerationLedgerState({ ...h, baseline, currentRows: [current, current] })
    ).rejects.toThrow('unique drafts');
    await writePrivateJson(h.file('generation_ledger_baseline.json'), {
      ...baseline,
      rows: [row('prior', 'Tampered.')],
    });
    await expect(loadGenerationLedgerBaseline(h)).rejects.toThrow('baseline changed');
    await expect(writeGenerationLedgerState({ ...h, baseline, currentRows: [] })).rejects.toThrow(
      'baseline changed'
    );
    const invalidBaseline = { ...baseline, rows: [current], rowsHash: sha256Json([current]) };
    await expect(
      writeGenerationLedgerState({ ...h, baseline: invalidBaseline, currentRows: [] })
    ).rejects.toThrow('baseline changed');
  });
  it('retains published immutability and owner-only output', async () => {
    const h = await harness();
    const baseline = await loadGenerationLedgerBaseline(h);
    await writeGenerationLedgerState({ ...h, baseline, currentRows: [] });
    if (process.platform !== 'win32')
      expect((await fs.stat(h.file('generation_ledger_state.json'))).mode & 0o077).toBe(0);
    await writePrivateJson(h.file('publication-readback.json'), { status: 'Published' });
    await expect(loadGenerationLedgerBaseline(h)).rejects.toThrow('immutable');
    await expect(writeGenerationLedgerState({ ...h, baseline, currentRows: [] })).rejects.toThrow(
      'immutable'
    );
  });
});
