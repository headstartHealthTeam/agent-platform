import type { GoogleReadFetch, GoogleReadResponse } from '@headstart-health/google-read-transport';
import { describe, expect, it, vi } from 'vitest';

import { createGoogleRestAdapter, GoogleAdapterError } from './google-publication-adapter.js';
import type { GooglePublicationAdapterOptions } from './google-publication-adapter.js';
import { sha256Json } from './json-fingerprint.js';

const manifest = { spreadsheetId: 'synthetic', runId: 'run', stages: [] };
const grid = { id: 'grid', title: 'Queue', sheetId: 1, kind: 'grid-properties' };
function good(): GoogleReadResponse {
  return {
    ok: true,
    json: (): Promise<unknown> =>
      Promise.resolve({
        spreadsheetId: 'synthetic',
        sheets: [{ properties: { sheetId: 1, gridProperties: { rowCount: 10 } } }],
      }),
  };
}
function fixture(
  fetchImpl: GoogleReadFetch,
  overrides: Partial<GooglePublicationAdapterOptions> = {}
): {
  options: GooglePublicationAdapterOptions;
  sleeps: number[];
} {
  let time = Date.parse('2026-01-01T00:00:00Z');
  const sleeps: number[] = [];
  return {
    sleeps,
    options: {
      manifest,
      tokenProvider: (): Promise<string> => Promise.resolve('synthetic'),
      checkConcurrency: (): Promise<undefined> => Promise.resolve(undefined),
      fetchImpl,
      now: () => time,
      random: () => 0,
      sleep: (ms): Promise<void> => {
        sleeps.push(ms);
        time += ms;
        return Promise.resolve();
      },
      ...overrides,
    },
  };
}
describe('Google publication bounded failures', () => {
  it.each(['recover', 'exhaust', 'long-delay', 'forbidden'])(
    'retains approved retry policy: %s',
    async (scenario) => {
      let attempts = 0;
      const json = vi.fn((): Promise<unknown> =>
        Promise.reject(new Error('must not read private response'))
      );
      const f = fixture((): Promise<GoogleReadResponse> => {
        attempts++;
        if (scenario === 'recover' && attempts === 3) return Promise.resolve(good());
        const status =
          scenario === 'forbidden' ? 403 : scenario === 'recover' && attempts === 2 ? 503 : 429;
        return Promise.resolve({
          ok: false,
          status,
          headers: new Headers({ 'Retry-After': scenario === 'long-delay' ? '61' : '3' }),
          json,
        });
      });
      const onIncompleteCapture = vi.fn((): Promise<void> => Promise.resolve());
      const input = { ...manifest, assertions: [grid], onIncompleteCapture };
      const adapter = createGoogleRestAdapter(f.options);
      if (scenario === 'recover') {
        expect((await adapter.readAssertions(input)).assertions).toHaveLength(1);
        expect(attempts).toBe(3);
        expect(f.sleeps).toEqual([3000, 3000]);
        expect(onIncompleteCapture).not.toHaveBeenCalled();
      } else {
        await expect(adapter.readAssertions(input)).rejects.toMatchObject({
          name: 'GoogleAdapterError',
          status: scenario === 'forbidden' ? 403 : 429,
          retryAfterMs: scenario === 'long-delay' ? 61000 : 3000,
          attempts: scenario === 'exhaust' ? 5 : 1,
        });
        expect(onIncompleteCapture).toHaveBeenCalledWith({
          runId: manifest.runId,
          spreadsheetId: manifest.spreadsheetId,
          complete: false,
          expectedAssertions: 1,
          assertions: [],
        });
        expect(f.sleeps.every((ms) => ms <= 60_000)).toBe(true);
      }
      expect(json).not.toHaveBeenCalled();
    }
  );
  it('retains completed assertions in private callback and never retries uncertain POSTs', async () => {
    let reads = 0;
    let writes = 0;
    const payload = { requests: [{ synthetic: true }] };
    const f = fixture(
      (_url, init): Promise<GoogleReadResponse> => {
        if (init.method === 'POST') {
          writes++;
          return Promise.resolve({ ok: false, status: 503 });
        }
        reads++;
        return Promise.resolve(reads === 1 ? good() : { ok: false, status: 429 });
      },
      {
        manifest: {
          ...manifest,
          stages: [{ id: 'stage', calls: [{ payloadHash: sha256Json(payload) }] }],
        },
      }
    );
    const adapter = createGoogleRestAdapter(f.options);
    const onIncompleteCapture = vi.fn((): Promise<void> => Promise.resolve());
    await expect(
      adapter.readAssertions({
        ...manifest,
        assertions: [grid, { ...grid, id: 'second', title: 'Second' }],
        onIncompleteCapture,
      })
    ).rejects.toMatchObject({ status: 429, attempts: 5 });
    expect(reads).toBe(6);
    expect(onIncompleteCapture).toHaveBeenCalledWith({
      runId: manifest.runId,
      spreadsheetId: manifest.spreadsheetId,
      complete: false,
      expectedAssertions: 2,
      assertions: [{ id: grid.id, sheetId: 1, gridProperties: { rowCount: 10 } }],
    });
    await expect(
      adapter.apply({
        spreadsheetId: manifest.spreadsheetId,
        stageId: 'stage',
        callIndex: 0,
        payload,
      })
    ).rejects.toMatchObject({ status: 503, attempts: 1 });
    expect(writes).toBe(1);
  });
  it.each([999, 99, 503.5, Number.NaN])('does not retry invalid HTTP status %s', async (status) => {
    const fetchImpl = vi.fn((): Promise<GoogleReadResponse> =>
      Promise.resolve({ ok: false, status })
    );
    const adapter = createGoogleRestAdapter(fixture(fetchImpl).options);
    await expect(adapter.readMetadata()).rejects.toMatchObject({
      status: null,
      transient: false,
      attempts: 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('preserves fractional and HTTP-date retry headers, and clamps retry jitter', async () => {
    for (const header of ['0.5', 'Thu, 01 Jan 2026 00:00:03 GMT', 'bad', '-1', '']) {
      let attempts = 0;
      const f = fixture(
        (): Promise<GoogleReadResponse> =>
          Promise.resolve(
            ++attempts === 1
              ? { ok: false, status: 429, headers: new Headers({ 'Retry-After': header }) }
              : good()
          ),
        { random: () => 2 }
      );
      await createGoogleRestAdapter(f.options).readMetadata();
      expect(f.sleeps).toEqual([header.startsWith('Thu') ? 3000 : 2000]);
    }
  });
  it('retries transient transport/body failures but sanitizes all errors and rejects wrong targets', async () => {
    for (const source of [
      'transport',
      'body',
      'missing-body',
      'null-body',
      'abort',
      'plain-abort',
      'plain-timeout',
      'body-plain-abort',
      'other',
      'target',
    ]) {
      const fetchImpl = vi.fn((): Promise<GoogleReadResponse> => {
        if (source === 'transport') return Promise.reject(new TypeError('private-token'));
        if (source === 'abort')
          return Promise.reject(Object.assign(new Error('private-token'), { name: 'AbortError' }));
        if (source === 'other') return Promise.reject(new Error('private-token'));
        if (source === 'plain-abort' || source === 'plain-timeout')
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Reproduce provider error-like values, not only native Error instances.
          return Promise.reject({
            name: source === 'plain-abort' ? 'AbortError' : 'TimeoutError',
            private: 'not exposed',
          });
        if (source === 'body-plain-abort')
          return Promise.resolve({
            ok: true,
            json: (): Promise<unknown> =>
              // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Response bodies can reject with provider error-like values too.
              Promise.reject({ name: 'AbortError', private: 'not exposed' }),
          });
        if (source === 'body')
          return Promise.resolve({
            ok: true,
            json: (): Promise<unknown> => Promise.reject(new TypeError('private-token')),
          });
        if (source === 'missing-body') return Promise.resolve({ ok: true });
        return Promise.resolve({
          ok: true,
          json: (): Promise<unknown> =>
            Promise.resolve(source === 'null-body' ? null : { spreadsheetId: 'wrong' }),
        });
      });
      const f = fixture(fetchImpl);
      const result = createGoogleRestAdapter(f.options).readMetadata();
      await expect(result).rejects.toBeInstanceOf(GoogleAdapterError);
      await expect(result).rejects.toThrow('no response body or credential was logged');
      const attempts = ['other', 'target'].includes(source) ? 1 : 5;
      expect(fetchImpl).toHaveBeenCalledTimes(attempts);
    }
  });
  it('does not discover credentials or call fetch for an empty explicit token', async () => {
    const fetchImpl = vi.fn((): Promise<GoogleReadResponse> => Promise.resolve(good()));
    const f = fixture(fetchImpl, { tokenProvider: (): Promise<string> => Promise.resolve('') });
    await expect(createGoogleRestAdapter(f.options).readMetadata()).rejects.toMatchObject({
      transient: false,
      attempts: 1,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
