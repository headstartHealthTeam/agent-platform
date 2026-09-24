import { describe, expect, it } from 'vitest';

import { buildIdentityProfile } from './identity-profile.js';
import { evaluateConversationMatch } from './search-pathway-match.js';
import type { SearchPathwayIdentity } from './search-pathway-types.js';
import {
  buildNameVariants,
  compactPhone,
  hasCompetingNamedClient,
  normalizeSearchText,
  stageSearchVernacular,
} from './search-pathway-values.js';
import { buildSearchPathways } from './search-pathways.js';

const identity = {
  opportunityId: '006000000000001',
  opportunityName: 'Synthetic Example',
  stage: 'IA Scheduled',
  providers: [{ name: 'Doctor Fiction', email: 'doctor@example.invalid' }],
  currentCsm: { name: 'Coordinator Exampleworker' },
  authorizationNumbers: ['AUTH-123'],
  familyPhones: ['+1 (212) 555-0144'],
  payers: ['Fiction Payer'],
  candidates: [{ name: 'Staff Candidate' }],
} satisfies SearchPathwayIdentity;

describe('Intake search pathways and supplemental conversation admission', () => {
  it('retains normalization, phone handling and ordered name variants', () => {
    expect(normalizeSearchText('  Sýnthetic—Example  ')).toBe('synthetic example');
    expect(normalizeSearchText(false)).toBe('');
    expect(normalizeSearchText(123)).toBe('123');
    expect(compactPhone('+1 (212) 555-0144')).toBe('2125550144');
    expect(compactPhone('442125550144')).toBe('442125550144');
    expect(buildNameVariants('Sýnthetic Middle Example')).toEqual([
      'synthetic middle example',
      'syntheticmiddleexample',
      'synthetic example',
      'syntheticexample',
      's example',
      'example synthetic',
      'synthetic',
      'example',
    ]);
    expect(buildNameVariants(null)).toEqual([]);
  });
  it.each([
    ['Insurance Verification', 'vob'],
    ['IA Requested', 'initial authorization'],
    ['IC Completed', 'initial authorization'],
    ['IA Approved', '97151'],
    ['IA Scheduled', '97151'],
    ['97151 Completed', 'clinical review'],
    ['Treatment Plan In-review', 'clinical review'],
    ['TA Requested', 'resubmission'],
    ['TA Approved', 'restaffing'],
    ['97153', 'restaffing'],
    ['First Day', 'restaffing'],
    ['', 'next step'],
  ])('retains stage vocabulary for %s', (stage, term) => {
    expect(stageSearchVernacular(stage)).toContain(term);
  });
  it('composes actual identity producers without dropping provider roles or inherited metadata', () => {
    const profile = buildIdentityProfile({
      ...identity,
      providerRoles: [
        { role: 'Rendering', name: 'Assigned Doctor', email: 'role@example.invalid' },
      ],
      practice: { name: 'Fiction Clinic' },
      priorCsms: ['Previous Coordinator', 'Earlier Coordinator'],
    });
    const pathways = buildSearchPathways(profile);
    expect(pathways.meetingRetrieval.providerNames).toContain('assigned doctor');
    expect(pathways.transcriptMatching.providerAnchors).toContain('fiction clinic');
    expect(pathways.transcriptMatching.csmAnchors).toContain('previous coordinator');
    expect(
      evaluateConversationMatch({
        text: 'Synthetic assessment',
        metadata: 'Assigned Doctor',
        identity: profile,
      })
    ).toMatchObject({ matched: true, quality: 'Likely', score: 72 });
  });
  it('preserves supplied variants, role precedence and query order', () => {
    const pathways = buildSearchPathways({
      ...identity,
      knownNameVariants: [' Special Alias ', 'Special Alias'],
      providerRoles: [
        {
          primaryName: 'Role Doctor',
          names: ['Doctor Alias'],
          emails: ['role@example.invalid'],
          phones: ['2125550111'],
          practiceAliases: ['Practice Alias'],
          meetingAliases: ['Meeting Alias'],
        },
      ],
      searchVernacular: ['Custom Term'],
      priorCsms: [null, 'Prior Coordinator'],
      rbtRequests: [{ name: 'Request Name', assignedRbt: 'Assigned RBT' }],
    });
    expect(pathways.directIdentifiers.fullNameVariants).toEqual(['special alias']);
    expect(pathways.meetingRetrieval.providerNames).toEqual([
      'role doctor',
      'doctor alias',
      'meeting alias',
    ]);
    expect(pathways.transcriptMatching.providerAnchors).not.toContain('doctor fiction');
    expect(pathways.transcriptMatching.vernacular).toEqual(['custom term']);
    expect(pathways.queryPlan.map((path) => path.label)).toEqual([
      'Full client name',
      'Provider / practice',
      'Current and prior CSM',
      'Authorization / payer',
      'RBT / candidate',
      'Stage vernacular',
    ]);
    expect(buildSearchPathways().queryPlan).toEqual([
      {
        tier: 'Context',
        label: 'Stage vernacular',
        terms: ['intake', 'schedule', 'provider', 'family', 'next step'],
      },
    ]);
  });
  it('keeps explicit lookup precedence above all textual evidence', () => {
    expect(
      evaluateConversationMatch({
        text: '',
        opportunityId: identity.opportunityId,
        linkedOpportunityId: identity.opportunityId,
      })
    ).toEqual({ matched: true, quality: 'Direct', score: 100, reasons: ['Opportunity lookup'] });
    expect(
      evaluateConversationMatch({
        text: 'Synthetic Example',
        identity,
        opportunityId: identity.opportunityId,
        linkedOpportunityId: '006000000000002',
      })
    ).toEqual({
      matched: false,
      quality: 'Weak',
      score: 0,
      reasons: ['Directly linked to a different Opportunity'],
    });
    expect(evaluateConversationMatch({ text: '' })).toEqual({
      matched: false,
      quality: 'Weak',
      score: 0,
      reasons: [],
    });
  });
  it.each([
    ['Synthetic Example', 90, 'Direct'],
    ['Synthetic middle Example', 85, 'Direct'],
    ['Synthetix Examplx Doctor Fiction', 82, 'Likely'],
    ['Synthetic Doctor Fiction', 72, 'Likely'],
    ['Synthetix Doctor Fiction assessment', 67, 'Likely'],
    ['Synthetic Coordinator Exampleworker assessment', 60, 'Weak'],
    ['Synthetic Staff Candidate', 70, 'Likely'],
    ['Synthetic assessment', 55, 'Weak'],
    ['Synthetic health assessment', 0, 'Weak'],
    ['unrelated', 0, 'Weak'],
    ['AUTH-123', 95, 'Direct'],
  ])('preserves score precedence for %s', (text, score, quality) => {
    expect(evaluateConversationMatch({ text, identity })).toMatchObject({
      score,
      quality,
      matched: score >= 65,
    });
  });
  it('keeps family phone extraction and optional country prefix behavior', () => {
    for (const phone of [
      '2125550144',
      '212-555-0144',
      '+1 212.555.0144',
      '12125550144',
      '1\t2125550144',
    ]) {
      expect(evaluateConversationMatch({ text: phone, identity })).toEqual({
        matched: true,
        quality: 'Direct',
        score: 95,
        reasons: ['Family phone'],
      });
    }
    expect(evaluateConversationMatch({ text: '212-555-0145', identity }).matched).toBe(false);
  });
  it('keeps competing-name caps and the approved strong-identifier exception', () => {
    expect(
      evaluateConversationMatch({ text: 'for Different: Synthetic Doctor Fiction', identity })
    ).toMatchObject({ matched: false, quality: 'Weak', score: 40 });
    expect(
      evaluateConversationMatch({ text: 'for Different: Synthetic Example', identity })
    ).toMatchObject({ matched: true, quality: 'Direct', score: 90 });
    expect(
      hasCompetingNamedClient({
        text: 'Other Client',
        targetName: 'Synthetic Example',
        cohortNames: ['Other Client'],
      })
    ).toBe(true);
    expect(
      hasCompetingNamedClient({
        text: 'Other Client and Synthetic Example',
        targetName: 'Synthetic Example',
        cohortNames: ['Other Client'],
      })
    ).toBe(false);
    expect(hasCompetingNamedClient({ text: 'Other Client', targetName: '' })).toBe(false);
  });
  it('consumes prepared pathways without recomputing or mutating them', () => {
    const pathways = buildSearchPathways({ ...identity, knownNameVariants: ['Prepared Alias'] });
    const before = structuredClone(pathways);
    expect(
      evaluateConversationMatch({
        text: 'Prepared Alias',
        identity: { ...identity, searchPathways: pathways },
      })
    ).toMatchObject({ score: 90, quality: 'Direct' });
    expect(pathways).toEqual(before);
  });
});
