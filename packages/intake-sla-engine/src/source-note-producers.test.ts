import { describe, expect, it } from 'vitest';

import {
  adaptOpportunityNotes,
  buildIdentityProfile,
  createNoteAdjudicator,
  interpretationGateContext,
  sha256Json,
} from './index.js';
import type { OpportunityNoteAdjudicationInput } from './index.js';

const runAt = new Date('2026-09-24T12:34:56.789Z');
const profile = buildIdentityProfile({
  opportunityId: 'synthetic',
  opportunityName: 'Synthetic Case',
  stage: 'Treatment Plan',
});
const opportunity = {
  Current_SLA__c: 'synthetic-sla',
  Current_SLA__r: { Reason_for_Delay_Notes__c: 'Waiting for parent signature on treatment plan.' },
};
describe('actual source note producer contracts', () => {
  it.each([null, undefined])(
    'preserves a Date cutoff and nullable gate blocker %s through the actual adjudicator',
    (blocker) => {
      const gate = interpretationGateContext({
        stage: 'Treatment Plan',
        authorizationGate: {
          required: true,
          satisfied: false,
          ...(blocker === undefined ? {} : { blocker }),
        },
      });
      const planner = createNoteAdjudicator({ runId: 'synthetic-run', asOf: runAt });
      const captured: OpportunityNoteAdjudicationInput[] = [];
      const events = adaptOpportunityNotes({
        opportunity,
        profile,
        gate,
        asOf: runAt,
        adjudicateNote(input) {
          captured.push(input);
          return planner.interpret(input);
        },
      });
      expect(events).toHaveLength(1);
      expect(captured[0]?.asOf).toBe(runAt);
      expect(captured[0]?.eventDate).toBe(runAt);
      expect(captured[0]?.gate).toBe(gate);
      expect(planner.packets[0]?.eventDate).toBe(runAt);
      expect(planner.packets[0]?.gate.unresolvedGate).toBe(blocker);
      expect(events[0]?.eventDate).toBe(runAt);
      const packet = planner.packets[0];
      if (packet === undefined) throw Error('Missing synthetic packet');
      const { packetHash, ...payload } = packet;
      expect(packetHash).toBe(sha256Json(payload));
      const adjudicator = createNoteAdjudicator({
        runId: 'synthetic-run',
        asOf: runAt,
        artifact: {
          schemaVersion: 1,
          runId: 'synthetic-run',
          sourceCutoff: runAt.toISOString(),
          executionProvenance: { kind: 'codex-current-run' },
          decisions: [
            {
              opportunityId: profile.opportunityId,
              sourceRecordId: packet.sourceRecordId,
              packetHash,
              disposition: 'administrative',
              rationale: 'Current-run source reviewed as administrative.',
              supportSpan: packet.text,
              findings: [],
            },
          ],
        },
      });
      expect(
        adaptOpportunityNotes({
          opportunity,
          profile,
          gate,
          asOf: runAt,
          adjudicateNote: adjudicator.interpret,
        })
      ).toEqual([]);
      adjudicator.assertConsumed();
      expect(runAt.toISOString()).toBe('2026-09-24T12:34:56.789Z');
    }
  );
  it('retains original string source dates and cutoffs rather than replacing them with collection time', () => {
    const captured: OpportunityNoteAdjudicationInput[] = [];
    adaptOpportunityNotes({
      opportunity: { ...opportunity, CreatedDate: '2026-09-23' },
      profile,
      gate: interpretationGateContext({ stage: 'Treatment Plan' }),
      asOf: runAt,
      adjudicateNote(input) {
        captured.push(input);
        return [];
      },
    });
    expect(captured[0]?.eventDate).toBe('2026-09-23');
    expect(captured[0]?.asOf).toBe(runAt);
  });
});
