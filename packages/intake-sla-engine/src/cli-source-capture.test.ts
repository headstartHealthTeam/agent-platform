import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readCaptureInput } from './cli-capture-input.js';
import { isSourceCaptureCommand, runSourceCaptureCommand } from './cli-source-capture.js';
import { checkpointPlan } from './connector-checkpoint.js';
import { currentCandidateManifest } from './fireflies-bounded-files.js';
import { boundedFixture, first } from './fireflies-bounded-fixture.test-support.js';
import { readPrivateJson, writePrivateJson } from './private-run-storage.js';

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'intake-capture-command-'));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true });
});
function file(name: string): string {
  return path.join(root, name);
}
async function call(
  command: string,
  args: readonly string[] = [],
  input?: unknown
): Promise<Awaited<ReturnType<typeof runSourceCaptureCommand>>> {
  return runSourceCaptureCommand(
    command,
    ['--run-dir', root, ...args],
    Readable.from(input === undefined ? [] : [Buffer.from(JSON.stringify(input))])
  );
}
async function firefliesInputs(): Promise<ReturnType<typeof boundedFixture>> {
  const input = boundedFixture();
  for (const [name, value] of new Map<string, unknown>([
    ['fireflies_discovery_raw.json', input.discovery],
    ['fireflies_run_inventory.json', input.collectionPlan],
    ['identity_profile_rows.json', input.profiles],
    ['fireflies_search_execution.json', input.searchExecution],
  ]))
    await writePrivateJson(file(name), value);
  return input;
}
describe('saved source capture command composition', () => {
  it('bounds stdin without altering exact saved JSON and rejects malformed input', async () => {
    const value = { private: ['synthetic', null, 0] };
    await writePrivateJson(file('capture.json'), value);
    expect(await readCaptureInput(file('capture.json'))).toEqual(value);
    expect(
      await readCaptureInput('-', Readable.from([Buffer.from('{"a":'), Buffer.from('1}')]))
    ).toEqual({ a: 1 });
    await expect(readCaptureInput('-', Readable.from([Buffer.from('{')]))).rejects.toThrow();
    await expect(readCaptureInput('-', Readable.from(['text']))).rejects.toThrow('binary');
    await expect(
      readCaptureInput('-', Readable.from([Buffer.alloc(64 * 1024 * 1024 + 1)]))
    ).rejects.toThrow('bounded input');
  });
  it('routes connector checkpoints, hides private pending requests and preserves failed terminal results', async () => {
    const plan = checkpointPlan({
      version: 1,
      source: 'portal',
      runId: 'synthetic',
      asOf: '2026-01-01',
      inputHash: 'a'.repeat(64),
      requests: [{ requestKey: 'private-synthetic-target' }],
    });
    await writePrivateJson(file('plan.json'), plan);
    const flags = ['--plan', file('plan.json')];
    const initial = await call('review:checkpoint', [...flags, '--action', 'plan']);
    expect(initial.exitCode).toBe(0);
    expect(JSON.parse(initial.stdout)).toMatchObject({ pending: 1, saved: 0 });
    expect(initial.stdout).not.toContain('private-synthetic-target');
    const capture = {
      version: 1,
      runId: plan.runId,
      planHash: plan.planHash,
      batchId: 'one',
      expectedRequestCount: 1,
      complete: true,
      results: [
        {
          requestKey: 'private-synthetic-target',
          status: 'Blocked',
          output: { reason: 'synthetic' },
        },
      ],
    };
    expect(
      (await call('review:checkpoint', [...flags, '--action', 'accept', '--input', '-'], capture))
        .exitCode
    ).toBe(0);
    await writePrivateJson(file('capture.json'), capture);
    expect(
      (
        await call('review:checkpoint', [
          ...flags,
          '--action',
          'accept',
          '--input',
          file('capture.json'),
        ])
      ).exitCode
    ).toBe(0);
    const final = await call('review:checkpoint', [...flags, '--action', 'finalize']);
    expect(JSON.parse(final.stdout)).toMatchObject({ pending: 0, saved: 1, blocked: 1 });
    await writePrivateJson(file('publication-readback.json'), {});
    expect((await call('review:checkpoint', [...flags, '--action', 'status'])).exitCode).toBe(1);
  });
  it('normalizes idempotently, fills missing outputs and preflights every existing artifact before writing', async () => {
    const input = await firefliesInputs();
    const firstResult = await call('review:fireflies-normalize');
    expect(firstResult.exitCode).toBe(0);
    expect(JSON.parse(firstResult.stdout)).toMatchObject({ status: 'Normalized', meetings: 2 });
    expect(await readPrivateJson(file('fireflies_discovery_raw.json'))).toEqual(input.discovery);
    expect(await call('review:fireflies-normalize')).toEqual(firstResult);
    const receipt = await readPrivateJson(file('fireflies_discovery_normalization.json'));
    await fs.unlink(file('fireflies_discovery.json'));
    await writePrivateJson(file('fireflies_discovery_normalization.json'), { conflict: true });
    expect((await call('review:fireflies-normalize')).exitCode).toBe(1);
    await expect(fs.access(file('fireflies_discovery.json'))).rejects.toThrow();
    await writePrivateJson(file('fireflies_discovery_normalization.json'), receipt);
    expect(await call('review:fireflies-normalize')).toEqual(firstResult);
    await fs.writeFile(file('fireflies_discovery_normalization.json'), '{');
    expect((await call('review:fireflies-normalize')).exitCode).toBe(1);
    await writePrivateJson(file('fireflies_discovery_raw.json'), {
      ...input.discovery,
      normalization: true,
    });
    expect((await call('review:fireflies-normalize')).stderr).toContain(
      'ALREADY_NORMALIZED_DISCOVERY'
    );
  });
  it('plans, captures bodies, resumes and finalizes through command entrypoints with provider cooldowns intact', async () => {
    const input = await firefliesInputs();
    expect((await call('review:fireflies-normalize')).exitCode).toBe(0);
    expect((await call('review:fireflies-bounded', ['--action', 'plan'])).exitCode).toBe(0);
    expect(
      JSON.parse((await call('review:fireflies-bounded', ['--action', 'status'])).stdout)
    ).toMatchObject({ pending: 1 });
    const limited = await call('review:fireflies-body-capture', ['--index', '0', '--input', '-'], {
      response: { status: 429, retryAfterMs: 1 },
    });
    expect(JSON.parse(limited.stderr)).toEqual({
      code: 'FIREFLIES_RATE_LIMITED',
      status: 429,
      retryAfterMs: 60_000,
      stopDispatch: true,
    });
    const record = first(input.fetched);
    const capture = {
      retrievalEndpoint: record.retrievalEndpoint,
      retrievedAt: record.retrievedAt,
      response: {
        content: [
          {
            type: 'text',
            text: `Id: ${record.transcriptId}\nDateString: ${record.date}\nSentences: ${record.fullTranscript}\nTitle: ${record.title}\nOrganizer Email: ${record.organizerEmail}\nParticipants: ${record.participants.join(', ')}\nMeeting Attendees: No meeting attendees\nIs Live: false`,
          },
        ],
      },
    };
    await writePrivateJson(file('body.json'), capture);
    expect(
      (await call('review:fireflies-body-capture', ['--index', '0', '--input', file('body.json')]))
        .exitCode
    ).toBe(0);
    expect((await call('review:fireflies-body-capture', ['--index', '0'])).exitCode).toBe(0);
    expect((await call('review:fireflies-body-capture', ['--index', '-1'])).exitCode).toBe(1);
    expect(
      (
        await call('review:fireflies-body-capture', [
          '--index',
          '0',
          '--input',
          path.join(root, 'nested', 'input.json'),
        ])
      ).exitCode
    ).toBe(1);
    const { manifest } = await currentCandidateManifest(root);
    const batch = {
      version: manifest.version,
      runId: manifest.runId,
      manifestHash: manifest.manifestHash,
      records: [record],
    };
    expect(
      (await call('review:fireflies-bounded', ['--action', 'accept', '--input', '-'], batch))
        .exitCode
    ).toBe(0);
    expect(
      JSON.parse((await call('review:fireflies-bounded', ['--action', 'finalize'])).stdout)
    ).toMatchObject({ status: 'Finalized', transcripts: 1 });
    await writePrivateJson(file('publication-readback.json'), {});
    expect((await call('review:fireflies-bounded', ['--action', 'status'])).exitCode).toBe(1);
    expect((await call('review:fireflies-bounded', ['--action', 'bad'])).exitCode).toBe(1);
  });
  it('reports only sanitized failures for unsupported/missing arguments', async () => {
    expect(isSourceCaptureCommand('review:slack-capture')).toBe(true);
    expect(isSourceCaptureCommand('wrong')).toBe(false);
    await expect(call('wrong')).rejects.toThrow('Unknown');
    for (const command of [
      'review:checkpoint',
      'review:fireflies-normalize',
      'review:fireflies-body-capture',
      'review:fireflies-bounded',
      'review:slack-capture',
      'review:slack-delta',
    ]) {
      const result = await call(command);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).not.toContain(root);
    }
  });
});
