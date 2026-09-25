import type { DelayHistoryReceiptInput } from './delay-history-types.js';

export type QualityAuditRow = Readonly<Record<string, unknown>> & {
  readonly sheet: string;
  readonly Salesforce?: unknown;
  readonly 'In-Depth Summary'?: unknown;
};

export function qualityAuditText(value: unknown): string {
  return String(value);
}
export interface WorkbookQualityFinding {
  readonly severity: 'Critical' | 'Warning' | 'Review';
  readonly rule: string;
  readonly detail: string;
  readonly opportunityName?: unknown;
  readonly sheet?: string;
  readonly stage?: unknown;
  readonly rowIndex?: number;
  readonly columnIndex?: number;
  readonly length?: number;
}
export interface WorkbookQualityInput {
  readonly workbook: {
    readonly runId?: unknown;
    readonly sheets: Readonly<Record<string, readonly (readonly unknown[])[]>>;
  };
  readonly binding?: DelayHistoryReceiptInput['binding'];
  readonly histories?: DelayHistoryReceiptInput['histories'];
  readonly auditedAt?: string;
}
export interface WorkbookQualityReport {
  readonly version: '2026-08-12.2';
  readonly auditedAt: string;
  readonly runId: unknown;
  readonly rowCount: number;
  readonly duplicateOpportunityCount: number;
  readonly counts: Readonly<Record<string, number>>;
  readonly passed: boolean;
  readonly findings: readonly WorkbookQualityFinding[];
}

export interface QualityRowContext {
  readonly row: QualityAuditRow;
  readonly summary: string;
  readonly detail: string;
  readonly currentDetail: string;
  readonly action: string;
  readonly owner: string;
  readonly reviewReason: string;
  readonly combined: string;
  readonly updateDate: string;
}

export function qualityRowFinding(
  row: QualityAuditRow,
  severity: WorkbookQualityFinding['severity'],
  rule: string,
  detail: string
): WorkbookQualityFinding {
  return {
    opportunityName: row['Opportunity Name'],
    sheet: row.sheet,
    stage: row['Stage'],
    severity,
    rule,
    detail,
  };
}
