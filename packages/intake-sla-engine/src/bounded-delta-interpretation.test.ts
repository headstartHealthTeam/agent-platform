import { describe, expect, it } from 'vitest';

import { interpretationBindingForPacket } from './ai-interpretation.js';
import {
  groupInterpretationsByOpportunity,
  interpretationKey,
  planInterpretationDelta,
} from './bounded-delta-interpretation.js';
import type {
  InterpretationArtifact,
  InterpretationEnvelope,
  SavedInterpretation,
} from './bounded-delta-interpretation.js';
import { EVIDENCE_ENGINE_VERSION } from './engine-version.js';
import {
  APPROVED_INTERPRETER_MODEL,
  APPROVED_INTERPRETER_PROVIDER,
} from './interpretation-binding.js';
import { buildTranscriptInterpretationPacket } from './interpretation-packet.js';

function envelope(
  gate = 'Gate A',
  opportunityId = 'synthetic',
  sourceRecordId = 'meeting:1'
): InterpretationEnvelope {
  return {
    opportunityId,
    sourceRecordId,
    meetingId: 'meeting',
    packet: buildTranscriptInterpretationPacket({
      profile: { opportunityId, stage: 'Synthetic stage' },
      gate: { processPosition: 'Synthetic stage', unresolvedGate: gate },
      source: 'Fireflies',
      sourceRecordId,
      eventDate: '2026-01-01',
      segment: 'Synthetic evidence only.',
      matchQuality: 'Direct',
    }),
  };
}
function saved(
  item: InterpretationEnvelope
): SavedInterpretation & { readonly findings: readonly never[] } {
  return {
    sourceRecordId: item.sourceRecordId,
    findings: [],
    binding: interpretationBindingForPacket({
      packet: item.packet,
      model: APPROVED_INTERPRETER_MODEL,
    }),
  };
}
function priorArtifact(item: InterpretationEnvelope): InterpretationArtifact<SavedInterpretation> {
  return {
    apiEnabled: true,
    currentRunPrecomputed: false,
    provider: APPROVED_INTERPRETER_PROVIDER,
    model: APPROVED_INTERPRETER_MODEL,
    engineVersion: EVIDENCE_ENGINE_VERSION,
    store: false,
    rows: [{ opportunityId: item.opportunityId, interpretations: [saved(item)] }],
  };
}
function plan(
  current: InterpretationEnvelope,
  prior = current,
  overrides: Partial<InterpretationArtifact<SavedInterpretation>> = {}
): ReturnType<typeof planInterpretationDelta<SavedInterpretation>> {
  return planInterpretationDelta({
    currentPackets: { packets: [current] },
    priorPackets: { packets: [prior] },
    priorInterpretations: { ...priorArtifact(prior), ...overrides },
    model: APPROVED_INTERPRETER_MODEL,
  });
}

