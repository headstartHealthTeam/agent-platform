import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertContractFingerprint,
  getStageContract,
  getStageOrder,
  isExcludedOpportunity,
  isExcludedStage,
  isSupportingOnlyEvidence,
  isSupportingOnlySource,
  SOURCE_CONTRACT,
  STAGE_CONTRACT,
  validateStageContract,
} from './contracts.js';
import {
  calendarAgeDays,
  freshnessFor,
  isoDate,
  nextBusinessDay,
  parseEmbeddedDate,
  toDate,
} from './dates.js';
import { EVIDENCE_ENGINE_VERSION, INTAKE_SOURCE_REVISION } from './engine-version.js';
import { canonicalJson, sha256Json } from './json-fingerprint.js';

describe('approved Intake domain foundations', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('preserves source versions, stage aliases/order and excluded dispositions', () => {
    expect(EVIDENCE_ENGINE_VERSION).toBe('2026-09-22.2');
    expect(INTAKE_SOURCE_REVISION).toBe('15b66ac3904fec49c42d60496ff6000cc8f3c60b');
    expect(validateStageContract()).toEqual([]);
    expect(getStageContract('IA Requested')?.defaultOwner).toBe('Insurance Ops');
    expect(getStageContract(' ic scheduled — pending start ')?.stage).toBe(
      'IC Scheduled - Pending Start'
    );
    expect(getStageOrder('IA Scheduled')).toBe(50);
    expect(getStageOrder()).toBeNull();
    expect(getStageContract()).toBeNull();
    expect(isExcludedStage('Pending Discharge')).toBe(true);
    expect(isExcludedStage()).toBe(false);
    expect(isExcludedOpportunity({ StageName: 'Pending Discharge' })).toBe(true);
    expect(
      isExcludedOpportunity({ currentSla: { reasonForDelayNotes: 'awaiting discharge' } })
    ).toBe(true);
    expect(isExcludedOpportunity({ Close_Suggestion__c: 'Closed not admitted' })).toBe(true);
    expect(isExcludedOpportunity()).toBe(false);
    expect(
      isExcludedOpportunity({
        stage: 'IA Scheduled',
        Current_SLA__r: { Reason_for_Delay__c: 'A scheduled appointment' },
      })
    ).toBe(false);
    expect(assertContractFingerprint(STAGE_CONTRACT.version)).toEqual({
      publishable: true,
      expected: '2026-07-29.2',
      actual: '2026-07-29.2',
    });
    expect(assertContractFingerprint()).toMatchObject({ publishable: false, actual: 'Missing' });
    expect(assertContractFingerprint('different')).toMatchObject({
      publishable: false,
      actual: 'different',
    });
    const stage = getStageContract('IA Scheduled');
    if (stage === null) throw new Error('Synthetic contract setup failed');
    expect(
      validateStageContract({ ...STAGE_CONTRACT, stages: [stage, { ...stage, defaultOwner: '' }] })
    ).toEqual(['Duplicate stage order 50', 'IA Scheduled missing defaultOwner']);
  });

  it('does not demote Slack wholesale or change the approved source contract', () => {
    expect(SOURCE_CONTRACT.supportingOnlySources).toEqual([]);
    expect(SOURCE_CONTRACT.collectionModes['standard']?.alwaysSearchedOperationalSources).toEqual([
      'Slack',
    ]);
    expect(SOURCE_CONTRACT.collectionModes['standard']?.escalationOnlySources).toEqual([
      'Gmail',
      'Linked Files',
    ]);
    expect(isSupportingOnlySource('Slack')).toBe(false);
    expect(isSupportingOnlySource()).toBe(false);
    expect(isSupportingOnlyEvidence('Slack')).toBe(false);
    expect(isSupportingOnlyEvidence({ source: 'Slack', supportingOnly: true })).toBe(true);
    expect(isSupportingOnlyEvidence({ source: 'Slack' })).toBe(false);
    expect(isSupportingOnlyEvidence(null)).toBe(false);
  });

  it('preserves UTC calendar freshness and next weekday behavior without inventing a holiday calendar', () => {
    for (const input of [undefined, null, '', 0, 'invalid', NaN]) expect(toDate(input)).toBeNull();
    const original = new Date('2026-09-23T01:00:00Z');
    expect(toDate(original)).not.toBe(original);
    expect(isoDate(original)).toBe('2026-09-23');
    expect(isoDate('invalid')).toBeNull();
    expect(calendarAgeDays('2026-09-22T23:59:00Z', '2026-09-23T00:00:00Z')).toBe(1);
    expect(calendarAgeDays('2026-09-24', '2026-09-23')).toBe(0);
    expect(calendarAgeDays(null, original)).toBeNull();
    for (const [input, expected] of [
      ['2026-09-21', 'Current'],
      ['2026-09-20', 'Semi-Stale'],
      ['2026-09-17', 'Semi-Stale'],
      ['2026-09-16', 'Stale'],
      ['invalid', 'Missing'],
    ]) {
      expect(freshnessFor(input, original)).toBe(expected);
    }
    expect(nextBusinessDay('2026-09-18')).toBe('2026-09-21');
    expect(nextBusinessDay('2026-09-19')).toBe('2026-09-21');
    expect(nextBusinessDay('2026-09-20')).toBe('2026-09-21');
    expect(nextBusinessDay('2026-09-21')).toBe('2026-09-22');
    vi.useFakeTimers();
    vi.setSystemTime(original);
    expect(nextBusinessDay(null)).toBe('2026-09-24');
  });

  it('uses the leading SLA-note date, not a later promise or prior history', () => {
    expect(
      parseEmbeddedDate('9/18 status. Next visit 9/24. Earlier history 8/30.', '2026-09-23')
    ).toBe('2026-09-18');
    expect(parseEmbeddedDate('9/18/25 status', '2026-09-23')).toBe('2025-09-18');
    expect(parseEmbeddedDate('9/18/2024 status', '2026-09-23')).toBe('2024-09-18');
    for (const text of ['', null, undefined, 'no dated note'])
      expect(parseEmbeddedDate(text, null)).toBeNull();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T01:00:00Z'));
    expect(parseEmbeddedDate('9/18 status', undefined)).toBe('2026-09-18');
  });

  it('preserves canonical fingerprint ordering, JSON omissions and the pinned-source digest', () => {
    const input = { b: [null, { z: 3, x: 2 }], a: 1 };
    expect(canonicalJson(input)).toBe('{"a":1,"b":[null,{"x":2,"z":3}]}');
    expect(sha256Json(input)).toBe(
      'a8c2b3f75bb6f6a6d5537e6bf070fee156828b1c43d2209c00c2737114cee480'
    );
    expect(sha256Json(input)).toBe(sha256Json({ a: 1, b: [null, { x: 2, z: 3 }] }));
    expect(canonicalJson({ z: undefined, a: [undefined], c: NaN })).toBe('{"a":[null],"c":null}');
    expect(canonicalJson(undefined)).toBeUndefined();
    expect(() => sha256Json(undefined)).toThrow('serializable');
  });
});
