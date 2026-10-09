import { describe, expect, it } from 'vitest';

import { FirefliesReadError, firefliesReadFailure } from './failure.js';

describe('Fireflies provider failures', () => {
  it('classifies native, structured, and JSON error envelopes without exposing messages', () => {
    for (const value of [
      {
        isError: true,
        content: [{ type: 'text', text: 'Error: rate limit exceeded; private payload' }],
      },
      { structuredContent: { error: { status: 429 }, retryAfter: 4 } },
      {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: { code: 'RATE_LIMIT_EXCEEDED' }, retryAfterMs: 2000 }),
          },
        ],
      },
      { errors: [{ code: 'quota_exceeded', message: 'private payload' }] },
      { error_code: 'too_many_requests' },
      { error: 'rate_limited' },
      new Error('private quota payload'),
    ]) {
      const result = firefliesReadFailure(value);
      expect(result).toBeInstanceOf(FirefliesReadError);
      expect(result).toMatchObject({ code: 'FIREFLIES_RATE_LIMITED', status: 429 });
      expect(JSON.stringify(result)).not.toContain('private');
      expect(result?.message).toBe('FIREFLIES_RATE_LIMITED');
    }
  });

  it('preserves status and the maximum provider cooldown without applying retry policy', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    expect(firefliesReadFailure({ status: 429, retryAfter: '2' }, now)?.retryAfterMs).toBe(2000);
    expect(
      firefliesReadFailure(
        { status: '503', headers: { 'retry-after': 'Thu, 01 Jan 2026 00:00:03 GMT' } },
        now
      )
    ).toMatchObject({ code: 'FIREFLIES_READ_FAILED', status: 503, retryAfterMs: 3000 });
    expect(
      firefliesReadFailure(
        { statusCode: 502, headers: new Headers({ 'Retry-After': '2.5' }), retryAfterMs: 4000 },
        now
      )
    ).toMatchObject({ status: 502, retryAfterMs: 4000 });
    expect(firefliesReadFailure({ error: { code: '401' }, retry_after: 6 }, now)).toMatchObject({
      status: 401,
      retryAfterMs: 6000,
    });
    expect(firefliesReadFailure({ status: 429, retryAfter: 3600 }, now)?.retryAfterMs).toBe(
      3600000
    );
    for (const delay of ['bad', 'Wed, 31 Dec 2025 00:00:00 GMT', -10, Infinity, null]) {
      expect(
        firefliesReadFailure({ status: 500, retryAfter: delay, retryAfterMs: NaN }, now)
          ?.retryAfterMs
      ).toBe(0);
    }
  });

  it('keeps ordinary read failures separate from rate limiting', () => {
    for (const value of [
      new Error('private problem'),
      { ok: false },
      { error: { message: 'private' } },
      { content: [{ type: 'text', text: 'Error: failed privately' }] },
    ]) {
      expect(firefliesReadFailure(value)).toMatchObject({
        code: 'FIREFLIES_READ_FAILED',
        status: null,
        retryAfterMs: 0,
      });
    }
    expect(new FirefliesReadError({ code: 'FIREFLIES_BODY_CAPTURE_FAILED' })).toMatchObject({
      status: null,
      retryAfterMs: 0,
    });
  });

  it('does not infer provider failure from transcript words or malformed non-error content', () => {
    for (const value of [
      null,
      undefined,
      [],
      'rate limit',
      { status: 200 },
      { status: {} },
      { content: [{ type: 'text', text: 'Id: synthetic\nSentences: Rate limit exceeded' }] },
      { message: 'A conversation about quota' },
      { errors: [] },
      { content: [{ type: 'image', text: 'Error: no' }] },
      {
        content: [
          { type: 'text', text: 'ok' },
          { type: 'text', text: 'Rate limit exceeded' },
        ],
      },
    ])
      expect(firefliesReadFailure(value)).toBeNull();
  });
});
