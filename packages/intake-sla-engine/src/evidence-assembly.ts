import { createEvidenceEvent } from './evidence.js';
import type { EvidenceEvent } from './evidence.js';

export function canonicalEvidenceSource(source: string): string {
  if (['SLA update', 'Intake notes', 'On-hold notes'].includes(source))
    return 'SLA / Intake / On-Hold Notes';
  if (['Salesforce task', 'Task update', 'Task Chatter'].includes(source))
    return 'Tasks / Task Chatter';
  if (source === 'Salesforce email') return 'Salesforce Emails';
  if (
    ['Salesforce SMS', 'Aircall SMS', 'Aircall transcript', 'Aircall call summary'].includes(source)
  )
    return 'Calls / Texts';
  if (source === 'Portal chat') return 'Portal';
  if (source === 'Treatment plan status') return 'Clinical Quality';
  if (source === 'Candidate / Ticket Match') return 'Ticket Match';
  return source;
}
export interface CoreEvidenceRow {
  readonly opportunityId: string;
  readonly source: string;
  readonly category: string;
  readonly eventDate?: string | null | undefined;
  readonly sourceRecordId?: string | null | undefined;
  readonly fact?: string | null | undefined;
  readonly text?: string | null | undefined;
  readonly substantive?: boolean | null | undefined;
  readonly matchQuality?: string | undefined;
  readonly collectedAt?: string | undefined;
  readonly issueKey?: string | null | undefined;
  readonly rawText?: string | null | undefined;
  readonly matchedEntities?: unknown;
  readonly processGateScore?: number | string | null | undefined;
  readonly relationship?: string | null | undefined;
  readonly factType?: string | null | undefined;
  readonly denialReason?: string | null | undefined;
  readonly requestedInformation?: string | null | undefined;
  readonly specificityMissing?: boolean | undefined;
  readonly candidateName?: string | null | undefined;
  readonly candidateStep?: string | null | undefined;
  readonly candidateActive?: boolean | null | undefined;
  readonly gateImpact?: string | null | undefined;
  readonly milestoneDate?: string | null | undefined;
  readonly milestoneKind?: string | null | undefined;
  readonly interpretationProvenance?: unknown;
  readonly supportSpan?: string | null | undefined;
  readonly followUpDate?: string | null | undefined;
  readonly actionOwner?: string | null | undefined;
  readonly actionType?: string | null | undefined;
  readonly recommendedAction?: string | null | undefined;
  readonly assumedIdentityMatch?: boolean | undefined;
  readonly assumedIdentityNote?: string | null | undefined;
  readonly matchedAs?: string | null | undefined;
}
export interface AssembledEvidenceEvent extends EvidenceEvent {
  readonly milestoneKind?: string | null | undefined;
  readonly interpretationProvenance: unknown;
  readonly supportSpan: string | null | undefined;
  readonly denialReason: string | null | undefined;
  readonly requestedInformation: string | null | undefined;
  readonly specificityMissing: boolean;
  readonly candidateName: string | null | undefined;
  readonly candidateStep: string | null | undefined;
  readonly candidateActive: boolean | null | undefined;
  readonly assumedIdentityMatch: boolean;
  readonly assumedIdentityNote: string | null | undefined;
  readonly matchedAs: string | null | undefined;
}
function admitted(
  row: CoreEvidenceRow
): row is CoreEvidenceRow & { eventDate: string; sourceRecordId: string; matchQuality: string } {
  return (
    Boolean(row.eventDate) &&
    Boolean(row.sourceRecordId) &&
    (Boolean(row.fact) || Boolean(row.text)) &&
    Boolean(row.substantive) &&
    ['Direct', 'Likely', 'Weak'].includes(row.matchQuality ?? '')
  );
}
function presentText<T>(primary: string | null | undefined, fallback: T): string | T {
  return typeof primary === 'string' && primary.length > 0 ? primary : fallback;
}
function matchedIdentities(value: unknown): unknown[] {
  const present = Boolean(value);
  return present ? [value] : [];
}
export function coreEvidenceEvents(rows: readonly CoreEvidenceRow[]): AssembledEvidenceEvent[] {
  return rows.filter(admitted).map((row) =>
    createEvidenceEvent({
      opportunityId: row.opportunityId,
      source: canonicalEvidenceSource(row.source),
      sourceRecordId: row.sourceRecordId,
      eventDate: row.eventDate,
      collectionDate: row.collectedAt,
      category: row.category,
      issueKey: row.issueKey,
      text: presentText(row.fact, row.text ?? ''),
      rawText: presentText(row.rawText, row.text),
      matchedIdentities: matchedIdentities(row.matchedEntities),
      processRelevance: Number(row.processGateScore ?? 0),
      matchQuality: row.matchQuality,
      substantive: Boolean(row.substantive),
      relationship: presentText(row.relationship, 'Supports'),
      factType: row.factType,
      denialReason: row.denialReason,
      requestedInformation: row.requestedInformation,
      specificityMissing: Boolean(row.specificityMissing),
      candidateName: row.candidateName,
      candidateStep: row.candidateStep,
      candidateActive: row.candidateActive,
      gateImpact: row.gateImpact,
      milestoneDate: row.milestoneDate,
      ...(Object.hasOwn(row, 'milestoneKind') ? { milestoneKind: row.milestoneKind } : {}),
      interpretationProvenance: row.interpretationProvenance,
      supportSpan: row.supportSpan,
      followUpDate: row.followUpDate,
      actionOwner: row.actionOwner,
      actionType: row.actionType,
      recommendedAction: row.recommendedAction,
      assumedIdentityMatch: Boolean(row.assumedIdentityMatch),
      assumedIdentityNote: row.assumedIdentityNote,
      matchedAs: row.matchedAs,
    })
  );
}
type DedupeEvent = Pick<
  EvidenceEvent,
  'eventDate' | 'opportunityId' | 'source' | 'sourceRecordId' | 'factType' | 'text'
>;
export function dedupeEvidenceEvents<T extends DedupeEvent>(
  events: readonly (T | null | undefined | false)[] = []
): T[] {
  return [
    ...new Map(
      events
        .filter((event): event is T => Boolean(event))
        .map((event) => {
          const time = Date.parse(event.eventDate);
          const date = Number.isFinite(time) ? new Date(time).toISOString() : event.eventDate;
          return [
            JSON.stringify([
              event.opportunityId,
              canonicalEvidenceSource(event.source),
              event.sourceRecordId,
              event.factType,
              date,
              event.text,
            ]),
            event,
          ];
        })
    ).values(),
  ];
}
