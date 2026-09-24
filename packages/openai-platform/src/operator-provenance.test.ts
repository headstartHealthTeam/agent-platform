import { describe, expect, it } from 'vitest';

import { verifiedOperatorRoots } from './operator-provenance.js';

const binding = {
  sessionId: 'session_a',
  turnId: 'turn_first',
  workflowRevision: 'workflow_a',
  target: 'target_a',
};
const session = { id: 'session_a', metadata: { workflow_revision: 'workflow_a' } };
type Root = ReturnType<typeof verifiedOperatorRoots>['root'];
const turn = (id: string, status: Root['status']): Root => ({
  id,
  status,
  session_id: 'session_a',
  subagent_id: null,
});

describe('operator session provenance', () => {
  it.each(['completed', 'failed', 'cancelled'] as const)(
    'observes an already-existing later root after a %s root without replaying work',
    (status) => {
      const current = turn('turn_later', 'in_progress');
      expect(
        verifiedOperatorRoots(binding, session, {
          data: [turn('turn_first', status), current],
          has_more: false,
        }).root
      ).toEqual(current);
    }
  );

  it.each(['queued', 'waiting', 'in_progress'] as const)(
    'rejects overlapping nonterminal roots (%s)',
    (status) => {
      expect(() =>
        verifiedOperatorRoots(binding, session, {
          data: [turn('turn_first', status), turn('turn_later', 'in_progress')],
          has_more: false,
        })
      ).toThrow('provenance');
    }
  );

  it('preserves the original anchor and rejects duplicates, foreign turns and incomplete history', () => {
    for (const data of [
      [turn('different_anchor', 'completed')],
      [turn('turn_first', 'completed'), turn('turn_first', 'completed')],
      [{ ...turn('turn_first', 'completed'), session_id: 'other_session' }],
    ])
      expect(() => verifiedOperatorRoots(binding, session, { data, has_more: false })).toThrow();
    expect(() =>
      verifiedOperatorRoots(binding, session, {
        data: [turn('turn_first', 'completed')],
        has_more: true,
      })
    ).toThrow();
  });
});
