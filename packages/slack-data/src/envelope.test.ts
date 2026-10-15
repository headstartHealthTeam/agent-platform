import { describe, expect, it } from 'vitest';

import {
  SlackResponseError,
  assertSlackSearchSuccess,
  unwrapSlackSearchResponse,
} from './envelope.js';

describe('Slack native search transport', () => {
  it('keeps direct and JSON-wrapped successful objects intact', () => {
    const result = {
      results: 'Synthetic results',
      pagination_info: 'Next page',
      extra: { retained: true },
    };
    expect(unwrapSlackSearchResponse(result)).toBe(result);
    expect(
      unwrapSlackSearchResponse({ content: [{ type: 'text', text: JSON.stringify(result) }] })
    ).toEqual(result);
    expect(() => {
      assertSlackSearchSuccess({});
    }).not.toThrow();
  });
  it('rejects failed or ambiguous envelopes without displaying their payload', () => {
    for (const response of [
      null,
      [],
      'private text',
      { ok: false },
      { isError: true },
      { blocked: true },
      { error: 'private payload' },
      { truncated: true },
      { paginationComplete: false },
      { structuredContent: {}, content: [{ type: 'text', text: '{}' }] },
      { content: [] },
      { content: [{ type: 'image', text: '{}' }] },
      {
        content: [
          { type: 'text', text: '{}' },
          { type: 'text', text: '{}' },
        ],
      },
      { content: [{ type: 'text', text: 'private malformed JSON' }] },
      { content: [{ type: 'text', text: JSON.stringify({ error: 'private nested error' }) }] },
    ]) {
      expect(() => unwrapSlackSearchResponse(response)).toThrow(SlackResponseError);
      expect(() => unwrapSlackSearchResponse(response)).not.toThrow(/private/);
    }
  });
});
