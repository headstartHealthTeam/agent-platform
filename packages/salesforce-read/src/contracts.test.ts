import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  assertSalesforceOrganization,
  completeQueryRecords,
  parseSalesforceTarget,
  salesforceOrganizationRequirement,
} from './contracts.js';

const target = {
  targetOrg: 'synthetic-local',
  expectedOrgId: '00D000000000001',
  expectedSandbox: false,
};

describe('Salesforce provider contracts independent of a workflow', () => {
  it('requires explicit host configuration and never infers environment from an alias', () => {
    expect(parseSalesforceTarget({ ...target, targetOrg: ' sandbox-name ' }).targetOrg).toBe(
      'sandbox-name'
    );
    for (const invalid of [
      {},
      { ...target, targetOrg: '' },
      { ...target, expectedOrgId: 'invalid' },
      { ...target, expectedSandbox: undefined },
    ]) {
      expect(() => parseSalesforceTarget(invalid)).toThrow(/explicit target/);
    }
  });
  it('preserves the source 15/18 character org comparison and verifies environment explicitly', () => {
    expect(
      assertSalesforceOrganization({ Id: `${target.expectedOrgId}AAA`, IsSandbox: false }, target)
    ).toEqual({ orgId: `${target.expectedOrgId}AAA`, isSandbox: false });
    expect(
      assertSalesforceOrganization(
        { Id: target.expectedOrgId, IsSandbox: true },
        { ...target, expectedSandbox: true }
      ).isSandbox
    ).toBe(true);
    expect(() =>
      assertSalesforceOrganization({ Id: target.expectedOrgId, IsSandbox: true }, target)
    ).toThrow(/different org or environment/);
    expect(() =>
      assertSalesforceOrganization({ Id: '00D000000000002', IsSandbox: false }, target)
    ).toThrow(/different org or environment/);
    expect(() => assertSalesforceOrganization({ Id: target.expectedOrgId }, target)).toThrow(
      /incomplete Organization/
    );
  });
  it('describes only the verified Organization-read permission', () => {
    expect(salesforceOrganizationRequirement(target)).toMatchObject({
      id: 'salesforce.organization.read',
      sideEffect: 'read',
      requiredPermissions: ['Organization:read'],
      targetAssertions: [
        { key: 'orgId', expected: target.expectedOrgId },
        { key: 'isSandbox', expected: false },
      ],
    });
  });
  it('accepts complete zero and nonzero sets without conflating missing or failed data with empty', () => {
    const schema = z.object({ count: z.number() });
    expect(
      completeQueryRecords({ status: 0, result: { done: true, totalSize: 0, records: [] } }, schema)
    ).toEqual([]);
    expect(
      completeQueryRecords(
        { status: 0, result: { done: true, totalSize: 1, records: [{ count: 0 }] } },
        schema
      )
    ).toEqual([{ count: 0 }]);
    for (const invalid of [
      {},
      { status: 1, result: { done: true, totalSize: 0, records: [] } },
      { status: 0, result: { done: false, totalSize: 0, records: [] } },
      { status: 0, result: { done: true, totalSize: 1, records: [] } },
      { status: 0, result: { done: true, totalSize: 1, records: [{ count: 'unknown' }] } },
    ])
      expect(() => completeQueryRecords(invalid, schema)).toThrow(/complete valid result set/);
  });
});
