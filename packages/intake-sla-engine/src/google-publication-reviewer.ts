import { GOOGLE_REVIEWER_FIELDS } from './google-capture-values.js';
import type {
  GooglePreparedStage,
  GooglePublicationRows,
  GoogleWorkbookSheets,
  ReviewerPreservationProof,
  GooglePublicationUpdate,
} from './google-publication-types.js';
import {
  googleCellValue,
  publicationItem,
  publicationMatrix,
  publicationText,
  setPublicationCell,
  workbookSheet,
} from './google-publication-values.js';
import { sha256Json } from './json-fingerprint.js';
import type { ReviewerSnapshot, ReviewerSnapshotRow } from './publication-state.js';

function opportunityIdFromRow(row: readonly unknown[], headers: readonly unknown[]): string | null {
  return (
    /\/Opportunity\/([A-Za-z0-9]+)\/view$/.exec(
      publicationText(publicationItem(row, headers.indexOf('Salesforce')) ?? '')
    )?.[1] ?? null
  );
}
function checkReviewerCell(
  title: string,
  header: string,
  field: string,
  prepared: unknown,
  current: ReviewerSnapshotRow | undefined
): void {
  if (current !== undefined) {
    const live: unknown = Object.hasOwn(current, field) ? Reflect.get(current, field) : null;
    if ((prepared === '' ? null : prepared) !== live)
      throw new Error(`${title} would change reviewer-owned field ${header}`);
  } else if (prepared !== '' && prepared !== null && prepared !== undefined)
    throw new Error(`${title} assigns reviewer-owned field ${header} on a brand-new row`);
}
export function reviewerSafeReadbackRows(
  title: string,
  rows: GooglePublicationRows,
  currentReviewerState: ReviewerSnapshot
): GooglePublicationRows {
  const headers = rows[0];
  if (headers === undefined) throw new TypeError('Missing reviewer headers');
  const currentById = new Map(
    (currentReviewerState.rows ?? []).map((row) => [row.opportunityId, row])
  );
  return rows.map((row, rowIndex) => {
    if (rowIndex === 0) return row;
    const opportunityId = opportunityIdFromRow(row, headers);
    if (!opportunityId) throw new Error(`${title} row is missing its Opportunity identity`);
    const current = currentById.get(opportunityId);
    const expected = [...row];
    for (const [header, field] of GOOGLE_REVIEWER_FIELDS) {
      const columnIndex = headers.indexOf(header);
      if (columnIndex < 0) throw new Error(`${title} is missing ${header}`);
      const prepared = publicationItem(row, columnIndex) ?? '';
      checkReviewerCell(title, header, field, prepared, current);
      if (header === 'Needs CSM Review' && current === undefined && prepared === '')
        setPublicationCell(expected, columnIndex, false);
    }
    return expected;
  });
}
export function assertReviewSheetHeaders(title: string, headers: readonly unknown[] = []): void {
  for (const header of ['Salesforce', 'Freshness', ...GOOGLE_REVIEWER_FIELDS.map(([name]) => name)])
    if (!headers.includes(header)) throw new Error(`${title} is missing required header ${header}`);
}
function preparedRow(
  stage: GooglePreparedStage,
  rowIndex: number
): GooglePublicationUpdate | undefined {
  return stage.payload.requests
    .flatMap((request) => ('updateCells' in request ? [request.updateCells] : []))
    .find(
      (request) => request.range.startRowIndex <= rowIndex && request.range.endRowIndex > rowIndex
    );
}
function rowValues(
  row: readonly unknown[],
  headers: readonly unknown[],
  write: GooglePublicationUpdate | undefined,
  rowIndex: number,
  counts: ReviewerPreservationProof['counts']
): unknown[] {
  const cells =
    write === undefined
      ? undefined
      : publicationItem(write.rows, rowIndex - write.range.startRowIndex)?.values;
  return GOOGLE_REVIEWER_FIELDS.map(([header]) => {
    const column = headers.indexOf(header),
      value = publicationItem(row, column);
    const expected = googleCellValue(value, header).userEnteredValue ?? null;
    if (
      sha256Json(publicationItem(cells, column)?.userEnteredValue ?? null) !== sha256Json(expected)
    )
      throw new Error('Prepared payload differs from reviewer preservation evidence');
    counts.cells++;
    if (value === null || value === undefined || value === '') counts.blank++;
    else if (value === false) counts.unchecked++;
    else counts.populated++;
    return expected;
  });
}
export function reviewerPreservationProof(
  sheets: GoogleWorkbookSheets,
  stages: readonly GooglePreparedStage[],
  currentReviewerState: ReviewerSnapshot
): ReviewerPreservationProof {
  const priorIds = new Set((currentReviewerState.rows ?? []).map((row) => row.opportunityId));
  const currentIds = new Set<unknown>();
  const counts = {
    rows: 0,
    cells: 0,
    blank: 0,
    unchecked: 0,
    populated: 0,
    newRows: 0,
    removedRows: 0,
  };
  const queues: ReviewerPreservationProof['queues'] = [];
  for (const title of ['Review Queue', 'On-Hold Review']) {
    const rawRows = workbookSheet(sheets, title);
    if (rawRows === undefined) throw new TypeError('Missing reviewer rows');
    const rows = publicationMatrix(rawRows);
    const headers = rows[0];
    if (headers === undefined) throw new TypeError('Missing reviewer headers');
    reviewerSafeReadbackRows(title, rows, currentReviewerState);
    const prepared = stages.find(
      (item) => item.id === (title === 'Review Queue' ? '02-review-queue' : '03-on-hold-review')
    );
    if (prepared === undefined) throw new TypeError('Missing prepared reviewer stage');
    const rowProofs = rows.slice(1).map((row, offset) => {
      const opportunityId = opportunityIdFromRow(row, headers);
      if (currentIds.has(opportunityId)) throw new Error('Duplicate reviewer Opportunity identity');
      currentIds.add(opportunityId);
      const rowIndex = offset + 1;
      const values = rowValues(row, headers, preparedRow(prepared, rowIndex), rowIndex, counts);
      counts.rows++;
      if (!priorIds.has(opportunityId)) counts.newRows++;
      return { opportunityId, rowIndex, values };
    });
    queues.push({
      title,
      rows: rowProofs.length,
      payloadHash: prepared.payloadHash,
      reviewerRowsHash: sha256Json(rowProofs),
    });
  }
  counts.removedRows = [...priorIds].filter((id) => !currentIds.has(id)).length;
  return {
    schemaVersion: 1,
    passed: true,
    basis: 'Exact prepared userEnteredValue cells compared by Opportunity ID',
    currentReviewerStateHash: sha256Json(currentReviewerState),
    counts,
    queues,
  };
}
