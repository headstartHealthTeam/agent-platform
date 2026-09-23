import { z } from 'zod';

import type { OpenAIPlatform } from './platform.js';

const page = z.object({
  data: z.array(z.unknown()).max(100),
  has_more: z.boolean(),
  last_id: z.string().nullable().optional(),
});

/** Page size is a transport bound, not a maximum lifetime for a valid session. */
export async function sessionHistory(
  platform: Pick<OpenAIPlatform, 'read'>,
  sessionId: string,
  operation: 'sessions.turns' | 'sessions.items',
  after?: string
): Promise<{ data: unknown[]; has_more: false }> {
  const data: unknown[] = [];
  const cursors = new Set<string>();
  for (;;) {
    const result = await platform.read({
      operation,
      id: sessionId,
      query: { limit: 100, order: 'asc', ...(after ? { after } : {}) },
    });
    const parsed = page.parse(result.data);
    data.push(...parsed.data);
    if (!parsed.has_more) return { data, has_more: false };
    if (!parsed.data.length || !parsed.last_id || cursors.has(parsed.last_id))
      throw new Error('Session history cursor did not advance');
    after = parsed.last_id;
    cursors.add(after);
  }
}
