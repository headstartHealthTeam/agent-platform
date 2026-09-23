import { createStructuredResponsesClient } from '@headstart-health/openai-platform/responses';
import { describe, expect, it, vi } from 'vitest';

import {
  interpretationBindingForPacket,
  interpretationValidationBindingForPacket,
  interpretTranscriptPacketWithAI,
  interpretTranscriptSegmentWithAI,
} from './ai-interpretation.js';
import {
  INTERPRETER_INSTRUCTIONS,
  TRANSCRIPT_INTERPRETATION_SCHEMA,
} from './interpretation-contract.js';
import {
  aiFindingAsOperationalFact,
  validateTranscriptFindings,
} from './interpretation-findings.js';
import type { TranscriptFindingInput } from './interpretation-findings.js';
import {
  buildTranscriptInterpretationPacket,
  interpretationGateContext,
} from './interpretation-packet.js';
import { sha256Json } from './json-fingerprint.js';

const fact = {
  matchedOpportunityId: 'synthetic',
  synthesizedFact: 'The corrected packet is back with the reviewers.',
  gateImpact: 'Confirm the review disposition.',
  substantive: true,
  relationship: 'Supports',
  supportSpan: 'corrected packet is back with the reviewers',
  actionOwner: 'CSM',
  actionType: 'Monitor',
  recommendedAction: 'CSM to monitor the review disposition.',
  milestoneDate: '2026-09-17',
  followUpDate: null,
  milestoneKind: 'observed',
  category: 'treatmentPlan',
  issueKey: 'clinical-review',
  factType: 'tp-resubmitted-for-review',
};
const packet = buildTranscriptInterpretationPacket({
  profile: { opportunityId: 'synthetic' },
  source: 'Fireflies',
  sourceRecordId: 'synthetic:1',
  eventDate: '2026-09-17',
  segment: fact.synthesizedFact,
  matchQuality: 'Direct',
});
function validate(
  findings: readonly TranscriptFindingInput[]
): ReturnType<typeof validateTranscriptFindings> {
  return validateTranscriptFindings({
    findings,
    segment: packet.transcriptSegment,
    inputMatchQuality: 'Direct',
    expectedOpportunityId: 'synthetic',
    eventDate: '2026-09-17',
  });
}

