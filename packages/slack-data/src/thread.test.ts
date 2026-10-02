import { describe, expect, it } from 'vitest';

import {
  normalizeSlackThreadResponse as normalize,
  slackThreadRetrievalProblem,
} from './thread.js';

const text =
  '=== THREAD REPLIES (2 total) ===\n--- Reply 1 of 2 ---\nSynthetic first reply.\n--- Reply 2 of 2 ---\nSynthetic second reply.';
const parent =
  '=== THREAD PARENT MESSAGE ===\nFrom: Synthetic Operator\nTime: synthetic\n' +
  'Message TS: 1789397469.459679\nSynthetic parent text.\n\nNo thread messsages\n';
const payload = {
  messages: parent,
  pagination_info: 'There are no more messages in this thread.\n',
};
const row = { messageTs: '1789397469.459679', text: JSON.stringify(payload) };
interface TestMessage {
  ts?: string;
  thread_ts?: string;
  reply_count?: number | string;
  text: string;
}
function structuredMessages(): TestMessage[] {
  return [
    { ts: '100.001', thread_ts: '100.001', reply_count: 2, text: 'Synthetic parent' },
    { ts: '100.002', thread_ts: '100.001', text: 'Synthetic first reply' },
    { ts: '100.003', thread_ts: '100.001', text: 'Synthetic second reply' },
  ];
}

