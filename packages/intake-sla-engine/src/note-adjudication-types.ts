import type { EvidenceEvent } from './evidence.js';
import type { GateContext } from './gate-context.js';

export type NoteGate = { readonly [K in keyof GateContext]?: GateContext[K] | null | undefined };

export interface NoteAdjudicationInput {
  readonly opportunityId: string;
  readonly source: string;
  readonly sourceRecordId: string;
  readonly noteRecordId: string;
  readonly eventDate: string;
  readonly rawText: string;
  readonly stageEntryDate?: string | null | undefined;
  readonly gate: NoteGate;
  readonly context?: unknown;
}
export interface NoteAdjudicationPacket {
  runId: string;
  sourceCutoff: string;
  engineVersion: string;
  opportunityId: string;
  source: string;
  sourceRecordId: string;
  noteRecordId: string;
  eventDate: string;
  text: string;
  stageEntryDate: string | null | undefined;
  gate: NoteAdjudicationInput['gate'];
  context: unknown;
}
export interface NoteAdjudicationReceipt {
  opportunityId: string;
  sourceRecordId: string;
  noteRecordId: string;
  packetHash: string;
  decisionHash: string;
  disposition: 'administrative' | 'substantive';
  rationale: unknown;
  acceptedFindings: number;
}
export interface NoteEvidenceEvent extends EvidenceEvent {
  readonly factType: string;
  readonly issueKey: string;
  readonly supportSpan: string;
  readonly milestoneKind: string | null;
  readonly interpretationProvenance: {
    kind: 'codex-current-run';
    packetHash: string;
    decisionHash: string;
  };
}
export interface NoteAdjudicator {
  packets: (NoteAdjudicationPacket & { packetHash: string })[];
  receipts: NoteAdjudicationReceipt[];
  inputHash: string;
  interpret: (input: NoteAdjudicationInput) => NoteEvidenceEvent[] | null;
  reviewedNoteIds: (opportunityId: string) => Set<string>;
  administrativeNote: (opportunityId: string, noteRecordId: string) => boolean;
  assertConsumed: () => void;
}
