import spawn from 'cross-spawn';
import { z } from 'zod';

class GoogleCommandUnavailableError extends Error {}

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
export class GoogleReadError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'GoogleReadError';
  }
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
        throw new GoogleReadError(
          'Google ADC command could not start; verify gcloud installation and PATH before retrying'
        );
      }
      throw new GoogleReadError(
        'Google ADC is unavailable; follow the configured organization OAuth recovery procedure'
      );
    }
  }
}
const ALLOWED_HOSTS = new Set([
  'www.googleapis.com',
  'analyticsdata.googleapis.com',
  'analyticsadmin.googleapis.com',
  'sheets.googleapis.com',
]);
export class GoogleReadTransport implements GoogleJsonReader {
  readonly #tokens: GoogleTokenProvider;
  public constructor(tokens: GoogleTokenProvider) {
    this.#tokens = tokens;
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
    let response: Response;
    try {
      response = await fetch(url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Authorization: `Bearer ${await this.#tokens.getAccessToken()}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new GoogleReadError(
        'Google read failed before a response; verify ADC and network access'
      );
    }
    if (!response.ok) {
      const failure = z
        .object({
          error: z
            .object({
              status: z.string().optional(),
              details: z.array(z.object({ reason: z.string().optional() }).loose()).optional(),
            })
            .loose(),
        })
        .safeParse(await response.json().catch(() => undefined));
      const reason = failure.success
        ? [failure.data.error.status, ...(failure.data.error.details ?? []).map((x) => x.reason)]
            .filter((x) => x !== undefined && /^[A-Z_]+$/.test(x))
            .join(', ')
        : '';
      throw new GoogleReadError(
        `Google read returned HTTP ${String(response.status)} from ${parsed.hostname}${reason ? ` (${reason})` : ''}`
      );
    }
    try {
      return await response.json();
    } catch {
      throw new GoogleReadError('Google returned invalid JSON');
    }
  }
}

function searchConsoleRead(path: string, post: boolean): boolean {
  if (post) return /^\/webmasters\/v3\/sites\/[^/]+\/searchAnalytics\/query$/.test(path);
  return path === '/webmasters/v3/sites' || /^\/webmasters\/v3\/sites\/[^/]+\/sitemaps$/.test(path);
}
