import { describe, expect, it } from 'vitest';

import { SlackResponseError } from './envelope.js';
import { normalizeSlackRenderedSearch } from './search.js';
import type { SlackIndividualReadback } from './search.js';

const QUERY = '"Synthetic support issue"';
const TS = '1789397469.459679';
const CHANNEL = 'C1234567890';
const TERMINAL = 'End of results - No more pages available.\\n';
const CONTINUATION = 'For the next page of results use cursor `opaque-next-page`\n';
function block(n = 1, total = 1, ts = TS, text = 'Synthetic update.\nSecond line.'): string {
  return (
    `### Result ${String(n)} of ${String(total)}\nChannel: #synthetic (ID: ${CHANNEL})\n` +
    `From: Synthetic Operator <operator@example.test> (ID: U1234567890) \n` +
    `Time: 2026-09-14 10:51:09 EDT\nMessage_ts: ${ts}\n` +
    `Permalink: [link](https://synthetic.slack.com/archives/${CHANNEL}/p${ts.replace('.', '')})\n` +
    `Text: \n${text}\n\n---\n\n`
  );
}
function response(
  body = block(),
  count = 1,
  pagination = TERMINAL
): { results: string; pagination_info: string } {
  return {
    results: `# Search Results for: ${QUERY}\n\n## Messages (${String(count)} results)\n${body}`,
    pagination_info: pagination,
  };
}
function readback(
  text = 'A synthetic software issue was created.',
  messageTs = TS
): SlackIndividualReadback & { collectedAt: string } {
  return {
    channelId: CHANNEL,
    messageTs,
    collectedAt: '2026-09-14T20:02:00Z',
    response: {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            messages: `=== THREAD PARENT MESSAGE ===\nFrom: Synthetic Bot\nTime: 2026-09-14 10:51:09 EDT\nMessage TS: ${messageTs}\n${text}\n\nNo thread messsages\n`,
            pagination_info: 'There are no more messages in this thread.\n',
          }),
        },
      ],
    },
  };
}

