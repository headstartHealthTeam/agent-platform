import { createHash } from 'node:crypto';

function compact(value: unknown = ''): string {
  return String(value).replace(/\s+/g, ' ').trim();
}
function canonical(value: unknown = ''): string {
  return compact(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
export function generationHash(value: unknown = ''): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}
function sentenceParts(value: unknown = ''): string[] {
  return compact(value)
    .split(/(?<=[.!?])\s+|\s*[;|]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}
function tokenSet(value: unknown = ''): Set<string> {
  return new Set(canonical(value).split(' ').filter(Boolean));
}
function jaccard(left: unknown, right: unknown): number {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / new Set([...a, ...b]).size;
}
export interface GeneratedNoteLedgerEntry {
  readonly runId?: string | undefined;
  readonly opportunityId?: string | null | undefined;
  readonly slaId?: string | null | undefined;
  readonly summaryHash?: unknown;
  readonly generatedSummary?: unknown;
}
export interface SlaNoteClassification {
  readonly provenance:
    | 'Empty'
    | 'Generated - Exact'
    | 'Generated - Human Addition'
    | 'Generated - Similar'
    | 'Generated - Unverified Legacy'
    | 'Human';
  readonly admittedText: string;
  readonly excludedText: string;
  readonly matchedRunId?: string | undefined;
  readonly similarity?: number;
}
function similarity(
  row: GeneratedNoteLedgerEntry,
  text: string,
  threshold: number
): {
  row: GeneratedNoteLedgerEntry;
  similarity: number;
  generatedSentences: string[];
  currentSentences: string[];
  generatedClausesPreserved: boolean;
} {
  const generatedSentences = sentenceParts(row.generatedSummary);
  const currentSentences = sentenceParts(text);
  const preservedClauses = generatedSentences.filter((generated) =>
    currentSentences.some((current) => jaccard(current, generated) >= threshold)
  ).length;
  return {
    row,
    similarity: jaccard(text, row.generatedSummary),
    generatedSentences,
    currentSentences,
    generatedClausesPreserved:
      generatedSentences.length > 0 && preservedClauses === generatedSentences.length,
  };
}
export function classifyCurrentSlaNote({
  note,
  opportunityId,
  slaId,
  ledgerRows = [],
  generatedPatternMatch = false,
  similarityThreshold = 0.84,
}: {
  readonly note?: unknown;
  readonly opportunityId?: string | null | undefined;
  readonly slaId?: string | null | undefined;
  readonly ledgerRows?: readonly GeneratedNoteLedgerEntry[];
  readonly generatedPatternMatch?: boolean;
  readonly similarityThreshold?: number;
}): SlaNoteClassification {
  const text = compact(note);
  if (!text) return { provenance: 'Empty', admittedText: '', excludedText: '' };
  const candidates = ledgerRows.filter(
    (row) =>
      (!opportunityId || row.opportunityId === opportunityId) &&
      (!slaId || !row.slaId || row.slaId === slaId)
  );
  const exact = candidates.find((row) => row.summaryHash === generationHash(text));
  if (exact !== undefined)
    return {
      provenance: 'Generated - Exact',
      admittedText: '',
      excludedText: text,
      matchedRunId: exact.runId,
    };
  const similar = candidates
    .map((row) => similarity(row, text, similarityThreshold))
    .sort((left, right) => right.similarity - left.similarity)[0];
  if (
    similar !== undefined &&
    (similar.similarity >= similarityThreshold || similar.generatedClausesPreserved)
  ) {
    const additions = similar.currentSentences.filter(
      (part) =>
        !similar.generatedSentences.some(
          (generated) => jaccard(part, generated) >= similarityThreshold
        )
    );
    return {
      provenance: additions.length > 0 ? 'Generated - Human Addition' : 'Generated - Similar',
      admittedText: additions.join(' '),
      excludedText: similar.generatedSentences.join(' '),
      matchedRunId: similar.row.runId,
      similarity: similar.similarity,
    };
  }
  if (generatedPatternMatch)
    return { provenance: 'Generated - Unverified Legacy', admittedText: '', excludedText: text };
  return { provenance: 'Human', admittedText: text, excludedText: '' };
}
export interface GenerationLedgerRow {
  readonly runId: string;
  readonly slaId: string;
  readonly opportunityId: string;
  readonly engineVersion: string | undefined;
  readonly sourceCutoff: string | undefined;
  readonly generatedAt: string;
  readonly generatedSummary: string;
  readonly summaryHash: string;
  readonly operationalSummary: string;
  readonly operationalSummaryHash: string;
  readonly publicationStatus: string;
}
export function createGenerationLedgerRow({
  runId,
  slaId,
  opportunityId,
  engineVersion,
  sourceCutoff,
  generatedAt = new Date().toISOString(),
  generatedSummary,
  operationalSummary = '',
  publicationStatus = 'Built - Pending Publish',
}: {
  readonly runId: string;
  readonly slaId: string;
  readonly opportunityId: string;
  readonly engineVersion?: string | undefined;
  readonly sourceCutoff?: string | undefined;
  readonly generatedAt?: string;
  readonly generatedSummary?: unknown;
  readonly operationalSummary?: unknown;
  readonly publicationStatus?: string;
}): GenerationLedgerRow {
  return {
    runId,
    slaId,
    opportunityId,
    engineVersion,
    sourceCutoff,
    generatedAt,
    generatedSummary: compact(generatedSummary),
    summaryHash: generationHash(generatedSummary),
    operationalSummary: compact(operationalSummary),
    operationalSummaryHash: generationHash(operationalSummary),
    publicationStatus,
  };
}
export const GENERATION_LEDGER_HEADERS = [
  'Run ID',
  'SLA ID',
  'Opportunity ID',
  'Engine Version',
  'Source Cutoff',
  'Generated At',
  'Generated Summary',
  'Summary Hash',
  'Operational Summary',
  'Operational Summary Hash',
  'Publication Status',
];
export type GenerationLedgerProjection = Readonly<
  Partial<Record<keyof GenerationLedgerRow, unknown>>
>;
export function generationLedgerRows(
  rows: readonly GenerationLedgerProjection[] = []
): unknown[][] {
  return [
    GENERATION_LEDGER_HEADERS,
    ...rows.map((row) => [
      row.runId,
      row.slaId,
      row.opportunityId,
      row.engineVersion,
      row.sourceCutoff,
      row.generatedAt,
      row.generatedSummary,
      row.summaryHash,
      row.operationalSummary ?? '',
      row.operationalSummaryHash,
      row.publicationStatus,
    ]),
  ];
}
