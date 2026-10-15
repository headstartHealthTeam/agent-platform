import { describe, expect, it } from 'vitest';

import { firefliesParticipantIdentities, FirefliesParticipantError } from './participants.js';

describe('provider-independent participant aliases', () => {
  it('preserves field precedence, order, duplicate identities and explicit empty names', () => {
    expect(
      firefliesParticipantIdentities({
        participants: [
          'one@example.test',
          { emailAddress: 'two@example.test', displayName: 'Two' },
          {
            email: '',
            emailAddress: 'not-selected@example.test',
            name: '',
            displayName: 'Not selected',
          },
          {},
          { email: 'three@example.test', name: 'Three' },
        ],
        participantEmails: ['one@example.test'],
      })
    ).toEqual([
      { email: 'one@example.test', name: '' },
      { email: 'two@example.test', name: 'Two' },
      { email: '', name: '' },
      { email: '', name: '' },
      { email: 'three@example.test', name: 'Three' },
      { email: 'one@example.test', name: '' },
    ]);
    expect(firefliesParticipantIdentities({})).toEqual([]);
    expect(firefliesParticipantIdentities({ participants: null, participantEmails: null })).toEqual(
      []
    );
  });
  it('rejects malformed vendor fields without reflecting raw data or thrown causes', () => {
    for (const input of [
      null,
      { participants: [null] },
      { participantEmails: [5] },
      {
        get participants(): never {
          throw new Error('synthetic-sensitive-marker');
        },
      },
    ]) {
      let caught: unknown;
      try {
        firefliesParticipantIdentities(input);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(FirefliesParticipantError);
      if (!(caught instanceof FirefliesParticipantError))
        throw new Error('Expected provider error');
      expect(caught.cause).toBeUndefined();
      expect(caught.message).toBe('Unsupported Fireflies participant metadata');
    }
  });
});
