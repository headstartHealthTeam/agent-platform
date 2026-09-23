export interface GridExpansionInput {
  readonly liveRowCount?: unknown;
  readonly liveColumnCount?: unknown;
  readonly requiredRowCount?: unknown;
  readonly requiredColumnCount?: unknown;
}
/** Planned capacity only; does not shrink a grid or perform a write. */
export function requiredGridExpansion({
  liveRowCount,
  liveColumnCount,
  requiredRowCount,
  requiredColumnCount,
}: GridExpansionInput = {}): { rowCount: number | null; columnCount: number | null } {
  const rows = Number(liveRowCount),
    columns = Number(liveColumnCount);
  const requiredRows = Number(requiredRowCount),
    requiredColumns = Number(requiredColumnCount);
  return {
    rowCount:
      Number.isInteger(rows) && Number.isInteger(requiredRows) && rows < requiredRows
        ? requiredRows
        : null,
    columnCount:
      Number.isInteger(columns) && Number.isInteger(requiredColumns) && columns < requiredColumns
        ? requiredColumns
        : null,
  };
}
