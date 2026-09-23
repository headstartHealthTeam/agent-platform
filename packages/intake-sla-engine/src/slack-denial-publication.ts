import type { DenialContextCoverage } from './slack-denial-context.js';

export interface DenialPublicationSource {
  readonly opportunityId: string;
  readonly source: string;
  readonly required?: boolean;
  readonly status?: string;
  readonly detail?: string | null;
}
export interface DenialPublicationInputs {
  readonly coverage: DenialContextCoverage;
  readonly workbook: {
    readonly sheets: Readonly<Record<string, readonly (readonly unknown[])[] | undefined>>;
  };
  readonly sourceStatuses: readonly DenialPublicationSource[];
}
export interface DenialPublicationResult {
  readonly passed: boolean;
  readonly applicable: number;
  readonly complete: number;
  readonly blocked: number;
  readonly unmarked: number;
}
/** Existing partial-publication rule: missing coverage must remain an explicit row/source exception. */
export function denialContextPublicationCheck({
  coverage,
  workbook,
  sourceStatuses,
}: DenialPublicationInputs): DenialPublicationResult {
  const queue = [workbook.sheets['Review Queue'], workbook.sheets['On-Hold Review']].flatMap(
    (sheet) => {
      const [headers = [], ...rows] = sheet ?? [];
      return rows.map(
        (row) => new Map(headers.map((header, index) => [String(header), row.at(index)]))
      );
    }
  );
  const unmarked = coverage.rows
    .filter((row) => !row.complete)
    .filter((row) => {
      const matches = queue.filter((entry) =>
        String(entry.get('Salesforce')).endsWith(`/Opportunity/${row.opportunityId}/view`)
      );
      const sources = sourceStatuses.filter(
        (source) => source.opportunityId === row.opportunityId && source.source === 'Slack'
      );
      const match = matches[0];
      const source = sources[0];
      return (
        matches.length !== 1 ||
        match?.get('Ready to Copy') !== 'Blocked' ||
        match.get('Evidence Status') !== 'Blocked' ||
        !/denial.context/i.test(String(match.get('Why Review Needed'))) ||
        sources.length !== 1 ||
        source?.required !== true ||
        source.status !== 'Blocked' ||
        !/denial.context/i.test(source.detail ?? '')
      );
    });
  return {
    passed: unmarked.length === 0,
    applicable: coverage.applicable,
    complete: coverage.complete,
    blocked: coverage.incomplete,
    unmarked: unmarked.length,
  };
}
