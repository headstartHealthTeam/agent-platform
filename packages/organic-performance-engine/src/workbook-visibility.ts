import type { ReportRows, WorkbookBinding, WorkbookTemplate } from './workbook-contract.js';

type TemplateSheet = WorkbookTemplate['sheets'][number];

/** Only explicitly optional, isolated row sections may be hidden. */
export function validateOptionalSections(sheet: TemplateSheet): void {
  for (const binding of sheet.bindings) {
    const section = binding.optionalSection;
    if (!section) continue;
    if (
      binding.expandRows !== undefined ||
      section.startRow > binding.range.row ||
      section.endRow < binding.range.row + binding.range.rows ||
      section.endRow > sheet.rows
    )
      throw new Error('Optional section must contain its bounded binding: ' + binding.id);
    for (const other of sheet.bindings) {
      if (other === binding) continue;
      const start = other.optionalSection?.startRow ?? other.range.row;
      const end =
        other.optionalSection?.endRow ??
        other.range.row + Math.max(other.range.rows, other.expandRows ?? other.range.rows);
      if (start < section.endRow && end > section.startRow)
        throw new Error('Optional section overlaps another binding: ' + binding.id);
    }
  }
}

export function optionalSectionVisibility(
  sheetId: number,
  binding: WorkbookBinding,
  rows: ReportRows
): Record<string, unknown>[] {
  const section = binding.optionalSection;
  if (!section) return [];
  const populated = rows.some((row) =>
    row.some((value) => value !== null && (typeof value !== 'string' || value.trim() !== ''))
  );
  return [
    {
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: 'ROWS',
          startIndex: section.startRow,
          endIndex: section.endRow,
        },
        properties: { hiddenByUser: !populated },
        fields: 'hiddenByUser',
      },
    },
  ];
}
