import { setTimeout as delay } from 'node:timers/promises';

import {
  GoogleReadError,
  GoogleReadTransport,
  googleHttpFailureMetadata,
} from '@headstart-health/google-read-transport';
import type {
  GoogleJsonReader,
  GoogleReadFetch,
  GoogleReadFailureMetadata,
} from '@headstart-health/google-read-transport';

import { requireContract as check } from './connector-checkpoint.js';
import { captureProperty } from './google-capture-property.js';
import type { PublicationPayload } from './publication-readback-types.js';

export class GoogleAdapterError extends Error {
  public readonly status: number | null;
  public readonly retryAfterMs: number | null;
  public readonly transient: boolean;
  public attempts?: number;
  public constructor({
    status = null,
    retryAfterMs = null,
    transient = false,
  }: GoogleReadFailureMetadata = {}) {
    super('Google adapter request failed; no response body or credential was logged');
    this.name = 'GoogleAdapterError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.transient = transient;
  }
}
function validStatus(status: number | null): number | null {
  return status !== null && Number.isInteger(status) && status >= 100 && status <= 599
    ? status
    : null;
}
function failure(error: unknown): GoogleAdapterError {
  if (error instanceof GoogleAdapterError) return error;
  if (error instanceof GoogleReadError) {
    const status = validStatus(error.status);
    return new GoogleAdapterError({
      status,
      retryAfterMs: error.retryAfterMs,
      transient:
        error.kind === 'transport'
          ? error.transient
          : status === 429 || (status !== null && status >= 500),
    });
  }
  return new GoogleAdapterError({
    transient:
      error instanceof TypeError ||
      ['AbortError', 'TimeoutError'].some((name) => captureProperty(error, 'name') === name),
  });
}
export interface GooglePublicationHttpOptions {
  readonly spreadsheetId: string;
  readonly tokenProvider: () => Promise<string>;
  readonly fetchImpl?: GoogleReadFetch;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<unknown>;
  readonly random?: () => number;
}
export interface GooglePublicationHttp {
  readonly read: GoogleJsonReader;
  readonly write: (payload: PublicationPayload) => Promise<unknown>;
}
/** Intake owns pacing/retry policy and exact authorized writes; shared transport owns provider reads. */
export function createGooglePublicationHttp(
  options: GooglePublicationHttpOptions
): GooglePublicationHttp {
  const {
    spreadsheetId,
    tokenProvider,
    fetchImpl = globalThis.fetch,
    now = Date.now,
    sleep = delay,
    random = Math.random,
  } = options;
  let nextReadAt = 0;
  let queue = Promise.resolve();
  const pace = (): Promise<void> => {
    const turn = queue.then(async () => {
      while (nextReadAt > now()) await sleep(nextReadAt - now());
      nextReadAt = now() + 1100;
      return undefined;
    });
    queue = turn.catch(() => undefined);
    return turn;
  };
  const target = (body: unknown): unknown => {
    if (body === undefined || body === null) throw new TypeError('Missing Google response');
    check(captureProperty(body, 'spreadsheetId') === spreadsheetId, 'Wrong target');
    return body;
  };
  const once = async (url: string, payload?: PublicationPayload): Promise<unknown> => {
    try {
      const token = await tokenProvider();
      check(typeof token === 'string' && token.length > 0, 'No credential');
      if (payload === undefined) {
        const http = new GoogleReadTransport(
          { getAccessToken: (): Promise<string> => Promise.resolve(token) },
          {
            fetchImpl,
            beforeFetch: pace,
            now,
            readErrorDetails: false,
          }
        );
        return target(await http.request(url));
      }
      const response = await fetchImpl(url, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(60_000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: payload.requests,
          includeSpreadsheetInResponse:
            captureProperty(payload, 'include_spreadsheet_in_response') ?? false,
          responseIncludeGridData: captureProperty(payload, 'response_include_grid_data') ?? false,
        }),
      });
      if (!response.ok) {
        const metadata = googleHttpFailureMetadata(response, now());
        const status = validStatus(metadata.status ?? null);
        throw new GoogleAdapterError({
          ...metadata,
          status,
          transient: status === 429 || (status !== null && status >= 500),
        });
      }
      if (response.json === undefined) throw new TypeError('Missing Google response body');
      return target(await response.json());
    } catch (error) {
      throw failure(error);
    }
  };
  const request = async (url: string, payload?: PublicationPayload): Promise<unknown> => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await once(url, payload);
      } catch (error) {
        const sanitized = failure(error);
        sanitized.attempts = attempt;
        // A POST may already have applied. Only executor readback can resolve that outcome.
        if (payload !== undefined || !sanitized.transient || attempt >= 5) throw sanitized;
        const jitter = Math.floor(Math.max(0, Math.min(1, random())) * 1000);
        const wait = Math.max(sanitized.retryAfterMs ?? 0, 1000 * 2 ** (attempt - 1) + jitter);
        if (wait > 60_000) throw sanitized;
        await sleep(wait);
      }
    }
  };
  return {
    read: { request: (url): Promise<unknown> => request(url) },
    write: (payload): Promise<unknown> =>
      request(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
        payload
      ),
  };
}
