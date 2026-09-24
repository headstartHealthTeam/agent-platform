import { describe, expect, it, vi } from 'vitest';

import { readSchema } from './operations.js';
import { operatorRootPage } from './operator-provenance.js';
import { OperatorTurns } from './operator-turns.js';
import type { OpenAIPlatform } from './platform.js';
import { fingerprint } from './platform.js';

describe('incremental verified turn history', () => {
  it('discards provider payloads and subagent records while preserving root metadata', () => {
    const root = { id: 'turn_a', session_id: 'session_a', subagent_id: null, status: 'completed' };
    expect(
      operatorRootPage('session_a', [
        { ...root, output: 'x'.repeat(1_000_000), provider_metadata: { private: 'not retained' } },
        { ...root, id: 'child', subagent_id: 'agent_child', output: 'x'.repeat(1_000_000) },
      ])
    ).toEqual([root]);
    expect(() => operatorRootPage('session_a', [{ ...root, session_id: 'foreign' }])).toThrow(
      'provenance'
    );
  });
  it('reads every initial page then only mutable/new turns, preserving the initial anchor', async () => {
    const binding = {
      sessionId: 'session_a',
      turnId: 'turn_0',
      target: 'synthetic',
      workflowRevision: 'rev',
    };
    const turns = Array.from({ length: 205 }, (_, index) => ({
      id: `turn_${String(index)}`,
      session_id: binding.sessionId,
      subagent_id: null,
      status: index === 204 ? 'in_progress' : 'completed',
    }));
    const read = vi.fn<OpenAIPlatform['read']>(async (input) => {
      const request = readSchema.parse(input);
      if (request.operation === 'sessions.get')
        return {
          data: { id: binding.sessionId, metadata: { workflow_revision: 'rev' } },
          fingerprint: 'synthetic',
        };
      if (request.operation !== 'sessions.turns') throw new Error('Unexpected read');
      const start = request.query.after
        ? turns.findIndex((turn) => turn.id === request.query.after) + 1
        : 0;
      const values = turns.slice(start, start + request.query.limit);
      const data = {
        data: values,
        has_more: start + values.length < turns.length,
        last_id: values.at(-1)?.id ?? null,
      };
      return { data, fingerprint: fingerprint(data) };
    });
    const history = new OperatorTurns();
    expect((await history.read({ read }, binding)).roots).toHaveLength(205);
    expect(read).toHaveBeenCalledTimes(4);
    read.mockClear();
    expect((await history.read({ read }, binding)).root.id).toBe('turn_204');
    expect(read).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenCalledWith({
      operation: 'sessions.turns',
      id: binding.sessionId,
      query: { limit: 100, order: 'asc', after: 'turn_203' },
    });
    const active = turns.at(-1);
    if (!active) throw new Error('Missing test root');
    active.status = 'failed';
    await history.read({ read }, binding);
    turns.push({ ...active, id: 'turn_205', status: 'in_progress' });
    expect((await history.read({ read }, binding)).root.id).toBe('turn_205');
    await expect(history.read({ read }, { ...binding, turnId: 'foreign' })).rejects.toThrow(
      'binding changed'
    );
    history.clear();
    read.mockClear();
    expect((await history.read({ read }, binding)).roots).toHaveLength(206);
    expect(read).toHaveBeenCalledTimes(4);
  });
});
