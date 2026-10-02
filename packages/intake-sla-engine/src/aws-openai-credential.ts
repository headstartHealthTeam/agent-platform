import { interpreterConfigFromEnv } from './interpretation-binding.js';

export interface AwsCredentialExecOptions {
  readonly encoding: 'utf8';
  readonly env: NodeJS.ProcessEnv;
  readonly timeout: 30000;
  readonly maxBuffer: 1048576;
}
export interface AwsOpenAICredentialInput<T> {
  readonly profile: unknown;
  readonly region: unknown;
  readonly secretId: unknown;
  readonly env?: Readonly<NodeJS.ProcessEnv>;
  readonly execFile: (
    command: 'aws',
    args: readonly string[],
    options: AwsCredentialExecOptions
  ) => Promise<{ readonly stdout: string }>;
  readonly run: (childEnv: NodeJS.ProcessEnv) => T | Promise<T>;
}
function explicitBinding(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim()) && !/[\r\n\0]/.test(value);
}
function secretValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    if (/^[{["]/.test(raw)) throw new Error('Malformed secret');
    return raw;
  }
}
function decodeSecret(stdout: string): string {
  const response: unknown = JSON.parse(stdout);
  if (
    typeof response !== 'object' ||
    response === null ||
    !('SecretString' in response) ||
    typeof response.SecretString !== 'string' ||
    !response.SecretString.trim()
  )
    throw new Error('Invalid secret');
  let value = secretValue(response.SecretString.trim());
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const entries = new Map(Object.entries(value));
    const keys = ['OPENAI_API_KEY', 'openai_api_key', 'apiKey', 'api_key', 'key']
      .filter((name) => entries.has(name))
      .map((name): unknown => entries.get(name));
    if (keys.length === 0 || new Set(keys).size !== 1) throw new Error('Ambiguous secret');
    [value] = keys;
  }
  if (typeof value !== 'string' || !value || /\s/.test(value))
    throw new Error('Invalid secret value');
  return value;
}
/** Intake's explicit AWS binding and child-only handoff; no inherited-key fallback or logging. */
export async function withAwsOpenAICredential<T>({
  profile,
  region,
  secretId,
  env = process.env,
  execFile,
  run,
}: AwsOpenAICredentialInput<T>): Promise<T> {
  if (!explicitBinding(profile) || !explicitBinding(region) || !explicitBinding(secretId))
    throw new Error('AWS_OPENAI_BINDING_REQUIRED');
  const cleanEnv = { ...env };
  delete cleanEnv['OPENAI_API_KEY'];
  const childEnv: NodeJS.ProcessEnv = {
    ...cleanEnv,
    SLA_APPROVED_CREDENTIAL_SOURCE: `aws-secrets-manager:${secretId}`,
  };
  if (childEnv['SLA_AI_INTERPRETATION'] !== 'on')
    throw new Error('SLA_AI_INTERPRETATION must be exactly on');
  interpreterConfigFromEnv(childEnv, { requireCredentialSource: true });
  try {
    const { stdout } = await execFile(
      'aws',
      [
        'secretsmanager',
        'get-secret-value',
        '--profile',
        profile,
        '--region',
        region,
        '--secret-id',
        secretId,
        '--output',
        'json',
      ],
      { encoding: 'utf8', env: cleanEnv, timeout: 30000, maxBuffer: 1048576 }
    );
    childEnv['OPENAI_API_KEY'] = decodeSecret(stdout);
  } catch {
    throw new Error('AWS_OPENAI_CREDENTIAL_UNAVAILABLE');
  }
  try {
    return await run(childEnv);
  } finally {
    delete childEnv['OPENAI_API_KEY'];
  }
}
