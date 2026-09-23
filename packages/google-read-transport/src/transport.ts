import spawn from 'cross-spawn';
import { z } from 'zod';

class GoogleCommandUnavailableError extends Error {}
const ADC_COMMAND_UNAVAILABLE =
  'Google ADC command could not start; verify gcloud installation and PATH before retrying';
const ADC_UNAVAILABLE =
  'Google ADC is unavailable; follow the configured organization OAuth recovery procedure';
const SAFE_TOKEN_GUIDANCE = new Set([ADC_COMMAND_UNAVAILABLE, ADC_UNAVAILABLE]);

function readGcloudToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    // cross-spawn supports the normal Windows gcloud.cmd entrypoint while retaining an argv
    // boundary. Never enable shell:true or interpolate credential commands into a shell string.
    const child = spawn('gcloud', ['auth', 'application-default', 'print-access-token'], {
      timeout: 60_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let bytes = 0;
    const accept = (chunk: Buffer): boolean => {
      bytes += chunk.byteLength;
      if (bytes <= 64_000) return true;
      child.kill();
      reject(new Error('ADC command output exceeded its limit'));
      return false;
    };
    child.stdout?.on('data', (chunk: Buffer) => {
      if (accept(chunk)) output += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      accept(chunk);
    });
    child.on('error', () => {
      reject(new GoogleCommandUnavailableError());
    });
    child.on('close', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error('ADC command failed'));
    });
  });
}

export interface GoogleTokenProvider {
  getAccessToken(): Promise<string>;
}
export interface GoogleJsonReader {
  request(url: string, body?: Readonly<Record<string, unknown>>): Promise<unknown>;
}
export type GoogleReadFailureKind =
  | 'configuration'
  | 'authentication'
  | 'permission'
  | 'rate-limit'
  | 'server'
  | 'http'
  | 'transport'
  | 'invalid-response';
export interface GoogleReadFailureMetadata {
  readonly status?: number | null;
  readonly retryAfterMs?: number | null;
  readonly transient?: boolean;
  readonly kind?: GoogleReadFailureKind;
}
export class GoogleReadError extends Error {
  public readonly status: number | null;
  public readonly retryAfterMs: number | null;
  public readonly transient: boolean;
  public readonly kind: GoogleReadFailureKind;
  public constructor(message: string, metadata: GoogleReadFailureMetadata = {}) {
    super(message);
    this.name = 'GoogleReadError';
    this.status = metadata.status ?? null;
    this.retryAfterMs = metadata.retryAfterMs ?? null;
    this.transient = metadata.transient ?? false;
    this.kind = metadata.kind ?? 'configuration';
  }
}

function retryDelay(value: string | null, now: number): number | null {
  if (value === null || value.trim().length === 0) return null;
  // Retain the source adapter's fractional-second compatibility as well as HTTP dates.
  const parts = value.trim().split('.');
  const numeric = parts.length <= 2 && parts.every((part) => /^\d+$/.test(part));
  const delay = numeric ? Number(value) * 1000 : Date.parse(value) - now;
  return Number.isFinite(delay) && delay >= 0 ? Math.ceil(delay) : null;
}

function transportFailure(error: unknown): GoogleReadFailureMetadata {
  const name: unknown =
    typeof error === 'object' && error !== null ? Reflect.get(error, 'name') : undefined;
  return {
    kind: 'transport',
    transient: error instanceof TypeError || name === 'AbortError' || name === 'TimeoutError',
  };
}

function responseBodyFailure(error: unknown): GoogleReadError {
  const failure = transportFailure(error);
  return failure.transient === true
    ? new GoogleReadError('Google response body could not be read', failure)
    : new GoogleReadError('Google returned invalid JSON', { kind: 'invalid-response' });
}

