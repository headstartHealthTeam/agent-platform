import { createHash } from 'node:crypto';

import type {
  OperatorBinding,
  OperatorHistoryCursor,
  OperatorHistoryPage,
  OperatorItem,
} from '@headstart-health/workflow-contracts';
import { z } from 'zod';

import { OperatorItems, operatorText } from './operator-items.js';
import { OperatorTurns } from './operator-turns.js';
import { pendingFunctionCalls } from './pending-functions.js';
import type { OpenAIPlatform } from './platform.js';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const cursorSchema = z
  .object({
    after: id.nullable(),
    itemId: id.nullable(),
    offset: z.number().int().min(0),
    position: z.number().int().min(0),
  })
  .strict();
const pageSchema = z.object({ data: z.array(z.unknown()).max(100), has_more: z.boolean() });
const itemSchema = z.object({
  id: id.nullable(),
  turn_id: id,
  type: z.string(),
  status: z.string().optional(),
});
const LIMIT = 180;

class HistoryBatch {
  readonly items: OperatorHistoryPage['items'] = [];
  private next: OperatorHistoryCursor;
  private ordinal: number;
  private readonly projection: OperatorItems;
  constructor(
    private readonly binding: OperatorBinding,
    private readonly roots: string[],
    private readonly cursor: OperatorHistoryCursor
  ) {
    this.next = { ...cursor };
    this.ordinal = cursor.position;
    this.projection = new OperatorItems(binding.sessionId, binding.turnId);
    this.projection.includeTurns(roots);
  }
  consume(raw: unknown, index: number): boolean {
    const item = itemSchema.parse(raw);
    if (index === 0 && this.cursor.itemId !== null && item.id !== this.cursor.itemId)
      throw new Error('History checkpoint item changed');
    if (item.status === 'in_progress') return false;
    const value = this.roots.includes(item.turn_id)
      ? (question(raw, this.binding) ?? this.projection.finalized(raw))
      : null;
    if (value) {
      if (item.id === null) throw new Error('Finalized history item has no identity');
      if (!this.append(value, item.id, index === 0 ? this.cursor.offset : 0)) return false;
    } else if (index === 0 && this.cursor.itemId !== null) {
      throw new Error('History checkpoint is no longer a finalized operator item');
    }
    if (item.id !== null)
      this.next = { after: item.id, itemId: null, offset: 0, position: this.ordinal };
    return true;
  }
  private append(value: OperatorItem, rawId: string, offset: number): boolean {
    if (offset > value.text.length) throw new Error('History checkpoint text changed');
    const key = createHash('sha256').update(value.id).digest('hex');
    for (let position = offset; position < Math.max(1, value.text.length); position += 10000) {
      if (this.items.length === LIMIT) {
        if (position !== 0)
          this.next = {
            after: this.next.after,
            itemId: rawId,
            offset: position,
            position: this.ordinal,
          };
        return false;
      }
      this.items.push({
        ...value,
        id: position ? `part_${key}_${String(position)}` : value.id,
        text: value.text.slice(position, position + 10000),
        position: this.ordinal++,
      });
    }
    return true;
  }
  result(hasMore: boolean): OperatorHistoryPage {
    return { items: this.items, cursor: this.next, hasMore };
  }
}

function question(raw: unknown, binding: OperatorBinding): OperatorItem | null {
  const header = z
    .object({ type: z.string(), name: z.string().optional(), status: z.string().optional() })
    .parse(raw);
  if (
    header.type !== 'function_call' ||
    header.name !== 'ask_operator' ||
    header.status !== 'completed'
  )
    return null;
  const call = z.object({ turn_id: id }).parse(raw);
  const pending = pendingFunctionCalls(
    { id: binding.sessionId, required_actions: [raw] },
    { sessionId: binding.sessionId, turnId: call.turn_id }
  )[0];
  if (!pending) throw new Error('Invalid historical question');
  const args = z
    .object({
      question: z.string().min(1).max(10000),
      evidenceReference: z.string().max(1000).optional(),
    })
    .strict()
    .parse(pending.arguments);
  return {
    id: pending.callId,
    kind: 'question',
    text: operatorText(args.question),
    final: true,
    callFingerprint: pending.fingerprint,
  };
}

/** Separate lossless recovery lane. No raw transcript or provider outputs cross this boundary. */
export async function operatorHistory(
  platform: Pick<OpenAIPlatform, 'read'>,
  binding: OperatorBinding,
  checkpoint: OperatorHistoryCursor | null,
  turns = new OperatorTurns()
): Promise<OperatorHistoryPage> {
  const cursor =
    checkpoint === null
      ? { after: null, itemId: null, offset: 0, position: 0 }
      : cursorSchema.parse(checkpoint);
  if ((cursor.itemId === null) !== (cursor.offset === 0))
    throw new Error('Invalid history checkpoint');
  const response = await platform.read({
    operation: 'sessions.items',
    id: binding.sessionId,
    query: { limit: 100, order: 'asc', ...(cursor.after ? { after: cursor.after } : {}) },
  });
  // Read ownership after items: a concurrently created root must not be skipped by the cursor.
  const { roots } = await turns.read(platform, binding);
  const page = pageSchema.parse(response.data);
  if (cursor.itemId !== null && page.data.length === 0)
    throw new Error('History checkpoint item missing');
  const batch = new HistoryBatch(
    binding,
    roots.map((turn) => turn.id),
    cursor
  );
  for (const [index, raw] of page.data.entries()) {
    // A mutable item or a full frame is a checkpoint barrier, not evidence of complete history.
    if (!batch.consume(raw, index)) return batch.result(true);
  }
  const result = batch.result(page.has_more);
  if (page.has_more && result.cursor.after === cursor.after)
    throw new Error('History cursor did not advance');
  return result;
}