describe('Slack native thread contracts', () => {
  it('exposes retrieval problems without claiming content completeness or choosing a cutoff', () => {
    expect(slackThreadRetrievalProblem({})).toBeNull();
    expect(slackThreadRetrievalProblem({ text: 'Unverified content' }, 2)).toBeNull();
    for (const minimum of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(slackThreadRetrievalProblem({}, minimum)).toBe('Slack reply count is invalid.');
    }
    for (const flags of [{ ok: false }, { has_more: true }, { next_cursor: 'next' }]) {
      expect(slackThreadRetrievalProblem(flags)).toBe(
        'Slack thread retrieval is blocked or incomplete.'
      );
    }
  });

  it('establishes no replies only with terminal metadata and the requested identity', () => {
    expect(normalize(row)).toEqual({
      complete: true,
      text: parent,
      error: '',
      completionEvidence: { kind: 'explicit-no-replies', replies: 0 },
    });
    expect(normalize(row, 1).complete).toBe(false);
    expect(normalize({ ...row, messageTs: '1789397470.459679' }).complete).toBe(false);
    expect(normalize({ text: JSON.stringify(payload) }).complete).toBe(true);
    for (const bad of [
      { ...payload, pagination_info: 'Next page available' },
      { messages: parent },
      { ...payload, messages: parent.replace('No thread messsages', '') },
      { ...payload, messages: parent.replace('Message TS: 1789397469.459679', '') },
      { ...payload, messages: `${parent}--- Reply 1 of 1 ---\nContradicting reply` },
      { ...payload, has_more: true },
      { ...payload, truncated: true },
    ]) {
      expect(normalize({ ...row, text: JSON.stringify(bad) }).complete).toBe(false);
    }
  });

  it('accepts explicit reply counts without inventing pagination cursors', () => {
    for (const value of [
      text,
      JSON.stringify({ messages: text }),
      JSON.stringify({ results: text }),
      text.replaceAll('\n', '\r\n'),
    ]) {
      expect(normalize({ text: value })).toMatchObject({
        complete: true,
        completionEvidence: { kind: 'explicit-reply-count', replies: 2 },
      });
    }
    expect(normalize({ text: '=== THREAD REPLIES (0 total) ===' }).complete).toBe(true);
    expect(normalize({ text: '=== THREAD REPLIES (0 total) ===' }, 1).complete).toBe(false);
    expect(normalize({ text }, -1).complete).toBe(false);
    expect(normalize({ text }, 0.5).complete).toBe(false);
    expect(normalize().complete).toBe(false);
  });

  it('rejects absent, duplicated, inconsistent and partial reply evidence', () => {
    for (const value of [
      text.replace('--- Reply 2 of 2 ---', ''),
      text.replace('--- Reply 2 of 2 ---', '--- Reply 1 of 2 ---'),
      text.replace('--- Reply 2 of 2 ---', '--- Reply 2 of 3 ---'),
      `${text}\n=== THREAD REPLIES (2 total) ===`,
      text.replace('(2 total)', '(3 total)'),
      'Synthetic unverified text',
      '',
      JSON.stringify({ messages: [] }),
      '=== THREAD REPLIES (1 total) ===\n--- Reply 1 of 1 ---\n',
      '=== THREAD REPLIES (9007199254740992 total) ===',
      '=== THREAD REPLIES malformed ===',
    ])
      expect(normalize({ text: value }).complete).toBe(false);
    for (const flags of [
      { ok: false },
      { blocked: true },
      { isError: true },
      { error: 'private failure' },
      { truncated: true },
      { paginationComplete: false },
      { has_more: true },
      { next_cursor: 'next' },
      { response_metadata: { next_cursor: 'next' } },
    ]) {
      expect(normalize({ text, ...flags })).toMatchObject({ complete: false, text: '' });
      expect(normalize({ text: JSON.stringify({ messages: text, ...flags }) })).toMatchObject({
        complete: false,
        text: '',
      });
    }
  });

  it('supports existing explicit pagination receipts without coercing structured content', () => {
    const messages = structuredMessages();
    expect(normalize({ text: JSON.stringify({ messages }) }).complete).toBe(false);
    const valid = normalize({ text: JSON.stringify({ messages }), paginationComplete: true });
    expect(valid).toEqual({
      complete: true,
      text: JSON.stringify(messages),
      error: '',
      completionEvidence: { kind: 'pagination-receipt', replies: 2 },
    });
    expect(
      normalize({ text: JSON.stringify({ results: messages }), paginationComplete: true })
    ).toEqual(valid);
    expect(normalize({ text: JSON.stringify(messages), paginationComplete: true })).toEqual(valid);
    expect(
      normalize({ text: 'Synthetic complete plain text', paginationComplete: true })
    ).toMatchObject({ complete: true });
    for (const data of [
      null,
      { messages: [{}] },
      { messages: [{ text: 'Synthetic reply without identity' }] },
      { unexpected: 'shape' },
      { messages: '' },
      '  ',
      { messages: [] },
    ]) {
      expect(normalize({ text: JSON.stringify(data), paginationComplete: true }).complete).toBe(
        false
      );
    }
  });

  it('counts distinct replies linked to exactly one parent, not array entries', () => {
    const check = (
      messages: readonly TestMessage[],
      minimumReplies = 2,
      messageTs = '100.001'
    ): boolean =>
      normalize(
        { messageTs, text: JSON.stringify({ ok: true, messages }), paginationComplete: true },
        minimumReplies
      ).complete;
    expect(check(structuredMessages())).toBe(true);
    expect(check(structuredMessages().slice(0, 2))).toBe(false);
    expect(check(structuredMessages().slice(0, 2), 1)).toBe(false);
    expect(check(structuredMessages(), 3)).toBe(false);
    const changes: readonly ((messages: TestMessage[]) => TestMessage[])[] = [
      (messages): TestMessage[] =>
        messages.map((m, index) => (index === 2 ? { ...m, ts: '100.002' } : m)),
      (messages): TestMessage[] =>
        messages.map((m, index) => (index === 2 ? { ...m, thread_ts: '200.001' } : m)),
      (messages): TestMessage[] =>
        messages.map((m, index) => (index === 2 ? { text: m.text, thread_ts: '100.001' } : m)),
      (messages): TestMessage[] =>
        messages.map((m, index) => (index === 2 ? { text: m.text, ts: '100.003' } : m)),
      (messages): TestMessage[] =>
        messages.map((m, index) =>
          index === 0 ? { text: m.text, ts: '100.001', thread_ts: '100.001' } : m
        ),
      (messages): TestMessage[] =>
        messages.map((m, index) => (index === 0 ? { ...m, reply_count: '2' } : m)),
      (messages): TestMessage[] =>
        messages.map((m, index) => (index === 0 ? { ...m, reply_count: 1 } : m)),
      (messages): TestMessage[] =>
        messages.map((m, index) => (index === 0 ? { ...m, reply_count: -1 } : m)),
      (messages): TestMessage[] =>
        messages.map((m, index) => (index === 0 ? { ...m, ts: '200.001' } : m)),
      (messages): TestMessage[] =>
        messages.map((m, index) => (index === 1 ? { ...m, thread_ts: '100.002' } : m)),
      (messages): TestMessage[] => messages.slice(1),
    ];
    for (const change of changes) expect(check(change(structuredMessages()))).toBe(false);
    expect(check(structuredMessages(), 2, 'unrelated')).toBe(false);
    expect(check(structuredMessages(), 2, '100.002')).toBe(true);
    const parentOnly = [
      { ts: '100.001', thread_ts: '100.001', text: 'Synthetic parent', reply_count: 0 },
    ];
    expect(check(parentOnly, 0)).toBe(true);
    expect(check(parentOnly, 1)).toBe(false);
  });
});
