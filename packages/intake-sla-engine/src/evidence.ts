export interface EvidenceEvent {
  readonly opportunityId: string;
  readonly source: string;
  readonly sourceRecordId: string;
  readonly eventDate: string;
  readonly category: string;
  readonly text: string;
  readonly collectionDate: string | undefined;
  readonly matchedIdentities: readonly unknown[];
  readonly processRelevance: number;
  readonly matchQuality: string;
  readonly substantive: boolean;
  readonly relationship: string;
  readonly rawText: string | null | undefined;
  readonly issueKey: string | null | undefined;
  readonly lifecycleState: string | null;
  readonly resolvedByEventId: string | null;
  readonly resolutionDate: string | null;
  readonly narrativeContribution: string;
  readonly factType?: string | null | undefined;
  readonly gateImpact?: string | null | undefined;
  readonly recommendedAction?: string | null | undefined;
  readonly actionOwner?: string | null | undefined;
  readonly actionType?: string | null | undefined;
  readonly followUpDate?: string | null | undefined;
  readonly milestoneDate?: string | null | undefined;
  readonly supportingOnly?: boolean;
}

export type EvidenceInput = Pick<
  EvidenceEvent,
  'opportunityId' | 'source' | 'sourceRecordId' | 'eventDate' | 'category' | 'text'
> &
  Partial<EvidenceEvent>;

const MATCH_SCORE = new Map([
  ['Direct', 3],
  ['Likely', 2],
  ['Weak', 1],
]);
const RELATION_SCORE = new Map([
  ['Supports', 2],
  ['Conflicts', 1],
  ['Neutral', 0],
]);
const FACT_SPECIFICITY = new Map([
  ['rbt-lost', 30],
  ['tp-signature-format', 30],
  ['treatment-start-planned', 25],
  ['treatment-ready-to-schedule', 24],
  ['ia-underway', 24],
  ['ia-partial', 24],
  ['ia-medical-reschedule', 24],
  ['ia-reschedule', 24],
  ['auth-date-correction', 24],
  ['auth-denial-reason', 30],
  ['auth-additional-info', 26],
  ['family-document-update', 24],
  ['tp-revisions', 28],
  ['tp-portal-submitted-awaiting-clinical-quality', 32],
  ['tp-clinical-review', 24],
  ['tp-drafting', 20],
  ['tp-signature', 18],
  ['rbt-assigned', 16],
  ['rbt-candidate', 10],
  ['rbt-recruiting', 8],
]);
const STRUCTURED_SOURCES = new Set([
  'Salesforce Opportunity / SLA',
  'Authorization',
  'Authorization Review',
  'VOB',
  'Clinical Quality',
  'RBT Request',
  'Ticket Match',
  'Talent Acquisition',
  'RBT First Interview',
  'Staffing',
  'Linked Billing / Claims',
]);

export function evidenceSpecificity(
  event: Pick<EvidenceEvent, 'factType' | 'gateImpact' | 'recommendedAction'> = {}
): number {
  return (
    (FACT_SPECIFICITY.get((event.factType ?? '').toLowerCase()) ?? 0) +
    Number(Boolean(event.gateImpact)) +
    Number(Boolean(event.recommendedAction))
  );
}

function relevanceTier(value: number): number {
  if (value >= 11) return 4;
  if (value >= 8) return 3;
  if (value >= 5) return 2;
  if (value > 0) return 1;
  return 0;
}

export function createEvidenceEvent<T extends EvidenceInput>(input: T): EvidenceEvent & T {
  const required = {
    opportunityId: input.opportunityId,
    source: input.source,
    sourceRecordId: input.sourceRecordId,
    eventDate: input.eventDate,
    category: input.category,
    text: input.text,
  };
  for (const [field, value] of Object.entries(required)) {
    if (!value) throw new Error(`EvidenceEvent missing ${field}`);
  }
  return {
    collectionDate: new Date().toISOString(),
    matchedIdentities: [],
    processRelevance: 0,
    matchQuality: 'Weak',
    substantive: false,
    relationship: 'Neutral',
    rawText: null,
    issueKey: null,
    lifecycleState: null,
    resolvedByEventId: null,
    resolutionDate: null,
    narrativeContribution: 'Audit Only',
    ...input,
  };
}

export type RankedEvidence = Pick<
  EvidenceEvent,
  'source' | 'matchQuality' | 'substantive' | 'eventDate' | 'relationship'
> & { readonly processRelevance?: number | null };

export function evidenceRank(event: RankedEvidence): readonly number[] {
  const sourceReliability =
    event.source === 'Authorization' ? 2 : Number(STRUCTURED_SOURCES.has(event.source));
  return [
    relevanceTier(event.processRelevance ?? 0),
    MATCH_SCORE.get(event.matchQuality) ?? 0,
    sourceReliability,
    Number(event.substantive),
    new Date(event.eventDate).valueOf() || 0,
    event.processRelevance ?? 0,
    RELATION_SCORE.get(event.relationship) ?? 0,
  ];
}

export function compareEvidence(left: RankedEvidence, right: RankedEvidence): number {
  const a = evidenceRank(left);
  const b = evidenceRank(right);
  for (const [index, value] of a.entries()) {
    const other = b.at(index);
    if (other !== undefined && value !== other) return other - value;
  }
  return 0;
}

export function approvedEvidence<T extends RankedEvidence>(events: readonly T[]): T[] {
  return events
    .filter(
      (event) =>
        event.substantive &&
        ['Direct', 'Likely'].includes(event.matchQuality) &&
        event.relationship !== 'Neutral'
    )
    .sort(compareEvidence);
}

export function newestRelevantEvidence<T extends RankedEvidence>(events: readonly T[]): T | null {
  // Contract ordering wins over recency alone; do not re-sort the approved list by date.
  return approvedEvidence(events)[0] ?? null;
}
