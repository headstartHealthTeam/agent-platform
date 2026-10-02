import { describe, expect, it, vi } from 'vitest';

import { conversationInStoryWindow, conversationProviderAnchors } from './conversation-anchors.js';
import type { ConversationMatch, ConversationProfile } from './conversation-match-types.js';
import { scoreConversationMatch } from './conversation-match.js';
import { bestConversationNameMatch, uniqueConversationValues } from './conversation-name.js';
import {
  createConversationSearchResult,
  evaluateConversationSourceHealth,
} from './conversation-search-result.js';
import { buildIdentityProfile } from './identity-profile.js';

const profile: ConversationProfile = {
  opportunityId: 'synthetic-one',
  opportunityName: 'Maren Example',
  stage: 'IA Scheduled',
  providerNames: ['Synthetic Provider'],
  familyPhones: ['2025550100'],
  authorizationNumbers: ['synthetic-auth'],
  clientAliases: ['Marin Alias'],
  payer: 'synthetic-payer',
};
function score(text: string, targetProfile = profile): ConversationMatch {
  return scoreConversationMatch({
    text,
    targetProfile,
    providerRelationshipConfirmed: true,
    asOf: '2026-09-08',
  });
}
describe('conversation relevance and search outcomes', () => {
  it('composes typed identity profiles, nullable Portal provider names and explicit default options', () => {
    const identity = buildIdentityProfile({
      opportunityId: 'synthetic-one',
      opportunityName: 'Maren Example',
    });
    const text = 'Maren Example assessment';
    const expected = scoreConversationMatch({ text, targetProfile: identity });
    expect(
      scoreConversationMatch({
        text,
        targetProfile: {
          ...identity,
          providerNames: identity.providers.map((provider) => provider.name),
        },
        metadata: undefined,
        providerRoster: undefined,
        providerRelationshipConfirmed: undefined,
        linkedOpportunityId: undefined,
        eventDate: undefined,
        storyStartDate: undefined,
        asOf: undefined,
      })
    ).toEqual(expected);
    expect(scoreConversationMatch({ text, targetProfile: undefined })).toMatchObject({
      quality: 'Rejected',
    });
  });
  it('preserves exact, verified-alias, fuzzy and first-name scoring without upgrading assumptions', () => {
    expect(score('Maren Example assessment')).toMatchObject({
      quality: 'Direct',
      score: 90,
      nameMatchKind: 'Exact full name',
      scoreBreakdown: { name: 40, providerRoster: 25, stage: 15, context: 0, date: 10 },
    });
    expect(score('Marin Alias assessment')).toMatchObject({
      quality: 'Likely',
      nameMatchKind: 'Exact verified alias',
      score: 90,
    });
    expect(score('Marin Exampl assessment')).toMatchObject({
      quality: 'Likely',
      nameMatchKind: 'Fuzzy full name',
    });
    expect(score('Maren assessment')).toMatchObject({
      quality: 'Likely',
      nameMatchKind: 'Exact first name',
      score: 75,
    });
    expect(score('Marin assessment')).toMatchObject({
      quality: 'Likely',
      nameMatchKind: 'Fuzzy first name',
      score: 75,
    });
    expect(score('Maren unrelated')).toMatchObject({ quality: 'Weak', score: 60 });
    expect(score('unrelated')).toMatchObject({ quality: 'Rejected', score: 35 });
    expect(bestConversationNameMatch('unrelated', { opportunityName: 'Al' }).score).toBe(0);
    expect(
      bestConversationNameMatch('One Two Three', { opportunityName: 'One Two Three' }).score
    ).toBe(40);
  });
  it('retains direct lookup, record, authorization and phone precedence without inventing fallback IDs', () => {
    expect(
      scoreConversationMatch({
        text: 'unrelated',
        targetProfile: profile,
        linkedOpportunityId: 'synthetic-one',
      })
    ).toMatchObject({ quality: 'Direct', reason: 'Opportunity lookup' });
    expect(score('synthetic-one')).toMatchObject({ quality: 'Direct', reason: 'Opportunity ID' });
    expect(score('synthetic-auth')).toMatchObject({
      quality: 'Direct',
      reason: 'Authorization number',
    });
    expect(score('202-555-0100')).toMatchObject({ quality: 'Direct', reason: 'Family phone' });
    expect(
      scoreConversationMatch({
        text: 'Name Only synthetic-one',
        targetProfile: profile,
        providerRoster: [{ name: 'Name Only' }],
        linkedOpportunityId: 'synthetic-one',
      })
    ).toMatchObject({ quality: 'Weak', nameMatchKind: 'Exact full name' });
    expect(scoreConversationMatch({ text: 'unrelated' })).toMatchObject({
      quality: 'Rejected',
      score: 0,
      rankedCandidates: [],
      winnerOpportunityId: null,
    });
  });
  it('retains roster ambiguity, competing winners, deduplication and the three-candidate preview', () => {
    const roster = [
      profile,
      { ...profile, opportunityId: 'second', opportunityName: 'Maren Other' },
      { opportunityId: 'third', opportunityName: 'Third Person' },
      { opportunityId: 'fourth', opportunityName: 'Fourth Person' },
    ];
    const ambiguous = scoreConversationMatch({
      text: 'Maren assessment',
      targetProfile: profile,
      providerRoster: roster,
      providerRelationshipConfirmed: true,
    });
    expect(ambiguous).toMatchObject({ quality: 'Weak', margin: 0, score: 75 });
    expect(ambiguous.rankedCandidates).toHaveLength(3);
    const competing = scoreConversationMatch({
      text: 'Maren Other assessment',
      targetProfile: profile,
      providerRoster: roster,
      providerRelationshipConfirmed: true,
    });
    expect(competing).toMatchObject({
      quality: 'Weak',
      reason: 'Another provider-roster client scored higher.',
      winnerOpportunityId: 'second',
    });
    expect(
      scoreConversationMatch({
        text: 'Maren Example',
        targetProfile: profile,
        providerRoster: [profile, profile],
      }).rankedCandidates
    ).toHaveLength(1);
    expect(roster).toHaveLength(4);
  });
  it('keeps provider and contextual anchors and stage-specific terms separate from source admission', () => {
    const targetProfile: ConversationProfile = {
      ...profile,
      practice: { name: 'Synthetic Practice' },
      providerRoles: [
        {
          primaryName: 'Primary',
          primaryEmail: 'primary@example.test',
          names: ['Role One', 'Role Two'],
        },
      ],
      providers: [{ name: 'Provider', email: 'email@example.test', phones: ['2025550199'] }],
      rbtRequests: [{ name: 'synthetic-request', assignedRbt: 'Synthetic RBT' }],
      candidates: [{ name: 'Synthetic Candidate' }],
    };
    expect(conversationProviderAnchors(targetProfile)).toContain('role one role two');
    expect(
      scoreConversationMatch({
        text: 'Marin assessment synthetic-request',
        metadata: 'Synthetic Practice',
        targetProfile,
      })
    ).toMatchObject({ quality: 'Likely', scoreBreakdown: { context: 10, providerRoster: 25 } });
    for (const [stage, term] of [
      ['97151', 'signature'],
      ['Treatment Plan', 'provider capacity'],
      ['IA Requested', 'sipa'],
      ['TA Requested', 'resend'],
      ['TA Approved', 'rbt'],
      ['97153', 'hire'],
      ['First Day', 'staffing'],
      ['', 'next step'],
    ])
      expect(
        score(`Maren ${term ?? ''}`, { ...profile, stage: stage ?? '' }).scoreBreakdown.stage
      ).toBe(15);
    expect(
      scoreConversationMatch({
        text: 'Maren Example',
        metadata: 'email@example.test',
        targetProfile,
        eventDate: '2026-09-09',
        asOf: '2026-09-08',
      })
    ).toMatchObject({ quality: 'Direct', scoreBreakdown: { date: 0 } });
  });
  it('preserves date-only cutoff end-of-day, missing dates, invalid dates and optional current-time behavior', () => {
    expect(conversationInStoryWindow(null, '2026-09-01', '2026-09-08')).toBe(true);
    expect(conversationInStoryWindow('2026-09-08T23:59:59.999Z', null, '2026-09-08')).toBe(true);
    expect(conversationInStoryWindow('2026-09-09', null, '2026-09-08')).toBe(false);
    expect(conversationInStoryWindow('2026-09-01', '2026-09-02', '2026-09-08')).toBe(false);
    expect(conversationInStoryWindow('invalid', null, '2026-09-08')).toBe(false);
    expect(conversationInStoryWindow('2026-09-02', 'invalid', '2026-09-08T12:00:00Z')).toBe(true);
    expect(conversationInStoryWindow('2026-09-02', null, 'invalid')).toBe(false);
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-08T00:00:00Z'));
    try {
      expect(conversationInStoryWindow('2026-09-02', '', null)).toBe(true);
    } finally {
      now.mockRestore();
    }
  });
  it('reports partial source failures independently of matches and preserves status precedence', () => {
    const input = {
      source: 'Fireflies',
      opportunityId: 'synthetic-one',
      searchedAt: '2026-09-08T00:00:00Z',
      matches: [
        { quality: 'Direct' },
        { quality: 'Likely' },
        ...Array.from({ length: 4 }, () => ({ quality: 'Weak' })),
        { quality: 'Rejected' },
        { quality: 'Unknown' },
      ],
      identitiesUsed: ['a', ['b', 'a'], null],
      queriesUsed: ['query', 'query'],
    };
    const result = createConversationSearchResult(input);
    expect(result).toMatchObject({
      status: 'Found',
      complete: true,
      matchCounts: { Direct: 1, Likely: 1, Weak: 4, Rejected: 1 },
      identitiesUsed: ['a', 'b'],
      queriesUsed: ['query'],
    });
    expect(result.weakMatches).toHaveLength(3);
    expect(result.directAndLikelyMatches).toHaveLength(2);
    expect(result.rejectedMatches).toHaveLength(1);
    expect(createConversationSearchResult({ ...input, failures: ['failure'] })).toMatchObject({
      status: 'Blocked',
      complete: false,
    });
    expect(createConversationSearchResult({ ...input, paginationComplete: false }).status).toBe(
      'Blocked'
    );
    expect(
      createConversationSearchResult({ ...input, transcriptFetchComplete: false }).status
    ).toBe('Blocked');
    expect(createConversationSearchResult({ ...input, blocked: true })).toMatchObject({
      status: 'Blocked',
      complete: true,
    });
    expect(createConversationSearchResult({ ...input, blocked: true, timedOut: true }).status).toBe(
      'Timed Out'
    );
    expect(
      createConversationSearchResult({ ...input, timedOut: true, unsupported: true }).status
    ).toBe('Unsupported');
    expect(
      createConversationSearchResult({ source: 'Fireflies', opportunityId: 'synthetic-one' })
    ).toMatchObject({ status: 'Searched - Not Found', complete: true });
    expect(uniqueConversationValues()).toEqual([]);
  });
  it('preserves source-wide health checks without treating legitimate Fireflies empty results as failure', () => {
    expect(evaluateConversationSourceHealth({ source: 'Portal', results: [{}] }).status).toBe(
      'Blocked'
    );
    expect(evaluateConversationSourceHealth({ source: 'Fireflies', results: [{}] })).toEqual({
      source: 'Fireflies',
      status: 'Complete',
      reason: null,
    });
    expect(evaluateConversationSourceHealth({ source: 'Portal' }).status).toBe('Complete');
    expect(
      evaluateConversationSourceHealth({ source: 'Portal', results: [{ recordsScanned: '1' }] })
        .status
    ).toBe('Complete');
    expect(
      evaluateConversationSourceHealth({
        source: 'Portal',
        results: [{ matchCounts: { Likely: 1 } }],
      }).status
    ).toBe('Complete');
    expect(
      evaluateConversationSourceHealth({
        source: 'Fireflies',
        sentinelExpected: true,
        sentinelFound: null,
      }).reason
    ).toContain('sentinel');
    expect(
      evaluateConversationSourceHealth({
        source: 'Fireflies',
        sentinelExpected: true,
        sentinelFound: true,
      }).status
    ).toBe('Complete');
    expect(
      evaluateConversationSourceHealth({
        source: 'Fireflies',
        inventoryComplete: false,
        sentinelExpected: true,
      }).reason
    ).toContain('pagination');
  });
});
