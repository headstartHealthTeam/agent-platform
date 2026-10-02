import { describe, expect, it } from 'vitest';

import { interpretationValidationBindingForPacket } from './ai-interpretation.js';
import { planInterpretationDelta } from './bounded-delta-interpretation.js';
import { APPROVED_INTERPRETER_MODEL } from './interpretation-binding.js';
import { buildTranscriptInterpretationPacket } from './interpretation-packet.js';
import { assertInterpretationCandidate } from './precomputed-candidate.js';
import type { PrecomputedFinding } from './precomputed-candidate.js';
import { finalizeCurrentRunPrecomputed } from './precomputed-interpretation.js';
import type { CurrentRunPrecomputedInput } from './precomputed-interpretation.js';

export function syntheticPrecomputedFinding(): PrecomputedFinding {
  return {
    matchedOpportunityId: 'synthetic-one',
    synthesizedFact: 'RBT recruiting is paused pending a restart decision.',
    gateImpact: 'Confirm the staffing restart condition.',
    substantive: true,
    relationship: 'Supports',
    supportSpan: 'RBT recruiting is paused',
    actionOwner: 'RBT Team',
    actionType: 'RBT Follow-Up',
    recommendedAction: 'RBT Team to confirm the staffing restart condition.',
    milestoneDate: null,
    followUpDate: null,
    category: 'rbt',
    issueKey: 'rbt-staffing',
    factType: 'rbt-recruiting-paused',
    milestoneKind: null,
  };
}
function fixture(findings: unknown = [syntheticPrecomputedFinding()]): CurrentRunPrecomputedInput {
  return {
    packets: {
      packets: [
        {
          opportunityId: 'synthetic-one',
          sourceRecordId: 'meeting:1',
          meetingId: 'meeting',
          packet: buildTranscriptInterpretationPacket({
            profile: { opportunityId: 'synthetic-one', opportunityName: 'Synthetic Client' },
            source: 'Fireflies',
            sourceRecordId: 'meeting:1',
            eventDate: '2026-09-18',
            segment: 'RBT recruiting is paused',
          }),
        },
      ],
    },
    candidates: {
      rows: [
        {
          opportunityId: 'synthetic-one',
          interpretations: [{ sourceRecordId: 'meeting:1', findings }],
        },
      ],
    },
  };
}
describe('current-run Codex interpretation provenance', () => {
  it('composes into delta planning as non-reusable current-run judgment, including undefined meeting IDs', () => {
    const input = fixture();
    const packets = {
      packets: (input.packets.packets ?? []).map((packet) => ({ ...packet, meetingId: undefined })),
    };
    const artifact = finalizeCurrentRunPrecomputed({ ...input, packets });
    const result = planInterpretationDelta({
      currentPackets: packets,
      priorPackets: packets,
      priorInterpretations: artifact,
      model: APPROVED_INTERPRETER_MODEL,
    });
    expect(result.items[0]).toMatchObject({
      mode: 'fresh',
      reason: 'prior-execution-not-reusable',
    });
    expect(Object.hasOwn(artifact.rows[0]?.interpretations[0] ?? {}, 'meetingId')).toBe(true);
    expect(artifact.rows[0]?.interpretations[0]?.meetingId).toBeUndefined();
  });
  it('binds exact packets without claiming API execution or discarding findings', () => {
    const input = fixture();
    const packet = input.packets.packets?.[0]?.packet;
    const result = finalizeCurrentRunPrecomputed(input);
    expect(result).toMatchObject({
      schemaVersion: 1,
      apiEnabled: false,
      currentRunPrecomputed: true,
      executionProvenance: { kind: 'codex-current-run', api: false },
    });
    expect(result.rows[0]).toMatchObject({
      opportunityId: 'synthetic-one',
      enabled: true,
      mode: 'precomputed',
    });
    expect(result.rows[0]?.interpretations[0]?.validationBinding).toEqual(
      interpretationValidationBindingForPacket({ packet })
    );
    expect(result.rows[0]?.interpretations[0]?.findings).toBe(
      input.candidates.rows?.[0]?.interpretations?.[0]?.findings
    );
    for (const key of ['provider', 'model', 'store'])
      expect(Object.hasOwn(result, key)).toBe(false);
    expect(Object.hasOwn(result.rows[0]?.interpretations[0] ?? {}, 'binding')).toBe(false);
    expect(finalizeCurrentRunPrecomputed({ packets: {}, candidates: {} })).toMatchObject({
      rows: [],
      validationBindingVersion: null,
    });
    expect(
      finalizeCurrentRunPrecomputed({ ...input, engineVersion: 'synthetic-version' }).engineVersion
    ).toBe('synthetic-version');
  });
  it('rejects missing, duplicate, extra and cross-client results while allowing an explicit empty interpretation', () => {
    expect(() => finalizeCurrentRunPrecomputed({ ...fixture(), candidates: {} })).toThrow(
      'findings are missing'
    );
    const row = {
      opportunityId: 'synthetic-one',
      interpretations: [{ sourceRecordId: 'meeting:1', findings: [] }],
    };
    expect(() =>
      finalizeCurrentRunPrecomputed({ ...fixture(), candidates: { rows: [row, row] } })
    ).toThrow('Duplicate');
    expect(() =>
      finalizeCurrentRunPrecomputed({ packets: {}, candidates: { rows: [row] } })
    ).toThrow('outside the current inventory');
    expect(() =>
      finalizeCurrentRunPrecomputed(
        fixture([{ ...syntheticPrecomputedFinding(), matchedOpportunityId: 'different' }])
      )
    ).toThrow('another Opportunity');
    expect(
      finalizeCurrentRunPrecomputed(fixture([])).rows[0]?.interpretations[0]?.findings
    ).toEqual([]);
    expect(
      finalizeCurrentRunPrecomputed({
        packets: {},
        candidates: { rows: [{ opportunityId: 'unused' }] },
      }).rows
    ).toEqual([]);
  });
  it('enforces the exact existing finding keys, types, semantic triplet and date meaning', () => {
    const target = { opportunityId: 'synthetic-one', sourceRecordId: 'meeting:1' };
    for (const candidate of [null, {}, { findings: null }, { findings: {} }])
      expect(() => {
        assertInterpretationCandidate(candidate, target);
      }).toThrow('findings are missing');
    expect(() => {
      assertInterpretationCandidate(
        { findings: Array.from({ length: 7 }, syntheticPrecomputedFinding) },
        target
      );
    }).toThrow('count is invalid');
    const base = syntheticPrecomputedFinding();
    for (const key of Object.keys(base)) {
      const missing: Record<string, unknown> = { ...base };
      Reflect.deleteProperty(missing, key);
      expect(() => {
        assertInterpretationCandidate({ findings: [missing] }, target);
      }).toThrow('schema is invalid');
    }
    expect(() => {
      assertInterpretationCandidate({ findings: [{ ...base, extra: true }] }, target);
    }).toThrow('schema is invalid');
    for (const overrides of [
      { synthesizedFact: 3 },
      { gateImpact: false },
      { substantive: 'true' },
      { supportSpan: null },
      { actionOwner: null },
      { recommendedAction: null },
      { relationship: 'Other' },
      { actionType: 'Other' },
      { category: '' },
      { issueKey: ' ' },
      { category: null },
      { milestoneKind: 'done' },
      { milestoneKind: 'planned' },
      { milestoneDate: '9/18/2026' },
      { milestoneDate: ['2026-09-18'] },
      { followUpDate: ['2026-09-18'] },
      { followUpDate: 'invalid' },
    ])
      expect(() => {
        assertInterpretationCandidate({ findings: [{ ...base, ...overrides }] }, target);
      }).toThrow('types are invalid');
    expect(() => {
      assertInterpretationCandidate({ findings: [{ ...base, matchedOpportunityId: 7 }] }, target);
    }).toThrow('another Opportunity');
    for (const overrides of [
      { category: null, issueKey: null, factType: null },
      { matchedOpportunityId: null },
      { milestoneKind: 'planned', milestoneDate: '2026-09-18' },
      { milestoneKind: 'observed', milestoneDate: '2026-99-99' },
    ])
      expect(() => {
        assertInterpretationCandidate({ findings: [{ ...base, ...overrides }] }, target);
      }).not.toThrow();
  });
});