describe('approved interpretation contract', () => {
  it('retains the exact approved prompt, JSON schema and packet binding hashes', () => {
    expect(sha256Json(INTERPRETER_INSTRUCTIONS)).toBe(
      '7811a0664de1a047ec504d6b759c9a9de3a61d67a619641b768a6578e725449c'
    );
    expect(sha256Json(TRANSCRIPT_INTERPRETATION_SCHEMA)).toBe(
      '8d05e568b0ea5a256d2361d46d6f990e8cf737781d59015be90083b16831ce1c'
    );
    const schema = TRANSCRIPT_INTERPRETATION_SCHEMA.properties.findings.items;
    expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
    const goldenPacket = buildTranscriptInterpretationPacket({
      profile: { opportunityId: 'synthetic-opportunity', stage: 'IA Scheduled' },
      source: 'Fireflies',
      sourceRecordId: 'synthetic-meeting:1',
      eventDate: '2026-01-01',
      segment: 'The assessment appointment is scheduled for next week.',
      matchQuality: 'Direct',
    });
    expect(
      interpretationBindingForPacket({ packet: goldenPacket, model: 'gpt-5.6-sol' }).bindingHash
    ).toBe('fda34bf31b50ca620755e7182bbe917c0885f1d4efe7ea99802beec0fd81fd04');
    expect(interpretationValidationBindingForPacket({ packet: goldenPacket }).bindingHash).toBe(
      'a247b2c37daf73c0197b134292c2483f8b0b5c19dcafc867c151871b8eb4b2b3'
    );
  });
  it('preserves identity context and gate ownership without adding inferred evidence', () => {
    const full = buildTranscriptInterpretationPacket({
      profile: {
        opportunityId: 'synthetic',
        opportunityName: 'Synthetic client',
        stage: 'IA Scheduled',
        stageEntryDate: '2026-01-01',
        knownNameVariants: ['Alias'],
        clientAliases: ['Ignored'],
        practice: { name: 'Synthetic practice' },
        currentCsm: { name: 'Synthetic CSM' },
        priorCsms: ['Old CSM'],
        authorizationNumbers: ['synthetic-auth'],
        payers: ['Synthetic payer'],
        rbtRequests: [{ name: 'Request' }],
        candidates: [{ name: 'Candidate' }],
        providerRoles: [
          { role: 'Assessment', names: ['Provider'], emails: ['provider@example.test'] },
          { role: 'Treatment' },
        ],
        providerRoster: [
          { opportunityId: 'one', opportunityName: 'First' },
          { id: 'two', name: 'Second' },
          {},
        ],
      },
      gate: {
        processPosition: 'Assessment',
        unresolvedGate: 'Confirm appointment',
        gateCategory: 'intakeScheduling',
      },
      segment: '  word\n'.repeat(5000),
      matchContext: { scope: 'synthetic' },
    });
    expect(full.opportunity).toMatchObject({
      aliases: ['Alias'],
      practice: 'Synthetic practice',
      currentCsm: 'Synthetic CSM',
      providerRoles: [
        { role: 'Assessment', names: ['Provider'], emails: ['provider@example.test'] },
        { role: 'Treatment', names: [], emails: [] },
      ],
      providerRoster: [
        { opportunityId: 'one', opportunityName: 'First' },
        { opportunityId: 'two', opportunityName: 'Second' },
        { opportunityId: null, opportunityName: null },
      ],
    });
    expect(full.transcriptSegment).toHaveLength(16000);
    expect(full.process).toEqual({
      stage: 'IA Scheduled',
      processPosition: 'Assessment',
      unresolvedGate: 'Confirm appointment',
      gateCategory: 'intakeScheduling',
      stageEntryDate: '2026-01-01',
    });
    expect(buildTranscriptInterpretationPacket({}).transcriptSegment).toBe('');
    expect(
      buildTranscriptInterpretationPacket({
        profile: { clientAliases: ['Fallback'], practice: 'Practice', currentCsm: { id: 'csm' } },
      }).opportunity
    ).toMatchObject({ aliases: ['Fallback'], practice: 'Practice', currentCsm: { id: 'csm' } });
    expect(interpretationGateContext()).toEqual({ processPosition: '', unresolvedGate: '' });
    expect(
      interpretationGateContext({
        stage: 'IA Scheduled',
        authorizationGate: { required: true, satisfied: false, blocker: 'Authorization missing' },
      }).unresolvedGate
    ).toBe('Authorization missing');
    expect(
      interpretationGateContext({
        stage: 'IA Scheduled',
        authorizationGate: { required: true, satisfied: true },
      }).unresolvedGate
    ).toBe('IA Scheduled');
  });
});

describe('finding support and semantic preservation', () => {
  it('retains supported typed meanings and converts only the existing operational fields', () => {
    const result = validate([fact]);
    expect(result).toHaveLength(1);
    const finding = result[0];
    expect(finding).toMatchObject({
      factType: fact.factType,
      milestoneKind: 'observed',
      semanticsSupplied: true,
      substantive: true,
    });
    if (finding === undefined) throw new Error('Expected synthetic finding');
    expect(aiFindingAsOperationalFact(finding)).toMatchObject({
      type: 'ai-interpreted-conversation',
      summary: fact.synthesizedFact,
      relevance: 10,
      aiInterpreted: true,
    });
    expect(aiFindingAsOperationalFact({ ...finding, relationship: 'Conflicts' }).relevance).toBe(
      11
    );
    expect(validateTranscriptFindings({})).toEqual([]);
  });
  it('rejects unsupported, partial-semantic, wrong-client and invalid-date-meaning findings', () => {
    for (const change of [
      { category: null },
      { issueKey: '' },
      { factType: ' ' },
      { milestoneKind: 'completed' },
      { milestoneDate: null },
      { milestoneDate: 'tomorrow' },
      { milestoneDate: '2026-99-99' },
      { supportSpan: 'absent exact support' },
      { supportSpan: 'short' },
      { matchedOpportunityId: 'other' },
      { synthesizedFact: 'Too short' },
      { substantive: false },
    ])
      expect(validate([{ ...fact, ...change }])).toEqual([]);
  });
  it('keeps supported legacy findings without fabricating semantics and applies reviewed fallbacks', () => {
    const legacy = {
      synthesizedFact: 'Corrected packet is back with the reviewers.',
      substantive: true,
      supportSpan: 'CORRÉCTED packet is back with the reviewers',
      relationship: 'Unknown',
      actionType: 'Unknown',
    };
    const result = validateTranscriptFindings({
      findings: [legacy],
      segment: packet.transcriptSegment,
      inputMatchQuality: 'Unknown',
    });
    expect(result[0]).toMatchObject({
      matchedOpportunityId: null,
      matchQuality: 'Weak',
      relationship: 'Neutral',
      actionType: 'No Action',
      milestoneKind: null,
      semanticsSupplied: false,
      category: null,
      issueKey: null,
      factType: null,
    });
    expect(
      validate([
        {
          ...fact,
          matchedOpportunityId: null,
          category: null,
          issueKey: null,
          factType: null,
          milestoneKind: null,
          milestoneDate: 'not a date',
          followUpDate: '2026-09-21',
          semanticsSupplied: false,
        },
      ])[0]
    ).toMatchObject({
      matchedOpportunityId: 'synthetic',
      milestoneDate: null,
      followUpDate: '2026-09-21',
      semanticsSupplied: false,
    });
  });
});

