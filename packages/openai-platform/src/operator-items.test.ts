import { describe, expect, it } from 'vitest';

import { OperatorItems, operatorText } from './operator-items.js';

const message = (text = '', status = 'in_progress'): Record<string, unknown> => ({
  id: 'item_a',
  turn_id: 'turn_a',
  type: 'message',
  role: 'assistant',
  phase: 'commentary',
  status,
  content: [{ type: 'output_text', text }],
});
const event = (
  type: string,
  fields: Record<string, unknown>,
  eventId = 'event_a'
): Record<string, unknown> => ({
  type: `agent.session.turn.${type}`,
  event_id: eventId,
  session_id: 'session_a',
  turn_id: 'turn_a',
  ...fields,
});

describe('operator-safe activity projection', () => {
  it('shows failed question calls from later roots without exposing arguments or raw errors', () => {
    const items = new OperatorItems('session_a', 'turn_a');
    const call = {
      id: 'call_b',
      turn_id: 'turn_b',
      type: 'function_call',
      name: 'ask_operator',
      arguments: { question: 'private question' },
      status: 'failed',
      error: 'private diagnostic',
    };
    items.recover([call]);
    expect(items.values()).toEqual([]);
    items.includeTurns(['turn_a', 'turn_b']);
    items.consume(event('item.done', { turn_id: 'turn_b', item: call }));
    items.recover([
      call,
      { ...call, id: 'output_b', type: 'function_call_output', output: 'private output' },
    ]);
    expect(items.values()).toEqual([
      {
        id: 'call_b',
        kind: 'tool',
        text: 'The agent could not complete a question request. Check the agent’s update before continuing.',
        final: true,
      },
    ]);
    const recovered = new OperatorItems('session_a', 'turn_b');
    recovered.recover([call]);
    expect(recovered.values()).toEqual(items.values());
    expect(JSON.stringify(items.values())).not.toMatch(/private|diagnostic|arguments|fingerprint/);
  });
  it('shows named tool lifecycle activity but never turns function history into a pending question', () => {
    const items = new OperatorItems('session_a', 'turn_a');
    const call = {
      id: 'call_a',
      turn_id: 'turn_a',
      type: 'function_call',
      name: 'another_tool',
      arguments: 'private arguments',
    };
    items.recover([
      { ...call, status: 'in_progress' },
      { ...call, status: 'completed' },
      { ...call, status: 'invalid' },
    ]);
    expect(items.values()).toMatchObject([
      { kind: 'tool', text: 'Another tool · Completed', final: true },
    ]);
    items.recover([
      { ...call, id: 'failed_call', status: 'failed' },
      { ...call, id: 'command_a', type: 'command_execution', status: 'failed' },
    ]);
    expect(items.values()).toHaveLength(3);
    for (const item of items.values()) {
      expect(item).toMatchObject({
        kind: 'tool',
        final: true,
      });
      expect(item.callFingerprint).toBeUndefined();
    }
    expect(JSON.stringify(items.values())).not.toMatch(/private/);
  });
  it('shows successful MCP evidence reads without exposing tool arguments or output', () => {
    const items = new OperatorItems('session_a', 'turn_a');
    const call = {
      id: 'source_a',
      turn_id: 'turn_a',
      type: 'mcp_call',
      name: 'get_salesforce_record_files',
      server_label: 'headstart',
      arguments: { token: 'private' },
      output: 'private original bytes',
    };
    items.recover([{ ...call, status: 'in_progress' }]);
    expect(items.values()).toMatchObject([
      { text: 'Read source documents · In progress', final: false },
    ]);
    items.recover([{ ...call, status: 'completed' }]);
    expect(items.values()).toMatchObject([
      { text: 'Read source documents · Completed', final: true },
    ]);
    expect(JSON.stringify(items.values())).not.toContain('private');
  });
  it('recovers and streams only explicitly verified root turns, preserving prior activity', () => {
    const items = new OperatorItems('session_a', 'turn_a');
    const followup = { ...message('Follow-up', 'completed'), id: 'item_b', turn_id: 'turn_b' };
    items.recover([message('Original', 'completed'), followup]);
    expect(items.values()).toHaveLength(1);
    items.includeTurns(['turn_a', 'turn_b']);
    items.recover([followup, { ...followup, id: 'subagent_item', turn_id: 'turn_subagent' }]);
    expect(items.values().map((item) => item.text)).toEqual(['Original', 'Follow-up']);
    items.consume(
      event('item.added', {
        turn_id: 'turn_b',
        item: { ...message('Working'), id: 'item_c', turn_id: 'turn_b' },
      })
    );
    expect(items.values().at(-1)?.text).toBe('Working');
  });
  it('streams exact text, deduplicates events and lets final saved items win', () => {
    const items = new OperatorItems('session_a', 'turn_a');
    items.consume(event('item.added', { item: message('Checking') }));
    const delta = event(
      'output_text.delta',
      { item_id: 'item_a', content_index: 0, delta: ' the CV.' },
      'event_b'
    );
    items.consume(delta);
    items.consume(delta);
    expect(items.values()[0]?.text).toBe('Checking the CV.');
    items.recover([message('older partial')]);
    expect(items.values()[0]?.text).toBe('Checking the CV.');
    items.consume(
      event(
        'output_text.done',
        { item_id: 'item_a', content_index: 0, text: 'Complete text.' },
        'event_c'
      )
    );
    items.recover([message('Final saved explanation.', 'completed')]);
    items.consume(event('item.done', { item: message('late event', 'completed') }, 'event_d'));
    expect(items.values()).toMatchObject([{ text: 'Final saved explanation.', final: true }]);
  });
  it('does not concatenate overlapping history and stream text after reconnect', () => {
    const items = new OperatorItems('session_a', 'turn_a');
    items.recover([message('partially saved')]);
    items.consume(
      event('output_text.delta', { item_id: 'item_a', content_index: 0, delta: 'saved' })
    );
    expect(items.values()[0]?.text).toBe('Agent is writing an update…');
    items.consume(
      event(
        'output_text.done',
        { item_id: 'item_a', content_index: 0, text: 'Exact complete explanation' },
        'event_b'
      )
    );
    expect(items.values()[0]?.text).toBe('Exact complete explanation');
  });
  it('withholds reasoning, user messages, other turns, tool arguments and tool output', () => {
    const items = new OperatorItems('session_a', 'turn_a');
    items.recover([
      { ...message('private'), type: 'reasoning' },
      { ...message('user input'), role: 'user' },
      { ...message('another turn'), turn_id: 'turn_b' },
      {
        id: 'tool_a',
        turn_id: 'turn_a',
        type: 'command_execution',
        status: 'in_progress',
        command: 'private command',
        output: 'private output',
      },
    ]);
    items.consume({
      type: 'agent.session.turn.reasoning_summary.delta',
      delta: 'private reasoning',
    });
    expect(items.values()).toMatchObject([{ kind: 'tool', text: 'Agent is using a tool.' }]);
    items.recover([
      { id: 'tool_a', turn_id: 'turn_a', type: 'command_execution', status: 'completed' },
    ]);
    expect(JSON.stringify(items.values())).not.toMatch(/private|command/);
    expect(items.values()[0]?.final).toBe(true);
  });
  it('redacts obvious secrets and keeps subsequent fragments withheld', () => {
    expect(
      operatorText('Risk-based review: date of birth and tax identifiers need verification.')
    ).toBe('Risk-based review: date of birth and tax identifiers need verification.');
    const items = new OperatorItems('session_a', 'turn_a');
    items.consume(event('item.added', { item: message('sk-') }));
    items.consume(
      event(
        'output_text.delta',
        { item_id: 'item_a', content_index: 0, delta: 'synthetic-fragment' },
        'event_b'
      )
    );
    items.consume(event('item.done', { item: message('later fragment', 'completed') }, 'event_c'));
    expect(items.values()[0]?.text).toBe('[Sensitive content withheld]');
    expect(operatorText('Bearer synthetic')).toBe('[Sensitive content withheld]');
  });
  it('rejects wrong sessions and bounds item/text/event retention', () => {
    const items = new OperatorItems('session_a', 'turn_a');
    expect(() => {
      items.consume(event('item.added', { session_id: 'wrong', item: message() }));
    }).toThrow('session');
    items.consume(event('item.added', { turn_id: 'turn_b', item: message() }));
    items.consume(
      event(
        'output_text.delta',
        { item_id: 'unknown', content_index: 0, delta: 'ignored' },
        'unknown'
      )
    );
    items.consume(event('item.added', { item: message('a'.repeat(10000)) }));
    items.consume(
      event('output_text.delta', { item_id: 'item_a', content_index: 0, delta: 'b' }, 'oversize')
    );
    expect(
      items
        .values()
        .map((item) => item.text)
        .join('')
    ).toBe(`${'a'.repeat(10000)}b`);
    for (let index = 0; index < 179; index++)
      items.recover([
        { ...message('final', 'completed'), id: `other_${String(index)}`, phase: 'final_answer' },
      ]);
    items.recover([{ ...message(), id: 'overflow' }]);
    expect(items.values()).toHaveLength(180);
    expect(items.values().at(-1)?.id).toBe('overflow');
    const bounded = new OperatorItems('session_a', 'turn_a');
    for (let index = 0; index < 10000; index++)
      bounded.consume(
        event('output_text.delta', { item_id: 'unknown', content_index: 0 }, `e_${String(index)}`)
      );
    expect(() => {
      bounded.consume(
        event('output_text.delta', { item_id: 'unknown', content_index: 0 }, 'overflow')
      );
    }).not.toThrow();
  });
});
