import { validateDelayHistoryReceipt } from './delay-history-receipt.js';
import { currentNarrative } from './delay-history.js';
import { duplicateOperationalSummaries } from './publication-quality.js';
import { oversizedWorkbookCells } from './publication-timeline.js';
import { auditWorkbookChronology, auditWorkbookNarrative } from './workbook-quality-narrative.js';
import { auditWorkbookReadiness } from './workbook-quality-readiness.js';
import {
  qualityRowFinding,
  qualityAuditText,
  type QualityAuditRow,
  type QualityRowContext,
  type WorkbookQualityFinding,
  type WorkbookQualityInput,
  type WorkbookQualityReport,
} from './workbook-quality-types.js';

function context(row: QualityAuditRow): QualityRowContext {
  const summary = qualityAuditText(row['Suggested SLA Summary'] ?? '').trim();
  const detail = qualityAuditText(row['In-Depth Summary'] ?? '').trim();
  return {
    row,
    summary,
    detail,
    currentDetail: currentNarrative(detail),
    action: qualityAuditText(row['Suggested Action'] ?? '').trim(),
    owner: qualityAuditText(row['Action Owner'] ?? '').trim(),
    reviewReason: qualityAuditText(row['Why Review Needed'] ?? '').trim(),
    combined: `${summary} ${detail}`,
    updateDate: qualityAuditText(row['Last Substantive Update Date'] ?? ''),
  };
}

function duplicateFindings(rows: readonly QualityAuditRow[]): WorkbookQualityFinding[] {
  const findings: WorkbookQualityFinding[] = [];
  const duplicates = duplicateOperationalSummaries(
    rows.map((row) => ({
      opportunityId: row.Salesforce,
      opportunityName: row['Opportunity Name'],
      operationalSummary: row['In-Depth Summary'],
    }))
  );
  for (const duplicate of duplicates)
    for (const duplicateRow of duplicate.rows) {
      const row = rows.find(
        (candidate) =>
          candidate.Salesforce === duplicateRow.opportunityId &&
          candidate['Opportunity Name'] === duplicateRow.opportunityName
      );
      if (row)
        findings.push(
          qualityRowFinding(
            row,
            'Critical',
            'duplicate-in-depth-summary',
            `In-Depth Summary is identical across ${String(duplicate.rows.length)} Opportunities.`
          )
        );
    }
  return findings;
}

/** Full workbook audit from the approved shadow audit; no source reads or policy changes. */
export function auditWorkbookQuality({
  workbook,
  binding,
  histories = [],
  auditedAt = new Date().toISOString(),
}: WorkbookQualityInput): WorkbookQualityReport {
  const sheets = new Map(Object.entries(workbook.sheets));
  const rows = ['Review Queue', 'On-Hold Review'].flatMap((sheet) => {
    const [headers = [], ...values] = sheets.get(sheet) ?? [];
    return values.map((valuesRow): QualityAuditRow => ({
      ...Object.fromEntries(headers.map((header, index) => [String(header), valuesRow.at(index)])),
      sheet,
    }));
  });
  const findings: WorkbookQualityFinding[] = [
    ...validateDelayHistoryReceipt({
      ...(binding === undefined ? {} : { binding }),
      histories,
      rows,
    }),
  ];
  for (const cell of oversizedWorkbookCells(workbook.sheets))
    findings.push({
      ...cell,
      severity: 'Critical',
      rule: 'google-cell-length',
      detail: `Cell exceeds Google's 50,000-character limit (${String(cell.length)}); preserve evidence while correcting its representation.`,
    });
  for (const row of rows) {
    const input = context(row);
    findings.push(
      ...auditWorkbookNarrative(input),
      ...auditWorkbookChronology(input),
      ...auditWorkbookReadiness(input)
    );
  }
  findings.push(...duplicateFindings(rows));
  const duplicates = rows.length - new Set(rows.map((row) => row.Salesforce)).size;
  const counts = new Map<string, number>();
  for (const finding of findings)
    counts.set(finding.severity, (counts.get(finding.severity) ?? 0) + 1);
  return {
    version: '2026-08-12.2',
    auditedAt,
    runId: workbook.runId,
    rowCount: rows.length,
    duplicateOpportunityCount: duplicates,
    counts: Object.fromEntries(counts),
    passed: duplicates === 0 && !findings.some((finding) => finding.severity === 'Critical'),
    findings,
  };
}
