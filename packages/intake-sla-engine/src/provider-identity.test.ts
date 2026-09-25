import { describe, expect, it } from 'vitest';

import {
  explicitRoleProviders,
  providerIdentityInputFromSources,
} from './provider-identity-input.js';
import type { ProviderIdentityInput } from './provider-identity-types.js';
import { normalizeIdentityValue, PROVIDER_ROLE_FIELDS } from './provider-identity-values.js';
import {
  buildProviderIdentityCluster,
  buildProviderRoleClusters,
  providerClusterAnchors,
} from './provider-identity.js';

describe('Intake provider identity clustering', () => {
  it('retains falsey source-array omissions until clustering and rejects truthy malformed objects', () => {
    const omissions = [null, undefined, false, 0, ''];
    const cluster = buildProviderIdentityCluster({
      providers: [
        {
          name: 'Synthetic Provider',
          aliases: [...omissions, 'Known Alias'],
          providerProfileEmails: [...omissions, 'PROFILE@example.test'],
          firefliesParticipantEmails: [...omissions, 'MEETING@example.test'],
        },
      ],
      providerEmails: [...omissions, 'PROVIDER@example.test'],
      currentCsm: {
        name: 'CSM',
        aliases: [...omissions, 'CSM Alias'],
        emails: [...omissions, 'CSM@example.test'],
      },
    });
    expect(cluster.names).toEqual(['Synthetic Provider', 'Known Alias']);
    expect(cluster.emails).toEqual([
      'provider@example.test',
      'profile@example.test',
      'meeting@example.test',
    ]);
    expect(cluster.csmNames).toEqual(['CSM', 'CSM Alias']);
    expect(cluster.csmEmails).toEqual(['csm@example.test']);
    const projected = providerIdentityInputFromSources({
      verifiedFirefliesParticipants: [{ emails: [...omissions, 'MEETING@example.test'] }],
    });
    expect(projected.firefliesParticipantEmails).toEqual([...omissions, 'MEETING@example.test']);
    expect(
      buildProviderIdentityCluster({ providers: [projected] }).firefliesParticipantEmails
    ).toEqual(['meeting@example.test']);
    expect(() =>
      buildProviderIdentityCluster({ providerEmails: [{ unexpected: 'object' }] })
    ).toThrow();
  });
  it('preserves deterministic aliases and source-specific email provenance without conflating CSM with provider', () => {
    const input = {
      providers: [
        {
          id: 'synthetic-p',
          name: 'Áda Synthetic',
          aliases: ['Ada Synthetic', 'A. Synthetic'],
          email: 'ADA@EXAMPLE.TEST',
          providerProfileEmail: 'PROFILE@example.test',
          contactEmails: ['CONTACT@example.test'],
          businessEmails: ['business@example.test'],
          backendUserEmail: 'login@example.test',
          firefliesParticipantEmail: 'meeting@example.test',
          phone: '+1 (555) 123-4567',
          practiceName: 'Synthetic Practice',
          portalProviderId: 'backend-synthetic',
        },
      ],
      currentCsm: { name: 'Synthetic CSM', email: 'CSM@example.test' },
      priorCsms: ['Earlier CSM'],
      meetingAliases: ['Practice Check-in'],
      providerNames: ['', 'Áda Synthetic'],
    };
    const original = structuredClone(input);
    const cluster = buildProviderIdentityCluster(input);
    expect(input).toEqual(original);
    expect(cluster).toEqual({
      registryVersion: '2026-09-04-reconstructed-v1',
      registryMatchCount: 0,
      salesforceIds: ['synthetic-p'],
      names: ['Áda Synthetic', 'A. Synthetic'],
      emails: [
        'ada@example.test',
        'profile@example.test',
        'business@example.test',
        'contact@example.test',
        'login@example.test',
        'meeting@example.test',
      ],
      providerProfileEmails: ['profile@example.test'],
      businessEmails: ['business@example.test'],
      contactEmails: ['contact@example.test'],
      backendUserEmails: ['login@example.test'],
      firefliesParticipantEmails: ['meeting@example.test'],
      registryEmails: [],
      phones: ['5551234567'],
      practiceAliases: ['Synthetic Practice'],
      meetingAliases: ['Practice Check-in'],
      portalProviderIds: ['backend-synthetic'],
      csmNames: ['Earlier CSM', 'Synthetic CSM'],
      csmEmails: ['csm@example.test'],
    });
    expect(providerClusterAnchors(cluster)).not.toContain('csm@example.test');
    expect(normalizeIdentityValue('  Áda-Marie  O’Neil ')).toBe('ada marie o neil');
  });
  it('retains configured and linked role order with provider-local identity clusters', () => {
    const input: ProviderIdentityInput = {
      providerRoles: { Custom: [{ name: 'One' }, false], Other: 'Two' },
      renderingProvider: { name: 'Three', role: 'Explicit' },
      iaRenderingProviders: ['Four', null],
      practice: { name: 'Practice', aliases: ['Alias'] },
      currentCsm: 'CSM',
    };
    const roles = buildProviderRoleClusters(input);
    expect(roles.map((role) => [role.sequence, role.role, role.primaryName])).toEqual([
      [0, 'Custom', 'One'],
      [1, 'Other', 'Two'],
      [2, 'Explicit', 'Three'],
      [3, 'IA Rendering Provider', 'Four'],
    ]);
    expect(
      roles.every((role) => role.names.length === 1 && role.practiceAliases.length === 2)
    ).toBe(true);
    expect(
      buildProviderRoleClusters({
        providerRoles: [null, { displayName: 'Display', email: 'email@example.test' }],
      })[0]
    ).toMatchObject({
      role: 'Unspecified',
      primaryName: 'Display',
      primaryEmail: 'email@example.test',
    });
    expect(
      buildProviderRoleClusters({ providerRoles: [{ legalName: 'Legal' }, {}] }).map(
        (role) => role.primaryName
      )
    ).toEqual(['Legal', null]);
    for (const [role, fields] of PROVIDER_ROLE_FIELDS) {
      for (const field of fields)
        expect(explicitRoleProviders({ [field]: { name: 'Synthetic' } })[0]?.role).toBe(role);
    }
    expect(
      explicitRoleProviders({ providerRoles: [false, '', 'Named'], renderingProvider: false })
    ).toEqual([{ name: 'Named' }]);
  });
  it('matches registry by ID/email/name and preserves registry provenance without rewriting original display values', () => {
    const registry = {
      version: 'synthetic-registry',
      providers: [
        {
          salesforceIds: ['known'],
          names: ['Known Name'],
          emails: ['REGISTRY@example.test'],
          phones: ['5550000000'],
          practiceAliases: ['Registry Practice'],
        },
      ],
    };
    for (const providers of [
      [{ id: 'known' }],
      [{ email: 'registry@example.test' }],
      [{ name: 'KNÓWN NAME' }],
    ]) {
      expect(buildProviderIdentityCluster({ providers }, registry)).toMatchObject({
        registryMatchCount: 1,
        registryEmails: ['registry@example.test'],
        practiceAliases: ['Registry Practice'],
      });
    }
    expect(
      buildProviderIdentityCluster({ providers: ['Other'] }, registry).registryMatchCount
    ).toBe(0);
    expect(buildProviderIdentityCluster({}).names).toEqual([]);
  });
  it('keeps authoritative source field precedence, including empty-but-populated fields', () => {
    const result = providerIdentityInputFromSources({
      role: 'Rendering Provider',
      providerProfile: {
        Id: 'provider-id',
        Name: 'Profile Name',
        First_Name__c: 'Legal',
        Last_Name__c: 'Name',
        Email__c: 'profile@example.test',
        Phone__c: '',
        Headstart_Backend_Id__c: 'profile-backend',
        Practice_Name__r: { Name: 'Profile Practice' },
      },
      contacts: [
        {
          Email: 'contact@example.test',
          Secondary_Email__c: 'second@example.test',
          MobilePhone: '5550000000',
        },
      ],
      businessProfile: { Name: 'Business Practice', Business_Email__c: 'business@example.test' },
      backendUser: {
        id: 'backend-id',
        firstName: 'Backend',
        lastName: 'Name',
        email: 'login@example.test',
      },
      verifiedFirefliesParticipants: [{ emails: ['meeting@example.test'] }],
    });
    expect(result).toMatchObject({
      role: 'Rendering Provider',
      id: 'provider-id',
      name: 'Profile Name',
      legalName: 'Legal Name',
      phone: '',
      portalProviderId: 'profile-backend',
      practiceName: 'Business Practice',
      contactEmails: ['contact@example.test', 'second@example.test'],
      firefliesParticipantEmails: ['meeting@example.test'],
    });
    expect(providerIdentityInputFromSources({})).toMatchObject({
      name: '',
      legalName: null,
      phone: null,
      practiceName: null,
    });
    expect(
      providerIdentityInputFromSources({
        backendUser: {
          firstName: 'First',
          lastName: 'Last',
          mobile: '1',
          id: 'u',
          llcName: 'Backend Practice',
        },
      })
    ).toMatchObject({
      name: 'First Last',
      phone: '1',
      portalProviderId: 'u',
      practiceName: 'Backend Practice',
    });
    expect(
      providerIdentityInputFromSources({
        providerProfile: { id: 'p', Practice_Name__r: { Name: 'Profile Practice' } },
        contacts: [{ Phone: '2' }],
      })
    ).toMatchObject({ id: 'p', phone: '2', practiceName: 'Profile Practice' });
    expect(
      providerIdentityInputFromSources({
        contacts: [{ MobilePhone: '', Phone: '2' }],
        businessProfile: { Business_Phone__c: '3' },
      }).phone
    ).toBe('');
    expect(
      providerIdentityInputFromSources({ businessProfile: { Business_Phone__c: '3' } }).phone
    ).toBe('3');
  });
});
