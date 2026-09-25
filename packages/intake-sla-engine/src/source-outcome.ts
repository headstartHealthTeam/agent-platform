import type { SourceStatus } from './source-result.js';

export interface StageEvidence {
  readonly substantive?: boolean;
  readonly matchQuality?: string | null;
  readonly processGateRelevance?: string | null;
}
export interface SourceCheck {
  readonly unsupported?: boolean | null | undefined;
  readonly error?: string | null | undefined;
  readonly searchedAt?: string | null | undefined;
  readonly collectedAt?: string | null | undefined;
  readonly checkedAt?: string | null | undefined;
  readonly timedOut?: boolean | null | undefined;
  readonly blocked?: boolean | null | undefined;
}
export interface SourceOutcome {
  readonly source: string;
  readonly found: number;
  readonly recordsRetrieved: number;
  readonly required: boolean;
  readonly status: SourceStatus;
  readonly detail: string;
  readonly coverageStatus?: string;
}
export interface SourceOutcomeInput {
  readonly row?: SourceCheck | null | undefined;
  readonly items?: readonly StageEvidence[];
  readonly source: string;
  readonly required?: boolean;
  readonly recordsRetrieved?: number;
  readonly coverageStatus?: string;
  readonly coverageDetail?: string;
  readonly asOf: string;
}

export function isUsableStageEvidence(item?: StageEvidence | null): boolean {
  return (
    item?.substantive === true &&
    ['Direct', 'Likely'].includes(item.matchQuality ?? '') &&
    item.processGateRelevance !== 'Not Relevant'
  );
}

function staleDetail(records: number, required: boolean): string {
  return records
    ? 'Historical evidence retained, but this source was not revalidated in the current run.'
    : `${required ? 'Required' : 'Non-blocking enrichment'} source was not checked in the current run.`;
}
function emptyDetail(records: number): string {
  return records
    ? `Retrieved ${String(records)} candidate record${records === 1 ? '' : 's'}, but none were substantive and stage-relevant.`
    : 'Current-run search completed without stage-relevant evidence.';
}

export function sourceOutcome({
  row,
  items = [],
  source,
  required = true,
  recordsRetrieved = items.length,
  coverageStatus = 'Complete',
  coverageDetail = '',
  asOf,
}: SourceOutcomeInput): SourceOutcome {
  const relevant = items.filter(isUsableStageEvidence);
  const base = { source, found: relevant.length, recordsRetrieved, required };
  if (row?.unsupported)
    return {
      ...base,
      status: 'Unsupported',
      found: 0,
      recordsRetrieved: 0,
      detail: [row.error].find(Boolean) ?? 'The authorized connector does not expose this source.',
    };
  if (coverageStatus !== 'Complete')
    return {
      ...base,
      status: 'Blocked',
      coverageStatus,
      detail:
        [coverageDetail].find(Boolean) ??
        `${source} identity or retrieval coverage is ${coverageStatus.toLowerCase()}.`,
    };
  const time = Date.parse([row?.searchedAt, row?.collectedAt, row?.checkedAt].find(Boolean) ?? '');
  if (!(
    Number.isFinite(time) && Math.abs(new Date(asOf).getTime() - time) <= 12 * 60 * 60 * 1000
  )) {
    return { ...base, status: 'Blocked', detail: staleDetail(recordsRetrieved, required) };
  }
  // Useful partial evidence does not erase an explicit required-source failure.
  if (row?.timedOut)
    return {
      ...base,
      status: 'Timed Out',
      detail: [row.error].find(Boolean) ?? 'Source timed out.',
    };
  if (row?.blocked || row?.error)
    return {
      ...base,
      status: 'Blocked',
      detail: [row.error].find(Boolean) ?? 'Source access blocked.',
    };
  if (relevant.length > 0)
    return {
      ...base,
      status: 'Found',
      detail: 'Current-run Direct or Likely substantive evidence matched the current gate.',
    };
  return { ...base, status: 'Searched - Not Found', detail: emptyDetail(recordsRetrieved) };
}
