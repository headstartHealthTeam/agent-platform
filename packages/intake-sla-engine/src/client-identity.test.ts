import { describe, expect, it } from 'vitest';

import {
  candidateMatchIsActive,
  candidateMatchRank,
  selectCurrentCandidateMatch,
} from './candidate-match.js';
import { clientIdentityAliasesFor, clientIdentityRegistryMatches } from './client-identity.js';
import type { ClientIdentityRegistry } from './client-identity.js';
import { nameEditDistance, normalizeClientName } from './client-name.js';

describe('client alias and candidate identity contracts', () => {
  it('matches exact IDs or normalized names within practice scope without mutating the registry', () => {
    const registry: ClientIdentityRegistry = {
      version: 'synthetic',
      clients: [
        {
          opportunityIds: ['one'],
          names: ['Synthetic Client'],
          practiceIds: ['practice-a'],
          aliases: ['Known Alias'],
          evidence: { source: 'synthetic' },
        },
        { names: ['Synthetic Client'], aliases: ['Known Alias', 'Second Alias'], evidence: false },
      ],
    };
    expect(
      clientIdentityRegistryMatches({ opportunityId: 'one', practiceId: 'wrong' }, registry)
    ).toEqual([registry.clients[0]]);
    expect(
      clientIdentityAliasesFor(
        { opportunityName: 'Sýnthetic CLIENT', practiceId: 'practice-a' },
        registry
      )
    ).toEqual({
      registryVersion: 'synthetic',
      registryMatchCount: 2,
      aliases: ['Known Alias', 'Second Alias'],
      evidence: [{ source: 'synthetic' }],
    });
    expect(
      clientIdentityAliasesFor(
        { opportunityName: 'Synthetic Client', practiceId: 'wrong' },
        registry
      ).registryMatchCount
    ).toBe(1);
    expect(clientIdentityAliasesFor().registryMatchCount).toBe(0);
    expect(clientIdentityRegistryMatches()).toEqual([]);
  });
  it('retains normalized edit distance and distinguishes roster punctuation from provider anchors', () => {
    expect(normalizeClientName('Éxample.Name@example.test')).toBe('example name example test');
    expect(nameEditDistance('Marin', 'Maren')).toBe(1);
    expect(nameEditDistance('', 'abc')).toBe(3);
    expect(nameEditDistance()).toBe(0);
  });
  it('selects active staffing matches by approved status rank then modification time', () => {
    expect(candidateMatchIsActive()).toBe(true);
    expect(candidateMatchRank()).toBe(50);
    const statuses = [
      'Hired',
      'Matched',
      'Offer accepted',
      'Second interview',
      'Interview',
      'Proposed',
      'Screen',
      'Other',
      'Declined',
    ];
    expect(
      statuses.map((status) => candidateMatchRank({ Ticket_Match_Status__c: status }))
    ).toEqual([600, 500, 450, 350, 300, 200, 100, 50, 0]);
    expect(
      candidateMatchIsActive({ Candidate__r: { Provider_Rejection_Reason__c: 'withdrew' } })
    ).toBe(false);
    const rows = [
      { id: 'older', Ticket_Match_Status__c: 'Hired', CreatedDate: '2026-01-01' },
      { id: 'newer', Ticket_Match_Status__c: 'Hired', LastModifiedDate: '2026-01-02' },
      {
        id: 'rejected',
        Ticket_Match_Status__c: 'Hired',
        Rejection_Reason__c: 'rejected',
        LastModifiedDate: '2026-01-03',
      },
    ];
    expect(selectCurrentCandidateMatch(rows)?.id).toBe('newer');
    expect(rows[0]?.id).toBe('older');
    expect(selectCurrentCandidateMatch()).toBeUndefined();
    expect(selectCurrentCandidateMatch([{}, {}])).toEqual({});
  });
});
