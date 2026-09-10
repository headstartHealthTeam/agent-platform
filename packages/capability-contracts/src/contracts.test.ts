import { describe, expect, it } from 'vitest';

import {
  capabilityPreflightResultSchema,
  capabilityRequirementSchema,
  executionProfileSchema,
} from './contracts.js';

describe('capability contracts', () => {
  it('accepts a narrow read requirement and private provider binding', () => {
    const requirement = capabilityRequirementSchema.parse({
      id: 'google-search-console.performance.read',
      sideEffect: 'read',
      requiredPermissions: ['webmasters.readonly'],
      targetAssertions: [{ key: 'siteUrl', expected: 'sc-domain:example.test' }],
    });
    expect(requirement.optional).toBe(false);

    const profile = executionProfileSchema.parse({
      schemaVersion: 'headstart-capability-profile/v1',
      id: 'local-marketing-read',
      revision: 'fixture-v1',
      bindings: [
        {
          capabilityId: requirement.id,
          providerId: 'gsc-api',
          adapterVersion: 'v1.0.0',
          credentialRef: 'google-user-oauth',
          options: { expectedSiteUrl: 'sc-domain:example.test' },
        },
      ],
    });
    expect(profile.bindings).toHaveLength(1);
  });

  it('rejects duplicate bindings and machine-like identifiers', () => {
    const binding = {
      capabilityId: 'semrush.domain-organic.read',
      providerId: 'semrush-mcp',
      adapterVersion: 'commit-abc123',
    };
    expect(() =>
      executionProfileSchema.parse({
        schemaVersion: 'headstart-capability-profile/v1',
        id: 'local-marketing-read',
        revision: 'v1',
        bindings: [binding, binding],
      })
    ).toThrow(/duplicate capability binding/);
    expect(() =>
      capabilityRequirementSchema.parse({ id: '/tmp/provider', sideEffect: 'read' })
    ).toThrow();
  });

  it('validates sanitized preflight evidence', () => {
    const result = capabilityPreflightResultSchema.parse({
      capabilityId: 'google-analytics.ga4-report.read',
      providerId: 'google-analytics-mcp',
      adapterVersion: 'v1.2.0',
      status: 'ready',
      permissions: ['analytics.readonly'],
      targetIdentity: { propertyId: 'properties/123' },
      message: 'provider and target verified',
    });
    expect(result.status).toBe('ready');
  });
});
