import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { StructuredResponsesClient } from '@headstart-health/openai-platform/responses';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runInterpretationPreflightCommand } from './cli-interpretation.js';
import { EVIDENCE_ENGINE_VERSION } from './engine-version.js';
import { INTERPRETATION_BINDING_VERSION } from './interpretation-binding.js';
import { preflightInterpretation } from './interpretation-preflight.js';

const env = {
  OPENAI_API_KEY: 'synthetic-key',
  SLA_AI_INTERPRETATION: 'on',
  SLA_INTERPRETER_PROVIDER: 'openai-responses',
  SLA_INTERPRETER_MODEL: 'gpt-5.6-sol',
  SLA_APPROVED_CREDENTIAL_SOURCE: 'synthetic-approved',
};
const fixed = '2026-01-02T00:00:00.000Z';
const response = {
  data: { findings: [] },
  usage: null,
  responseId: 'synthetic-response',
  model: env.SLA_INTERPRETER_MODEL,
};
let directory: string;
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'intake-ai-preflight-'));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await fs.rm(directory, { recursive: true, force: true });
});
describe('synthetic interpretation preflight', () => {
  it('uses the exact current contract and saves only the private success receipt', async () => {
    const client = vi.fn<StructuredResponsesClient>(async () => response);
    const createClient = vi.fn(() => client);
    const artifact = await preflightInterpretation({
      runDirectory: directory,
      env,
      createClient,
      now: () => new Date(fixed),
    });
    expect(createClient).toHaveBeenCalledWith('synthetic-key');
    const request = client.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      model: 'gpt-5.6-sol',
      schemaName: 'sla_transcript_findings',
      reasoningEffort: 'low',
    });
    expect(JSON.parse(request?.input ?? '')).toMatchObject({
      opportunity: { id: 'synthetic-opportunity', name: 'Synthetic Client' },
      source: { recordId: 'synthetic-meeting:1', eventDate: '2026-01-01', matchQuality: 'Direct' },
      transcriptSegment:
        'A synthetic provider confirmed a synthetic appointment for January 2, 2026.',
    });
    expect(artifact).toEqual({
      schemaVersion: 1,
      passed: true,
      checkedAt: fixed,
      provider: 'openai-responses',
      model: 'gpt-5.6-sol',
      engineVersion: EVIDENCE_ENGINE_VERSION,
      bindingVersion: INTERPRETATION_BINDING_VERSION,
      store: false,
      credentialSourceApproved: true,
    });
    const file = path.join(directory, 'ai_interpretation_preflight.json');
    expect(await fs.readFile(file, 'utf8')).toBe(`${JSON.stringify(artifact, null, 2)}\n`);
    if (process.platform !== 'win32') expect((await fs.stat(file)).mode & 0o777).toBe(0o600);
    expect(JSON.stringify(artifact)).not.toContain('synthetic-key');
  });
  it('sanitizes interpretation failures without persisting prompts or error bodies', async () => {
    const artifact = await preflightInterpretation({
      runDirectory: directory,
      env,
      createClient: () => async (): Promise<never> => {
        throw new Error('sensitive-body');
      },
      now: () => new Date(fixed),
    });
    expect(artifact).toEqual({
      schemaVersion: 1,
      passed: false,
      checkedAt: fixed,
      provider: 'openai-responses',
      model: 'gpt-5.6-sol',
      engineVersion: EVIDENCE_ENGINE_VERSION,
      store: false,
      failure: 'Synthetic structured-response preflight failed.',
    });
    expect(
      await fs.readFile(path.join(directory, 'ai_interpretation_preflight.json'), 'utf8')
    ).not.toContain('sensitive-body');
  });
  it('rejects config or client setup before creating a receipt', async () => {
    for (const changes of [
      { SLA_AI_INTERPRETATION: 'off' },
      { SLA_INTERPRETER_MODEL: 'other' },
      { SLA_APPROVED_CREDENTIAL_SOURCE: '' },
      { OPENAI_API_KEY: '' },
    ]) {
      await expect(
        preflightInterpretation({ runDirectory: directory, env: { ...env, ...changes } })
      ).rejects.toThrow();
    }
    expect(await fs.readdir(directory)).toEqual([]);
    await expect(
      preflightInterpretation({
        runDirectory: path.join(directory, 'missing'),
        env,
        createClient: () => async (): Promise<typeof response> => response,
      })
    ).rejects.toThrow();
  });
  it('composes the real shared Responses request using an injected synthetic fetch only', async () => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    const fetch = vi.fn(
      async (_url: unknown, _init: unknown) =>
        new Response(JSON.stringify({ output_text: '{"findings":[]}' }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetch);
    const result = await runInterpretationPreflightCommand(['--run-dir', directory]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const call = fetch.mock.calls[0];
    expect(call?.[0]).toBe('https://api.openai.com/v1/responses');
    const init = call?.[1];
    if (
      typeof init !== 'object' ||
      init === null ||
      !('body' in init) ||
      typeof init.body !== 'string'
    )
      throw new Error('Missing request body');
    expect(JSON.parse(init.body)).toMatchObject({
      model: 'gpt-5.6-sol',
      store: false,
      reasoning: { effort: 'low' },
      text: { format: { type: 'json_schema', name: 'sla_transcript_findings', strict: true } },
    });
    fetch.mockRejectedValueOnce(new Error('sensitive-network-body'));
    const failed = await runInterpretationPreflightCommand(['--run-dir', directory]);
    expect(failed.exitCode).toBe(1);
    expect(failed.stdout).toBe('');
    expect(failed.stderr).not.toContain('sensitive-network-body');
    await expect(runInterpretationPreflightCommand([])).rejects.toThrow('--run-dir');
  });
});
