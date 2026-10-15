import type { StructuredResponsesClient } from '@headstart-health/openai-platform/responses';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { firefliesPacketInput } from './fireflies-evidence-common.js';
import type { FirefliesSuppliedInterpretation } from './fireflies-evidence-types.js';
import { APPROVED_INTERPRETER_PROVIDER } from './interpretation-binding.js';
import {
  buildTranscriptInterpretationPacket,
  interpretationGateContext,
} from './interpretation-packet.js';
import { discoverFirefliesMeeting } from './meeting-segmentation.js';
import { createNoteAdjudicator } from './note-adjudication.js';
import { finalizeCurrentRunPrecomputed } from './precomputed-interpretation.js';
import { cutoff, id, reportEvaluationFixture } from './report-evaluation.test-support.js';
import { buildReportIdentityProfiles } from './report-identity.js';
import {
  evaluateReportInterpretation,
  type ReportInterpretationInput,
} from './report-interpretation.js';
import {
  indexReportStructuredSources,
  prepareReportOpportunity,
} from './report-opportunity-context.js';

const body = `Synthetic Alpha (${id}) completed the initial assessment.`;
const meeting = { id: 'meeting', date: '2026-09-23', fullTranscript: body };
const finding = {
  matchedOpportunityId: id,
  synthesizedFact: body,
  gateImpact: 'The provider reported completion.',
  substantive: true,
  relationship: 'Supports',
  supportSpan: body,
  actionOwner: 'CSM',
  actionType: 'Monitor',
  recommendedAction: 'Verify the completion date.',
  milestoneDate: null,
  followUpDate: null,
  category: 'intakeScheduling',
  issueKey: 'initial-assessment',
  factType: 'ia-completed',
  milestoneKind: null,
};
async function fixture(): Promise<ReportInterpretationInput<FirefliesSuppliedInterpretation>> {
  const data = await reportEvaluationFixture();
  const profiles = buildReportIdentityProfiles(data, cutoff);
  const opportunity = data.opportunities[0];
  const identity = profiles[0];
  if (!opportunity || !identity) throw new Error('Synthetic fixture missing');
  return {
    context: prepareReportOpportunity({
      opportunity,
      identity,
      index: indexReportStructuredSources(data),
      ledgerRows: [],
      runAt: new Date(cutoff),
    }),
    runAt: new Date(cutoff),
    identities: new Map(profiles.map((profile) => [profile.opportunityId, profile])),
    cohortNames: profiles.map((profile) => profile.opportunityName),
    noteAdjudicator: createNoteAdjudicator({ runId: 'synthetic', asOf: cutoff }),
    requested: true,
    execution: { apiEnabled: false },
    precomputed: undefined,
    firefliesRow: { searchedAt: cutoff, meetings: [meeting] },
    slackRow: undefined,
    portalInput: [],
    billingEvents: [],
    gmailEvents: [],
    fileEvents: [],
  };
}
describe('saved-run interpretation and freshness composition', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(cutoff));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('retains mode distinctions and does not manufacture deterministic Fireflies evidence', async () => {
    const input = await fixture();
    const unavailable = await evaluateReportInterpretation(input);
    expect(unavailable.mode).toBe('unavailable');
    expect(unavailable.ai.events).toEqual([]);
    expect(unavailable.unrecoveredFailures).toHaveLength(1);
    const disabled = await evaluateReportInterpretation({ ...input, requested: false });
    expect(disabled.mode).toBe('disabled');
    expect(disabled.record.enabled).toBe(false);
    expect(disabled.ai).toEqual({
      events: [],
      interpretations: [],
      failures: [],
      usage: { inputTokens: 0, outputTokens: 0 },
    });
    const empty = await evaluateReportInterpretation({
      ...input,
      precomputed: { interpretations: [] },
      firefliesRow: { meetings: [] },
    });
    expect(empty.mode).toBe('precomputed');
    expect(empty.record.enabled).toBe(true);
    expect(empty.unrecoveredFailures).toEqual([]);
  });
  it('uses the exact configured API and records supported facts, bindings, usage and failures', async () => {
    const input = await fixture();
    const client = vi.fn<StructuredResponsesClient>().mockResolvedValue({
      data: { findings: [finding] },
      usage: { input_tokens: 12, output_tokens: 4 },
      responseId: 'synthetic',
      model: 'gpt-5.6-sol',
    });
    const execution = {
      apiEnabled: true,
      client,
      config: { model: 'gpt-5.6-sol', provider: APPROVED_INTERPRETER_PROVIDER },
    } as const;
    const result = await evaluateReportInterpretation({ ...input, execution });
    expect(client).toHaveBeenCalledTimes(1);
    expect(client.mock.calls[0]?.[0]).toMatchObject({
      model: 'gpt-5.6-sol',
      schemaName: 'sla_transcript_findings',
      reasoningEffort: 'low',
    });
    expect(result.mode).toBe('api');
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 4 });
    expect(result.ai.events).toMatchObject([{ factType: 'ia-completed' }]);
    expect(result.record.events).toBe(result.ai.events);
    expect(result.freshness.evidence.filter((event) => event.source === 'Fireflies')).toHaveLength(
      1
    );
    client.mockRejectedValue(new Error('Synthetic unavailable'));
    const failure = await evaluateReportInterpretation({ ...input, execution });
    expect(failure.ai.events).toEqual([]);
    expect(failure.unrecoveredFailures).toEqual(['meeting:1: Synthetic unavailable']);
  });
  it('accepts the actual fresh-current-run Codex finalizer without relabeling it as API execution', async () => {
    const input = await fixture();
    const profile = input.context.identity;
    const segment = discoverFirefliesMeeting({ profile, meeting }).segments[0];
    if (!segment) throw new Error('Synthetic segment missing');
    const gate = interpretationGateContext({
      stage: input.context.opp.StageName,
      authorizationGate: input.context.authorizationGate,
    });
    const packet = buildTranscriptInterpretationPacket(
      firefliesPacketInput({
        input: { row: input.firefliesRow, profile, gate, asOf: input.runAt },
        meeting,
        segment,
        sourceRecordId: 'meeting:1',
      })
    );
    const finalized = finalizeCurrentRunPrecomputed({
      packets: {
        packets: [
          { opportunityId: id, sourceRecordId: 'meeting:1', meetingId: meeting.id, packet },
        ],
      },
      candidates: {
        rows: [
          {
            opportunityId: id,
            interpretations: [{ sourceRecordId: 'meeting:1', findings: [finding] }],
          },
        ],
      },
    });
    const result = await evaluateReportInterpretation({
      ...input,
      precomputed: { ...finalized, interpretations: finalized.rows[0]?.interpretations },
    });
    expect(result.mode).toBe('precomputed');
    expect(result.unrecoveredFailures).toEqual([]);
    expect(result.ai.events).toMatchObject([{ factType: 'ia-completed' }]);
    expect(result.ai.interpretations[0]).toHaveProperty('validationBinding');
    expect(result.ai.interpretations[0]).not.toHaveProperty('model');
  });
  it('honors bound note judgment, preserves source rows, and does not reintroduce another client through raw Slack', async () => {
    const input = await fixture();
    await evaluateReportInterpretation({ ...input, requested: false });
    const artifact = {
      schemaVersion: 1,
      runId: 'synthetic',
      sourceCutoff: cutoff,
      executionProvenance: { kind: 'codex-current-run' },
      decisions: input.noteAdjudicator.packets.map((packet) => ({
        opportunityId: packet.opportunityId,
        sourceRecordId: packet.sourceRecordId,
        packetHash: packet.packetHash,
        disposition: 'administrative',
        rationale: 'Reviewed as administrative context.',
        supportSpan: packet.text,
        findings: [],
      })),
    };
    const noteAdjudicator = createNoteAdjudicator({ runId: 'synthetic', asOf: cutoff, artifact });
    const before = structuredClone(input.context.evidenceOpp);
    const result = await evaluateReportInterpretation({
      ...input,
      requested: false,
      noteAdjudicator,
      slackRow: {
        records: [{ text: 'Synthetic Beta completed the initial assessment.', time: '2026-09-23' }],
      },
    });
    expect(result.reviewedNoteIds.has('sla')).toBe(true);
    expect(result.interpretedNoteEvents).toEqual([]);
    expect(result.interpretedSlackEvents).toEqual([]);
    expect(result.freshness.evidence.filter((event) => event.source === 'SLA update')).toEqual([]);
    expect(input.context.evidenceOpp).toEqual(before);
    noteAdjudicator.assertConsumed();
    expect(interpretationGateContext({ stage: null })).toEqual({
      processPosition: null,
      unresolvedGate: null,
    });
    expect(interpretationGateContext({ stage: undefined })).toEqual({
      processPosition: '',
      unresolvedGate: '',
    });
  });
});
