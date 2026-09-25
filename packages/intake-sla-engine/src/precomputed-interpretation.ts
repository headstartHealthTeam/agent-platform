import { interpretationValidationBindingForPacket } from './ai-interpretation.js';
import { interpretationKey } from './bounded-delta-interpretation.js';
import { EVIDENCE_ENGINE_VERSION } from './engine-version.js';
import type { InterpretationValidationBinding } from './interpretation-binding.js';
import { assertInterpretationCandidate } from './precomputed-candidate.js';
import type { PrecomputedFinding } from './precomputed-candidate.js';

export interface PrecomputedCandidateInput {
  readonly sourceRecordId: string;
  readonly findings?: unknown;
}
/** This finalizer hashes the original packet; it does not reinterpret or reconstruct its fields. */
export interface CurrentRunPacketEnvelope<TMeeting = string | undefined> {
  readonly opportunityId: string;
  readonly sourceRecordId: string;
  readonly meetingId?: TMeeting;
  readonly packet: unknown;
}
export interface CurrentRunPrecomputedInput<TMeeting = string | undefined> {
  readonly packets: { readonly packets?: readonly CurrentRunPacketEnvelope<TMeeting>[] | null };
  readonly candidates: {
    readonly rows?:
      | readonly {
          readonly opportunityId?: unknown;
          readonly interpretations?: readonly PrecomputedCandidateInput[] | null;
        }[]
      | null;
  };
  readonly engineVersion?: string;
}
export interface CurrentRunInterpretation<TMeeting = string | undefined> {
  sourceRecordId: string;
  meetingId: TMeeting | undefined;
  findings: readonly PrecomputedFinding[];
  packetHash: string;
  validationBinding: InterpretationValidationBinding;
}
export interface CurrentRunPrecomputedArtifact<TMeeting = string | undefined> {
  schemaVersion: 1;
  generatedAt: string;
  apiEnabled: false;
  engineVersion: string;
  validationBindingVersion: string | null;
  currentRunPrecomputed: true;
  executionProvenance: { kind: 'codex-current-run'; api: false };
  rows: {
    opportunityId: string;
    enabled: true;
    mode: 'precomputed';
    interpretations: CurrentRunInterpretation<TMeeting>[];
  }[];
}
export function finalizeCurrentRunPrecomputed<TMeeting = string | undefined>(
  input: CurrentRunPrecomputedInput<TMeeting>
): CurrentRunPrecomputedArtifact<TMeeting> {
  const { packets, candidates, engineVersion = EVIDENCE_ENGINE_VERSION } = input;
  const candidateByKey = new Map<string, PrecomputedCandidateInput>();
  for (const row of candidates.rows ?? []) {
    for (const interpretation of row.interpretations ?? []) {
      if (typeof row.opportunityId !== 'string')
        throw new Error('Invalid current-run candidate Opportunity identity');
      const key = interpretationKey(row.opportunityId, interpretation.sourceRecordId);
      if (candidateByKey.has(key))
        throw new Error(`Duplicate current-run precomputed result for ${key}`);
      candidateByKey.set(key, interpretation);
    }
  }
  const rows = new Map<string, CurrentRunInterpretation<TMeeting>[]>();
  const expectedKeys = new Set<string>();
  for (const envelope of packets.packets ?? []) {
    const key = interpretationKey(envelope.opportunityId, envelope.sourceRecordId);
    expectedKeys.add(key);
    const candidate = candidateByKey.get(key);
    assertInterpretationCandidate(candidate, envelope);
    const interpretations = rows.get(envelope.opportunityId) ?? [];
    const validationBinding = interpretationValidationBindingForPacket({
      packet: envelope.packet,
      engineVersion,
    });
    interpretations.push({
      sourceRecordId: envelope.sourceRecordId,
      meetingId: envelope.meetingId,
      findings: candidate.findings,
      packetHash: validationBinding.packetHash,
      validationBinding,
    });
    rows.set(envelope.opportunityId, interpretations);
  }
  if ([...candidateByKey.keys()].some((key) => !expectedKeys.has(key)))
    throw new Error('Current-run precomputed input contains packets outside the current inventory');
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    apiEnabled: false,
    engineVersion,
    validationBindingVersion: [...rows.values()][0]?.[0]?.validationBinding.bindingVersion ?? null,
    currentRunPrecomputed: true,
    executionProvenance: { kind: 'codex-current-run', api: false },
    rows: [...rows.entries()].map(([opportunityId, interpretations]) => ({
      opportunityId,
      enabled: true,
      mode: 'precomputed',
      interpretations,
    })),
  };
}
