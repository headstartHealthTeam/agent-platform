import path from 'node:path';

export class GoogleReaderError extends Error {
  public readonly code: string;
  public readonly status: number | null;
  public constructor(code: string, status: number | null = null) {
    super(code);
    this.name = 'GoogleReaderError';
    this.code = code;
    this.status = status;
  }
}
export interface GoogleCredentialFileStat {
  readonly mode: number;
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
}
export interface GoogleAdcCommandOptions {
  readonly env: NodeJS.ProcessEnv;
  readonly encoding: 'utf8';
  readonly timeout: number;
  readonly maxBuffer: number;
}
export interface GoogleBoundAdcOptions {
  readonly configDir: string;
  readonly clientIdFile: string;
  readonly expectedEmail: string;
  readonly execFile: (
    command: string,
    args: string[],
    options: GoogleAdcCommandOptions
  ) => Promise<{ readonly stdout: string }>;
  readonly readFile: (file: string, encoding: 'utf8') => Promise<string>;
  readonly lstat: (file: string) => Promise<GoogleCredentialFileStat>;
  readonly env?: NodeJS.ProcessEnv;
  readonly fetchImpl?: (
    url: string,
    init: RequestInit
  ) => Promise<{
    readonly ok: boolean;
    readonly status?: number;
    json(): Promise<unknown>;
  }>;
  readonly now?: () => number;
}
function field(value: unknown, name: string): unknown {
  if (value === undefined || value === null) throw new TypeError('Missing credential structure');
  if (typeof value !== 'object' && typeof value !== 'function') return undefined;
  const result: unknown = Reflect.get(value, name);
  return result;
}
function lowercase(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('Invalid identity');
  return value.toLowerCase();
}
function validatePrivateFiles(
  directory: GoogleCredentialFileStat,
  files: readonly GoogleCredentialFileStat[]
): void {
  if (
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    (directory.mode & 0o077) !== 0 ||
    files.some((stat) => !stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0)
  )
    throw new GoogleReaderError('GOOGLE_READER_PRIVATE_BINDING_REQUIRED');
}
function validateClient(adc: unknown, client: unknown, email: string): void {
  const mismatch = (): never => {
    throw new GoogleReaderError('GOOGLE_READER_CLIENT_OR_ACCOUNT_MISMATCH');
  };
  if (field(adc, 'type') !== 'authorized_user') mismatch();
  const installed = field(client, 'installed');
  const clientId =
    installed === undefined || installed === null ? undefined : field(installed, 'client_id');
  const hasClient = Boolean(clientId);
  if (!hasClient || field(adc, 'client_id') !== clientId) mismatch();
  const hasRefresh = Boolean(field(adc, 'refresh_token'));
  if (!hasRefresh) mismatch();
  const tokenUri = field(adc, 'token_uri'),
    hasUri = Boolean(tokenUri);
  if (hasUri && tokenUri !== 'https://oauth2.googleapis.com/token') mismatch();
  const account = field(adc, 'account'),
    hasAccount = Boolean(account);
  if (hasAccount && lowercase(account) !== email.toLowerCase()) mismatch();
}
function childEnvironment(env: NodeJS.ProcessEnv, configDirectory: string): NodeJS.ProcessEnv {
  return {
    ...Object.fromEntries(
      Object.entries(env).filter(
        ([key]) =>
          !key.startsWith('CLOUDSDK_') &&
          !['GOOGLE_APPLICATION_CREDENTIALS', 'OPENAI_API_KEY'].includes(key)
      )
    ),
    CLOUDSDK_CONFIG: configDirectory,
  };
}
async function readBoundToken(options: GoogleBoundAdcOptions): Promise<string> {
  const {
    configDir,
    clientIdFile,
    expectedEmail,
    lstat,
    readFile,
    execFile,
    env = process.env,
    fetchImpl = globalThis.fetch,
  } = options;
  const adcPath = path.join(configDir, 'application_default_credentials.json');
  const [directory, adcStat, clientStat] = await Promise.all([
    lstat(configDir),
    lstat(adcPath),
    lstat(clientIdFile),
  ]);
  validatePrivateFiles(directory, [adcStat, clientStat]);
  const adc: unknown = JSON.parse(await readFile(adcPath, 'utf8'));
  const client: unknown = JSON.parse(await readFile(clientIdFile, 'utf8'));
  validateClient(adc, client, expectedEmail);
  const result = await execFile('gcloud', ['auth', 'application-default', 'print-access-token'], {
    env: childEnvironment(env, configDir),
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
  const token = result.stdout.trim();
  if (!token || /\s/.test(token)) throw new GoogleReaderError('GOOGLE_READER_TOKEN_UNAVAILABLE');
  const response = await fetchImpl('https://www.googleapis.com/oauth2/v2/userinfo', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new GoogleReaderError('GOOGLE_READER_IDENTITY_UNAVAILABLE', response.status);
  const identity: unknown = await response.json();
  const email = field(identity, 'email');
  if (
    field(identity, 'verified_email') !== true ||
    (email === undefined || email === null ? undefined : lowercase(email)) !==
      expectedEmail.toLowerCase()
  )
    throw new GoogleReaderError('GOOGLE_READER_ACCOUNT_MISMATCH');
  return token;
}
/** Explicit host binding, no OAuth or discovery. Tokens remain in the caller's in-memory provider. */
export function createGoogleAdcTokenProvider(
  options: GoogleBoundAdcOptions
): () => Promise<string> {
  const {
    configDir,
    clientIdFile,
    expectedEmail,
    execFile,
    readFile,
    lstat,
    env = process.env,
    fetchImpl = globalThis.fetch,
    now = Date.now,
  } = options;
  if (
    ![configDir, clientIdFile].every(
      (value) => typeof value === 'string' && path.isAbsolute(value)
    ) ||
    typeof expectedEmail !== 'string' ||
    !/^[^\s@]+@[^\s@]+$/.test(expectedEmail)
  )
    throw new GoogleReaderError('GOOGLE_READER_BINDING_REQUIRED');
  // Preserve the approved construction-time identity/dependencies; env intentionally retains its reference.
  const binding = {
    configDir,
    clientIdFile,
    expectedEmail,
    execFile,
    readFile,
    lstat,
    env,
    fetchImpl,
  };
  let cached: string | undefined;
  let expiresAt = 0;
  let pending: Promise<string> | undefined;
  const refresh = async (): Promise<string> => {
    try {
      cached = await readBoundToken(binding);
      expiresAt = now() + 40 * 60 * 1000;
      return cached;
    } catch (error) {
      cached = undefined;
      expiresAt = 0;
      if (error instanceof GoogleReaderError) throw error;
      throw new GoogleReaderError('GOOGLE_READER_CREDENTIAL_UNAVAILABLE');
    }
  };
  return async () => {
    if (cached && now() < expiresAt) return cached;
    pending ??= refresh().finally(() => {
      pending = undefined;
    });
    return pending;
  };
}
