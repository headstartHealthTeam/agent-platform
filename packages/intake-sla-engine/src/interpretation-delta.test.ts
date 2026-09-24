import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { StructuredResponsesClient } from '@headstart-health/openai-platform/responses';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { interpretationBindingForPacket } from './ai-interpretation.js';
import { runInterpretationDeltaCommand } from './cli-interpretation.js';
import { EVIDENCE_ENGINE_VERSION } from './engine-version.js';
import { INTERPRETATION_BINDING_VERSION } from './interpretation-binding.js';
import { interpretSavedDelta } from './interpretation-delta.js';

const fixed = '2026-01-02T00:00:00.000Z';
const config = { model: 'gpt-5.6-sol', provider: 'openai-responses' };
const env = {
  SLA_AI_INTERPRETATION: 'on',
  SLA_INTERPRETER_MODEL: config.model,
  SLA_INTERPRETER_PROVIDER: config.provider,
  SLA_APPROVED_CREDENTIAL_SOURCE: 'synthetic-approved',
  OPENAI_API_KEY: 'synthetic-key',
  SLA_INTERPRETER_CONCURRENCY: '1',
};
const response = {
  data: { findings: [] },
  usage: null,
  responseId: 'synthetic-response',
  model: config.model,
};
const preflight = {
  passed: true,
  ...config,
  engineVersion: EVIDENCE_ENGINE_VERSION,
  bindingVersion: INTERPRETATION_BINDING_VERSION,
  store: false,
  credentialSourceApproved: true,
  checkedAt: fixed,
};
const envelope = {
  opportunityId: 'synthetic',
  sourceRecordId: 'synthetic:1',
  meetingId: null,
  packet: { transcriptSegment: 'Synthetic segment.', extra: { hashMe: true } },
};
const bound = {
  sourceRecordId: envelope.sourceRecordId,
  binding: interpretationBindingForPacket({ packet: envelope.packet, ...config }),
  findings: [],
  extra: 'retained interpretation metadata',
};
let root: string;
let current: string;
let prior: string;
async function write(directory: string, name: string, value: unknown): Promise<void> {
  await fs.writeFile(path.join(directory, name), JSON.stringify(value));
}
async function read(name: string): Promise<unknown> {
  const value: unknown = JSON.parse(await fs.readFile(path.join(current, name), 'utf8'));
  return value;
}
async function priorResult(overrides: Readonly<Record<string, unknown>> = {}): Promise<void> {
  await write(prior, 'ai_interpretation_precomputed.json', {
    apiEnabled: true,
    ...config,
    engineVersion: EVIDENCE_ENGINE_VERSION,
    store: false,
    rows: [{ opportunityId: 'synthetic', interpretations: [bound] }],
    ...overrides,
  });
}
beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'intake-delta-')));
  current = path.join(root, 'current');
  prior = path.join(root, 'prior');
  await fs.mkdir(current, { mode: 0o700 });
  await fs.mkdir(prior, { mode: 0o700 });
  await write(current, 'ai_interpretation_preflight.json', preflight);
  await write(current, 'fireflies_interpretation_packets.json', { packets: [envelope] });
  await write(prior, 'fireflies_interpretation_packets.json', { packets: [envelope] });
  await priorResult();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(fixed));
});
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});
function clientFactory(): {
  client: ReturnType<typeof vi.fn<StructuredResponsesClient>>;
  createClient: () => StructuredResponsesClient;
} {
  const client = vi.fn<StructuredResponsesClient>(async () => response);
  return { client, createClient: () => client };
}
describe('saved bounded interpretation delta', () => {
  it('reuses exact API-bound results without dropping unused metadata or calling the API', async () => {
    const { client, createClient } = clientFactory();
    const artifact = await interpretSavedDelta({
      runDirectory: current,
      priorRunDirectory: prior,
      env,
      createClient,
    });
    expect(client).not.toHaveBeenCalled();
    expect(artifact.counts).toEqual({ total: 1, 'reuse-exact': 1, resume: 0, fresh: 0 });
    expect(artifact.rows[0]?.interpretations[0]).toEqual({ ...bound, meetingId: null });
    expect(await read('ai_interpretation_delta_execution.json')).toMatchObject({
      currentPacketCount: 1,
      allCurrentPacketsBound: true,
      workerTelemetry: { completed: 0, required: 0, retries: 0, elapsedMs: 0 },
    });
    expect(await read('ai_interpretation_precomputed.json')).toEqual(artifact);
    expect(Object.hasOwn(artifact, 'credentialSource')).toBe(false);
    expect(await fs.readdir(current)).not.toContain('.writer-lock');
  });
  it('freshly interprets prior Codex results and resumes the private checkpoint on rerun', async () => {
    await priorResult({ apiEnabled: false, currentRunPrecomputed: true });
    const { client, createClient } = clientFactory();
    const onProgress = vi.fn();
    const input = {
      runDirectory: current,
      priorRunDirectory: prior,
      env,
      createClient,
      onProgress,
    };
    const artifact = await interpretSavedDelta(input);
    expect(client).toHaveBeenCalledTimes(1);
    expect(client.mock.calls[0]?.[0].input).toBe(JSON.stringify(envelope.packet));
    expect(artifact.counts.fresh).toBe(1);
    expect(artifact.resolvedCounts.resume).toBe(1);
    expect(onProgress).toHaveBeenCalledWith({
      completed: 1,
      required: 1,
      retries: 0,
      concurrencyLimit: 1,
      elapsedMs: 0,
    });
    expect(await read('ai_interpretation_delta_checkpoint.json')).toMatchObject({
      interpretations: [
        {
          opportunityId: 'synthetic',
          sourceRecordId: 'synthetic:1',
          meetingId: null,
          binding: bound.binding,
        },
      ],
    });
    const rerun = await interpretSavedDelta(input);
    expect(rerun.counts.resume).toBe(1);
    expect(client).toHaveBeenCalledTimes(1);
    if (process.platform !== 'win32')
      expect(
        (await fs.stat(path.join(current, 'ai_interpretation_delta_checkpoint.json'))).mode & 0o777
      ).toBe(0o600);
  });
  it('retains completed results after a later failure and removes only its own lock/listeners', async () => {
    await write(current, 'fireflies_interpretation_packets.json', {
      packets: [envelope, { ...envelope, sourceRecordId: 'synthetic:2' }],
    });
    await priorResult({ apiEnabled: false });
    const { client, createClient } = clientFactory();
    client.mockResolvedValueOnce(response).mockRejectedValueOnce(new Error('synthetic failure'));
    const before = [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')];
    await expect(
      interpretSavedDelta({ runDirectory: current, priorRunDirectory: prior, env, createClient })
    ).rejects.toThrow('synthetic failure');
    expect(await read('ai_interpretation_delta_checkpoint.json')).toMatchObject({
      interpretations: [{ sourceRecordId: 'synthetic:1' }],
    });
    expect(await fs.readdir(current)).not.toContain('ai_interpretation_precomputed.json');
    expect(await fs.readdir(current)).not.toContain('.writer-lock');
    expect([process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')]).toEqual(before);
  });
  it('rejects mismatched or expired preflight before any client or saved output', async () => {
    const createClient = vi.fn(() => clientFactory().client);
    for (const changes of [
      { passed: false },
      { model: 'other' },
      { provider: 'other' },
      { engineVersion: 'other' },
      { bindingVersion: 'other' },
      { store: true },
      { credentialSourceApproved: false },
      { checkedAt: 'invalid' },
      { checkedAt: '2026-01-02T00:00:00.001Z' },
      { checkedAt: '2026-01-01T23:29:59.999Z' },
    ]) {
      await write(current, 'ai_interpretation_preflight.json', { ...preflight, ...changes });
      await expect(
        interpretSavedDelta({ runDirectory: current, priorRunDirectory: prior, env, createClient })
      ).rejects.toThrow('preflight');
    }
    expect(createClient).not.toHaveBeenCalled();
    await write(current, 'ai_interpretation_preflight.json', {
      ...preflight,
      checkedAt: '2026-01-01T23:30:00.000Z',
    });
    await expect(
      interpretSavedDelta({ runDirectory: current, priorRunDirectory: prior, env, createClient })
    ).resolves.toMatchObject({ apiEnabled: true });
  });
  it('honors configuration, immutable-run and existing writer-lock failures', async () => {
    const { createClient } = clientFactory();
    const input = { runDirectory: current, priorRunDirectory: prior, env, createClient };
    await expect(
      interpretSavedDelta({ ...input, env: { ...env, SLA_AI_INTERPRETATION: 'off' } })
    ).rejects.toThrow('exactly on');
    await fs.mkdir(path.join(current, '.writer-lock'));
    await expect(interpretSavedDelta(input)).rejects.toThrow('locked');
    await fs.rmdir(path.join(current, '.writer-lock'));
    await write(current, 'publication-readback.json', {});
    await expect(interpretSavedDelta(input)).rejects.toThrow('immutable');
  });
  it('preserves existing checkpoint metadata and rejects mismatched checkpoint identity', async () => {
    await write(current, 'ai_interpretation_delta_checkpoint.json', {
      ...config,
      extra: { preserve: true },
      interpretations: null,
    });
    await priorResult({ apiEnabled: false });
    const { createClient } = clientFactory();
    await interpretSavedDelta({
      runDirectory: current,
      priorRunDirectory: prior,
      env,
      createClient,
    });
    expect(await read('ai_interpretation_delta_checkpoint.json')).toMatchObject({
      extra: { preserve: true },
    });
    await write(current, 'ai_interpretation_delta_checkpoint.json', { ...config, model: 'other' });
    await expect(
      interpretSavedDelta({ runDirectory: current, priorRunDirectory: prior, env, createClient })
    ).rejects.toThrow('different model or provider');
  });
  it('uses the shared non-storing API through the CLI and sanitizes every command failure', async () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    await priorResult({ apiEnabled: false });
    const fetch = vi.fn(
      async (_url: unknown, _init: unknown) =>
        new Response(JSON.stringify({ output_text: '{"findings":[]}' }))
    );
    vi.stubGlobal('fetch', fetch);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const result = await runInterpretationDeltaCommand([
      '--run-dir',
      current,
      '--prior-run-dir',
      prior,
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"phase":"complete"');
    expect(stdout.mock.calls[0]?.[0]).toContain('"phase":"fresh-progress"');
    const init = fetch.mock.calls[0]?.[1];
    if (
      typeof init !== 'object' ||
      init === null ||
      !('body' in init) ||
      typeof init.body !== 'string'
    )
      throw new Error('Missing body');
    expect(JSON.parse(init.body)).toMatchObject({
      model: 'gpt-5.6-sol',
      store: false,
      reasoning: { effort: 'low' },
    });
    expect(await runInterpretationDeltaCommand([])).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: '{"code":"INTERPRETATION_DELTA_FAILED","checkpointsRetained":true}\n',
    });
  });
  it('handles empty inventories without a request but still requires client setup and worker limits', async () => {
    await write(current, 'fireflies_interpretation_packets.json', { packets: null });
    await write(prior, 'fireflies_interpretation_packets.json', {});
    await write(prior, 'ai_interpretation_precomputed.json', {
      rows: [{}, { interpretations: null }],
    });
    const { client, createClient } = clientFactory();
    const artifact = await interpretSavedDelta({
      runDirectory: current,
      priorRunDirectory: prior,
      env,
      createClient,
    });
    expect(artifact).toMatchObject({ rows: [], bindingVersion: null });
    expect(client).not.toHaveBeenCalled();
    await expect(
      interpretSavedDelta({
        runDirectory: current,
        priorRunDirectory: prior,
        env: { ...env, OPENAI_API_KEY: '' },
      })
    ).rejects.toThrow('OPENAI_API_KEY is required');
    await expect(
      interpretSavedDelta({
        runDirectory: current,
        priorRunDirectory: prior,
        env: { ...env, SLA_INTERPRETER_CONCURRENCY: '0' },
        createClient,
      })
    ).rejects.toThrow('Invalid bounded worker limits');
  });
  it('retains checkpoints when interrupted and releases signal listeners', async () => {
    await priorResult({ apiEnabled: false });
    const { client, createClient } = clientFactory();
    client.mockImplementation(async () => {
      process.emit('SIGINT');
      return response;
    });
    await expect(
      interpretSavedDelta({ runDirectory: current, priorRunDirectory: prior, env, createClient })
    ).rejects.toThrow('cancelled');
    expect(await read('ai_interpretation_delta_checkpoint.json')).toMatchObject({
      interpretations: [{ sourceRecordId: 'synthetic:1' }],
    });
    expect(await fs.readdir(current)).not.toContain('.writer-lock');
  });
});
