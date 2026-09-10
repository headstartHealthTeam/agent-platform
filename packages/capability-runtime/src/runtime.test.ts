import { describe, expect, it } from 'vitest';

import {
  CapabilityRuntimeError,
  resolveCapabilityBinding,
  verifyCapabilityPreflight,
  verifyExecutionReadiness,
} from './runtime.js';

const requirement = {
  id: 'google-search-console.performance.read',
  sideEffect: 'read' as const,
  requiredPermissions: ['webmasters.readonly'],
  targetAssertions: [{ key: 'siteUrl', expected: 'sc-domain:example.test' }],
  optional: false,
};

const profile = {
  schemaVersion: 'headstart-capability-profile/v1' as const,
  id: 'local-marketing-read',
  revision: 'fixture-v1',
  bindings: [
    {
      capabilityId: requirement.id,
      providerId: 'gsc-api',
      adapterVersion: 'v1.0.0',
      credentialRef: 'google-user-oauth',
      options: {},
    },
  ],
};

describe('capability runtime', () => {
  it('resolves and verifies a ready binding', () => {
    expect(resolveCapabilityBinding(profile, requirement).providerId).toBe('gsc-api');
    expect(
      verifyExecutionReadiness(
        profile,
        [requirement],
        [
          {
            capabilityId: requirement.id,
            providerId: 'gsc-api',
            adapterVersion: 'v1.0.0',
            status: 'ready',
            permissions: ['webmasters.readonly'],
            targetIdentity: { siteUrl: 'sc-domain:example.test' },
            message: 'verified',
          },
        ]
      )
    ).toHaveLength(1);
  });

  it('fails closed for wrong targets and missing evidence', () => {
    expect(() => verifyExecutionReadiness(profile, [requirement], [])).toThrow(
      /missing preflight evidence/
    );
    expect(() =>
      verifyExecutionReadiness(
        profile,
        [requirement],
        [
          {
            capabilityId: requirement.id,
            providerId: 'gsc-api',
            adapterVersion: 'v1.0.0',
            status: 'ready',
            permissions: ['webmasters.readonly'],
            targetIdentity: { siteUrl: 'sc-domain:other.test' },
            message: 'verified wrong target',
          },
        ]
      )
    ).toThrow(CapabilityRuntimeError);
  });

  it('fails closed for binding, revision, readiness, side-effect, and permission mismatches', () => {
    const binding = profile.bindings[0];
    if (binding === undefined) {
      throw new Error('fixture binding missing');
    }
    const ready = {
      capabilityId: requirement.id,
      providerId: 'gsc-api',
      adapterVersion: 'v1.0.0',
      status: 'ready' as const,
      permissions: ['webmasters.readonly'],
      targetIdentity: { siteUrl: 'sc-domain:example.test' },
      message: 'verified',
    };
    expect(() =>
      verifyCapabilityPreflight(requirement, { ...binding, capabilityId: 'other.read' }, ready)
    ).toThrow(/does not satisfy/);
    expect(() =>
      verifyCapabilityPreflight(requirement, binding, { ...ready, providerId: 'other-provider' })
    ).toThrow(/does not match/);
    expect(() =>
      verifyCapabilityPreflight(requirement, binding, { ...ready, adapterVersion: 'v2' })
    ).toThrow(/does not match/);
    expect(() =>
      verifyCapabilityPreflight(requirement, binding, {
        ...ready,
        status: 'provider-unavailable',
      })
    ).toThrow(/is not ready/);
    expect(() =>
      verifyCapabilityPreflight({ ...requirement, sideEffect: 'write' }, binding, ready)
    ).toThrow(/read-only/);
    expect(() =>
      verifyCapabilityPreflight(
        { ...requirement, requiredPermissions: ['webmasters.readonly', 'missing.read'] },
        binding,
        ready
      )
    ).toThrow(/missing permissions/);
  });

  it('rejects an unbound requirement and skips missing optional evidence', () => {
    const optional = {
      ...requirement,
      id: 'semrush.domain-organic.read',
      optional: true,
    };
    expect(() => resolveCapabilityBinding(profile, optional)).toThrow(/does not bind/);
    const optionalProfile = {
      ...profile,
      bindings: [
        ...profile.bindings,
        {
          capabilityId: optional.id,
          providerId: 'semrush-mcp',
          adapterVersion: 'v1',
          options: {},
        },
      ],
    };
    expect(verifyExecutionReadiness(optionalProfile, [optional], [])).toEqual([]);
  });
});
