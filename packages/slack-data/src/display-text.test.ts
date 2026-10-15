import { describe, expect, it } from 'vitest';

import { slackDisplayText, slackDisplayTimestamp } from './index.js';

describe('reusable Slack display projection', () => {
  it('projects labels, emphasis, emoji and escaped newlines without imposing a business policy', () => {
    expect(
      slackDisplayText(
        '<https://example.com|Release notes> by <@U123|Example Operator> :white_check_mark: *ready* _now_ &gt; next\\nstep'
      )
    ).toBe('Release notes by Example Operator ready now > next step');
    expect(slackDisplayText()).toBe('');
    expect(slackDisplayText(null)).toBe('null');
    expect(slackDisplayText('<@U123> <https://example.com> &amp;')).toBe(
      '<@U123> <https://example.com> &amp;'
    );
  });
  it('normalizes complete ISO stamps and otherwise retains the last native display offset', () => {
    expect(slackDisplayTimestamp('2026-09-22T10:00:00-04:00')).toBe('2026-09-22T14:00:00.000Z');
    expect(slackDisplayTimestamp('2026-09-22T10:00:00.123456Z')).toBe('2026-09-22T10:00:00.123Z');
    expect(
      slackDisplayTimestamp('Time: 2026-01-01 09:00:00 EST\nReply: 2026-09-22 10:30:00 EDT')
    ).toBe('2026-09-22T10:30:00-04:00');
    expect(slackDisplayTimestamp('2026-01-01 09:00:00 EST')).toBe('2026-01-01T09:00:00-05:00');
  });
  it('does not invent a stamp from date-only, Unix seconds or unsupported display forms', () => {
    for (const value of [
      undefined,
      null,
      1720000000,
      '2026-09-22',
      '2026-09-22T10:00:00',
      '2026-09-22 10:00:00 UTC',
      '2026-99-22T10:00:00Z',
    ])
      expect(slackDisplayTimestamp(value)).toBeNull();
    // Native display projection historically retains fields verbatim; calendar validation is not added here.
    expect(slackDisplayTimestamp('2026-99-22 10:00:00 EDT')).toBe('2026-99-22T10:00:00-04:00');
  });
});
