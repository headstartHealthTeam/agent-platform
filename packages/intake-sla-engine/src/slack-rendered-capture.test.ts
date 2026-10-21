import { describe, expect, it } from 'vitest';

import { sha256Json } from './json-fingerprint.js';
import { normalizeSlackSearchPage } from './slack-search-page.js';

const messageTs = '1767225600.001000';
const query = 'synthetic-query';
const collectedAt = '2026-01-02T00:01:00Z';
function rendered(text = 'Synthetic note'): { results: string; pagination_info: string } {
  return {
    results: `# Search Results for: ${query}\n\n## Messages (1 results)\n### Result 1 of 1\nChannel: #synthetic (ID: C123)\nFrom: Synthetic Operator\nTime: 2026-01-01\nMessage_ts: ${messageTs}\nPermalink: [link](https://synthetic.slack.com/archives/C123/p${messageTs.replace('.', '')})\nText: \n${text}\n\n---\n\n`,
    pagination_info: 'End of results - No more pages available.',
  };
}
function readback(): {
  channelId: string;
  messageTs: string;
  collectedAt: string;
  extra: { retained: boolean };
  response: { content: { type: string; text: string }[] };
} {
  return {
    channelId: 'C123',
    messageTs,
    collectedAt,
    extra: { retained: true },
    response: {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            messages: `=== THREAD PARENT MESSAGE ===\nFrom: Synthetic Operator\nTime: 2026-01-01\nMessage TS: ${messageTs}\nIndividual source content\n\nNo thread messsages\n`,
            pagination_info: 'There are no more messages in this thread.',
          }),
        },
      ],
    },
  };
}
const receipt = { query, complete: true, requestCursor: '', pageNumber: 1, collectedAt };
describe('native rendered Slack source composed with Intake capture provenance', () => {
  it('hashes the original transport and treats missing reply count as unknown', () => {
    const response = { content: [{ type: 'text', text: JSON.stringify(rendered()) }] };
    const result = normalizeSlackSearchPage({ ...receipt, response });
    expect(result.responseHash).toBe(sha256Json(response));
    expect(result.records[0]).toMatchObject({
      text: 'Synthetic note',
      replyCount: null,
      channelId: 'C123',
      messageTs,
    });
  });
  it('uses a bound individual read without leaking provider-only reference fields into saved rows', () => {
    const individual = readback();
    const response = rendered('');
    const result = normalizeSlackSearchPage({
      ...receipt,
      response,
      messageReadbacks: [individual],
    });
    expect(result.records[0]).toMatchObject({
      text: 'Individual source content',
      replyCount: 0,
      originalSearchText: '',
      individualReadbackHash: sha256Json(individual),
    });
    expect(Object.hasOwn(result.records[0] ?? {}, 'individualReadback')).toBe(false);
    expect(result.responseHash).toBe(sha256Json(response));
    expect(individual.extra).toEqual({ retained: true });
  });
  it('rejects stale, future and unbound readback times without weakening provider completeness', () => {
    for (const stamp of ['invalid', '2026-01-01T23:59:59Z', '2999-01-01'])
      expect(() =>
        normalizeSlackSearchPage({
          ...receipt,
          response: rendered(''),
          messageReadbacks: [{ ...readback(), collectedAt: stamp }],
        })
      ).toThrow('timestamp');
    expect(() =>
      normalizeSlackSearchPage({
        ...receipt,
        collectedAt: undefined,
        response: rendered(''),
        messageReadbacks: [readback()],
      })
    ).toThrow('timestamp');
    expect(() => normalizeSlackSearchPage({ ...receipt, response: rendered('') })).toThrow(
      'individual read'
    );
    expect(() =>
      normalizeSlackSearchPage({ ...receipt, response: { ...rendered(), nextCursor: 'conflict' } })
    ).toThrow('continuation');
  });
});
