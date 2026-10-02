import { describe, expect, it } from 'vitest';

import { normalizeSlackThread } from './slack-thread.js';

const parent = '=== THREAD PARENT MESSAGE ===\nMessage TS: 100.000000\nSynthetic parent.\n\n';
const bodies = [
  'Message TS: 110.000000\nEarlier reply.',
  'Message TS: 120.000000\nAt cutoff.',
  'Message TS: 120.000001\nLater reply excluded.',
];
function envelope(parts: readonly string[], parentText = parent): string {
  return JSON.stringify({
    messages:
      parentText +
      `=== THREAD REPLIES (${String(parts.length)} total) ===\n` +
      parts
        .map(
          (part, index) => `--- Reply ${String(index + 1)} of ${String(parts.length)} ---\n${part}`
        )
        .join('\n'),
    pagination_info: 'There are no more messages in this thread.\n',
  });
}
function fixture(): {
  messageTs: string;
  channelId: string;
  text: string;
  unboundedReadback: { messageTs: string; channelId: string; text: string; truncated?: boolean };
} {
  return {
    messageTs: '100.000000',
    channelId: 'synthetic-channel',
    text: envelope(bodies.slice(0, 2)),
    unboundedReadback: {
      messageTs: '100.000000',
      channelId: 'synthetic-channel',
      text: envelope(bodies),
    },
  };
}
const options = { sourceCutoff: '1970-01-01T00:02:00.000Z' };
describe('Intake frozen-cutoff Slack thread accounting', () => {
  it('accounts for later replies exactly without admitting their content or lowering observed counts', () => {
    const row = fixture();
    const before = structuredClone(row);
    const valid = normalizeSlackThread(row, 3, options);
    expect(valid).toMatchObject({
      complete: true,
      completionEvidence: {
        kind: 'verified-cutoff-replies',
        sourceCutoff: options.sourceCutoff,
        replies: 2,
        observedReplies: 3,
        deferredReplies: 1,
      },
    });
    expect(valid.text).not.toContain('Later reply');
    expect(row).toEqual(before);
    expect(normalizeSlackThread(row, 3).complete).toBe(false);
    expect(normalizeSlackThread(row, 4, options).complete).toBe(false);
    expect(normalizeSlackThread(row, 3, { sourceCutoff: 'invalid' }).complete).toBe(false);
  });
  it('rejects altered identity, temporal accounting, content, omitted replies and incomplete raw receipts', () => {
    const mutations: ((row: ReturnType<typeof fixture>) => void)[] = [
      (row): void => {
        row.unboundedReadback.channelId = 'other';
      },
      (row): void => {
        row.unboundedReadback.text = envelope(bodies).replace('110.000000', '100.000000');
      },
      (row): void => {
        row.unboundedReadback.text = envelope(bodies).replace('120.000001', '119.999999');
      },
      (row): void => {
        row.unboundedReadback.text = envelope(bodies).replace('Earlier reply', 'Changed content');
      },
      (row): void => {
        row.text = envelope(bodies.slice(0, 1));
      },
      (row): void => {
        row.unboundedReadback.truncated = true;
      },
      (row): void => {
        row.unboundedReadback.text = envelope(bodies).replace(
          'There are no more messages',
          'More messages'
        );
      },
      (row): void => {
        row.text = 'not JSON';
      },
      (row): void => {
        row.unboundedReadback.text = envelope(bodies, parent.replace('100.000000', '130.000000'));
        row.messageTs = row.unboundedReadback.messageTs = '130.000000';
      },
    ];
    for (const mutate of mutations) {
      const row = fixture();
      mutate(row);
      expect(normalizeSlackThread(row, 3, options)).toEqual({
        complete: false,
        text: '',
        error: 'Slack post-cutoff reply accounting is incomplete or inconsistent.',
      });
    }
  });
  it('preserves provider completion and failure precedence when no cutoff reconciliation applies', () => {
    expect(normalizeSlackThread({ text: '=== THREAD REPLIES (0 total) ===' })).toMatchObject({
      complete: true,
      completionEvidence: { kind: 'explicit-reply-count', replies: 0 },
    });
    expect(normalizeSlackThread()).toMatchObject({
      complete: false,
      error: 'Slack thread response is missing.',
    });
    expect(normalizeSlackThread(fixture(), -1, options)).toMatchObject({
      error: 'Slack reply count is invalid.',
    });
    expect(normalizeSlackThread({ ...fixture(), next_cursor: 'next' }, 3, options)).toMatchObject({
      error: 'Slack thread retrieval is blocked or incomplete.',
    });
    const row = fixture();
    expect(normalizeSlackThread({ ...row, unboundedReadback: false }, 3, options).complete).toBe(
      false
    );
    expect(normalizeSlackThread({ ...row, unboundedReadback: {} }, 3, options).complete).toBe(
      false
    );
  });
});
