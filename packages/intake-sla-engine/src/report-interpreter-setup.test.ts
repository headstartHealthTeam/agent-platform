import type { StructuredResponsesClient } from '@headstart-health/openai-platform/responses';
import { describe, expect, it, vi } from 'vitest';

import { EVIDENCE_ENGINE_VERSION } from './engine-version.js';
import { INTERPRETATION_BINDING_VERSION } from './interpretation-binding.js';
import { prepareReportInterpreter } from './report-interpreter-setup.js';

const environment = {
  SLA_INTERPRETER_PROVIDER: 'openai-responses',
  SLA_INTERPRETER_MODEL: 'gpt-5.6-sol',
  SLA_APPROVED_CREDENTIAL_SOURCE: 'synthetic-approved-source',
};
const now = Date.parse('2026-09-24T18:00:00.000Z');
const preflight = {
  passed: true,
  model: environment.SLA_INTERPRETER_MODEL,
  provider: environment.SLA_INTERPRETER_PROVIDER,
  engineVersion: EVIDENCE_ENGINE_VERSION,
  bindingVersion: INTERPRETATION_BINDING_VERSION,
  checkedAt: new Date(now).toISOString(),
  store: false,
  credentialSourceApproved: true,
};
const client = vi.fn<StructuredResponsesClient>();
describe('approved report interpreter startup', () => {
  it('requires an explicit on/off choice without interpreting anything', () => {
    for (const setting of [undefined, '', 'automatic'])
      expect(() =>
        prepareReportInterpreter({
          setting,
          environment: {},
          client: null,
          artifact: {},
        })
      ).toThrow('explicitly on or off');
    const disabled = prepareReportInterpreter({
      setting: ' off ',
      environment: {},
      client,
      artifact: {},
    });
    expect(disabled).toMatchObject({
      requested: false,
      execution: { apiEnabled: false },
      config: null,
    });
    expect(
      prepareReportInterpreter({ setting: 'on', environment: {}, client: null, artifact: {} })
        .config
    ).toBeNull();
    expect(client).not.toHaveBeenCalled();
  });
  it('uses the live preflight lease and exact provider contract before API execution', () => {
    const input = { setting: 'on', environment, client, artifact: {}, now, preflight };
    expect(prepareReportInterpreter(input).execution).toMatchObject({ apiEnabled: true, client });
    for (const checkedAt of [
      'invalid',
      new Date(now + 1).toISOString(),
      new Date(now - 1_800_001).toISOString(),
    ])
      expect(() =>
        prepareReportInterpreter({ ...input, preflight: { ...preflight, checkedAt } })
      ).toThrow('last 30 minutes');
    expect(
      prepareReportInterpreter({
        ...input,
        preflight: { ...preflight, checkedAt: new Date(now - 1_800_000).toISOString() },
      }).execution.apiEnabled
    ).toBe(true);
    for (const change of [
      { store: true },
      { passed: false },
      { model: 'another-model' },
      { provider: 'other' },
      { engineVersion: 'old' },
      { bindingVersion: 'old' },
      { credentialSourceApproved: false },
    ])
      expect(() =>
        prepareReportInterpreter({ ...input, preflight: { ...preflight, ...change } })
      ).toThrow('preflight');
    expect(() =>
      prepareReportInterpreter({
        ...input,
        environment: { ...environment, SLA_APPROVED_CREDENTIAL_SOURCE: '' },
      })
    ).toThrow('CREDENTIAL_SOURCE');
  });
  it('preserves current-run Codex provenance and shadows row-level API metadata', () => {
    const findings = [{ sourceRecordId: 'meeting:1', findings: [] }];
    const artifact = {
      currentRunPrecomputed: true,
      apiEnabled: false,
      engineVersion: EVIDENCE_ENGINE_VERSION,
      executionProvenance: { kind: 'codex-current-run', api: false },
      rows: [
        { opportunityId: '', interpretations: [] },
        { opportunityId: 'opp', model: 'row-model', interpretations: findings },
      ],
    };
    const input = { setting: 'on', environment: {}, client: null, artifact };
    const result = prepareReportInterpreter(input);
    expect(result.config).toBeNull();
    expect(result.precomputed.size).toBe(1);
    expect(result.precomputed.get('opp')?.interpretations).toBe(findings);
    expect(result.precomputed.get('opp')).toHaveProperty('model', undefined);
    for (const change of [
      { provider: undefined },
      { model: undefined },
      { store: undefined },
      { apiEnabled: true },
      { engineVersion: 'old' },
      { executionProvenance: { kind: 'api', api: true } },
    ])
      expect(() =>
        prepareReportInterpreter({ ...input, artifact: { ...artifact, ...change } })
      ).toThrow('Codex');
  });
  it('validates saved API metadata without requiring a live credential or a new API call', () => {
    const artifact = {
      apiEnabled: true,
      model: environment.SLA_INTERPRETER_MODEL,
      provider: environment.SLA_INTERPRETER_PROVIDER,
      engineVersion: EVIDENCE_ENGINE_VERSION,
      store: false,
      rows: [{ opportunityId: 'opp', interpretations: [] }],
    };
    const input = {
      setting: 'on',
      environment: { ...environment, SLA_APPROVED_CREDENTIAL_SOURCE: '' },
      client: null,
      artifact,
    };
    expect(prepareReportInterpreter(input)).toMatchObject({
      execution: { apiEnabled: false },
      config: { model: 'gpt-5.6-sol', credentialSource: null },
    });
    for (const change of [
      { apiEnabled: false },
      { model: 'other' },
      { provider: 'other' },
      { engineVersion: 'old' },
      { store: true },
    ])
      expect(() =>
        prepareReportInterpreter({ ...input, artifact: { ...artifact, ...change } })
      ).toThrow('API interpretation artifact');
    expect(() => prepareReportInterpreter({ ...input, environment: {} })).toThrow(
      'SLA_INTERPRETER_PROVIDER'
    );
    // Original startup still checks a present Codex artifact even when API execution is selected.
    expect(() =>
      prepareReportInterpreter({
        ...input,
        environment,
        client,
        preflight,
        now,
        artifact: { ...artifact, currentRunPrecomputed: true },
      })
    ).toThrow('Codex');
  });
});
