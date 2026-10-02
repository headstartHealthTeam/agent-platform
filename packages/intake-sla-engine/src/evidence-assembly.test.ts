import { describe, expect, it } from 'vitest';

import {
  canonicalEvidenceSource,
  coreEvidenceEvents,
  dedupeEvidenceEvents,
} from './evidence-assembly.js';
import type { CoreEvidenceRow } from './evidence-assembly.js';
import { createEvidenceEvent } from './evidence.js';

const row: CoreEvidenceRow = {
  opportunityId: 'synthetic-one',
  source: 'SLA update',
  sourceRecordId: 'note:1',
  eventDate: '2026-09-18',
  category: 'rbt',
  fact: 'Staffing is paused pending a restart decision.',
  text: 'Source text',
  substantive: true,
  matchQuality: 'Direct',
  factType: 'rbt-recruiting-paused',
  issueKey: 'rbt-staffing',
};
describe('evidence composition', () => {
  it('preserves typed interpretation fields and explicit unknown date meaning through normalized projections', () => {
    const input: CoreEvidenceRow = {
      ...row,
      milestoneDate: '2026-09-18',
      milestoneKind: 'planned',
      collectedAt: '2026-09-18T20:00:00Z',
      processGateScore: '10',
      matchedEntities: { opportunityId: 'synthetic-one' },
      rawText: 'Full source text',
      relationship: 'Conflicts',
      supportSpan: 'staffing is paused',
      interpretationProvenance: { kind: 'codex-current-run', packetHash: 'synthetic' },
      gateImpact: 'Confirm staffing.',
      actionOwner: 'RBT Team',
      actionType: 'RBT Follow-Up',
      recommendedAction: 'Confirm the staffing restart condition.',
      followUpDate: '2026-09-21',
      denialReason: null,
      requestedInformation: null,
      specificityMissing: true,
      candidateName: 'Synthetic Candidate',
      candidateStep: 'Interview',
      candidateActive: false,
      assumedIdentityMatch: true,
      assumedIdentityNote: 'Synthetic roster assumption',
      matchedAs: 'Synthetic Client',
    };
    const event = coreEvidenceEvents([input])[0];
    expect(event).toMatchObject({
      source: 'SLA / Intake / On-Hold Notes',
      text: input.fact,
      rawText: input.rawText,
      collectionDate: input.collectedAt,
      processRelevance: 10,
      matchedIdentities: [input.matchedEntities],
      milestoneKind: 'planned',
      milestoneDate: input.milestoneDate,
      interpretationProvenance: input.interpretationProvenance,
      relationship: 'Conflicts',
      candidateActive: false,
      specificityMissing: true,
      assumedIdentityMatch: true,
    });
    for (const key of [
      'supportSpan',
      'gateImpact',
      'actionOwner',
      'actionType',
      'recommendedAction',
      'followUpDate',
      'denialReason',
      'requestedInformation',
      'candidateName',
      'candidateStep',
      'assumedIdentityNote',
      'matchedAs',
    ])
      expect(new Map(Object.entries(event ?? {})).get(key)).toEqual(
        new Map(Object.entries(input)).get(key)
      );
    expect(coreEvidenceEvents([{ ...row, milestoneKind: null }])[0]?.milestoneKind).toBeNull();
    expect(Object.hasOwn(coreEvidenceEvents([row])[0] ?? {}, 'milestoneKind')).toBe(false);
    expect(
      Object.hasOwn(
        coreEvidenceEvents([{ ...row, milestoneKind: undefined }])[0] ?? {},
        'milestoneKind'
      )
    ).toBe(true);
  });
  it('retains admitted weak evidence but rejects empty, non-substantive or unrecognized matches', () => {
    expect(coreEvidenceEvents([{ ...row, matchQuality: 'Weak' }])).toHaveLength(1);
    expect(
      coreEvidenceEvents([
        { ...row, matchQuality: 'Likely', fact: '', rawText: '', relationship: '' },
      ])[0]
    ).toMatchObject({
      text: 'Source text',
      rawText: 'Source text',
      relationship: 'Supports',
      collectionDate: undefined,
      matchedIdentities: [],
    });
    for (const override of [
      { eventDate: '' },
      { sourceRecordId: null },
      { fact: '', text: '' },
      { substantive: false },
      { matchQuality: 'Rejected' },
      { matchQuality: undefined },
    ])
      expect(coreEvidenceEvents([{ ...row, ...override }])).toEqual([]);
    expect(
      coreEvidenceEvents([{ ...row, text: undefined, rawText: undefined }])[0]?.rawText
    ).toBeUndefined();
  });
  it('canonicalizes the approved source aliases without changing other source labels', () => {
    for (const source of ['SLA update', 'Intake notes', 'On-hold notes'])
      expect(canonicalEvidenceSource(source)).toBe('SLA / Intake / On-Hold Notes');
    for (const source of ['Salesforce task', 'Task update', 'Task Chatter'])
      expect(canonicalEvidenceSource(source)).toBe('Tasks / Task Chatter');
    expect(canonicalEvidenceSource('Salesforce email')).toBe('Salesforce Emails');
    for (const source of [
      'Salesforce SMS',
      'Aircall SMS',
      'Aircall transcript',
      'Aircall call summary',
    ])
      expect(canonicalEvidenceSource(source)).toBe('Calls / Texts');
    expect(canonicalEvidenceSource('Portal chat')).toBe('Portal');
    expect(canonicalEvidenceSource('Treatment plan status')).toBe('Clinical Quality');
    expect(canonicalEvidenceSource('Candidate / Ticket Match')).toBe('Ticket Match');
    expect(canonicalEvidenceSource('Fireflies')).toBe('Fireflies');
  });
  it('deduplicates equivalent timestamps and aliases while retaining the last authoritative object', () => {
    const projected = coreEvidenceEvents([row])[0];
    if (projected === undefined) throw new Error('Missing synthetic projection');
    const authoritative = createEvidenceEvent({
      ...projected,
      eventDate: '2026-09-18T00:00:00Z',
      source: 'SLA update',
    });
    expect(dedupeEvidenceEvents([null, false, projected, undefined, authoritative])).toEqual([
      authoritative,
    ]);
    expect(dedupeEvidenceEvents([projected, authoritative])[0]).toBe(authoritative);
    expect(
      dedupeEvidenceEvents([authoritative, { ...authoritative, eventDate: '2026-09-18T01:00:00Z' }])
    ).toHaveLength(2);
    expect(
      dedupeEvidenceEvents([authoritative, { ...authoritative, opportunityId: 'different' }])
    ).toHaveLength(2);
    const undated = { ...authoritative, eventDate: 'invalid' };
    expect(dedupeEvidenceEvents([undated, undated])).toEqual([undated]);
    expect(dedupeEvidenceEvents()).toEqual([]);
  });
});