describe('exact-bound interpretation delta', () => {
  it('reuses only exact API-bound prior evidence and reinterprets changed or legacy packets', () => {
    const original = envelope();
    expect(plan(original).items[0]?.mode).toBe('reuse-exact');
    expect(plan(original).counts).toEqual({ total: 1, 'reuse-exact': 1, resume: 0, fresh: 0 });
    expect(plan(envelope('Changed gate'), original).items[0]).toMatchObject({
      mode: 'fresh',
      reason: 'packet-changed',
    });
    expect(
      plan(original, original, {
        rows: [
          {
            opportunityId: original.opportunityId,
            interpretations: [{ sourceRecordId: original.sourceRecordId }],
          },
        ],
      }).items[0]
    ).toMatchObject({ mode: 'fresh', reason: 'prior-binding-invalid' });
  });
  it('does not reuse current-run Codex provenance or any mismatched execution contract', () => {
    const original = envelope();
    for (const override of [
      { apiEnabled: false },
      { currentRunPrecomputed: true },
      { provider: 'other' },
      { model: 'other' },
      { engineVersion: 'old' },
      { store: true },
    ])
      expect(plan(original, original, override).items[0]).toMatchObject({
        mode: 'fresh',
        reason: 'prior-execution-not-reusable',
      });
    const result = planInterpretationDelta({
      currentPackets: { packets: [original] },
      priorPackets: { packets: [original] },
      priorInterpretations: {
        ...priorArtifact(original),
        currentRunPrecomputed: true,
        apiEnabled: false,
      },
      model: APPROVED_INTERPRETER_MODEL,
    });
    expect(result.items[0]).toMatchObject({
      mode: 'fresh',
      reason: 'prior-execution-not-reusable',
    });
  });
  it('resumes a current exact checkpoint before considering prior reuse and ignores stale checkpoints', () => {
    const original = envelope();
    const checkpoint = {
      interpretations: [{ ...saved(original), opportunityId: original.opportunityId }],
    };
    expect(
      planInterpretationDelta({
        currentPackets: { packets: [original] },
        checkpoint,
        model: APPROVED_INTERPRETER_MODEL,
      }).items[0]?.mode
    ).toBe('resume');
    expect(
      planInterpretationDelta({
        currentPackets: { packets: [envelope('Changed')] },
        checkpoint,
        model: APPROVED_INTERPRETER_MODEL,
      }).items[0]
    ).toMatchObject({ mode: 'fresh', reason: 'new-packet' });
  });
  it('rejects duplicate identity in every supplied artifact, including otherwise unused prior rows', () => {
    const item = envelope();
    const model = APPROVED_INTERPRETER_MODEL;
    expect(() =>
      planInterpretationDelta({ currentPackets: { packets: [item, item] }, model })
    ).toThrow('Current packet artifact contains duplicate');
    expect(() =>
      planInterpretationDelta({
        currentPackets: {},
        priorPackets: { packets: [item, item] },
        model,
      })
    ).toThrow('Prior packet artifact contains duplicate');
    expect(() =>
      planInterpretationDelta({
        currentPackets: {},
        model,
        priorInterpretations: {
          rows: [
            { opportunityId: item.opportunityId, interpretations: [saved(item), saved(item)] },
          ],
        },
      })
    ).toThrow('Prior interpretation artifact contains duplicate');
    const checkpointed = { ...saved(item), opportunityId: item.opportunityId };
    expect(() =>
      planInterpretationDelta({
        currentPackets: {},
        model,
        checkpoint: { interpretations: [checkpointed, checkpointed] },
      })
    ).toThrow('Checkpoint contains duplicate');
  });
  it('handles legitimately empty artifacts and keeps distinct opportunity/source pairs', () => {
    expect(
      planInterpretationDelta({
        currentPackets: {},
        priorPackets: {},
        checkpoint: {},
        priorInterpretations: { rows: [{ opportunityId: 'empty' }] },
        model: APPROVED_INTERPRETER_MODEL,
      }).counts
    ).toEqual({ total: 0, 'reuse-exact': 0, resume: 0, fresh: 0 });
    const result = planInterpretationDelta({
      currentPackets: { packets: [envelope(), envelope('Gate A', 'other')] },
      model: APPROVED_INTERPRETER_MODEL,
    });
    expect(result.counts.fresh).toBe(2);
    expect(interpretationKey('one', 'two')).toBe('one\u0000two');
  });
  it('groups completed results without changing execution provenance or hiding missing work', () => {
    const first = envelope();
    const second = envelope('Gate A', 'synthetic', 'meeting:2');
    const third = envelope('Gate A', 'other');
    const items = [first, second, third].map((item) => ({
      key: interpretationKey(item.opportunityId, item.sourceRecordId),
      envelope: item,
      interpretation: {
        ...saved(item),
        opportunityId: item.opportunityId,
        responseId: 'synthetic-response',
      },
    }));
    const result = groupInterpretationsByOpportunity(items);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      opportunityId: 'synthetic',
      enabled: true,
      mode: 'precomputed',
    });
    expect(result[0]?.interpretations).toHaveLength(2);
    expect(result[0]?.interpretations[0]).toMatchObject({
      responseId: 'synthetic-response',
      sourceRecordId: 'meeting:1',
      meetingId: 'meeting',
      findings: [],
    });
    expect(result[0]?.interpretations[0]).not.toHaveProperty('opportunityId');
    expect(groupInterpretationsByOpportunity()).toEqual([]);
    expect(() => groupInterpretationsByOpportunity([{ key: 'missing', envelope: first }])).toThrow(
      'Interpretation is missing for missing'
    );
  });
});
