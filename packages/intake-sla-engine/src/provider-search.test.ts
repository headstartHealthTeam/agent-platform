import { describe, expect, it } from 'vitest';

import { buildProviderIdentityCluster, buildProviderRoleClusters } from './provider-identity.js';
import { proposeFirefliesParticipantIdentities } from './provider-participant-proposals.js';
import { firefliesClientSearchVariants, firefliesStageTerms } from './provider-search-terms.js';
import {
  assessFirefliesIdentityCoverage,
  providerFirefliesSearchPlan,
  providerFirefliesSearchPlans,
} from './provider-search.js';

describe('Intake provider search policy', () => {
  it('orders participant identity paths by provenance without adding CSM addresses to provider searches', () => {
    const cluster = buildProviderIdentityCluster({
      providers: [
        {
          name: 'Synthetic Provider',
          email: 'generic@example.test',
          firefliesParticipantEmail: 'meeting@example.test',
          backendUserEmail: 'login@example.test',
          providerProfileEmail: 'profile@example.test',
          contactEmail: 'contact@example.test',
          businessEmail: 'business@example.test',
        },
      ],
      currentCsm: { name: 'Synthetic CSM', email: 'csm@example.test' },
      practice: 'Synthetic Practice',
    });
    const plan = providerFirefliesSearchPlan({
      ...cluster,
      registryEmails: ['registry@example.test'],
    });
    expect(plan.participantEmails).toEqual([
      'meeting@example.test',
      'login@example.test',
      'profile@example.test',
      'contact@example.test',
      'business@example.test',
      'registry@example.test',
      'generic@example.test',
    ]);
    expect(plan.participantEmailCandidates.map((item) => item.sources)).toEqual([
      ['Verified Fireflies participant'],
      ['Headstart backend user'],
      ['Salesforce provider profile'],
      ['Salesforce contact'],
      ['Salesforce business profile'],
      ['Versioned identity registry'],
      [],
    ]);
    expect(plan.csmEmails).toEqual(['csm@example.test']);
    expect(plan.titleTerms).toEqual(['Synthetic Provider', 'Synthetic Practice']);
    expect(plan.identityDiscoveryOrder).toHaveLength(5);
  });
  it('groups overlapping provider roles while retaining provider-local names and role order', () => {
    const input = {
      renderingProvider: { name: 'Provider One', email: 'shared@example.test' },
      iaRenderingProvider: {
        name: 'Provider Alias',
        email: 'SHARED@example.test',
        role: 'Assessment',
      },
      priorProvider: { name: 'Other Provider', email: 'other@example.test' },
      practice: 'Practice',
      currentCsm: 'CSM',
      opportunityName: 'Synthetic Client',
      knownNameVariants: ['S. Client'],
      providerRoster: [{ opportunityName: 'Other Client' }],
      stage: 'TA Approved',
      authorizationNumbers: ['SYNTHETIC-AUTH'],
      payers: ['Synthetic Payer'],
      rbtNames: ['Synthetic RBT'],
      candidateNames: ['Synthetic Candidate'],
    };
    const plans = providerFirefliesSearchPlans(input);
    expect(plans.map((plan) => plan.roles)).toEqual([
      ['Rendering Provider', 'Assessment'],
      ['Prior Provider'],
      ['Practice Provider'],
    ]);
    expect(plans[0]).toMatchObject({
      primaryName: 'Provider One',
      role: 'Rendering Provider / Assessment',
      rosterOpportunityNames: ['Other Client'],
      coverage: { status: 'Complete' },
    });
    expect(plans[0]?.titleTerms).toEqual(['Provider One', 'Provider Alias', 'Practice']);
    expect(plans[0]?.transcriptSearchTerms).toEqual(
      expect.arrayContaining([
        'RBT',
        '97153',
        'SYNTHETIC-AUTH',
        'Synthetic Payer',
        'Synthetic RBT',
        'Synthetic Candidate',
      ])
    );
    expect(assessFirefliesIdentityCoverage(input)).toMatchObject({
      status: 'Complete',
      roles: 3,
      completeRoles: 3,
      missing: [],
    });
    const prebuilt = buildProviderRoleClusters(input);
    expect(
      providerFirefliesSearchPlans({
        ...input,
        renderingProvider: undefined,
        iaRenderingProvider: undefined,
        priorProvider: undefined,
        providerRoles: prebuilt,
      })
    ).toEqual(plans);
  });
  it('uses only original overlap anchors and preserves partial identity coverage', () => {
    for (const shared of [
      { id: 'same' },
      { portalProviderId: 'same' },
      { email: 'same@example.test' },
      { phone: '5551234567' },
      { name: 'same', practiceName: 'same' },
    ]) {
      expect(
        providerFirefliesSearchPlans({
          providerRoles: [
            { name: 'First', ...shared },
            { name: 'Second', ...shared },
          ],
        })
      ).toHaveLength(1);
    }
    expect(
      providerFirefliesSearchPlans({
        providerRoles: [
          { name: 'same', practiceName: 'one' },
          { name: 'same', practiceName: 'two' },
        ],
      })
    ).toHaveLength(2);
    expect(assessFirefliesIdentityCoverage({ providers: ['Named'] })).toMatchObject({
      status: 'Partial',
      missing: ['Provider email', 'Current or prior CSM'],
    });
    expect(assessFirefliesIdentityCoverage({})).toMatchObject({
      status: 'Partial',
      missing: ['Provider or practice name', 'Current or prior CSM'],
    });
    expect(
      providerFirefliesSearchPlans({
        providers: ['Named'],
        currentCsm: { email: 'csm@example.test' },
      })[0]?.coverage.attemptedIdentityPaths
    ).toEqual(['Provider or practice title', 'Current or prior CSM']);
  });
  it('retains client variant construction and stage-specific search terms, not new clinical conclusions', () => {
    expect(firefliesClientSearchVariants('Synthetic Client')).toEqual([
      'Synthetic Client',
      'syntheticclient',
      'Synthetic',
      'synthetic c',
      's client',
    ]);
    expect(firefliesClientSearchVariants('', ['@', '---', 'One'])).toEqual(['@', 'One']);
    expect(firefliesClientSearchVariants()).toEqual([]);
    expect(firefliesStageTerms('TA Approved')).toContain('97153');
    expect(firefliesStageTerms('Treatment Plan In Review')).toContain('signature');
    expect(firefliesStageTerms('TA Requested')).toContain('denial');
    expect(firefliesStageTerms('Insurance Verification')).toContain('VOB');
    expect(firefliesStageTerms()).toContain('97151');
  });
});
describe('candidate provider participant identities', () => {
  it('requires matching provider context plus exact name or known domain and returns proposals only', () => {
    const cluster = buildProviderIdentityCluster({
      providers: [{ name: 'Synthetic Provider', providerProfileEmail: 'known@practice.test' }],
      practice: 'Synthetic Practice',
    });
    expect(proposeFirefliesParticipantIdentities({ cluster })).toEqual([]);
    const proposals = proposeFirefliesParticipantIdentities({
      cluster,
      meetings: [
        {
          id: 'ignored',
          title: 'Unrelated',
          participants: [{ email: 'exact@external.test', name: 'Synthetic Provider' }],
        },
        {
          id: 'likely',
          title: 'Synthetic Practice',
          date: '2026-01-01',
          participants: [
            'known@practice.test',
            'stranger@external.test',
            'staff@headstart.health',
            '',
          ],
          participantEmails: ['second@practice.test'],
        },
        {
          id: 'direct',
          title: 'Synthetic Provider',
          participants: [
            { email: 'known@practice.test', name: 'Synthetic Provider' },
            { emailAddress: 'exact@external.test', displayName: 'Synthetic Provider' },
          ],
        },
        { title: 'Synthetic Practice', participants: ['known@practice.test'] },
        {
          organizerEmails: ['Synthetic Practice'],
          organizers: ['Synthetic Provider'],
          participants: [{ email: 'third@external.test', name: 'Synthetic Provider' }],
        },
      ],
    });
    expect(
      proposals.map((proposal) => [proposal.email, proposal.matchQuality, proposal.meetingId])
    ).toEqual([
      ['known@practice.test', 'Direct', 'direct'],
      ['second@practice.test', 'Likely', 'likely'],
      ['exact@external.test', 'Direct', 'direct'],
      ['third@external.test', 'Direct', null],
    ]);
    expect(cluster.firefliesParticipantEmails).toEqual([]);
  });
});
