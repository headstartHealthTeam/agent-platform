import { z } from 'zod';

import { GoogleReadError, type GoogleTokenProvider } from './transport.js';

const MAX_RESPONSE_BYTES = 16_384;
const REQUEST_TIMEOUT_MS = 15_000;
const FAILURE = 'Configured Google token endpoint could not supply an access token';

/** A trusted deployment binding, not a URL or scope selected by an agent request. */
export const googleTokenEndpointConfigSchema = z
  .object({
    endpoint: z
      .string()
      .max(2048)
      .refine((value) => {
        try {
          const url = new URL(value);
          return (
            url.protocol === 'https:' &&
            !url.username &&
            !url.password &&
            !value.includes('?') &&
            !value.includes('#') &&
            value === url.href
          );
        } catch {
          return false;
        }
      }),
    authorizationEnvironmentVariable: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,127}$/),
  })
  .strict();

const tokenResponseSchema = z
  .object({
    access_token: z
      .string()
      .min(1)
      .max(8192)
      .regex(/^[\x21-\x7e]+$/),
    token_type: z.literal('Bearer'),
    expires_in: z.number().int().positive().max(3600),
    scope: z.string().min(1).max(4096),
  })
  .strict();

async function readTokenResponse(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null && Number(declaredLength) > MAX_RESPONSE_BYTES)
    throw new Error('Response limit');
  if (response.body === null) throw new Error('Missing response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error('Response limit');
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** Renewable tokens without a Google private key or application dependency in the reader. */
export class GoogleEndpointTokenProvider implements GoogleTokenProvider {
  readonly #config: z.infer<typeof googleTokenEndpointConfigSchema>;
  readonly #scopes: ReadonlySet<string>;
  #cached: { token: string; requestedAt: number; refreshAt: number } | undefined;
  #refresh: Promise<string> | undefined;

  public constructor(
    config: z.infer<typeof googleTokenEndpointConfigSchema>,
    scopes: readonly string[]
  ) {
    const parsed = googleTokenEndpointConfigSchema.safeParse(config);
    if (
      !parsed.success ||
      scopes.length === 0 ||
      scopes.some((scope) => scope.length === 0 || /\s/.test(scope))
    )
      throw new GoogleReadError('An exact HTTPS token endpoint and explicit scopes are required');
    this.#config = parsed.data;
    this.#scopes = new Set(scopes);
  }

  public async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.#cached && now >= this.#cached.requestedAt && now < this.#cached.refreshAt)
      return this.#cached.token;
    if (this.#refresh) return this.#refresh;
    this.#refresh = this.#requestToken();
    try {
      return await this.#refresh;
    } finally {
      this.#refresh = undefined;
    }
  }

  async #requestToken(): Promise<string> {
    try {
      const authorization = process.env[this.#config.authorizationEnvironmentVariable];
      if (!authorization || authorization.length > 8192 || /[\r\n]/.test(authorization))
        throw new Error('Missing authorization');
      const requestedAt = Date.now();
      const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      const response = await fetch(this.#config.endpoint, {
        method: 'GET',
        headers: { Authorization: authorization, Accept: 'application/json' },
        redirect: 'error',
        cache: 'no-store',
        signal,
      });
      if (!response.ok || response.redirected) throw new Error('Token endpoint response failed');
      const value = tokenResponseSchema.parse(await readTokenResponse(response));
      signal.throwIfAborted();
      const returnedScopes = new Set(value.scope.trim().split(/\s+/));
      if (
        returnedScopes.size !== this.#scopes.size ||
        [...returnedScopes].some((scope) => !this.#scopes.has(scope))
      )
        throw new Error('Unexpected token scope');
      // Start at dispatch, not receipt, so network delay cannot extend the issuer's lifetime.
      const lifetime = value.expires_in * 1000;
      const refreshAt = requestedAt + lifetime - Math.min(30_000, lifetime / 10);
      const receivedAt = Date.now();
      if (receivedAt < requestedAt || receivedAt >= refreshAt)
        throw new Error('Token already needs renewal');
      this.#cached = { token: value.access_token, requestedAt, refreshAt };
      return value.access_token;
    } catch {
      // Endpoint URLs, response bodies and credentials must never appear in public errors.
      throw new GoogleReadError(FAILURE);
    }
  }
}
