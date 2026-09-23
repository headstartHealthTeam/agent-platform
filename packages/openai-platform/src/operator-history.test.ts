import type { OperatorHistoryCursor, OperatorItem } from '@headstart-health/workflow-contracts';
import { describe, expect, it } from 'vitest';

import { readSchema } from './operations.js';
import { operatorHistory } from './operator-history.js';
import type { OpenAIPlatform } from './platform.js';

const binding = {
  sessionId: 'session_test',
  turnId: 'turn_test',
  target: 'synthetic',
  workflowRevision: 'revision_test',
};
const message = (
  index: number,
  text = `Update ${String(index)}`
): { id: string } & Record<string, unknown> => ({
  id: `item_${String(index)}`,
  turn_id: binding.turnId,
  type: 'message',
  role: 'assistant',
  phase: 'commentary',
  status: 'completed',
  content: [{ type: 'output_text', text }],
});
function provider(
  source: ({ id: string } & Record<string, unknown>)[]
): Pick<OpenAIPlatform, 'read'> {
  return {
    read: async (input): ReturnType<OpenAIPlatform['read']> => {
      const request = readSchema.parse(input);
      if (request.operation === 'sessions.get')
        return {
          fingerprint: '',
          data: {
            id: binding.sessionId,
            metadata: { workflow_revision: binding.workflowRevision },
          },
        };
      if (request.operation === 'sessions.turns')
        return {
          fingerprint: '',
          data: {
            data: [
              {
                id: binding.turnId,
                session_id: binding.sessionId,
                subagent_id: null,
                status: 'completed',
              },
            ],
            has_more: false,
          },
        };
      if (request.operation !== 'sessions.items') throw new Error('Unexpected request');
      const offset = request.query.after
        ? source.findIndex((item) => item.id === request.query.after) + 1
        : 0;
      return {
        fingerprint: '',
        data: { data: source.slice(offset, offset + 100), has_more: source.length > offset + 100 },
      };
    },
  };
}

describe('bounded finalized operator history recovery', () => {
  it('reads item ownership after the item page so a concurrent new root is not checkpointed away', async () => {
    let nextRootVisible = false;
    const initial = provider([]);
    const read: OpenAIPlatform['read'] = async (input) => {
      const request = readSchema.parse(input);
      if (request.operation === 'sessions.items') {
        nextRootVisible = true;
        return {
          fingerprint: '',
          data: {
            data: [
              { ...message(0), turn_id: 'turn_next' },
              {
                id: 'question_next',
                turn_id: 'turn_next',
                type: 'function_call',
                name: 'ask_operator',
                call_id: 'call_next',
                status: 'completed',
                arguments: { question: 'Confirm the next office?' },
              },
            ],
            has_more: false,
          },
        };
      }
      if (request.operation === 'sessions.turns') {
        const root = {
          id: binding.turnId,
          session_id: binding.sessionId,
          subagent_id: null,
          status: 'completed',
        };
        return {
          fingerprint: '',
          data: {
            data: nextRootVisible ? [root, { ...root, id: 'turn_next' }] : [root],
            has_more: false,
          },
        };
      }
      return initial.read(input);
    };
    const page = await operatorHistory({ read }, binding, null);
    expect(page.items.map((item) => [item.id, item.kind, item.position])).toEqual([
      ['item_0', 'commentary', 0],
      ['call_next', 'question', 1],
    ]);
    expect(page.cursor).toEqual({ after: 'question_next', itemId: null, offset: 0, position: 2 });
    expect(page.hasMore).toBe(false);
  });
  it('recovers every item beyond the live 180-item window across fresh calls', async () => {
    const source = Array.from({ length: 241 }, (_, index) => message(index));
    let cursor: OperatorHistoryCursor | null = null;
    const items: OperatorItem[] = [];
    for (;;) {
      const page = await operatorHistory(provider(source), binding, cursor);
      expect(page.items.length).toBeLessThanOrEqual(180);
      items.push(...page.items);
      cursor = page.cursor;
      if (!page.hasMore) break;
    }
    expect(items.map((item) => item.id)).toEqual(source.map((item) => item.id));
    expect((await operatorHistory(provider(source), binding, cursor)).items).toEqual([]);
  });
  it('checkpoints within long messages without dropping early fragments or replaying prior items', async () => {
    const text = 'x'.repeat(1_900_001);
    const source = [message(0, text), message(1)];
    const first = await operatorHistory(provider(source), binding, null);
    expect(first.items).toHaveLength(180);
    expect(first.cursor).toEqual({
      after: null,
      itemId: 'item_0',
      offset: 1_800_000,
      position: 180,
    });
    const second = await operatorHistory(provider(source), binding, first.cursor);
    expect(second.hasMore).toBe(false);
    expect([...first.items, ...second.items.slice(0, -1)].map((item) => item.text).join('')).toBe(
      text
    );
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(192);
  });
  it('does not advance past mutable text and detects an invalid resumed item', async () => {
    const source = [message(0), { ...message(1), status: 'in_progress' }, message(2)];
    const first = await operatorHistory(provider(source), binding, null);
    expect(first.items.map((item) => item.id)).toEqual(['item_0']);
    expect(first).toMatchObject({
      cursor: { after: 'item_0', itemId: null, offset: 0 },
      hasMore: true,
    });
    source[1] = message(1);
    expect((await operatorHistory(provider(source), binding, first.cursor)).items).toHaveLength(2);
    await expect(
      operatorHistory(provider(source), binding, {
        after: null,
        itemId: 'wrong',
        offset: 10000,
        position: 1,
      })
    ).rejects.toThrow('changed');
  });
  it('recovers finalized question identity and chronology without exposing raw tool arguments', async () => {
    const page = await operatorHistory(
      provider([
        message(0),
        {
          id: 'question_item',
          turn_id: binding.turnId,
          type: 'function_call',
          name: 'ask_operator',
          call_id: 'question_call',
          status: 'completed',
          arguments: { question: 'Which synthetic office?' },
        },
        message(1),
      ]),
      binding,
      null
    );
    expect(page.items.map((item) => [item.id, item.position])).toEqual([
      ['item_0', 0],
      ['question_call', 1],
      ['item_1', 2],
    ]);
    expect(page.items[1]).toMatchObject({ kind: 'question', text: 'Which synthetic office?' });
    expect(page.items[1]?.callFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
