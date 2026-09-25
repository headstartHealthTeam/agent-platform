import type { StructuredResponsesClient } from '@headstart-health/openai-platform/responses';
import { z } from 'zod';

import { EVIDENCE_ENGINE_VERSION } from './engine-version.js';
import {
  APPROVED_INTERPRETER_PROVIDER,
  createInterpretationBinding,
  createInterpretationValidationBinding,
} from './interpretation-binding.js';
import type {
  InterpretationBinding,
  InterpretationValidationBinding,
} from './interpretation-binding.js';
import {
  INTERPRETER_INSTRUCTIONS,
  TRANSCRIPT_INTERPRETATION_SCHEMA,
} from './interpretation-contract.js';
import { validateTranscriptFindings } from './interpretation-findings.js';
import type { ValidatedTranscriptFinding } from './interpretation-findings.js';
import { buildTranscriptInterpretationPacket } from './interpretation-packet.js';
import type {
  InterpretationPacketInput,
  PreparedInterpretationPacket,
} from './interpretation-packet.js';

// Decode transport shape only. Evidence support and operational meaning remain the reviewed rules below.
const findingSchema = z.object({
  matchedOpportunityId: z.string().nullish(),
  synthesizedFact: z.string().nullish(),
  gateImpact: z.string().nullish(),
  substantive: z.boolean().optional(),
  relationship: z.string().nullish(),
  supportSpan: z.string().nullish(),
  actionOwner: z.string().nullish(),
  actionType: z.string().nullish(),
  recommendedAction: z.string().nullish(),
  milestoneDate: z.string().nullish(),
  followUpDate: z.string().nullish(),
  category: z.string().nullish(),
  issueKey: z.string().nullish(),
  factType: z.string().nullish(),
  milestoneKind: z.string().nullish(),
  semanticsSupplied: z.boolean().nullish(),
});
const resultSchema = z.object({ findings: z.array(findingSchema).nullish() }).nullable();

export interface PacketBindingInput {
  readonly packet: unknown;
  readonly model: string;
  readonly provider?: string;
  readonly engineVersion?: string;
}
export function interpretationBindingForPacket({
  packet,
  model,
  provider = APPROVED_INTERPRETER_PROVIDER,
  engineVersion = EVIDENCE_ENGINE_VERSION,
}: PacketBindingInput): InterpretationBinding {
  return createInterpretationBinding({
    packet,
    provider,
    model,
    instructions: INTERPRETER_INSTRUCTIONS,
    schema: TRANSCRIPT_INTERPRETATION_SCHEMA,
    schemaName: 'sla_transcript_findings',
    engineVersion,
  });
}
export function interpretationValidationBindingForPacket({
  packet,
  engineVersion = EVIDENCE_ENGINE_VERSION,
}: {
  readonly packet: unknown;
  readonly engineVersion?: string;
}): InterpretationValidationBinding {
  return createInterpretationValidationBinding({
    packet,
    instructions: INTERPRETER_INSTRUCTIONS,
    schema: TRANSCRIPT_INTERPRETATION_SCHEMA,
    schemaName: 'sla_transcript_findings',
    engineVersion,
  });
}
export interface PacketInterpretationInput {
  readonly packet?: PreparedInterpretationPacket | null;
  readonly client?: StructuredResponsesClient | null;
  readonly model: string;
  readonly provider?: string;
  readonly engineVersion?: string;
  readonly signal?: AbortSignal;
}
export interface PacketInterpretation {
  readonly findings: readonly ValidatedTranscriptFinding[];
  readonly usage: Awaited<ReturnType<StructuredResponsesClient>>['usage'];
  readonly responseId: string | null;
  readonly model: string;
  readonly packetHash: string;
  readonly binding: InterpretationBinding;
}
export async function interpretTranscriptPacketWithAI({
  packet,
  client,
  model,
  provider = APPROVED_INTERPRETER_PROVIDER,
  engineVersion = EVIDENCE_ENGINE_VERSION,
  signal,
}: PacketInterpretationInput): Promise<PacketInterpretation> {
  if (!packet) throw new Error('A prepared transcript interpretation packet is required.');
  if (!client) throw new Error('An explicit transcript interpretation client is required.');
  if (!model) throw new Error('An explicit transcript interpretation model is required.');
  const binding = interpretationBindingForPacket({ packet, model, provider, engineVersion });
  const result = await client({
    model,
    instructions: INTERPRETER_INSTRUCTIONS,
    input: JSON.stringify(packet),
    schema: TRANSCRIPT_INTERPRETATION_SCHEMA,
    schemaName: 'sla_transcript_findings',
    reasoningEffort: 'low',
    ...(signal === undefined ? {} : { signal }),
  });
  const parsed = resultSchema.safeParse(result.data);
  if (!parsed.success)
    throw new Error('Transcript interpretation findings have an invalid transport shape.');
  const findings = validateTranscriptFindings({
    findings: parsed.data?.findings ?? [],
    ...(packet.transcriptSegment === undefined ? {} : { segment: packet.transcriptSegment }),
    ...(packet.source?.matchQuality === undefined
      ? {}
      : { inputMatchQuality: packet.source.matchQuality }),
    ...(packet.source?.eventDate === undefined ? {} : { eventDate: packet.source.eventDate }),
    ...(packet.opportunity?.id === undefined
      ? {}
      : { expectedOpportunityId: packet.opportunity.id }),
  });
  return {
    findings,
    usage: result.usage,
    responseId: result.responseId,
    model: result.model,
    packetHash: binding.packetHash,
    binding,
  };
}
export async function interpretTranscriptSegmentWithAI({
  source = 'Fireflies',
  matchQuality = 'Likely',
  ...input
}: InterpretationPacketInput &
  Omit<PacketInterpretationInput, 'packet' | 'signal'>): Promise<PacketInterpretation> {
  if (!input.client) throw new Error('An explicit transcript interpretation client is required.');
  if (!input.model) throw new Error('An explicit transcript interpretation model is required.');
  const packet = buildTranscriptInterpretationPacket({ ...input, source, matchQuality });
  return interpretTranscriptPacketWithAI({ ...input, packet });
}
