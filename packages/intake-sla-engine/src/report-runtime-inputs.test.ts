import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { StructuredResponsesClient } from '@headstart-health/openai-platform/responses';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EVIDENCE_ENGINE_VERSION } from './engine-version.js';
import { INTERPRETATION_BINDING_VERSION } from './interpretation-binding.js';
import { writePrivateJson } from './private-run-storage.js';
import { buildProviderIdentityCluster } from './provider-identity.js';
import {
  decodeReportPrecomputedArtifact,
  loadReportIdentityRegistries,
  loadReportInterpreter,
} from './report-runtime-inputs.js';

let directory: string;
beforeEach(async () => {
  directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'intake-inputs-')));
});
afterEach(async () => {
  await fs.rm(directory, { recursive: true });
});
describe('private report runtime inputs', () => {
  it('retains exact raw interpretation objects and binding metadata', () => {
    const artifact = {
      rows: [
        {
          opportunityId: 'opp',
          model: 99,
          interpretations: [
            {
              sourceRecordId: 's',
              findings: [{ substantive: false }],
              validationBinding: { exact: true },
              custom: [false, null],
            },
          ],
        },
      ],
      extra: { preserved: true },
    };
    const before = structuredClone(artifact);
    const result = decodeReportPrecomputedArtifact(artifact);
    expect(result.raw).toBe(artifact);
    expect(result.rows).toBe(artifact.rows);
    expect(artifact).toEqual(before);
    expect(() => decodeReportPrecomputedArtifact({ rows: 'invalid' })).toThrow(
      'Invalid saved report'
    );
    expect(() =>
      decodeReportPrecomputedArtifact({
        rows: [
          {
            interpretations: [{ sourceRecordId: 's', findings: [{ substantive: 'private-data' }] }],
          },
        ],
      })
    ).not.toThrow();
    expect(() => decodeReportPrecomputedArtifact(null)).toThrow('Invalid saved report');
  });
  it('loads private alias registries without coercing or discarding metadata', async () => {
    const paths = {
      clientRegistryPath: path.join(directory, 'clients.json'),
      providerRegistryPath: path.join(directory, 'providers.json'),
    };
    const clients = {
      version: '1',
      clients: [
        { names: ['Synthetic'], aliases: null, evidence: { source: 'synthetic' }, retained: 1 },
      ],
    };
    const providers = {
      version: '2',
      providers: [
        {
          names: ['Provider'],
          salesforceIds: [],
          emails: [],
          meetingAliases: ['Weekly'],
          retained: false,
        },
      ],
    };
    await writePrivateJson(paths.clientRegistryPath, clients);
    await writePrivateJson(paths.providerRegistryPath, providers);
    expect(await loadReportIdentityRegistries(paths)).toEqual({ clients, providers });
    for (const field of [
      'phones',
      'practiceAliases',
      'meetingAliases',
      'portalProviderIds',
      'csmNames',
      'csmEmails',
    ]) {
      await writePrivateJson(paths.providerRegistryPath, {
        version: '2',
        providers: [{ names: ['Provider'], salesforceIds: [], emails: [], [field]: null }],
      });
      const loaded = await loadReportIdentityRegistries(paths);
      const cluster = buildProviderIdentityCluster({ providers: ['Provider'] }, loaded.providers);
      expect(Reflect.get(cluster, field)).toEqual([]);
    }
    await writePrivateJson(paths.providerRegistryPath, { version: '2', providers: [{}] });
    await expect(loadReportIdentityRegistries(paths)).rejects.toThrow(
      'Invalid private report identity registry'
    );
  });
  it('keeps missing and current-run Codex inputs credential-free', async () => {
    const createClient = vi.fn<(key: string) => StructuredResponsesClient>();
    const input = {
      runDirectory: directory,
      environment: { SLA_AI_INTERPRETATION: 'on' },
      createClient,
    };
    expect((await loadReportInterpreter(input)).artifact.rows).toEqual([]);
    await writePrivateJson(path.join(directory, 'ai_interpretation_precomputed.json'), {
      currentRunPrecomputed: true,
      apiEnabled: false,
      engineVersion: EVIDENCE_ENGINE_VERSION,
      executionProvenance: { kind: 'codex-current-run', api: false },
      rows: [{ opportunityId: 'opp', interpretations: [] }],
    });
    const result = await loadReportInterpreter(input);
    expect(result.config).toBeNull();
    expect(result.precomputed.get('opp')).toHaveProperty('model', undefined);
    expect(createClient).not.toHaveBeenCalled();
    await expect(loadReportInterpreter({ ...input, environment: {} })).rejects.toThrow(
      'explicitly on or off'
    );
  });
  it('does not validate disabled, ignored, overwritten or unmatched interpretation contents', async () => {
    const codex = {
      currentRunPrecomputed: true,
      apiEnabled: false,
      engineVersion: EVIDENCE_ENGINE_VERSION,
      executionProvenance: { kind: 'codex-current-run', api: false },
    };
    const cases = [
      { setting: 'off', artifact: { rows: [{ opportunityId: 'opp', interpretations: [{}] }] } },
      { setting: 'on', artifact: { ...codex, rows: [{ interpretations: [{}] }] } },
      { setting: 'on', artifact: { rows: [], model: 99 } },
      {
        setting: 'off',
        artifact: { rows: [{ opportunityId: 'opp', interpretations: [{ findings: null }] }] },
      },
      {
        setting: 'on',
        artifact: {
          ...codex,
          rows: [
            { opportunityId: 'opp', interpretations: 99 },
            { opportunityId: 'opp', interpretations: [] },
          ],
        },
      },
    ];
    for (const item of cases) {
      await writePrivateJson(
        path.join(directory, 'ai_interpretation_precomputed.json'),
        item.artifact
      );
      const result = await loadReportInterpreter({
        runDirectory: directory,
        environment: { SLA_AI_INTERPRETATION: item.setting },
      });
      expect(result.artifact.rows).toEqual(item.artifact.rows);
      if (item.artifact.rows.length === 2)
        expect(result.precomputed.get('opp')?.interpretations).toEqual([]);
    }
    await writePrivateJson(path.join(directory, 'ai_interpretation_precomputed.json'), {
      ...codex,
      rows: [
        {
          opportunityId: 'opp',
          interpretations: [{}, { sourceRecordId: 'unmatched', findings: null }],
        },
      ],
    });
    const result = await loadReportInterpreter({
      runDirectory: directory,
      environment: { SLA_AI_INTERPRETATION: 'on' },
    });
    expect(result.precomputed.get('opp')?.interpretations).toEqual([
      { sourceRecordId: 'unmatched', findings: null },
    ]);
    await writePrivateJson(path.join(directory, 'ai_interpretation_precomputed.json'), null);
    await expect(
      loadReportInterpreter({
        runDirectory: directory,
        environment: { SLA_AI_INTERPRETATION: 'off' },
      })
    ).rejects.toThrow('Invalid saved report');
  });
  it('injects the selected API key only into the client and requires the current preflight', async () => {
    const client = vi.fn<StructuredResponsesClient>();
    const createClient = vi.fn((_key: string): StructuredResponsesClient => client);
    const now = Date.parse('2026-09-24T16:00:00Z');
    const environment = {
      SLA_AI_INTERPRETATION: 'on',
      SLA_INTERPRETER_PROVIDER: 'openai-responses',
      SLA_INTERPRETER_MODEL: 'gpt-5.6-sol',
      SLA_APPROVED_CREDENTIAL_SOURCE: 'synthetic',
      OPENAI_API_KEY: 'synthetic-not-a-secret',
    };
    const input = { runDirectory: directory, environment, createClient, now };
    await expect(loadReportInterpreter(input)).rejects.toThrow('preflight');
    await writePrivateJson(path.join(directory, 'ai_interpretation_preflight.json'), {
      passed: true,
      checkedAt: new Date(now).toISOString(),
      model: environment.SLA_INTERPRETER_MODEL,
      provider: environment.SLA_INTERPRETER_PROVIDER,
      engineVersion: EVIDENCE_ENGINE_VERSION,
      bindingVersion: INTERPRETATION_BINDING_VERSION,
      store: false,
      credentialSourceApproved: true,
    });
    const result = await loadReportInterpreter(input);
    expect(result.execution.apiEnabled).toBe(true);
    expect(createClient).toHaveBeenCalledWith('synthetic-not-a-secret');
    expect(JSON.stringify(result)).not.toContain('synthetic-not-a-secret');
    expect(client).not.toHaveBeenCalled();
    createClient.mockClear();
    expect(
      (
        await loadReportInterpreter({
          ...input,
          environment: { ...environment, SLA_AI_INTERPRETATION: 'off' },
        })
      ).execution.apiEnabled
    ).toBe(false);
    expect(createClient).not.toHaveBeenCalled();
  });
});
