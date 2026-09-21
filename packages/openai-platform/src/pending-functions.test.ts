import { describe, expect, it } from 'vitest';

import { fingerprint } from './fingerprint.js';
import { pendingFunctionCalls } from './pending-functions.js';
import { summarize } from './platform.js';

const expected = { sessionId: 'session_synthetic', turnId: 'turn_synthetic' };
const call = {
  type: 'function_call',
  turn_id: expected.turnId,
  call_id: 'call_synthetic',
  name: 'ask_operator',
  arguments: { question: 'Which invented source should be used?', evidence: ['source_a'] },
};
const session = { id: expected.sessionId, required_actions: [call] };

describe('pending function projection', () => {
  it('accepts complete review packages above the former 100 KB mismatch', () => {
    const arguments_ = {
      inputJson: JSON.stringify({ fact: '\\'.repeat(600000) }),
      proposalJson: JSON.stringify({ text: 'complete'.repeat(60000) }),
    };
    const [projected] = pendingFunctionCalls(
      {
        ...session,
        required_actions: [
          { ...call, name: 'publish_credentialing_review_package', arguments: arguments_ },
        ],
      },
      expected
    );
    expect(projected?.arguments).toEqual(arguments_);
  });
  it('projects the exact pending call and binds arguments and identity, not extra provider content', () => {
    const projected = {
      ...expected,
      callId: call.call_id,
      name: call.name,
      arguments: call.arguments,
    };
    const result = pendingFunctionCalls({ ...session, instructions: 'private' }, expected);
    expect(result).toEqual([{ ...projected, fingerprint: fingerprint(projected) }]);
    expect(summarize({ data: result })).toEqual({ data: [{}] });
    const reordered = {
      ...call,
      arguments: { evidence: ['source_a'], question: call.arguments.question },
    };
    expect(pendingFunctionCalls({ ...session, required_actions: [reordered] }, expected)).toEqual(
      result
    );
  });

  it('ignores history, other turns and environment connection requests', () => {
    expect(
      pendingFunctionCalls(
        { id: expected.sessionId, required_actions: [], items: [call] },
        expected
      )
    ).toEqual([]);
    expect(
      pendingFunctionCalls(
        {
          id: expected.sessionId,
          required_actions: [
            { ...call, turn_id: 'turn_other' },
            { type: 'environment_connection', environment_id: 'env_synthetic' },
          ],
        },
        expected
      )
    ).toEqual([]);
  });

  it.each([
    null,
    {},
    { ...session, id: 'session_other' },
    { id: expected.sessionId, items: [call] },
    { ...session, required_actions: [call, call] },
    { ...session, required_actions: [{ ...call, arguments: null }] },
    {
      ...session,
      required_actions: [{ ...call, arguments: { text: 'x'.repeat(16 * 1024 * 1024 + 1) } }],
    },
    { ...session, required_actions: [{ type: 'future-action', private: 'private-marker' }] },
    { ...session, required_actions: [{ ...call, call_id: '../invalid' }] },
    { ...session, required_actions: Array.from({ length: 101 }, () => call) },
  ])('fails closed on malformed, ambiguous, unbounded or unexpected state', (input) => {
    expect(() => pendingFunctionCalls(input, expected)).toThrow('Invalid pending function state');
    expect(() => pendingFunctionCalls(input, expected)).not.toThrow('private-marker');
  });

  it('validates caller correlation before reading content', () => {
    expect(() => pendingFunctionCalls(session, { ...expected, turnId: '../unsafe' })).toThrow(
      'Invalid'
    );
  });

  it('changes the fingerprint when the call name or arguments change', () => {
    const original = pendingFunctionCalls(session, expected)[0]?.fingerprint;
    for (const changed of [
      { ...call, name: 'different_function' },
      { ...call, arguments: { question: 'A different question' } },
      { ...call, call_id: 'call_other' },
    ]) {
      expect(
        pendingFunctionCalls({ ...session, required_actions: [changed] }, expected)[0]?.fingerprint
      ).not.toBe(original);
    }
  });
});
