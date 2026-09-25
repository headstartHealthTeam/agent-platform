import { describe, expect, it } from 'vitest';

import { buildIdentityProfile } from './identity-profile.js';
import type { IdentityProfile } from './identity-profile.js';
import { assessTextMatch, stageTerms } from './text-match.js';
import type { TextMatch } from './text-match.js';
import { segmentTranscript } from './transcript-segments.js';

function identity(): IdentityProfile {
  return buildIdentityProfile({
    opportunityId: 'synthetic-opportunity',
    opportunityName: 'Maren Example',
    providers: [{ name: 'Synthetic Provider', email: 'provider@example.test' }],
    practice: 'Synthetic Practice',
    currentCsm: 'Synthetic Coordinator',
    familyPhones: ['+1 (202) 555-0100'],
    familyEmails: [' Family@Example.test '],
    authorizationNumbers: ['synthetic-authorization'],
    clientAliases: ['Marin Alias'],
  });
}
describe('identity profiles and transcript matching', () => {
  it('preserves the approved first-name pattern semantics and short-circuit behavior', () => {
    const profile = identity();
    for (const [opportunityName, text] of [
      ['Al.n Example', 'Alan assessment'],
      ['Ann+ Example', 'Annn assessment'],
    ]) {
      expect(
        assessTextMatch({
          text: text ?? '',
          identity: { ...profile, opportunityName: opportunityName ?? '' },
          sourceContext: 'provider@example.test',
          stage: 'IA Scheduled',
        })
      ).toMatchObject({ quality: 'Likely', reasons: { firstNameMatch: true } });
    }
    expect(() =>
      assessTextMatch({
        text: 'assessment',
        identity: { ...profile, opportunityName: '++ Example' },
      })
    ).not.toThrow();
    expect(() =>
      assessTextMatch({
        text: 'assessment',
        identity: { ...profile, opportunityName: 'A++ Example' },
      })
    ).toThrow(SyntaxError);
  });
  it('composes aliases, IDs, role provenance and normalized family anchors without mutation', () => {
    const input = Object.freeze({
      opportunityId: 'one',
      opportunityName: 'Éxample Client',
      leadId: 'lead',
      relatedSalesforceRecordIds: ['lead', 'one', 'related'],
      businessProfileId: 'practice',
      familyPhones: ['+1 202 555 0100'],
      familyEmails: [' A@example.test ', 'a@example.test'],
      priorCsms: ['Earlier Coordinator', 'Earlier Coordinator'],
      practiceProviderRosterComplete: true,
      renderingProvider: { name: 'Synthetic Provider', email: 'provider@example.test' },
      rbtNames: ['Synthetic RBT', 'Synthetic RBT'],
      candidateNames: ['Synthetic Candidate'],
      authorizationNumbers: ['auth', 'auth'],
    });
    const profile = buildIdentityProfile(input);
    expect(profile.salesforceRecordIds).toEqual(['one', 'lead', 'related']);
    expect(profile.clientAliases).toEqual([
      'example client',
      'exampleclient',
      'client example',
      'example c',
      'e client',
    ]);
    expect(profile).toMatchObject({
      practiceId: 'practice',
      businessProfileId: 'practice',
      familyPhones: ['2025550100'],
      familyEmails: ['a@example.test'],
      priorCsms: ['Earlier Coordinator'],
      authorizationNumbers: ['auth'],
      rbtNames: ['Synthetic RBT'],
      candidateNames: ['Synthetic Candidate'],
      practiceProviderRosterComplete: true,
      clientAliasRegistryMatchCount: 0,
      clientAliasEvidence: [],
    });
    expect(profile.providers[0]).toMatchObject({
      role: 'Rendering Provider',
      name: 'Synthetic Provider',
    });
    const empty = buildIdentityProfile({ opportunityId: '', opportunityName: '' });
    expect(empty.clientAliases).toEqual([]);
    expect(empty.providers).toEqual([
      {
        role: 'Unspecified',
        name: null,
        names: [],
        email: null,
        emails: [],
        phones: [],
        salesforceIds: [],
        portalProviderIds: [],
      },
    ]);
    expect(
      buildIdentityProfile({ opportunityId: 'a', opportunityName: 'Only', priorCsms: 'AA' })
        .priorCsms
    ).toEqual(['A']);
  });
  it('preserves stage-term precedence and explicit versus contextual identity matches', () => {
    const profile = identity();
    for (const text of [
      'synthetic-opportunity',
      'synthetic-authorization',
      '202-555-0100',
      'Maren Example',
    ])
      expect(assessTextMatch({ text, identity: profile }).quality).toBe('Direct');
    expect(
      assessTextMatch({
        text: 'unrelated',
        sourceContext: 'family@example.test',
        identity: profile,
      }).quality
    ).toBe('Direct');
    expect(
      assessTextMatch({
        text: 'Maren Example and Other Client',
        identity: profile,
        competingClientNames: ['Other Client'],
      }).quality
    ).toBe('Likely');
    expect(stageTerms('IA Scheduled')).toContain('97151');
    expect(stageTerms('97151')).toContain('signature');
    expect(stageTerms('Treatment Plan')).toContain('signature');
    expect(stageTerms('TA Requested')).toContain('payer');
    expect(stageTerms('TA Approved')).toContain('rbt');
    expect(stageTerms('97153')).toContain('rbt');
    expect(stageTerms(undefined)).toContain('payer');
    expect(stageTerms('Clinical Quality')).toContain('97151');
  });
  it('keeps aliases and fuzzy roster matches assumed, competing names weak, and CSM-only first names insufficient', () => {
    const profile = identity();
    const assess = (text: string, sourceContext = 'provider@example.test'): TextMatch =>
      assessTextMatch({ text, sourceContext, identity: profile, stage: 'IA Scheduled' });
    expect(assess('Marin Alias assessment')).toMatchObject({
      quality: 'Likely',
      assumedIdentityMatch: true,
    });
    expect(assess('Maren assessment')).toMatchObject({
      quality: 'Likely',
      reasons: { firstNameMatch: true },
    });
    expect(assess('Marin assessment')).toMatchObject({
      quality: 'Likely',
      reasons: { fuzzyFirstNameMatch: true },
    });
    expect(assess('Maren assessment', 'Synthetic Coordinator').quality).toBe('Weak');
    expect(assess('Maren unrelated', '').quality).toBe('Weak');
    expect(assess('Marin assessment', 'Synthetic Practice').quality).toBe('Likely');
    profile.providerRoster = [
      { opportunityId: profile.opportunityId, opportunityName: profile.opportunityName },
      { opportunityId: 'second', opportunityName: 'Different Person' },
    ];
    expect(assess('Marin Exampel assessment')).toMatchObject({
      quality: 'Likely',
      assumedIdentityMatch: true,
      reasons: { providerRosterAssumedMatch: true },
    });
    expect(
      assessTextMatch({
        text: 'Maren assessment Other Client',
        sourceContext: 'provider@example.test',
        identity: profile,
        competingClientNames: ['Other Client'],
      }).quality
    ).toBe('Weak');
    expect(
      assessTextMatch({
        text: '',
        identity: {
          opportunityId: '',
          opportunityName: '',
          familyPhones: [],
          authorizationNumbers: [],
        },
      }).quality
    ).toBe('Weak');
  });
  it('merges overlapping excerpts by sentence identity while retaining the first anchor and direct quality', () => {
    const profile = identity();
    const sentences = [
      { id: '0', text: 'unrelated' },
      { id: '1', text: 'Maren assessment' },
      { id: '2', text: 'Maren Example' },
      { id: '3', text: 'unrelated' },
      { id: '4', text: 'unrelated' },
      { id: '5', text: 'unrelated' },
      { id: '6', text: 'Maren Example' },
    ];
    const result = segmentTranscript({
      sentences,
      identity: profile,
      sourceContext: 'provider@example.test',
      radius: 1,
    });
    expect(result).toEqual([
      { start: 0, end: 4, anchorIndex: 1, quality: 'Direct', sentences: sentences.slice(0, 4) },
      { start: 5, end: 7, anchorIndex: 6, quality: 'Direct', sentences: sentences.slice(5) },
    ]);
    expect(segmentTranscript({ sentences, identity: profile })).toEqual([
      { start: 0, end: 7, anchorIndex: 2, quality: 'Direct', sentences },
    ]);
    expect(segmentTranscript({ sentences: [{ text: 'unrelated' }], identity: profile })).toEqual(
      []
    );
    expect(
      segmentTranscript({
        sentences: [{ text: 'Maren Example' }, { text: 'Maren Example' }],
        identity: profile,
      })[0]?.sentences
    ).toHaveLength(1);
  });
});
