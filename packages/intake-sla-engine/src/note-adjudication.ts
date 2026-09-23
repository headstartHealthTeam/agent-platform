import { EVIDENCE_ENGINE_VERSION } from './engine-version.js';
import { createEvidenceEvent } from './evidence.js';
import { sha256Json } from './json-fingerprint.js';
import {
  adjudicateNoteDecision,
  noteDecisionKey,
  noteDecisions,
} from './note-adjudication-decision.js';
import type { TypedNoteFinding } from './note-adjudication-decision.js';
import type {
  NoteAdjudicationInput,
  NoteAdjudicationPacket,
  NoteAdjudicationReceipt,
  NoteAdjudicator,
  NoteEvidenceEvent,
} from './note-adjudication-types.js';

function noteEvent(
  finding: TypedNoteFinding,
  packet: NoteAdjudicationPacket,
  packetHash: string,
  decisionHash: string
): NoteEvidenceEvent {
  return createEvidenceEvent({
    opportunityId: packet.opportunityId,
    source: packet.source,
    sourceRecordId: packet.sourceRecordId,
    eventDate: packet.eventDate,
    category: finding.category,
    issueKey: finding.issueKey,
    factType: finding.factType,
    text: finding.synthesizedFact,
    rawText: packet.text,
    supportSpan: finding.supportSpan,
    matchQuality: 'Direct',
    substantive: true,
    relationship: finding.relationship,
    processRelevance: finding.category === packet.gate.gateCategory ? 10 : 7,
    gateImpact: finding.gateImpact,
    actionOwner: finding.actionOwner,
    actionType: finding.actionType,
    recommendedAction: finding.recommendedAction,
    milestoneDate: finding.milestoneDate,
    milestoneKind: finding.milestoneKind,
    followUpDate: finding.followUpDate,
    interpretationProvenance: { kind: 'codex-current-run' as const, packetHash, decisionHash },
  });
}
export function createNoteAdjudicator({
  runId,
  asOf,
  artifact = null,
}: {
  readonly runId: string;
  readonly asOf: string | Date;
  readonly artifact?: unknown;
}): NoteAdjudicator {
  const sourceCutoff = (asOf instanceof Date ? asOf : new Date(asOf)).toISOString();
  const decisions = noteDecisions(artifact, runId, sourceCutoff);
  const packets: NoteAdjudicator['packets'] = [];
  const receipts: NoteAdjudicationReceipt[] = [];
  function interpret(input: NoteAdjudicationInput): NoteEvidenceEvent[] | null {
    const packet: NoteAdjudicationPacket = {
      runId,
      sourceCutoff,
      engineVersion: EVIDENCE_ENGINE_VERSION,
      opportunityId: input.opportunityId,
      source: input.source,
      sourceRecordId: input.sourceRecordId,
      noteRecordId: input.noteRecordId,
      eventDate: input.eventDate,
      text: input.rawText,
      stageEntryDate: input.stageEntryDate,
      gate: input.gate,
      context: input.context,
    };
    const packetHash = sha256Json(packet);
    packets.push({ ...packet, packetHash });
    const decision = decisions.get(noteDecisionKey(packet));
    if (decision === undefined) return null;
    const { disposition, findings } = adjudicateNoteDecision(decision, packet, packetHash);
    const decisionHash = sha256Json(decision);
    receipts.push({
      opportunityId: packet.opportunityId,
      sourceRecordId: packet.sourceRecordId,
      noteRecordId: packet.noteRecordId,
      packetHash,
      decisionHash,
      disposition,
      rationale: decision.rationale,
      acceptedFindings: findings.length,
    });
    return findings.map((finding) => noteEvent(finding, packet, packetHash, decisionHash));
  }
  return {
    packets,
    receipts,
    interpret,
    inputHash: sha256Json(artifact),
    reviewedNoteIds(opportunityId): Set<string> {
      return new Set(
        receipts.filter((row) => row.opportunityId === opportunityId).map((row) => row.noteRecordId)
      );
    },
    administrativeNote(opportunityId, noteRecordId): boolean {
      const applicable = packets.filter(
        (row) => row.opportunityId === opportunityId && row.noteRecordId === noteRecordId
      );
      return (
        applicable.length > 0 &&
        applicable.every((packet) =>
          receipts.some(
            (row) => row.packetHash === packet.packetHash && row.disposition === 'administrative'
          )
        )
      );
    },
    assertConsumed(): void {
      if (decisions.size !== receipts.length)
        throw new Error('Note adjudication contains unmatched records');
    },
  };
}