describe('native detailed Slack search', () => {
  it('sanitizes unexpected accessor and individual-readback serialization failures', () => {
    const marker = 'SYNTHETIC_PRIVATE_MARKER';
    const failure = (): never => {
      throw new Error(marker);
    };
    const sources = [
      (): unknown =>
        normalizeSlackRenderedSearch(
          {
            get results(): never {
              return failure();
            },
            pagination_info: TERMINAL,
          },
          QUERY
        ),
      (): unknown =>
        normalizeSlackRenderedSearch(response(block(1, 1, TS, '')), QUERY, [
          {
            channelId: CHANNEL,
            messageTs: TS,
            response: { messages: 'Synthetic', toJSON: failure },
          },
        ]),
      (): unknown =>
        normalizeSlackRenderedSearch(response(block(1, 1, TS, '')), QUERY, [
          {
            get channelId(): never {
              return failure();
            },
            messageTs: TS,
            response: {},
          },
        ]),
    ];
    for (const source of sources) {
      let caught: unknown;
      try {
        source();
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(SlackResponseError);
      if (!(caught instanceof SlackResponseError)) throw new Error('Expected provider error');
      expect(caught.message).toBe('Slack rendered search response could not be normalized');
      expect(caught.cause).toBeUndefined();
      expect(caught.stack).not.toContain(marker);
    }
  });
  it('preserves exact message text and identity with unknown or explicit reply counts', () => {
    const raw = response();
    const result = normalizeSlackRenderedSearch(raw, QUERY);
    expect(result.nextCursor).toBe('');
    expect(result.records[0]).toEqual({
      channelId: CHANNEL,
      channelName: '#synthetic',
      messageTs: TS,
      from: 'Synthetic Operator <operator@example.test> (ID: U1234567890) ',
      displayTime: '2026-09-14 10:51:09 EDT',
      url: `https://synthetic.slack.com/archives/${CHANNEL}/p${TS.replace('.', '')}`,
      text: 'Synthetic update.\nSecond line.',
      replyCount: null,
    });
    expect(raw).not.toHaveProperty('records');
    for (const count of [0, 19]) {
      const body = block().replace('\nPermalink:', `\nReply count: ${String(count)}\nPermalink:`);
      expect(normalizeSlackRenderedSearch(response(body), QUERY).records[0]?.replyCount).toBe(
        count
      );
    }
  });
  it('retains generic DM/group-DM and thread identities', () => {
    for (const channelId of ['D1234567890', 'G1234567890']) {
      const body = block()
        .replaceAll(CHANNEL, channelId)
        .replace('#synthetic', 'DM')
        .replace('\nFrom:', '\nParticipants: Synthetic One, Synthetic Two\nFrom:');
      expect(normalizeSlackRenderedSearch(response(body), QUERY).records[0]?.channelId).toBe(
        channelId
      );
    }
    const body = block().replace(
      'p1789397469459679)',
      `p1789397469459679?thread_ts=${TS}&cid=${CHANNEL})`
    );
    expect(normalizeSlackRenderedSearch(response(body), QUERY).records[0]?.threadTs).toBe(TS);
    expect(
      normalizeSlackRenderedSearch(
        response(block(1, 2) + block(2, 2, '1789397469.459680'), 2),
        QUERY
      ).records
    ).toHaveLength(2);
  });
  it('requires a query-bound terminal receipt for empty results and preserves continuation signals', () => {
    const empty = {
      results: `# Search Results for: ${QUERY}\n\nNo results found.\n`,
      pagination_info: TERMINAL,
    };
    expect(normalizeSlackRenderedSearch(empty, QUERY).records).toEqual([]);
    expect(normalizeSlackRenderedSearch(response(block(), 1, CONTINUATION), QUERY).nextCursor).toBe(
      'opaque-next-page'
    );
    expect(normalizeSlackRenderedSearch({ ...response(), has_more: true }, QUERY).has_more).toBe(
      true
    );
    expect(() =>
      normalizeSlackRenderedSearch({ ...empty, pagination_info: CONTINUATION }, QUERY)
    ).toThrow('empty Slack search');
    expect(() => normalizeSlackRenderedSearch(empty, 'wrong')).toThrow('query does not match');
    expect(() => normalizeSlackRenderedSearch(empty, 'bad\nquery')).toThrow('query does not match');
    for (const pagination of [
      '',
      'No next cursor',
      'End of results',
      TERMINAL + CONTINUATION,
      'For the next page of results use cursor ``',
      'For the next page of results use cursor `a` and `b`',
    ]) {
      expect(() => normalizeSlackRenderedSearch(response(block(), 1, pagination), QUERY)).toThrow();
    }
    expect(() =>
      normalizeSlackRenderedSearch({ ...response(), nextCursor: 'conflict' }, QUERY)
    ).toThrow('continuation signals conflict');
  });
  it('resolves empty text only through one complete identity-bound individual read', () => {
    const individual = readback();
    const result = normalizeSlackRenderedSearch(response(block(1, 1, TS, '')), QUERY, [individual]);
    expect(result.records[0]).toMatchObject({
      text: 'A synthetic software issue was created.',
      replyCount: 0,
      originalSearchText: '',
    });
    expect(result.records[0]?.individualReadback).toBe(individual);
    for (const entries of [
      [],
      [individual, individual],
      [{ ...individual, channelId: 'COTHER' }],
      [{ ...individual, messageTs: '1789397469.459680' }],
      [readback(' ')],
      [
        {
          ...individual,
          response: {
            messages: 'incomplete preview',
            pagination_info: 'There are no more messages in this thread.',
          },
        },
      ],
    ]) {
      expect(() =>
        normalizeSlackRenderedSearch(response(block(1, 1, TS, '')), QUERY, entries)
      ).toThrow();
    }
    expect(() => normalizeSlackRenderedSearch(response(), QUERY, [individual])).toThrow(
      'Unused or duplicate'
    );
    const wrongParent = {
      ...individual,
      response: readback('Synthetic content', '1789397469.459680').response,
    };
    expect(() =>
      normalizeSlackRenderedSearch(response(block(1, 1, TS, '')), QUERY, [wrongParent])
    ).toThrow('incomplete or has no verifiable content');
  });
  it('rejects ambiguous counts, numbering, truncated text and duplicate message identities', () => {
    for (const bad of [
      response(block(), 2),
      response(block(2, 1)),
      response(block(1, 2)),
      response(block(1, 2) + block(2, 2), 2),
      response(block().replace(`Message_ts: ${TS}`, 'Message_ts: invalid')),
      response(block().replace('Text: \n', '')),
      response(block().replace(/\n\n---\n\n$/, '')),
      response('Concise results only.'),
      response(block() + 'Unparsed remainder'),
      response(block(), 21),
    ]) {
      expect(() => normalizeSlackRenderedSearch(bad, QUERY)).toThrow();
    }
    for (const count of ['-1', '1.5', 'unknown', '9007199254740992', '01', '1\nReply count: 2']) {
      expect(() =>
        normalizeSlackRenderedSearch(
          response(block().replace('\nPermalink:', `\nReply count: ${count}\nPermalink:`)),
          QUERY
        )
      ).toThrow();
    }
    for (const bad of [
      null,
      {},
      { ...response(), records: [] },
      { ...response(), messages: [] },
      { ...response(), results: 1 },
    ])
      expect(() => normalizeSlackRenderedSearch(bad, QUERY)).toThrow('ambiguous or incomplete');
  });
  it('rejects unsafe or conflicting permalink identity and thread metadata', () => {
    for (const suffix of [
      '?thread_ts=invalid',
      '?thread_ts=1789397470.459679',
      `?thread_ts=${TS}&cid=COTHER`,
      `?cid=${CHANNEL}`,
      `?thread_ts=${TS}&thread_ts=${TS}`,
      `?thread_ts=${TS}&other=1`,
      '#thread',
    ]) {
      expect(() =>
        normalizeSlackRenderedSearch(
          response(block().replace('p1789397469459679)', `p1789397469459679${suffix})`)),
          QUERY
        )
      ).toThrow();
    }
    const authenticated = new URL(
      `https://synthetic.slack.com/archives/${CHANNEL}/p${TS.replace('.', '')}`
    );
    authenticated.username = 'synthetic-user';
    authenticated.password = 'not-a-secret';
    for (const url of [
      'https://invalid[host',
      'https://example.test/archives/C1234567890/p1789397469459679',
      authenticated.href,
      'https://synthetic.slack.com:444/archives/C1234567890/p1789397469459679',
      'https://synthetic.slack.com/archives/COTHER/p1789397469459679',
      'https://synthetic.slack.com/archives/C1234567890/p1789397469459680',
    ]) {
      const body = block().replace(
        `https://synthetic.slack.com/archives/${CHANNEL}/p${TS.replace('.', '')}`,
        url
      );
      expect(() => normalizeSlackRenderedSearch(response(body), QUERY)).toThrow();
    }
  });
});
