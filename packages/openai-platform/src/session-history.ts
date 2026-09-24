import { z } from 'zod';

import type { OpenAIPlatform } from './platform.js';

const page = z.object({
  data: z.array(z.unknown()).max(100),
  has_more: z.boolean(),
  last_id: z.string().nullable().optional(),
});

/** Visit each page without retaining provider payloads. Consumers keep only their compact state;
 * page size is a transport bound, not a maximum lifetime for a valid session.
 */
export async function visitSessionHistory(
  platform: Pick<OpenAIPlatform, 'read'>,
  sessionId: string,
  operation: 'sessions.turns' | 'sessions.items',
  consume: (data: unknown[]) => void,
  after?: string
): Promise<void> {
  const cursors = new Set<string>();
  for (;;) {
    const result = await platform.read({
      operation,
      id: sessionId,
      query: { limit: 100, order: 'asc', ...(after ? { after } : {}) },
    });
    const parsed = page.parse(result.data);
    consume(parsed.data);
    if (!parsed.has_more) return;
    if (!parsed.data.length || !parsed.last_id || cursors.has(parsed.last_id))
      throw new Error('Session history cursor did not advance');
    after = parsed.last_id;
    cursors.add(after);
  }
}
