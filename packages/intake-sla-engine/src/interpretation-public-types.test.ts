import { expect, expectTypeOf, it } from 'vitest';

import {
  buildTranscriptInterpretationPacket,
  finalizeCurrentRunPrecomputed,
  groupInterpretationsByOpportunity,
  planInterpretationDelta,
  type InterpretationEnvelope,
  type SavedInterpretation,
} from './index.js';

it('preserves known meeting-ID types across public composition and keeps raw unknown IDs intact', () => {
  const envelope: InterpretationEnvelope = {
    opportunityId: 'synthetic',
    sourceRecordId: 'synthetic:1',
    meetingId: 'meeting',
    packet: buildTranscriptInterpretationPacket({ segment: 'Synthetic evidence.' }),
  };
  const interpretation: SavedInterpretation = {
    sourceRecordId: 'synthetic:1',
    meetingId: 'meeting',
  };
  const plan = planInterpretationDelta({
    currentPackets: { packets: [envelope] },
    model: 'gpt-5.6-sol',
  });
  const grouped = groupInterpretationsByOpportunity([
    { key: 'synthetic', envelope, interpretation },
  ]);
  const finalized = finalizeCurrentRunPrecomputed({
    packets: { packets: [envelope] },
    candidates: {
      rows: [
        {
          opportunityId: 'synthetic',
          interpretations: [{ sourceRecordId: 'synthetic:1', findings: [] }],
        },
      ],
    },
  });
  expectTypeOf(plan.items[0]?.envelope.meetingId).toEqualTypeOf<string | undefined>();
  expectTypeOf(grouped[0]?.interpretations[0]?.meetingId).toEqualTypeOf<string | undefined>();
  expectTypeOf(finalized.rows[0]?.interpretations[0]?.meetingId).toEqualTypeOf<
    string | undefined
  >();
  const rawEnvelope: InterpretationEnvelope<unknown, unknown> = {
    ...envelope,
    meetingId: null,
    packet: { opaque: true },
  };
  const raw = planInterpretationDelta({
    currentPackets: { packets: [rawEnvelope] },
    model: 'gpt-5.6-sol',
  });
  expectTypeOf(raw.items[0]?.envelope.meetingId).toEqualTypeOf<unknown>();
  expect(raw.items[0]?.envelope.meetingId).toBeNull();
});
