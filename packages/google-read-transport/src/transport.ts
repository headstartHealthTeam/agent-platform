import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { z } from 'zod';

const execute = promisify(execFile);

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
  public constructor(
    run: () => Promise<string> = async () => {
      const result = await execute(
        'gcloud',
        ['auth', 'application-default', 'print-access-token'],
        { timeout: 60_000, maxBuffer: 64_000 }
      );
      return result.stdout;
    }
  ) {
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
    } catch {
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
