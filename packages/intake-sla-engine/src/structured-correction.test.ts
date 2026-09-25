import { describe, expect, it } from 'vitest';

import { postCutoffDisposition } from './post-cutoff-disposition.js';
import {
  STRUCTURED_CORRECTION_ARTIFACTS,
  structuredCorrectionDelta,
} from './structured-correction.js';

interface RecordFixture {
  Id?: string | null;
  opportunityId?: string;
  owner?: unknown;
  body?: string;
}
function snapshots(): {
  before: Record<string, RecordFixture[]>;
  after: Record<string, RecordFixture[]>;
} {
  const before = Object.fromEntries(STRUCTURED_CORRECTION_ARTIFACTS.map((name) => [name, []]));
  return { before, after: structuredClone(before) };
}
function setRows(
  snapshot: Record<string, RecordFixture[]>,
  name: string,
  rows: RecordFixture[]
): void {
  Reflect.set(snapshot, name, rows);
}
const OPPORTUNITIES = 'opportunity_rows.json';
const STAFFING = 'staffing_rows.json';
const TASKS = 'task_rows.json';
describe('structured correction scope', () => {
  it('retains exact ordered changes and both-snapshot indirect ownership without mutating inputs', () => {
    const input = snapshots();
    for (const snapshot of [input.before, input.after]) {
      setRows(snapshot, OPPORTUNITIES, [{ Id: 'opp-b' }, { Id: 'opp-a' }, { Id: 'opp-c' }]);
      setRows(snapshot, 'identity_profile_rows.json', [{ opportunityId: 'opp-a' }]);
      setRows(snapshot, STAFFING, [
        { Id: 'staff', owner: { nested: ['request'] }, body: 'pending' },
      ]);
      setRows(snapshot, 'rbt_rows.json', [{ Id: 'request', owner: 'opp-a' }]);
    }
    setRows(input.after, STAFFING, [{ Id: 'staff', owner: 'request', body: 'updated' }]);
    setRows(input.after, 'rbt_rows.json', [{ Id: 'request', owner: 'opp-b' }]);
    const before = structuredClone(input);
    const result = structuredCorrectionDelta(input);
    expect(result.affected).toEqual(['opp-a', 'opp-b']);
    expect(result.unchanged).toEqual(['opp-c']);
    expect(result.removed).toEqual([]);
    expect(result.changes).toEqual([
      {
        artifact: 'rbt_rows.json',
        recordId: 'request',
        kind: 'changed',
        opportunityIds: ['opp-a', 'opp-b'],
        ownership: 'linked',
      },
      {
        artifact: STAFFING,
        recordId: 'staff',
        kind: 'changed',
        opportunityIds: ['opp-a', 'opp-b'],
        ownership: 'linked',
      },
    ]);
    expect(result.sourcePolicy).toEqual({
      portal: 'fresh-current-run',
      fireflies: 'fresh-discovery-and-candidate-bodies',
      slack: 'refresh-unless-edit-and-deletion-complete-delta-proven',
      interpretations: 'exact-api-binding-only',
      qa: 'rebuild-all-current-rows',
    });
    expect(input).toEqual(before);
  });
  it('includes unresolved ownership in the whole cohort and distinguishes additions and removals', () => {
    const input = snapshots();
    setRows(input.before, OPPORTUNITIES, [{ Id: 'opp-a' }, { Id: 'opp-b' }]);
    setRows(input.after, OPPORTUNITIES, [{ Id: 'opp-a' }, { Id: 'opp-c' }]);
    setRows(input.before, TASKS, [{ Id: 'old', owner: 'opp-b' }]);
    setRows(input.after, TASKS, [{ Id: 'unlinked', body: 'synthetic' }]);
    const result = structuredCorrectionDelta(input);
    expect(result.affected).toEqual(['opp-a', 'opp-c']);
    expect(result.removed).toEqual(['opp-b']);
    expect(result.unchanged).toEqual([]);
    expect(
      result.changes.map((change) => [change.recordId, change.kind, change.ownership])
    ).toEqual([
      ['opp-b', 'removed', 'linked'],
      ['opp-c', 'added', 'linked'],
      ['old', 'removed', 'linked'],
      ['unlinked', 'added', 'unresolved-all-cohort'],
    ]);
  });
  it('resolves reverse-order multi-hop and cyclic references and retains additional artifact ownership', () => {
    const input = snapshots();
    for (const snapshot of [input.before, input.after]) {
      setRows(snapshot, OPPORTUNITIES, [{ Id: 'opp-a' }, { Id: 'opp-b' }]);
      setRows(snapshot, TASKS, [{ Id: 'leaf', owner: 'child' }]);
      setRows(snapshot, 'extra.json', [
        { Id: 'child', owner: ['parent', 'leaf'] },
        { Id: 'parent', owner: 'opp-a' },
      ]);
    }
    setRows(input.after, TASKS, [{ Id: 'leaf', owner: 'child', body: 'changed' }]);
    expect(structuredCorrectionDelta(input).affected).toEqual(['opp-a']);
  });
  it('requires every artifact, including explicit empty sources', () => {
    for (const name of STRUCTURED_CORRECTION_ARTIFACTS) {
      const input = snapshots();
      Reflect.deleteProperty(input.after, name);
      expect(() => structuredCorrectionDelta(input)).toThrow('Every structured');
    }
  });
  it('rejects missing, blank and duplicate identities instead of losing changes', () => {
    for (const rows of [[{}], [{ Id: '' }], [{ Id: 'same' }, { Id: 'same' }]]) {
      const input = snapshots();
      setRows(input.after, TASKS, rows);
      expect(() => structuredCorrectionDelta(input)).toThrow('duplicate or unsupported');
    }
    const input = snapshots();
    setRows(input.after, OPPORTUNITIES, [{ opportunityId: 'not-an-opportunity-id' }]);
    expect(() => structuredCorrectionDelta(input)).toThrow('cohort has missing identities');
  });
  it('returns an empty delta for complete empty or unchanged snapshots', () => {
    const input = snapshots();
    const result = structuredCorrectionDelta(input);
    expect(result).toMatchObject({
      version: 1,
      changes: [],
      affected: [],
      removed: [],
      unchanged: [],
    });
    expect(result.beforeHash).toBe(result.afterHash);
    setRows(input.before, OPPORTUNITIES, [{ Id: 'a' }]);
    setRows(input.after, OPPORTUNITIES, [{ Id: 'a' }]);
    expect(structuredCorrectionDelta(input).unchanged).toEqual(['a']);
  });
});
describe('post-cutoff disposition', () => {
  const input = {
    runCutoff: '2026-01-01T12:00:00Z',
    checkedAt: '2026-01-01T13:00:00Z',
    salesforceReadOnly: true,
    changes: { removed: ['opp-a'], stage: [{ id: 'opp-a' }] },
    records: [
      {
        Id: 'opp-a',
        LastModifiedDate: '2026-01-01T12:30:00Z',
        StageName: 'IA Scheduled',
        On_Hold__c: false,
      },
    ],
  };
  const now = (): number => Date.parse(input.checkedAt);
  it('accounts for every changed ID once and retains observed stage/hold without asserting completion', () => {
    const before = structuredClone(input);
    expect(postCutoffDisposition(input, now)).toEqual({
      schemaVersion: 1,
      runCutoff: input.runCutoff,
      checkedAt: input.checkedAt,
      disposition: 'defer-to-next-run',
      nextRunRequired: true,
      salesforceReadOnly: true,
      records: [
        {
          opportunityId: 'opp-a',
          observedModifiedAt: input.records[0]?.LastModifiedDate,
          stage: 'IA Scheduled',
          onHold: false,
        },
      ],
    });
    expect(input).toEqual(before);
    expect(
      postCutoffDisposition(
        { ...input, records: [{ Id: 'opp-a', LastModifiedDate: input.checkedAt }] },
        now
      ).records
    ).toEqual([
      { opportunityId: 'opp-a', observedModifiedAt: input.checkedAt, stage: null, onHold: null },
    ]);
  });
  it('rejects missing, duplicate and unrelated observations', () => {
    for (const records of [
      [],
      [...input.records, ...input.records],
      [{ Id: 'wrong', LastModifiedDate: input.checkedAt }],
    ]) {
      expect(() => postCutoffDisposition({ ...input, records }, now)).toThrow('Incomplete');
    }
  });
  it('rejects unverifiable, equal-to-cutoff, pre-cutoff and post-capture modifications', () => {
    for (const date of [
      'invalid',
      input.runCutoff,
      '2026-01-01T11:00:00Z',
      '2026-01-01T14:00:00Z',
    ]) {
      expect(() =>
        postCutoffDisposition({ ...input, records: [{ Id: 'opp-a', LastModifiedDate: date }] }, now)
      ).toThrow('Unverifiable');
    }
  });
  it('rejects future captures, pre-cutoff checks, incomplete changes and non-read-only attestations', () => {
    expect(() => postCutoffDisposition(input, () => 0)).toThrow('Incomplete');
    expect(() =>
      postCutoffDisposition({ ...input, checkedAt: '2026-01-01T11:00:00Z' }, now)
    ).toThrow('Incomplete');
    for (const changes of [
      {},
      { added: [null] },
      { onHold: [{ id: '' }] },
      { currentSla: ['opp-b'] },
    ]) {
      expect(() => postCutoffDisposition({ ...input, changes }, now)).toThrow('Incomplete');
    }
    for (const salesforceReadOnly of [false, 'true', null]) {
      expect(() => postCutoffDisposition({ ...input, salesforceReadOnly }, now)).toThrow(
        'Incomplete'
      );
    }
  });
});
