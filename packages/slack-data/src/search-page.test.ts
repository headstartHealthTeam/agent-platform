import { describe, expect, it } from 'vitest';

import { SlackResponseError } from './envelope.js';
import { normalizeSlackSearchPageResponse, slackReplyCount } from './search-page.js';

const record = {
  channel: { id: 'C123' },
  ts: '1767225600.001',
  text: 'Synthetic support issue',
  reply_count: 0,
  extra: { retained: true },
};
const response = {
  ok: true,
  messages: { matches: [record] },
  response_metadata: { next_cursor: '' },
};
describe('generic Slack structured page mechanics', () => {
  it('preserves exact text, additional metadata, identity aliases and explicit unknown reply counts', () => {
    const result = normalizeSlackSearchPageResponse(response, 1);
    expect(result).toEqual({
      nextCursor: '',
      terminal: true,
      records: [
        {
          ...record,
          channelId: 'C123',
          messageTs: record.ts,
          replyCount: 0,
          time: '2026-01-01T00:00:00.001Z',
        },
      ],
    });
    expect(
      normalizeSlackSearchPageResponse(
        {
          records: [{ channelId: 'C456', messageTs: record.ts, text: '  keep whitespace  ' }],
          nextCursor: '',
        },
        1
      ).records[0]
    ).toMatchObject({ text: '  keep whitespace  ', replyCount: null });
    expect(slackReplyCount()).toBeNull();
    expect(slackReplyCount({ reply_count: null, replyCount: 2 })).toBe(2);
    for (const metadata of [
      { reply_count: '0' },
      { reply_count: -1 },
      { reply_count: 1.5 },
      { reply_count: 0, replyCount: 1 },
    ])
      expect(() => slackReplyCount(metadata)).toThrow('reply counts');
  });
  it('supports explicit cursor variants and numbered pages without inferring terminal state', () => {
    for (const patch of [
      { response_metadata: { next_cursor: 'next' } },
      { next_cursor: 'next' },
      { nextCursor: 'next' },
    ]) {
      expect(normalizeSlackSearchPageResponse({ records: [], ...patch }, 1).terminal).toBe(false);
      expect(
        normalizeSlackSearchPageResponse({ messages: { matches: [], ...patch } }, 1).nextCursor
      ).toBe('next');
    }
    expect(
      normalizeSlackSearchPageResponse({ records: [], paging: { page: 1, pages: 2 } }, 1)
    ).toMatchObject({ nextCursor: 'page:2', terminal: false });
    expect(
      normalizeSlackSearchPageResponse({ records: [], paging: { page: 1, pages: 0 } }, 1)
    ).toMatchObject({ nextCursor: '', terminal: true });
    expect(
      normalizeSlackSearchPageResponse({ records: [], paging: { page: 2, pages: 2 } }, 2).terminal
    ).toBe(true);
    expect(() => normalizeSlackSearchPageResponse({ records: [] }, 1)).toThrow('explicit cursor');
  });
  it('rejects all contradictory completion signals and malformed records', () => {
    for (const value of [
      { records: [], next_cursor: '', nextCursor: 'next' },
      { records: [], next_cursor: null },
      { records: [], next_cursor: '', has_more: true },
      { records: [], next_cursor: 'next', paging: { page: 1, pages: 1 } },
      { records: [], paging: { page: 2, pages: 1 } },
      { records: [record], paging: { page: 1, pages: 0 } },
      { records: [], paging: { page: '1', pages: 1 } },
      { records: {}, next_cursor: '' },
      { records: [{ ...record, text: null }], next_cursor: '' },
      { records: [{ ...record, ts: 'invalid' }], next_cursor: '' },
      { records: [{ ...record, channel: { id: '' } }], next_cursor: '' },
      { records: [record], next_cursor: '', ok: false },
    ])
      expect(() => normalizeSlackSearchPageResponse(value, 1)).toThrow();
  });
  it('sanitizes unexpected property and timestamp errors without exposing the response', () => {
    const marker = 'SYNTHETIC_PRIVATE_MARKER';
    expect(() =>
      normalizeSlackSearchPageResponse(
        {
          get messages(): never {
            throw new Error(marker);
          },
        },
        1
      )
    ).toThrow('could not be normalized');
    expect(() =>
      normalizeSlackSearchPageResponse(
        {
          get messages(): never {
            throw new SlackResponseError(marker);
          },
        },
        1
      )
    ).toThrow('could not be normalized');
    expect(() =>
      normalizeSlackSearchPageResponse(
        { records: [{ ...record, ts: '999999999999999999999.1' }], nextCursor: '' },
        1
      )
    ).toThrow('could not be normalized');
  });
});
