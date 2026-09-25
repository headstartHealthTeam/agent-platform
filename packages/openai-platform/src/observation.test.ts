import { describe, expect, it } from 'vitest';

import { observedRootTurnOutcome, projectSessionControlEvent } from './observation.js';

const sessionId = 'session_synthetic';
const turnId = 'turn_synthetic';
const privateContent = 'private provider content must not escape';
interface SyntheticTurnEvent {
  type: string;
  event_id: string;
  session_id: string;
  turn_id: string;
  turn: {
    id: string;
    session_id: string;
    subagent_id: string | null;
    status: string;
    error: string;
    usage: { privateContent: string };
  };
}
const turn = (status = 'completed', subagentId: string | null = null): SyntheticTurnEvent => ({
  type: `agent.session.turn.${status}`,
  event_id: 'event_synthetic',
  session_id: sessionId,
  turn_id: turnId,
  turn: {
    id: turnId,
    session_id: sessionId,
    subagent_id: subagentId,
    status,
    error: privateContent,
    usage: { privateContent },
  },
});

describe('session control projection', () => {
  it.each(['idle', 'in_progress', 'requires_action', 'failed'])(
    'projects session %s without content',
    (status) => {
      expect(
        projectSessionControlEvent(
          {
            type: `agent.session.${status}`,
            event_id: 'event_synthetic',
            session: {
              id: sessionId,
              status,
              agent: privateContent,
              environment: privateContent,
              error: privateContent,
              required_actions: [privateContent],
            },
          },
          sessionId
        )
      ).toEqual({ kind: 'session', eventId: 'event_synthetic', sessionId, status });
    }
  );

  it.each(['pending', 'ready', 'connected', 'disconnected', 'failed'])(
    'projects environment %s without routing data',
    (status) => {
      expect(
        projectSessionControlEvent(
          {
            type: `agent.session.environment.${status}`,
            event_id: 'event_synthetic',
            session_id: sessionId,
            turn_id: null,
            environment: {
              id: 'env_synthetic',
              status,
              remote_url: privateContent,
              error: privateContent,
            },
          },
          sessionId
        )
      ).toEqual({
        kind: 'environment',
        eventId: 'event_synthetic',
        sessionId,
        turnId: null,
        environmentId: 'env_synthetic',
        status,
      });
    }
  );

  it.each(['completed', 'failed', 'cancelled'])(
    'correlates only the intended root turn %s',
    (status) => {
      const event = projectSessionControlEvent(turn(status), sessionId);
      expect(event).toEqual({
        kind: 'turn',
        eventId: 'event_synthetic',
        sessionId,
        turnId,
        subagentId: null,
        status,
      });
      if (event === null) throw new Error('Missing synthetic projection');
      expect(observedRootTurnOutcome(event, { sessionId, turnId })).toBe(status);
      expect(observedRootTurnOutcome(event, { sessionId, turnId: 'older_turn' })).toBeNull();
      expect(observedRootTurnOutcome(event, { sessionId: 'other_session', turnId })).toBeNull();
      const child = projectSessionControlEvent(turn(status, 'subagent_synthetic'), sessionId);
      if (child === null) throw new Error('Missing synthetic child projection');
      expect(observedRootTurnOutcome(child, { sessionId, turnId })).toBeNull();
    }
  );

  it('does not equate idle, disconnected, errors or nonterminal turns with completion', () => {
    for (const input of [
      { type: 'agent.session.idle', event_id: 'e1', session: { id: sessionId, status: 'idle' } },
      {
        type: 'agent.session.environment.disconnected',
        event_id: 'e2',
        session_id: sessionId,
        turn_id: turnId,
        environment: { id: 'env_synthetic', status: 'disconnected' },
      },
      { type: 'error', event_id: 'e3', session_id: sessionId, error: privateContent },
      turn('in_progress'),
    ]) {
      const event = projectSessionControlEvent(input, sessionId);
      if (event === null) throw new Error('Missing synthetic projection');
      expect(observedRootTurnOutcome(event, { sessionId, turnId })).toBeNull();
      expect(JSON.stringify(event)).not.toContain(privateContent);
    }
  });

  it.each([
    'agent.session.turn.output_text.delta',
    'agent.session.turn.item.done',
    'agent.session.turn.reasoning_summary_text.done',
    'agent.session.future',
  ])('excludes %s', (type) => {
    expect(
      projectSessionControlEvent({ type, event_id: 'e1', text: privateContent }, sessionId)
    ).toBeNull();
  });

  it('rejects missing identities, wrong sessions and inconsistent turn correlation without leaking payloads', () => {
    const base = turn();
    for (const input of [
      { type: base.type, event_id: 'e1', privateContent },
      { ...base, session_id: 'wrong_session' },
      { ...base, turn_id: 'wrong_turn' },
      { ...base, turn: { ...base.turn, subagent_id: undefined } },
      { ...base, turn: { ...base.turn, status: privateContent } },
      {
        type: 'agent.session.idle',
        event_id: 'e1',
        session: { id: 'wrong_session', status: 'idle' },
      },
    ]) {
      expect(() => projectSessionControlEvent(input, sessionId)).toThrow(
        'Invalid session observation; recover authoritative session and turn state.'
      );
    }
  });
});
