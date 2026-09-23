import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  APPROVED_INTERPRETER_MODEL,
  APPROVED_INTERPRETER_PROVIDER,
  assertInterpretationBinding,
  createInterpretationBinding,
  createInterpretationValidationBinding,
  interpretationBindingDiff,
  interpreterConfigFromEnv,
} from './interpretation-binding.js';

const input = {
  packet: { source: 'synthetic', segment: 'Synthetic transcript.' },
  provider: 'openai-responses',
  model: 'gpt-5.6-sol',
  instructions: 'Synthetic instructions.',
  schema: { type: 'object' },
  schemaName: 'synthetic_schema',
  engineVersion: '2026-09-22.2',
};
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('exact interpretation provenance', () => {
  it('matches source-computed API and provider-independent validation hashes', () => {
    const api = createInterpretationBinding(input);
    const validation = createInterpretationValidationBinding(input);
    expect(api).toEqual({
      bindingVersion: '2026-09-09.2',
      provider: 'openai-responses',
      model: 'gpt-5.6-sol',
      schemaName: 'synthetic_schema',
      engineVersion: '2026-09-22.2',
      store: false,
      instructionsHash: 'dd44e8325ea265e7f63e723461cf91dc4b358ce3d980f18a4c16e4711d6118ed',
      schemaHash: 'a2c799262a3ce3c19ef5cdd983bf3d12b43ab3c426227091b909dcb7054738c0',
      packetHash: 'f3bf1709c8967ad3c90b03c9549e922f8a5ab50b3fc147642fd2fbeb70f361dc',
      contractHash: 'd4668410e513a3a00752b4c14ce7616dbc6109364d17200a71c00116dfad4646',
      bindingHash: 'd15b6a1d34e94f89bcd7d69ee4ba6aba90ea79b988dfcb2f68636e74e2ec111c',
    });
    expect(validation).toMatchObject({
      bindingKind: 'packet-validation',
      packetHash: api.packetHash,
      contractHash: '8b69bdf4f320c6f20f406f791c7e3125b771dcc5d131a9410861e7127a749fa4',
      bindingHash: '10dacf4187cce0fa1506b5cf83c301b965d9dda896378366f57a73b094c0206f',
    });
    expect(validation).not.toHaveProperty('provider');
    expect(validation).not.toHaveProperty('model');
    expect(Object.keys(api)).toEqual([
      'bindingVersion',
      'provider',
      'model',
      'schemaName',
      'engineVersion',
      'store',
      'instructionsHash',
      'schemaHash',
      'packetHash',
      'contractHash',
      'bindingHash',
    ]);
    expect(Object.keys(validation)).toEqual([
      'bindingVersion',
      'bindingKind',
      'schemaName',
      'engineVersion',
      'instructionsHash',
      'schemaHash',
      'packetHash',
      'contractHash',
      'bindingHash',
    ]);
  });
  it('binds every packet and execution contract component without treating validation as API execution', () => {
    const binding = createInterpretationBinding(input);
    for (const extra of [
      { packet: { changed: true } },
      { provider: 'different' },
      { model: 'different' },
      { instructions: 'different' },
      { schema: { type: 'string' } },
      { schemaName: 'different' },
      { engineVersion: 'different' },
    ]) {
      expect(createInterpretationBinding({ ...input, ...extra }).bindingHash).not.toBe(
        binding.bindingHash
      );
    }
    expect(assertInterpretationBinding(binding, { ...binding })).toBe(true);
    expect(
      interpretationBindingDiff(binding, { ...binding, model: 'different', store: true })
    ).toEqual(['model', 'store']);
    expect(() =>
      assertInterpretationBinding(binding, { ...binding, packetHash: 'changed' })
    ).toThrow('Precomputed interpretation binding mismatch: packetHash');
    expect(interpretationBindingDiff(binding, null)).toEqual(['binding']);
    expect(interpretationBindingDiff(binding, 'invalid')).toEqual(['binding']);
    expect(interpretationBindingDiff(binding, [])).toEqual(Object.keys(binding));
    const inherited: unknown = Object.create(binding);
    expect(interpretationBindingDiff(binding, inherited)).toEqual([]);
    expect(
      interpretationBindingDiff(binding, createInterpretationValidationBinding(input))
    ).toContain('provider');
  });
  it('rejects incomplete contracts before hashing', () => {
    for (const extra of [
      { packet: null },
      { instructions: '' },
      { schema: null },
      { schemaName: '' },
      { engineVersion: '' },
    ]) {
      expect(() => createInterpretationBinding({ ...input, ...extra })).toThrow(
        'complete interpretation binding contract'
      );
      expect(() => createInterpretationValidationBinding({ ...input, ...extra })).toThrow(
        'complete interpretation validation contract'
      );
    }
    expect(() => createInterpretationBinding({ ...input, provider: '' })).toThrow(
      'complete interpretation binding contract'
    );
    expect(() => createInterpretationBinding({ ...input, model: '' })).toThrow(
      'complete interpretation binding contract'
    );
  });
  it('requires explicit approved provider/model and a credential source when requested', () => {
    const env = {
      SLA_INTERPRETER_PROVIDER: APPROVED_INTERPRETER_PROVIDER,
      SLA_INTERPRETER_MODEL: APPROVED_INTERPRETER_MODEL,
    };
    expect(() => interpreterConfigFromEnv({})).toThrow('SLA_INTERPRETER_PROVIDER');
    expect(() =>
      interpreterConfigFromEnv({ SLA_INTERPRETER_PROVIDER: APPROVED_INTERPRETER_PROVIDER })
    ).toThrow('SLA_INTERPRETER_MODEL');
    expect(() =>
      interpreterConfigFromEnv({ ...env, SLA_INTERPRETER_MODEL: 'another-model' })
    ).toThrow('SLA_INTERPRETER_MODEL');
    expect(() => interpreterConfigFromEnv(env, { requireCredentialSource: true })).toThrow(
      'SLA_APPROVED_CREDENTIAL_SOURCE'
    );
    expect(interpreterConfigFromEnv(env)).toEqual({
      provider: APPROVED_INTERPRETER_PROVIDER,
      model: APPROVED_INTERPRETER_MODEL,
      credentialSource: null,
    });
    expect(
      interpreterConfigFromEnv(
        { ...env, SLA_APPROVED_CREDENTIAL_SOURCE: ' synthetic-source ' },
        { requireCredentialSource: true }
      ).credentialSource
    ).toBe('synthetic-source');
    vi.stubEnv('SLA_INTERPRETER_PROVIDER', APPROVED_INTERPRETER_PROVIDER);
    vi.stubEnv('SLA_INTERPRETER_MODEL', APPROVED_INTERPRETER_MODEL);
    vi.stubEnv('SLA_APPROVED_CREDENTIAL_SOURCE', 'synthetic-source');
    expect(interpreterConfigFromEnv().credentialSource).toBe('synthetic-source');
  });
});
