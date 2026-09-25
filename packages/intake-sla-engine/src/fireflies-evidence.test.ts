import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { StructuredResponsesClient } from '@headstart-health/openai-platform/responses';
import { describe, expect, it, vi } from 'vitest';

import { firefliesPacketInput } from './fireflies-evidence-common.js';
import type { FirefliesEvidenceSegment, FirefliesPrecomputed } from './fireflies-evidence-types.js';
import type { PrecomputedFinding } from './precomputed-candidate.js';
import { writePrivateJson } from './private-run-storage.js';
import { loadReportInterpreter } from './report-runtime-inputs.js';

import {
  adaptFirefliesWithAI,
  adaptFirefliesWithPrecomputedAI,
  APPROVED_INTERPRETER_PROVIDER,
  buildIdentityProfile,
  buildTranscriptInterpretationPacket,
  dedupeEvidenceEvents,
  discoverFirefliesMeeting,
  EVIDENCE_ENGINE_VERSION,
  finalizeCurrentRunPrecomputed,
  interpretationBindingForPacket,
  interpretationGateContext,
  interpretationValidationBindingForPacket,
} from './index.js';

const profile = buildIdentityProfile({
  opportunityId: 'synthetic',
  opportunityName: 'Synthetic Example',
  stage: 'IA Scheduled',
  providerNames: ['Dr Fiction'],
  practice: { id: 'practice', metadata: { retained: true } },
  currentCsm: { name: 'Synthetic CSM', metadata: true },
  priorCsms: [undefined, 'Former CSM'],
  providerRoster: [{ opportunityId: undefined, opportunityName: 'Other Person' }],
});
const gate = interpretationGateContext({
  stage: 'IA Scheduled',
  authorizationGate: { required: true, satisfied: false },
});
const body = 'Synthetic Example completed the initial assessment.';
const meeting = { id: 'meeting', date: '2026-09-22', fullTranscript: body };
const base = {
  profile,
  gate,
  asOf: new Date('2026-09-24T12:00:00.123Z'),
  row: { searchedAt: '2026-09-24', meetings: [meeting] },
};
const model = 'gpt-5.6-sol';
const finding: PrecomputedFinding = {
  matchedOpportunityId: profile.opportunityId,
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
function context(): FirefliesEvidenceSegment {
  const segment = discoverFirefliesMeeting({ profile, meeting }).segments[0];
  if (!segment) throw new Error('Synthetic fixture must yield a supported segment');
  return { input: base, meeting, segment, sourceRecordId: 'meeting:1' };
}
function syntheticClient(
  findings: readonly PrecomputedFinding[] = [finding]
): StructuredResponsesClient {
  return async () => ({
    data: { findings: [...findings] },
    usage: { input_tokens: 12, output_tokens: 4 },
    responseId: 'synthetic-response',
    model,
  });
}
interface BoundApiFinding {
  readonly sourceRecordId: string;
  readonly findings: readonly PrecomputedFinding[];
  readonly binding: ReturnType<typeof interpretationBindingForPacket>;
}
function apiPrecomputed(
  findings: readonly PrecomputedFinding[] = [finding]
): FirefliesPrecomputed<BoundApiFinding> & { interpretations: BoundApiFinding[] } {
  const packet = buildTranscriptInterpretationPacket(firefliesPacketInput(context()));
  return {
    apiEnabled: true,
    model,
    provider: APPROVED_INTERPRETER_PROVIDER,
    engineVersion: EVIDENCE_ENGINE_VERSION,
    store: false,
    interpretations: [
      {
        sourceRecordId: 'meeting:1',
        findings,
        binding: interpretationBindingForPacket({ packet, model }),
      },
    ],
  };
}

describe('routine Fireflies interpretation adapters', () => {
  it('retains bound saved null substantive findings as non-substantive in both execution paths', async () => {
    const directory = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), 'intake-null-finding-')
    );
    try {
      const packet = buildTranscriptInterpretationPacket(firefliesPacketInput(context()));
      const findings = [{ ...finding, substantive: null }];
      const bundles = [
        {
          apiEnabled: true,
          model,
          provider: APPROVED_INTERPRETER_PROVIDER,
          engineVersion: EVIDENCE_ENGINE_VERSION,
          store: false,
          interpretation: {
            sourceRecordId: 'meeting:1',
            findings,
            binding: interpretationBindingForPacket({ packet, model }),
          },
        },
        {
          currentRunPrecomputed: true,
          apiEnabled: false,
          engineVersion: EVIDENCE_ENGINE_VERSION,
          executionProvenance: { kind: 'codex-current-run', api: false },
          interpretation: {
            sourceRecordId: 'meeting:1',
            findings,
            validationBinding: interpretationValidationBindingForPacket({ packet }),
          },
        },
      ];
      for (const { interpretation, ...metadata } of bundles) {
        await writePrivateJson(path.join(directory, 'ai_interpretation_precomputed.json'), {
          ...metadata,
          rows: [{ opportunityId: profile.opportunityId, interpretations: [interpretation] }],
        });
        const loaded = await loadReportInterpreter({
          runDirectory: directory,
          environment: {
            SLA_AI_INTERPRETATION: 'on',
            SLA_INTERPRETER_MODEL: model,
            SLA_INTERPRETER_PROVIDER: APPROVED_INTERPRETER_PROVIDER,
            SLA_APPROVED_CREDENTIAL_SOURCE: 'synthetic',
          },
        });
        const precomputed = loaded.precomputed.get(profile.opportunityId);
        if (!precomputed) throw new Error('Synthetic precomputed row missing');
        const raw = precomputed.interpretations?.[0]?.findings;
        const result = adaptFirefliesWithPrecomputedAI({ ...base, precomputed });
        expect(result.events).toEqual([]);
        expect(result.failures).toEqual([]);
        expect(result.interpretations[0]?.findings).toBe(raw);
        expect(raw).toEqual(findings);
        expect(result.interpretations[0]?.acceptedFindings).toBe(0);
      }
    } finally {
      await fs.rm(directory, { recursive: true });
    }
  });
  it('decodes raw saved findings only after the segment and binding have been selected', () => {
    const bound = apiPrecomputed();
    const valid = bound.interpretations[0];
    if (!valid) throw new Error('Synthetic interpretation missing');
    const unused = { sourceRecordId: 'unused', findings: null };
    expect(
      adaptFirefliesWithPrecomputedAI({
        ...base,
        precomputed: { ...bound, interpretations: [unused, valid] },
      }).events
    ).toHaveLength(1);
    const unmatchedBinding = { sourceRecordId: valid.sourceRecordId, findings: null, binding: {} };
    expect(
      adaptFirefliesWithPrecomputedAI({
        ...base,
        precomputed: { ...bound, interpretations: [unmatchedBinding] },
      }).failures[0]
    ).toContain('binding mismatch');
    expect(() =>
      adaptFirefliesWithPrecomputedAI({
        ...base,
        precomputed: { ...bound, interpretations: [{ ...valid, findings: null }] },
      })
    ).toThrow('Invalid consumed transcript findings');
    expect(
      adaptFirefliesWithPrecomputedAI({
        ...base,
        precomputed: { ...bound, interpretations: [valid, { ...valid, findings: [] }] },
      }).events
    ).toEqual([]);
  });
  it('composes real identity/gate producers and retains raw identity metadata and own undefined packet fields', () => {
    const packet = buildTranscriptInterpretationPacket(firefliesPacketInput(context()));
    expect(packet.opportunity.practice).toBe(profile.practice);
    expect(packet.opportunity.currentCsm).toBe('Synthetic CSM');
    expect(packet.opportunity.priorCsms).toBe(profile.priorCsms);
    expect(packet.opportunity.priorCsms).toEqual([undefined, 'Former CSM']);
    expect(packet.source.matchContext).toEqual({
      meetingTitle: undefined,
      meetingRelationship: undefined,
      assumedIdentityMatch: false,
      assumedIdentityNote: '',
      matchedAs: 'synthetic example',
    });
    expect(Object.hasOwn(packet.source.matchContext, 'meetingTitle')).toBe(true);
    expect(packet.process.unresolvedGate).toBeNull();
  });
  it('uses the injected API client and preserves request bindings, usage and evidence identity', async () => {
    const client = vi.fn(syntheticClient());
    const result = await adaptFirefliesWithAI({ ...base, model, client });
    expect(client).toHaveBeenCalledTimes(1);
    expect(client.mock.calls[0]?.[0]).toMatchObject({
      model,
      schemaName: 'sla_transcript_findings',
      reasoningEffort: 'low',
      input: JSON.stringify(buildTranscriptInterpretationPacket(firefliesPacketInput(context()))),
    });
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 4 });
    expect(result.failures).toEqual([]);
    expect(dedupeEvidenceEvents(result.events)).toMatchObject([
      {
        sourceRecordId: 'meeting:1',
        factType: 'ia-completed',
        milestoneDate: null,
        matchedIdentities: [{ opportunityId: profile.opportunityId, meetingTitle: undefined }],
      },
    ]);
    expect(result.interpretations).toMatchObject([
      {
        meetingId: 'meeting',
        sourceRecordId: 'meeting:1',
        model,
        responseId: 'synthetic-response',
      },
    ]);
    expect(result.conversationSearchResult).toMatchObject({
      status: 'Found',
      complete: true,
      recordsScanned: 1,
      segmentsScanned: 1,
    });
  });
  it('preserves explicit uncertain semantics without inventing a category or actionable relationship', async () => {
    const result = await adaptFirefliesWithAI({
      ...base,
      model,
      client: syntheticClient([
        { ...finding, category: null, issueKey: null, factType: null, relationship: 'Conflicts' },
      ]),
    });
    expect(result.events).toMatchObject([
      {
        category: 'unclassified',
        factType: 'ai-interpreted-conversation',
        relationship: 'Neutral',
        processRelevance: 0,
      },
    ]);
  });
  it('keeps valid empty findings distinct from API errors and never enables deterministic fallback by default', async () => {
    expect(
      (await adaptFirefliesWithAI({ ...base, model, client: syntheticClient([]) })).failures
    ).toEqual([]);
    const client = vi
      .fn<StructuredResponsesClient>()
      .mockRejectedValue(new Error('Synthetic failure'));
    const failed = await adaptFirefliesWithAI({ ...base, model, client });
    expect(failed.events).toEqual([]);
    expect(failed.failures).toEqual(['meeting:1: Synthetic failure']);
    const fallback = await adaptFirefliesWithAI({
      ...base,
      model,
      client,
      fallbackToDeterministic: true,
    });
    expect(fallback.events).toMatchObject([{ factType: 'ia-completed' }]);
    expect(fallback.failures).toEqual(failed.failures);
    await expect(
      adaptFirefliesWithAI({
        ...base,
        model,
        client: vi.fn<StructuredResponsesClient>().mockRejectedValue(null),
      })
    ).rejects.toThrow("Cannot read properties of null (reading 'message')");
  });
  it('does not call the client for blocked or irrelevant meetings and preserves blocked response shape', async () => {
    const client = vi.fn(syntheticClient());
    expect(
      await adaptFirefliesWithAI({
        ...base,
        model,
        client,
        row: { blocked: true, error: 'Source blocked' },
      })
    ).toEqual({
      events: [],
      interpretations: [],
      failures: ['Source blocked'],
      usage: { inputTokens: 0, outputTokens: 0 },
    });
    const result = await adaptFirefliesWithAI({
      ...base,
      model,
      client,
      row: { meetings: [{ ...meeting, fullTranscript: 'Unrelated weather discussion.' }] },
    });
    expect(result.events).toEqual([]);
    expect(client).not.toHaveBeenCalled();
  });
  it('accepts exact API bindings and keeps token usage and original interpretation metadata', () => {
    const usage = { inputTokens: 5, outputTokens: 2 };
    const supplied = apiPrecomputed();
    const result = adaptFirefliesWithPrecomputedAI({
      ...base,
      precomputed: {
        ...supplied,
        usage,
        interpretations: supplied.interpretations.map((entry) => ({
          ...entry,
          customMetadata: 'retained',
        })),
      },
    });
    expect(result.failures).toEqual([]);
    expect(result.usage).toBe(usage);
    expect(result.interpretations[0]?.customMetadata).toBe('retained');
    expect(result.interpretations[0]?.acceptedFindings).toBe(1);
    expect(result.events).toMatchObject([{ factType: 'ia-completed' }]);
  });
  it('composes the real current-run Codex finalizer without relabeling findings as API execution', () => {
    const packet = buildTranscriptInterpretationPacket(firefliesPacketInput(context()));
    const artifact = finalizeCurrentRunPrecomputed({
      packets: {
        packets: [
          {
            opportunityId: profile.opportunityId,
            sourceRecordId: 'meeting:1',
            meetingId: meeting.id,
            packet,
          },
        ],
      },
      candidates: {
        rows: [
          {
            opportunityId: profile.opportunityId,
            interpretations: [{ sourceRecordId: 'meeting:1', findings: [finding] }],
          },
        ],
      },
    });
    const result = adaptFirefliesWithPrecomputedAI({
      ...base,
      precomputed: { ...artifact, interpretations: artifact.rows[0]?.interpretations },
    });
    expect(result.failures).toEqual([]);
    expect(result.interpretations[0]?.validationBinding).toEqual(
      interpretationValidationBindingForPacket({ packet })
    );
    expect(result.interpretations[0]?.meetingId).toBe('meeting');
    expect(Object.hasOwn(result.interpretations[0] ?? {}, 'binding')).toBe(false);
    expect(Object.hasOwn(result.interpretations[0] ?? {}, 'model')).toBe(false);
  });
  it('retains missing/contract/binding failures even when opt-in fallback supplies a fact', () => {
    for (const precomputed of [
      { interpretations: [] },
      { ...apiPrecomputed(), store: true },
      { ...apiPrecomputed(), model: 'changed' },
    ]) {
      const result = adaptFirefliesWithPrecomputedAI({
        ...base,
        precomputed,
        fallbackToDeterministic: true,
      });
      expect(result.events).toHaveLength(1);
      expect(result.failures).toHaveLength(1);
      expect(result.unrecoveredFailures).toEqual(result.failures);
      expect(result.conversationSearchResult?.status).toBe('Blocked');
    }
  });
  it('permits only the existing unsupported-finding failure recovery, not missing bindings', () => {
    const precomputed = apiPrecomputed([
      { ...finding, supportSpan: 'An unsupported invented statement.' },
    ]);
    const blocked = adaptFirefliesWithPrecomputedAI({ ...base, precomputed });
    expect(blocked.failures).toEqual(['meeting:1: supplied findings lacked transcript support']);
    expect(blocked.unrecoveredFailures).toEqual(blocked.failures);
    const recovered = adaptFirefliesWithPrecomputedAI({
      ...base,
      precomputed,
      fallbackToDeterministic: true,
    });
    expect(recovered.failures).toEqual(blocked.failures);
    expect(recovered.unrecoveredFailures).toEqual([]);
    expect(recovered.events).toHaveLength(1);
  });
  it('retains source coverage incompleteness independently of successful interpretation', async () => {
    const result = await adaptFirefliesWithAI({
      ...base,
      model,
      client: syntheticClient(),
      row: {
        ...base.row,
        searchCoverage: {
          paginationComplete: false,
          transcriptsComplete: false,
          queriesUsed: ['bound-query'],
        },
      },
    });
    expect(result.events).toHaveLength(1);
    expect(result.conversationSearchResult).toMatchObject({
      status: 'Blocked',
      complete: false,
      queriesUsed: ['bound-query'],
    });
  });
});
