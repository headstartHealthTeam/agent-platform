import type { SalesforceQueryReader } from '@headstart-health/salesforce-read';
import { describe, expect, it } from 'vitest';

import { sha256 } from './drift.js';
import {
  checkIntakeProductionFingerprint,
  type IntakeProductionBaseline,
} from './production-fingerprint.js';
import { connectIntakeSalesforce, intakeSalesforceTargetFromEnv } from './salesforce-reader.js';

const target = { targetOrg: 'synthetic-target', expectedOrgId: '00D000000000001AAA' };
const checkedAt = '2026-09-24T16:00:00.000Z';
function baseline(): IntakeProductionBaseline {
  return {
    capturedAt: '2026-09-20T16:00:00Z',
    apex: { SyntheticClass: sha256('class Synthetic {}') },
    flows: { SyntheticFlow: { activeVersionId: 'flow-one', versionNumber: 7 } },
    slaMetadata: [
      ['IA Scheduled', 3, 'Days'],
      ['TA Requested', 5, 'Business Days'],
    ],
  };
}
function responses(): unknown[][] {
  return [
    [{ Name: 'SyntheticClass', Body: '\r\nclass Synthetic {}   \r\n' }],
    [{ DeveloperName: 'SyntheticFlow', ActiveVersionId: 'flow-one' }],
    [
      {
        Id: 'flow-one',
        Definition: { DeveloperName: 'SyntheticFlow' },
        VersionNumber: 7,
        LastModifiedDate: '2026-09-20T16:00:00Z',
      },
    ],
    [
      { Stage__c: 'TA Requested', Days__c: 5, Duration_Unit__c: 'Business Days' },
      { Stage__c: 'Unrelated stage', Days__c: 99, Duration_Unit__c: 'Days' },
      { Stage__c: 'IA Scheduled', Days__c: 3, Duration_Unit__c: null },
      { Stage__c: null, Days__c: 0 },
    ],
  ];
}
async function readerFor(records: readonly (readonly unknown[])[]): Promise<{
  reader: SalesforceQueryReader;
  calls: (readonly string[])[];
}> {
  const calls: (readonly string[])[] = [];
  const queue = [[{ Id: target.expectedOrgId, IsSandbox: false }], ...records];
  const reader = await connectIntakeSalesforce(target, async (argv) => {
    calls.push(argv);
    const next = queue.shift();
    if (!next) throw new Error('Unexpected synthetic query');
    return JSON.stringify({
      status: 0,
      result: { done: true, totalSize: next.length, records: next },
    });
  });
  return { reader, calls };
}
describe('Intake Production target and fingerprint composition', () => {
  it('retains explicit trimmed environment bindings without an alias fallback', () => {
    expect(
      intakeSalesforceTargetFromEnv({
        SF_TARGET_ORG: ' synthetic-target ',
        SF_EXPECTED_ORG_ID: ` ${target.expectedOrgId} `,
      })
    ).toEqual(target);
    expect(() => intakeSalesforceTargetFromEnv({})).toThrow('SF_TARGET_ORG is required');
    expect(() => intakeSalesforceTargetFromEnv({ SF_TARGET_ORG: 'synthetic' })).toThrow(
      'SF_EXPECTED_ORG_ID is required'
    );
    expect(() =>
      intakeSalesforceTargetFromEnv({ SF_TARGET_ORG: 'synthetic', SF_EXPECTED_ORG_ID: 'invalid' })
    ).toThrow('15- or 18-character');
    expect(
      intakeSalesforceTargetFromEnv({
        SF_TARGET_ORG: 'synthetic',
        SF_EXPECTED_ORG_ID: target.expectedOrgId.slice(0, 15),
      }).expectedOrgId
    ).toBe(target.expectedOrgId.slice(0, 15));
  });
  it.each([
    { Id: target.expectedOrgId, IsSandbox: true },
    { Id: '00D000000000002AAA', IsSandbox: false },
  ])('rejects an unapproved org before metadata access: %j', async (organization) => {
    let count = 0;
    await expect(
      connectIntakeSalesforce(target, async () => {
        count++;
        return JSON.stringify({
          status: 0,
          result: { done: true, totalSize: 1, records: [organization] },
        });
      })
    ).rejects.toThrow('different org or environment');
    expect(count).toBe(1);
  });
  it('uses the shared reader for four bounded reads and retains exact approved fingerprint projection', async () => {
    const input = baseline();
    const before = structuredClone(input);
    const { reader, calls } = await readerFor(responses());
    const result = await checkIntakeProductionFingerprint(reader, input, () => new Date(checkedAt));
    expect(result).toEqual({
      expectedCapturedAt: input.capturedAt,
      actual: {
        checkedAt,
        apex: input.apex,
        flows: {
          SyntheticFlow: {
            ...input.flows['SyntheticFlow'],
            lastModifiedDate: '2026-09-20T16:00:00Z',
          },
        },
        slaMetadata: input.slaMetadata,
      },
      result: { publishable: true, changes: [], checkedAt },
    });
    expect(input).toEqual(before);
    expect(calls).toHaveLength(5);
    expect(
      calls.every(
        (argv) => argv.slice(0, 4).join(' ') === 'data query --target-org synthetic-target'
      )
    ).toBe(true);
    expect(calls.map((argv) => argv.includes('--use-tooling-api'))).toEqual([
      false,
      true,
      true,
      true,
      false,
    ]);
    expect(calls.map((argv) => argv[argv.indexOf('-q') + 1])).toEqual([
      'SELECT Id, IsSandbox FROM Organization LIMIT 1',
      "SELECT Name, Body FROM ApexClass WHERE Name IN ('SyntheticClass')",
      "SELECT DeveloperName, ActiveVersionId FROM FlowDefinition WHERE DeveloperName IN ('SyntheticFlow')",
      "SELECT Id, Definition.DeveloperName, VersionNumber, LastModifiedDate FROM Flow WHERE Id IN ('flow-one')",
      'SELECT Stage__c, Days__c, Duration_Unit__c, Object__c FROM Intake_SLA__mdt WHERE Stage__c != null',
    ]);
  });
  it('reports missing Apex/Flow and changed metadata without inventing a replacement baseline', async () => {
    const { reader } = await readerFor([
      [],
      [],
      [],
      [{ Stage__c: 'IA Scheduled', Days__c: 4, Duration_Unit__c: 'Days' }],
    ]);
    const result = await checkIntakeProductionFingerprint(
      reader,
      baseline(),
      () => new Date(checkedAt)
    );
    expect(result.result.publishable).toBe(false);
    expect(result.result.changes.map((change) => change.type)).toEqual([
      'Apex',
      'Flow',
      'Custom Metadata',
    ]);
    expect(result.result.changes[0]?.actual).toBe('Missing');
    expect(result.result.changes[1]?.actual).toBe('Missing');
  });
  it('retains inactive Flow lookup and null days while distinguishing empty duration from null', async () => {
    const { reader, calls } = await readerFor([
      [],
      [{ DeveloperName: 'SyntheticFlow', ActiveVersionId: null }],
      [],
      [{ Stage__c: 'IA Scheduled', Days__c: null, Duration_Unit__c: '' }],
    ]);
    const result = await checkIntakeProductionFingerprint(
      reader,
      baseline(),
      () => new Date(checkedAt)
    );
    expect(calls[3]).toContain(
      "SELECT Id, Definition.DeveloperName, VersionNumber, LastModifiedDate FROM Flow WHERE Id IN ('null')"
    );
    expect(result.actual.slaMetadata).toEqual([['IA Scheduled', null, '']]);
  });
  it('uses a fresh check timestamp by default and preserves absent baseline timestamp', async () => {
    const { reader } = await readerFor([[], [], [], []]);
    const start = Date.now();
    const result = await checkIntakeProductionFingerprint(reader, {
      apex: {},
      flows: {},
      slaMetadata: [],
    });
    expect(Date.parse(result.actual.checkedAt)).toBeGreaterThanOrEqual(start);
    expect(Date.parse(result.actual.checkedAt)).toBeLessThanOrEqual(Date.now());
    expect(result.expectedCapturedAt).toBeUndefined();
    expect(result.result.publishable).toBe(true);
  });
  it('escapes configured selectors as literal values, never SOQL fragments', async () => {
    const { reader, calls } = await readerFor([[], [], [], []]);
    await checkIntakeProductionFingerprint(reader, {
      apex: { "Synthetic'\\Class": 'digest' },
      flows: {},
      slaMetadata: [],
    });
    expect(calls[1]).toContain(
      "SELECT Name, Body FROM ApexClass WHERE Name IN ('Synthetic\\'\\\\Class')"
    );
  });
  it('does not query metadata through a reader bound to a sandbox', async () => {
    const { reader, calls } = await readerFor([]);
    await expect(
      checkIntakeProductionFingerprint(
        { ...reader, organization: { orgId: target.expectedOrgId, isSandbox: true } },
        baseline()
      )
    ).rejects.toThrow('sandbox, not Production');
    expect(calls).toHaveLength(1);
  });
  it('propagates sanitized incomplete/malformed read failure instead of treating it as empty evidence', async () => {
    let count = 0;
    const reader = await connectIntakeSalesforce(target, async () => {
      count++;
      return count === 1
        ? JSON.stringify({
            status: 0,
            result: {
              done: true,
              totalSize: 1,
              records: [{ Id: target.expectedOrgId, IsSandbox: false }],
            },
          })
        : JSON.stringify({ status: 0, result: { done: false, totalSize: 1, records: [] } });
    });
    await expect(checkIntakeProductionFingerprint(reader, baseline())).rejects.toThrow(
      'incomplete evidence'
    );
    expect(count).toBe(2);
  });
});
