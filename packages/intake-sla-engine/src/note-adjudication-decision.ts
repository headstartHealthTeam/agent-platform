import { z } from 'zod';

import { validateTranscriptFindings } from './interpretation-findings.js';
import type { ValidatedTranscriptFinding } from './interpretation-findings.js';
import type { NoteAdjudicationPacket } from './note-adjudication-types.js';
import { assertInterpretationCandidate } from './precomputed-candidate.js';

const decisionSchema = z.looseObject({
  opportunityId: z.string(),
  sourceRecordId: z.string(),
  packetHash: z.unknown(),
  disposition: z.unknown(),
  rationale: z.unknown(),
  supportSpan: z.unknown(),
  findings: z.unknown(),
});
export type NoteDecision = z.infer<typeof decisionSchema>;
export interface TypedNoteFinding extends ValidatedTranscriptFinding {
  category: string;
  issueKey: string;
  factType: string;
}
export function noteDecisionKey(value: {
  readonly opportunityId: string;
  readonly sourceRecordId: string;
}): string {
  return `${value.opportunityId}:${value.sourceRecordId}`;
}
export function noteDecisions(
  artifact: unknown,
  runId: string,
  sourceCutoff: string
): Map<string, NoteDecision> {
  const decisions = new Map<string, NoteDecision>();
  const hasArtifact = Boolean(artifact);
  if (!hasArtifact) return decisions;
  const parsed = z
    .looseObject({
      schemaVersion: z.literal(1),
      runId: z.literal(runId),
      sourceCutoff: z.literal(sourceCutoff),
      executionProvenance: z.looseObject({ kind: z.literal('codex-current-run') }),
      decisions: z.array(decisionSchema),
    })
    .safeParse(artifact);
  if (!parsed.success)
    throw new Error('Note adjudication requires current-run provenance and cutoff');
  for (const decision of parsed.data.decisions) {
    const key = noteDecisionKey(decision);
    if (decisions.has(key)) throw new Error('Duplicate note adjudication');
    decisions.set(key, decision);
  }
  return decisions;
}
function compact(value: unknown): string {
  const text = String(value);
  return value === null || value === undefined ? '' : text.replace(/\s+/g, ' ').trim();
}
function typedFinding(finding: ValidatedTranscriptFinding): finding is TypedNoteFinding {
  return (
    Boolean(finding.category) &&
    Boolean(finding.issueKey) &&
    Boolean(finding.factType) &&
    finding.relationship !== 'Neutral'
  );
}
export function adjudicateNoteDecision(
  decision: NoteDecision,
  packet: NoteAdjudicationPacket,
  packetHash: string
): {
  disposition: 'administrative' | 'substantive';
  findings: TypedNoteFinding[];
} {
  if (decision.packetHash !== packetHash) throw new Error('Note adjudication binding mismatch');
  if (
    (decision.disposition !== 'administrative' && decision.disposition !== 'substantive') ||
    compact(decision.rationale).length < 12 ||
    compact(decision.supportSpan).length < 8 ||
    !compact(packet.text).includes(compact(decision.supportSpan)) ||
    !Number.isFinite(Date.parse(packet.eventDate)) ||
    Date.parse(packet.eventDate) > Date.parse(packet.sourceCutoff)
  )
    throw new Error('Note adjudication lacks supported disposition, rationale or source date');
  assertInterpretationCandidate(decision, packet);
  if (decision.disposition === 'administrative' && decision.findings.length > 0)
    throw new Error('Administrative note adjudication cannot include findings');
  const findings = validateTranscriptFindings({
    findings: decision.findings,
    segment: packet.text,
    inputMatchQuality: 'Direct',
    eventDate: packet.eventDate,
    expectedOpportunityId: packet.opportunityId,
  });
  const typed = findings.filter(typedFinding);
  if (
    decision.disposition === 'substantive' &&
    (typed.length === 0 || typed.length !== decision.findings.length)
  )
    throw new Error('Substantive note adjudication requires supported typed findings');
  return { disposition: decision.disposition, findings: typed };
}
