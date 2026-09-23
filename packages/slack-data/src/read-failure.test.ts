import { describe, expect, it } from 'vitest';

import { slackReadFailureMetadata } from './read-failure.js';

describe('Slack failure metadata without workflow policy', () => {
  it('reads direct, structured and text envelopes without treating ordinary text as an error', () => {
    expect(slackReadFailureMetadata({})).toEqual({ status: null, retryMs: 0, failed: false });
    expect(slackReadFailureMetadata({ status: 503 })).toEqual({
      status: 503,
      retryMs: 0,
      failed: false,
    });
    expect(slackReadFailureMetadata({ structuredContent: { error: 'ratelimited' } })).toEqual({
      status: 429,
      retryMs: 0,
      failed: true,
    });
    expect(
      slackReadFailureMetadata({
        content: [{ type: 'text', text: JSON.stringify({ statusCode: 403, ok: false }) }],
      })
    ).toEqual({ status: 403, retryMs: 0, failed: true });
    expect(slackReadFailureMetadata({ error_code: 'rate_limited' }).status).toBe(429);
    expect(
      slackReadFailureMetadata({
        content: [{ type: 'text', text: 'Ordinary synthetic text mentions 429' }],
      }).failed
    ).toBe(false);
    expect(slackReadFailureMetadata({ status: '429', statusCode: 200 }).status).toBeNull();
  });
  it('preserves Retry-After seconds, HTTP dates, callable headers and direct millisecond precedence', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    for (const retryAfter of ['2.5', ' Thu, 01 Jan 2026 00:00:02 GMT '])
      expect(slackReadFailureMetadata({ retryAfter }, now).retryMs).toBe(
        retryAfter === '2.5' ? 2500 : 2000
      );
    expect(slackReadFailureMetadata({ retryAfter: '2', retryAfterMs: 3000 }, now).retryMs).toBe(
      3000
    );
    expect(
      slackReadFailureMetadata(
        { headers: new Headers({ 'retry-after': '4' }), retryAfter: '2' },
        now
      ).retryMs
    ).toBe(4000);
    expect(slackReadFailureMetadata({ headers: { get: () => '5' } }, now).retryMs).toBe(5000);
    expect(
      slackReadFailureMetadata({ retryAfter: 'not a date', retryAfterMs: Infinity }, now).retryMs
    ).toBe(0);
    expect(slackReadFailureMetadata({ retryAfter: 5 }, now).retryMs).toBe(0);
    expect(
      slackReadFailureMetadata({ headers: { get: () => null }, retryAfter: '2' }, now).retryMs
    ).toBe(2000);
  });
  it('does not return private bodies, messages, causes or accessor exceptions', () => {
    const marker = 'SYNTHETIC_PRIVATE_MARKER';
    const result = slackReadFailureMetadata(
      Object.assign(new Error(marker), { status: 503, retryAfterMs: 1000 })
    );
    expect(result).toEqual({ status: 503, retryMs: 1000, failed: false });
    expect(JSON.stringify(result)).not.toContain(marker);
    expect(
      slackReadFailureMetadata({
        get status(): never {
          throw new Error(marker);
        },
      })
    ).toEqual({ status: null, retryMs: 0, failed: true });
    expect(
      slackReadFailureMetadata({
        headers: {
          get(): never {
            throw new Error(marker);
          },
        },
      }).failed
    ).toBe(true);
  });
});
