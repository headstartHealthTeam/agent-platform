import { describe, expect, it, vi } from 'vitest';

import { readSchema } from './operations.js';
import type { OpenAIPlatform } from './platform.js';
import { visitSessionHistory } from './session-history.js';

describe('complete session history', () => {
  it('retrieves all pages with the provider cursor', async () => {
    const consume = vi.fn<(data: unknown[]) => void>();
    const read = vi.fn<OpenAIPlatform['read']>(async (input) => {
      const request = readSchema.parse(input);
      if (request.operation !== 'sessions.items') throw new Error('Wrong operation');
      if (request.query.after) expect(consume).toHaveBeenCalledTimes(1);
      return {
        fingerprint: 'synthetic',
        data:
          request.query.after === 'item_100'
            ? { data: [{ id: 'item_101' }], has_more: false }
            : {
                data: Array.from({ length: 100 }, (_, index) => ({
                  id: `item_${String(index + 1)}`,
                })),
                has_more: true,
                last_id: 'item_100',
              },
      };
    });
    await visitSessionHistory({ read }, 'session_a', 'sessions.items', consume);
    expect(consume.mock.calls.map(([data]) => data.length)).toEqual([100, 1]);
    expect(read).toHaveBeenLastCalledWith({
      operation: 'sessions.items',
      id: 'session_a',
      query: { limit: 100, order: 'asc', after: 'item_100' },
    });
  });
  it('reports broken or repeated cursors rather than returning incomplete history', async () => {
    const read = vi.fn<OpenAIPlatform['read']>().mockResolvedValue({
      fingerprint: 'synthetic',
      data: { data: [{}], has_more: true, last_id: 'same' },
    });
    await expect(
      visitSessionHistory({ read }, 'session_a', 'sessions.turns', () => undefined)
    ).rejects.toThrow('cursor');
    expect(read).toHaveBeenCalledTimes(2);
  });
});
