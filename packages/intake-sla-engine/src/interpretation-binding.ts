import { sha256Json } from './json-fingerprint.js';

export const INTERPRETATION_BINDING_VERSION = '2026-09-09.2';
export const APPROVED_INTERPRETER_PROVIDER = 'openai-responses';
export const APPROVED_INTERPRETER_MODEL = 'gpt-5.6-sol';
export interface InterpreterEnvironment {
  readonly SLA_INTERPRETER_PROVIDER?: string;
  readonly SLA_INTERPRETER_MODEL?: string;
  readonly SLA_APPROVED_CREDENTIAL_SOURCE?: string;
}
export interface InterpreterConfig {
  readonly provider: typeof APPROVED_INTERPRETER_PROVIDER;
  readonly model: typeof APPROVED_INTERPRETER_MODEL;
  readonly credentialSource: string | null;
}
export function interpreterConfigFromEnv(
  env: InterpreterEnvironment = process.env,
  { requireCredentialSource = false }: { readonly requireCredentialSource?: boolean } = {}
): InterpreterConfig {
  const provider = (env.SLA_INTERPRETER_PROVIDER ?? '').trim();
  const model = (env.SLA_INTERPRETER_MODEL ?? '').trim();
  const credentialSource = (env.SLA_APPROVED_CREDENTIAL_SOURCE ?? '').trim();
  if (provider !== APPROVED_INTERPRETER_PROVIDER)
    throw new Error(`SLA_INTERPRETER_PROVIDER must be exactly ${APPROVED_INTERPRETER_PROVIDER}`);
  if (model !== APPROVED_INTERPRETER_MODEL)
    throw new Error(`SLA_INTERPRETER_MODEL must be exactly ${APPROVED_INTERPRETER_MODEL}`);
  if (requireCredentialSource && !credentialSource)
    throw new Error('SLA_APPROVED_CREDENTIAL_SOURCE is required for API interpretation');
  return { provider, model, credentialSource: credentialSource || null };
}

export interface InterpretationValidationInput {
  readonly packet: unknown;
  readonly instructions: string;
  readonly schema: unknown;
  readonly schemaName: string;
  readonly engineVersion: string;
}
export interface InterpretationBindingInput extends InterpretationValidationInput {
  readonly provider: string;
  readonly model: string;
}
interface BindingHashes {
  readonly packetHash: string;
  readonly contractHash: string;
  readonly bindingHash: string;
}
interface ValidationContract {
  readonly bindingVersion: string;
  readonly schemaName: string;
  readonly engineVersion: string;
  readonly instructionsHash: string;
  readonly schemaHash: string;
}
export interface InterpretationBinding extends ValidationContract, BindingHashes {
  readonly provider: string;
  readonly model: string;
  readonly store: false;
}
export interface InterpretationValidationBinding extends ValidationContract, BindingHashes {
  readonly bindingKind: 'packet-validation';
}

function bindingHashes(packet: unknown, contract: ValidationContract): BindingHashes {
  const packetHash = sha256Json(packet);
  const contractHash = sha256Json(contract);
  return { packetHash, contractHash, bindingHash: sha256Json({ packetHash, contractHash }) };
}
function completeValidationInput(input: InterpretationValidationInput): boolean {
  return (
    Boolean(input.packet) &&
    Boolean(input.instructions) &&
    Boolean(input.schema) &&
    Boolean(input.schemaName) &&
    Boolean(input.engineVersion)
  );
}
function validationContract(input: InterpretationValidationInput): ValidationContract {
  return {
    bindingVersion: INTERPRETATION_BINDING_VERSION,
    schemaName: input.schemaName,
    engineVersion: input.engineVersion,
    instructionsHash: sha256Json(input.instructions),
    schemaHash: sha256Json(input.schema),
  };
}
export function createInterpretationBinding(
  input: InterpretationBindingInput
): InterpretationBinding {
  if (!completeValidationInput(input) || !input.provider || !input.model)
    throw new Error('A complete interpretation binding contract is required');
  const contract = {
    bindingVersion: INTERPRETATION_BINDING_VERSION,
    provider: input.provider,
    model: input.model,
    schemaName: input.schemaName,
    engineVersion: input.engineVersion,
    store: false as const,
    instructionsHash: sha256Json(input.instructions),
    schemaHash: sha256Json(input.schema),
  };
  return { ...contract, ...bindingHashes(input.packet, contract) };
}
export function createInterpretationValidationBinding(
  input: InterpretationValidationInput
): InterpretationValidationBinding {
  if (!completeValidationInput(input))
    throw new Error('A complete interpretation validation contract is required');
  const { bindingVersion, ...details } = validationContract(input);
  const contract = {
    bindingVersion,
    bindingKind: 'packet-validation' as const,
    ...details,
  };
  return { ...contract, ...bindingHashes(input.packet, contract) };
}

export function interpretationBindingDiff(
  expected: InterpretationBinding | InterpretationValidationBinding,
  actual: unknown
): string[] {
  if (actual === null || typeof actual !== 'object') return ['binding'];
  return Object.entries(expected)
    .filter(([key, value]) => {
      const observed: unknown = Reflect.get(actual, key);
      return observed !== value;
    })
    .map(([key]) => key);
}
export function assertInterpretationBinding(
  expected: InterpretationBinding | InterpretationValidationBinding,
  actual: unknown
): true {
  const differences = interpretationBindingDiff(expected, actual);
  if (differences.length > 0)
    throw new Error(`Precomputed interpretation binding mismatch: ${differences.join(', ')}`);
  return true;
}
