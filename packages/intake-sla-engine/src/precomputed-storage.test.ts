import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { interpretationValidationBindingForPacket } from './ai-interpretation.js';
import { runFinalizePrecomputedCommand } from './cli-interpretation.js';
import { finalizeSavedCurrentRunPrecomputed } from './precomputed-storage.js';

let directory: string;
const packetFile = 'fireflies_interpretation_packets.json';
const candidateFile = 'ai_interpretation_candidate.json';
const outputFile = 'ai_interpretation_precomputed.json';
async function write(name: string, value: unknown): Promise<void> {
  await fs.writeFile(path.join(directory, name), JSON.stringify(value));
}
const packet = { extra: { retained: true }, transcriptSegment: 'Synthetic evidence only.' };
const packets = {
  extra: 'unconsumed metadata',
  packets: [{ opportunityId: 'synthetic', sourceRecordId: 'meeting:1', meetingId: null, packet }],
};
const candidates = {
  rows: [
    {
      opportunityId: 'synthetic',
      interpretations: [{ sourceRecordId: 'meeting:1', findings: [] }],
    },
  ],
};
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'intake-precomputed-'));
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));
});
afterEach(async () => {
  vi.useRealTimers();
  await fs.rm(directory, { recursive: true, force: true });
});
describe('saved current-run Codex finalization', () => {
  it('hashes the full original packet without requiring unused packet fields or inventing API provenance', async () => {
    await write(packetFile, packets);
    await write(candidateFile, candidates);
    const artifact = await finalizeSavedCurrentRunPrecomputed(directory);
    expect(artifact.rows[0]?.interpretations[0]).toEqual({
      sourceRecordId: 'meeting:1',
      meetingId: null,
      findings: [],
      packetHash: interpretationValidationBindingForPacket({ packet }).packetHash,
      validationBinding: interpretationValidationBindingForPacket({ packet }),
    });
    expect(artifact).toMatchObject({
      generatedAt: '2026-01-02T00:00:00.000Z',
      apiEnabled: false,
      currentRunPrecomputed: true,
      executionProvenance: { kind: 'codex-current-run', api: false },
    });
    const file = path.join(directory, outputFile);
    expect(await fs.readFile(file, 'utf8')).toBe(`${JSON.stringify(artifact, null, 2)}\n`);
    if (process.platform !== 'win32') expect((await fs.stat(file)).mode & 0o777).toBe(0o600);
    const result = await runFinalizePrecomputedCommand(['--run-dir', directory]);
    expect(result).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: `${JSON.stringify(
        {
          rows: 1,
          interpretations: 1,
          allCurrentPacketsBound: true,
          executionProvenance: { kind: 'codex-current-run', api: false },
        },
        null,
        2
      )}\n`,
    });
  }, 30_000);
  it('retains absent and null empty inventories and candidate rows', async () => {
    for (const [current, candidate] of [
      [{}, {}],
      [{ packets: null }, { rows: null }],
      [{ packets: [] }, { rows: [{ opportunityId: 'unused', interpretations: null }] }],
    ]) {
      await write(packetFile, current);
      await write(candidateFile, candidate);
      const artifact = await finalizeSavedCurrentRunPrecomputed(directory);
      expect(artifact.rows).toEqual([]);
      expect(artifact.validationBindingVersion).toBeNull();
    }
    for (const empty of [
      {},
      { opportunityId: null, interpretations: [] },
      { opportunityId: 7, interpretations: null },
    ]) {
      await write(packetFile, {});
      await write(candidateFile, { rows: [empty] });
      expect((await finalizeSavedCurrentRunPrecomputed(directory)).rows).toEqual([]);
      await write(packetFile, packets);
      await write(candidateFile, { rows: [...candidates.rows, empty] });
      expect((await finalizeSavedCurrentRunPrecomputed(directory)).rows).toHaveLength(1);
    }
  }, 30_000);
  it('preserves required-file and JSON-read ordering and never writes on invalid input', async () => {
    await expect(finalizeSavedCurrentRunPrecomputed(directory)).rejects.toThrow(
      'Current-run interpretation packets is required'
    );
    await fs.writeFile(path.join(directory, packetFile), 'invalid');
    await expect(finalizeSavedCurrentRunPrecomputed(directory)).rejects.toThrow(
      'Current-run Codex precomputed candidate is required'
    );
    await write(candidateFile, {});
    await expect(finalizeSavedCurrentRunPrecomputed(directory)).rejects.toBeInstanceOf(SyntaxError);
    for (const [current, candidate, message] of [
      [{ packets: false }, {}, 'Invalid current-run interpretation packet artifact'],
      [{}, { rows: false }, 'Invalid current-run precomputed candidate artifact'],
      [packets, {}, 'findings are missing'],
      [{}, candidates, 'outside the current inventory'],
    ] as const) {
      await write(packetFile, current);
      await write(candidateFile, candidate);
      await expect(finalizeSavedCurrentRunPrecomputed(directory)).rejects.toThrow(message);
    }
    expect(await fs.readdir(directory)).not.toContain(outputFile);
    await expect(runFinalizePrecomputedCommand([])).rejects.toThrow('--run-dir');
  }, 30_000);
});
