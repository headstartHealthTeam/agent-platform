import { z } from 'zod';

import { boundedJson } from './response.js';
import { containsViewerToken, isBrowserlessViewerPath } from './viewer-path.js';

const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,256}$/);
const createResponse = z.object({ liveURL: z.string().max(4096), liveURLId: identifier });
const statusResponse = z.object({
  status: z.enum(['open', 'closed', 'expired']),
  reason: z.enum(['closed', 'timeout', 'userDone', 'userFailed']).nullable(),
  interactable: z.boolean(),
  viewerCount: z.number().int().min(0),
  expiresAt: z.number().int().positive(),
});
const MAX_LIFETIME_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;

export type BrowserViewerStatus = z.infer<typeof statusResponse>;
export type BrowserViewerFailure =
  | 'invalid_binding'
  | 'authorization_ended'
  | 'cancelled'
  | 'access_rejected'
  | 'unavailable'
  | 'request_rejected'
  | 'read_failed'
  | 'dispatch_uncertain';

/** Safe code only: never include provider errors, URLs, response bodies or credential values. */
export class BrowserViewerError extends Error {
  public constructor(public readonly code: BrowserViewerFailure) {
    super(`Browser viewer: ${code}`);
    this.name = 'BrowserViewerError';
  }
}

/** All fields are private application state, especially the bearer-capability liveURL. */
export interface BrowserViewerReceipt {
  browserId: string;
  liveURLId: string;
  liveURL: string;
  /** Conservative local upper bound; fresh status may show an earlier session-bound expiry. */
  notAfter: number;
}

/** Trusted composition only, never values chosen by a model or incoming browser request. */
export interface BrowserlessViewerConfig {
  origin: string;
  token: string;
  /** Verified provider-plan connection limit, not persisted-profile TTL. */
  maximumSessionDurationMs: number;
}

function configuredOrigin(config: BrowserlessViewerConfig): string {
  try {
    const url = new URL(config.origin);
    if (
      url.protocol !== 'https:' ||
      config.origin !== url.origin ||
      !config.token ||
      config.token.length > 8192 ||
      /\s/.test(config.token) ||
      !Number.isSafeInteger(config.maximumSessionDurationMs) ||
      config.maximumSessionDurationMs <= 0
    )
      throw new Error('Binding');
    return url.origin;
  } catch {
    throw new BrowserViewerError('invalid_binding');
  }
}

function exactId(value: string): string {
  const parsed = identifier.safeParse(value);
  if (!parsed.success) throw new BrowserViewerError('invalid_binding');
  return parsed.data;
}

function responseFailure(status: number, method: string): BrowserViewerFailure {
  if (status === 401 || status === 403) return 'access_rejected';
  if (status === 404) return 'unavailable';
  if (status === 400 || status === 429) return 'request_rejected';
  // A server/proxy error after mutation dispatch cannot establish that nothing happened.
  return method === 'GET' ? 'read_failed' : 'dispatch_uncertain';
}

/** One documented REST request per method. No retries, provisioning, control or browser revival. */
export class BrowserlessViewerClient {
  readonly #origin: string;
  readonly #token: string;
  readonly #maximumSessionDurationMs: number;

  public constructor(config: BrowserlessViewerConfig) {
    this.#origin = configuredOrigin(config);
    this.#token = config.token;
    this.#maximumSessionDurationMs = config.maximumSessionDurationMs;
  }

  public async createWatchViewer(
    browserId: string,
    authorizationNotAfter: number,
    signal: AbortSignal
  ): Promise<BrowserViewerReceipt> {
    const startedAt = Date.now();
    if (!Number.isSafeInteger(authorizationNotAfter) || authorizationNotAfter <= startedAt)
      throw new BrowserViewerError('authorization_ended');
    const timeout = Math.min(
      MAX_LIFETIME_MS,
      this.#maximumSessionDurationMs,
      authorizationNotAfter - startedAt
    );
    const value = createResponse.safeParse(
      await this.#request('POST', browserId, undefined, signal, {
        interactable: false,
        resizable: false,
        showBrowserInterface: true,
        timeout,
        type: 'jpeg',
        quality: 70,
      })
    );
    if (!value.success) throw new BrowserViewerError('dispatch_uncertain');
    const liveURL = this.#validateURL(value.data.liveURL, value.data.liveURLId);
    // Do not throw away a known receipt when authorization expires during provider I/O.
    // The owner must retain it and reconcile/revoke; not expose or create a replacement blindly.
    return {
      browserId,
      liveURLId: value.data.liveURLId,
      liveURL,
      notAfter: startedAt + timeout,
    };
  }

  public async status(
    browserId: string,
    liveURLId: string,
    signal: AbortSignal
  ): Promise<BrowserViewerStatus> {
    const parsed = statusResponse.safeParse(
      await this.#request('GET', browserId, liveURLId, signal)
    );
    if (!parsed.success) throw new BrowserViewerError('read_failed');
    return parsed.data;
  }

  /** 404 stays unavailable, not proof of successful revocation or a stopped browser. */
  public async close(browserId: string, liveURLId: string, signal: AbortSignal): Promise<void> {
    await this.#request('DELETE', browserId, liveURLId, signal);
  }

  #validateURL(value: string, id: string): string {
    try {
      const url = new URL(value);
      if (
        url.origin !== this.#origin ||
        !isBrowserlessViewerPath(url.pathname) ||
        url.username ||
        url.password ||
        url.hash ||
        url.searchParams.getAll('i').length !== 1 ||
        url.searchParams.get('i') !== id ||
        url.searchParams.has('token') ||
        containsViewerToken(value, url, this.#token)
      )
        throw new Error('Viewer routing');
      return url.href;
    } catch {
      throw new BrowserViewerError('dispatch_uncertain');
    }
  }

  async #request(
    method: 'GET' | 'POST' | 'DELETE',
    browserId: string,
    liveURLId: string | undefined,
    signal: AbortSignal,
    body?: object
  ): Promise<unknown> {
    const browser = exactId(browserId);
    const suffix = liveURLId === undefined ? '' : `/${exactId(liveURLId)}`;
    if (signal.aborted) throw new BrowserViewerError('cancelled');
    const url = new URL(`/browser/${browser}/live${suffix}`, this.#origin);
    url.searchParams.set('token', this.#token);
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
    try {
      // The provider documents query authentication. This URL must never enter an activity feed.
      const response = await fetch(url, {
        method,
        redirect: 'error',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: requestSignal,
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new BrowserViewerError(responseFailure(response.status, method));
      }
      if (response.redirected) {
        await response.body?.cancel();
        throw new Error('Redirect');
      }
      if (method === 'DELETE') {
        await response.body?.cancel();
        if (response.status !== 204) throw new Error('Unexpected close response');
        return undefined;
      }
      return await boundedJson(response);
    } catch (error) {
      if (error instanceof BrowserViewerError) throw error;
      // Actual fetch/body settlement is awaited. A local timeout is not proof of remote rollback.
      throw new BrowserViewerError(method === 'GET' ? 'read_failed' : 'dispatch_uncertain');
    }
  }
}
