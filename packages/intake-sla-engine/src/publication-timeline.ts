import { GOOGLE_CELL_CHARACTER_LIMIT } from './google-publication-values.js';

export interface LifecycleTimelineEvent {
  readonly date?: string | null | undefined;
  readonly issueKey?: string | null | undefined;
  readonly lifecycleState?: string | null | undefined;
  readonly source?: string | null | undefined;
  readonly fact?: string | null | undefined;
  readonly narrativeContribution?: string | undefined;
}
type Value = string | null | undefined;
type Row = readonly [Value, Value, Value, Value, Value];

function groupedTimeline(rows: readonly Row[], groupDates: boolean): string {
  const result: string[] = [];
  let previousIssue: Value;
  let previousDate: Value;
  for (const [date, issue, state, source, fact] of rows) {
    if (!result.length || issue !== previousIssue) {
      result.push(`Issue: ${issue ?? ''}`);
      previousIssue = issue;
    }
    if (groupDates && (previousDate === undefined || date !== previousDate)) {
      result.push(`Date: ${date ?? ''}`);
      previousDate = date;
    }
    result.push((groupDates ? [state, source, fact] : [date, state, source, fact]).join('|'));
  }
  return result.join('\n');
}

function legendTimeline(rows: readonly Row[]): string {
  const states = [...new Set(rows.map((row) => row[2] ?? ''))];
  const sources = [...new Set(rows.map((row) => row[3] ?? ''))];
  const result = [
    ...states.map((state, index) => `L${String(index + 1)} = ${state}`),
    ...sources.map((source, index) => `S${String(index + 1)} = ${source}`),
    'Events: lifecycle|source|fact (date and issue apply until changed)',
  ];
  let priorDate: Value;
  let priorIssue: Value;
  for (const [date, issue, state, source, fact] of rows) {
    if (priorIssue === undefined || issue !== priorIssue) {
      result.push(`Issue: ${issue ?? ''}`);
      priorIssue = issue;
    }
    if (priorDate === undefined || date !== priorDate) {
      result.push(`Date: ${date ?? ''}`);
      priorDate = date;
    }
    result.push(
      `L${String(states.indexOf(state ?? '') + 1)}|S${String(sources.indexOf(source ?? '') + 1)}|${fact ?? ''}`
    );
  }
  return result.join('\n');
}

export function formatLifecycleTimeline(events: readonly LifecycleTimelineEvent[]): string {
  const rows: Row[] = events
    .filter((event) => event.narrativeContribution !== 'Audit Only')
    .map((event) => [event.date, event.issueKey, event.lifecycleState, event.source, event.fact]);
  const readable = rows.map((row) => row.join(' | ')).join('\n');
  if (readable.length <= GOOGLE_CELL_CHARACTER_LIMIT) return readable;
  const compact = rows.map((row) => row.join('|')).join('\n');
  if (compact.length <= GOOGLE_CELL_CHARACTER_LIMIT) return compact;
  const byIssue = groupedTimeline(rows, false);
  const shortest = byIssue.length < compact.length ? byIssue : compact;
  if (shortest.length <= GOOGLE_CELL_CHARACTER_LIMIT) return shortest;
  const byDate = groupedTimeline(rows, true);
  const groupedShortest = byDate.length < shortest.length ? byDate : shortest;
  if (groupedShortest.length <= GOOGLE_CELL_CHARACTER_LIMIT) return groupedShortest;
  const legend = legendTimeline(rows);
  return legend.length < groupedShortest.length ? legend : groupedShortest;
}

export function oversizedWorkbookCells(
  sheets: Readonly<Record<string, readonly (readonly unknown[])[]>>
): { sheet: string; rowIndex: number; columnIndex: number; length: number }[] {
  return Object.entries(sheets).flatMap(([sheet, rows]) =>
    rows.flatMap((row, rowIndex) =>
      row.flatMap((value, columnIndex) =>
        typeof value === 'string' && value.length > GOOGLE_CELL_CHARACTER_LIMIT
          ? [{ sheet, rowIndex, columnIndex, length: value.length }]
          : []
      )
    )
  );
}