export function googleHttpFailureMetadata(
  response: GoogleReadResponse,
  now: number
): GoogleReadFailureMetadata {
  const status = response.status ?? null;
  let kind: GoogleReadFailureKind = 'http';
  if (status === 401) kind = 'authentication';
  else if (status === 403) kind = 'permission';
  else if (status === 429) kind = 'rate-limit';
  else if (status !== null && status >= 500) kind = 'server';
  return {
    status,
    kind,
    retryAfterMs: retryDelay(response.headers?.get('retry-after') ?? null, now),
    transient: status === 429 || (status !== null && status >= 500),
  };
}
export class GcloudReadTokenProvider implements GoogleTokenProvider {
  readonly #run: () => Promise<string>;
  #cached: { token: string; obtainedAt: number } | undefined;
  public constructor(run: () => Promise<string> = readGcloudToken) {
    this.#run = run;
  }
  public async getAccessToken(): Promise<string> {
    if (this.#cached !== undefined && Date.now() - this.#cached.obtainedAt < 300_000)
      return this.#cached.token;
    try {
      const token = (await this.#run()).trim();
      if (token.length === 0) throw new Error('empty token');
      this.#cached = { token, obtainedAt: Date.now() };
      return token;
    } catch (error: unknown) {
      if (error instanceof GoogleCommandUnavailableError) {
        throw new GoogleReadError(ADC_COMMAND_UNAVAILABLE);
      }
      throw new GoogleReadError(ADC_UNAVAILABLE);
    }
  }
}
const ALLOWED_HOSTS = new Set([
  'www.googleapis.com',
  'analyticsdata.googleapis.com',
  'analyticsadmin.googleapis.com',
  'sheets.googleapis.com',
]);
async function failureReason(response: GoogleReadResponse, readDetails = true): Promise<string> {
  const failure = z
    .object({
      error: z
        .object({
          status: z.string().optional(),
          details: z.array(z.object({ reason: z.string().optional() }).loose()).optional(),
        })
        .loose(),
    })
    .safeParse(readDetails ? await response.json?.().catch(() => undefined) : undefined);
  return failure.success
    ? [failure.data.error.status, ...(failure.data.error.details ?? []).map((item) => item.reason)]
        .filter((item) => item !== undefined && /^[A-Z_]+$/.test(item))
        .join(', ')
    : '';
}
export class GoogleReadTransport implements GoogleJsonReader {
  readonly #tokens: GoogleTokenProvider;
  readonly #options: GoogleReadTransportOptions;
  public constructor(tokens: GoogleTokenProvider, options: GoogleReadTransportOptions = {}) {
    this.#tokens = tokens;
    this.#options = options;
  }
  async #accessToken(): Promise<string> {
    try {
      return await this.#tokens.getAccessToken();
    } catch (error: unknown) {
      // Public token-provider implementations can throw arbitrary errors, including our public
      // error class. Preserve only fixed adapter-owned guidance, never arbitrary messages/causes.
      if (error instanceof GoogleReadError && SAFE_TOKEN_GUIDANCE.has(error.message)) {
        throw new GoogleReadError(error.message);
      }
      throw new GoogleReadError(
        'Google token provider failed; verify the configured provider and recovery procedure'
      );
    }
  }
  public async request(url: string, body?: Readonly<Record<string, unknown>>): Promise<unknown> {
    const parsed = new URL(url);
    if (
      parsed.protocol !== 'https:' ||
      !ALLOWED_HOSTS.has(parsed.hostname) ||
      parsed.username ||
      parsed.password ||
      parsed.port
    )
      throw new GoogleReadError('Google API origin is not allowed');
    const allowedRead =
      (parsed.hostname === 'www.googleapis.com' &&
        searchConsoleRead(parsed.pathname, body !== undefined)) ||
      (parsed.hostname === 'analyticsdata.googleapis.com' &&
        body !== undefined &&
        /^\/v1beta\/properties\/\d+:runReport$/.test(parsed.pathname)) ||
      (parsed.hostname === 'analyticsadmin.googleapis.com' &&
        body === undefined &&
        /^\/v1beta\/properties\/\d+$/.test(parsed.pathname)) ||
      (parsed.hostname === 'sheets.googleapis.com' &&
        body === undefined &&
        (/^\/v4\/spreadsheets\/[A-Za-z0-9_-]+$/.test(parsed.pathname) ||
          /^\/v4\/spreadsheets\/[A-Za-z0-9_-]+\/values\/[^/]+$/.test(parsed.pathname)));
    if (!allowedRead) throw new GoogleReadError('Google operation is outside the read allowlist');
    const token = await this.#accessToken();
    let response: GoogleReadResponse;
    try {
      await this.#options.beforeFetch?.();
      response = await (this.#options.fetchImpl ?? globalThis.fetch)(url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error: unknown) {
      throw new GoogleReadError(
        'Google read failed before a response; verify ADC and network access',
        transportFailure(error)
      );
    }
    if (!response.ok) {
      const reason = await failureReason(response, this.#options.readErrorDetails);
      throw new GoogleReadError(
        `Google read returned HTTP ${String(response.status)} from ${parsed.hostname}${reason ? ` (${reason})` : ''}`,
        googleHttpFailureMetadata(response, (this.#options.now ?? Date.now)())
      );
    }
    try {
      if (response.json === undefined) throw new TypeError('Google response body is unavailable');
      return await response.json();
    } catch (error: unknown) {
      throw responseBodyFailure(error);
    }
  }
}

export interface GoogleReadTransportOptions {
  readonly fetchImpl?: GoogleReadFetch;
  readonly now?: () => number;
  /** Consumer-owned pacing before timeout creation; the transport still performs one attempt. */
  readonly beforeFetch?: () => Promise<void>;
  /** Omit even sanitized body inspection when a consumer requires headers-only failures. */
  readonly readErrorDetails?: boolean;
}
/** Minimal injected HTTP surface; native fetch Responses satisfy this contract directly. */
export interface GoogleReadResponse {
  readonly ok: boolean;
  readonly status?: number;
  readonly headers?: { get(name: string): string | null };
  readonly json?: () => Promise<unknown>;
}
export type GoogleReadFetch = (url: string, init: RequestInit) => Promise<GoogleReadResponse>;

function searchConsoleRead(path: string, post: boolean): boolean {
  if (post) return /^\/webmasters\/v3\/sites\/[^/]+\/searchAnalytics\/query$/.test(path);
  return path === '/webmasters/v3/sites' || /^\/webmasters\/v3\/sites\/[^/]+\/sitemaps$/.test(path);
}