describe('shared Responses composition', () => {
  it('sends the exact Intake contract with low effort, strict schema and store:false', async () => {
    const controller = new AbortController();
    const request = vi.fn<typeof fetch>(async (_url, options) => {
      if (typeof options?.body !== 'string') throw new Error('Expected serialized JSON request');
      const body: unknown = JSON.parse(options.body);
      expect(body).toMatchObject({
        model: 'gpt-5.6-sol',
        store: false,
        input: JSON.stringify(packet),
        instructions: INTERPRETER_INSTRUCTIONS,
        reasoning: { effort: 'low' },
        text: {
          format: {
            type: 'json_schema',
            name: 'sla_transcript_findings',
            strict: true,
            schema: TRANSCRIPT_INTERPRETATION_SCHEMA,
          },
        },
      });
      expect(options.signal).toBe(controller.signal);
      return Response.json({
        id: 'synthetic-response',
        usage: { input_tokens: 5 },
        output_text: JSON.stringify({ findings: [fact] }),
      });
    });
    const client = createStructuredResponsesClient({
      apiKey: 'synthetic-only',
      fetchImpl: request,
    });
    const result = await interpretTranscriptPacketWithAI({
      packet,
      client,
      model: 'gpt-5.6-sol',
      signal: controller.signal,
    });
    expect(result.findings[0]).toMatchObject({
      factType: fact.factType,
      milestoneKind: 'observed',
    });
    expect(result).toMatchObject({
      responseId: 'synthetic-response',
      usage: { input_tokens: 5 },
      model: 'gpt-5.6-sol',
    });
    expect(result.packetHash).toBe(result.binding.packetHash);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('keeps segment defaults and requires explicit packet/client/model inputs', async () => {
    const client = vi.fn(async () => ({
      data: { findings: [] },
      usage: null,
      responseId: null,
      model: 'gpt-5.6-sol',
    }));
    const result = await interpretTranscriptSegmentWithAI({
      profile: { opportunityId: 'synthetic' },
      segment: 'Synthetic only',
      client,
      model: 'gpt-5.6-sol',
    });
    expect(result.findings).toEqual([]);
    const request = client.mock.calls;
    expect(request).toHaveLength(1);
    await expect(
      interpretTranscriptPacketWithAI({ packet: null, client, model: 'gpt-5.6-sol' })
    ).rejects.toThrow('prepared transcript');
    await expect(interpretTranscriptPacketWithAI({ packet, model: 'gpt-5.6-sol' })).rejects.toThrow(
      'explicit transcript interpretation client'
    );
    await expect(interpretTranscriptPacketWithAI({ packet, client, model: '' })).rejects.toThrow(
      'explicit transcript interpretation model'
    );
    await expect(interpretTranscriptSegmentWithAI({ model: 'gpt-5.6-sol' })).rejects.toThrow(
      'explicit transcript interpretation client'
    );
    await expect(interpretTranscriptSegmentWithAI({ client, model: '' })).rejects.toThrow(
      'explicit transcript interpretation model'
    );
  });
  it('does not leak malformed response details, and distinguishes empty findings from invalid transport', async () => {
    const client = vi.fn(async () => ({
      data: { findings: 'private malformed value' },
      usage: null,
      responseId: null,
      model: 'gpt-5.6-sol',
    }));
    await expect(
      interpretTranscriptPacketWithAI({ packet, client, model: 'gpt-5.6-sol' })
    ).rejects.toThrow('invalid transport shape');
    const result = await interpretTranscriptPacketWithAI({
      packet,
      model: 'gpt-5.6-sol',
      client: async () => ({ data: null, usage: null, responseId: null, model: 'gpt-5.6-sol' }),
    });
    expect(result.findings).toEqual([]);
  });
});
