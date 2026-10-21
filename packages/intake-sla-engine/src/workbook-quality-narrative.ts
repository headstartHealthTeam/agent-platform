import { narrativeSentenceCount } from './publication-narrative.js';
import {
  qualityRowFinding,
  type QualityRowContext,
  type WorkbookQualityFinding,
} from './workbook-quality-types.js';

export function auditWorkbookNarrative(context: QualityRowContext): WorkbookQualityFinding[] {
  const { row, summary, detail, currentDetail, reviewReason, combined } = context;
  const findings: WorkbookQualityFinding[] = [];
  const add = (
    severity: WorkbookQualityFinding['severity'],
    rule: string,
    message: string
  ): void => {
    findings.push(qualityRowFinding(row, severity, rule, message));
  };
  if (!summary) add('Critical', 'missing-summary', 'Suggested SLA Summary is blank.');
  if (summary.length > 254)
    add('Critical', 'summary-length', `${String(summary.length)} characters.`);
  const count = narrativeSentenceCount(currentDetail);
  if (detail && count < 4)
    add('Critical', 'in-depth-sentence-count', `${String(count)} sentences; expected at least 4.`);
  if (summary && !/[.!?]$/.test(summary))
    add('Warning', 'summary-punctuation', 'Summary lacks terminal punctuation.');
  if (
    /stage-relevant operational update|unresolved gate is described|activity was recorded|an update was recorded/i.test(
      combined
    )
  )
    add('Critical', 'vague-placeholder', 'Generic placeholder language is present.');
  if (/Publication QA:/i.test(reviewReason)) add('Critical', 'publication-qa', reviewReason);
  if (/Subject:|Body:|Attachment:|\[[0-9]{1,2}:[0-9]{2}\]|\{[^}]{20,}\}/i.test(combined))
    add('Critical', 'raw-source-leakage', 'Raw source formatting is present.');
  if (/\.;|;;|\.\.|\s{3,}/.test(combined))
    add('Warning', 'malformed-formatting', 'Malformed punctuation or spacing is present.');
  if (
    /correction, appeal, or resubmission|replacement or closure path|one of several|may be|might be/i.test(
      summary
    )
  )
    add(
      'Warning',
      'noncommittal-summary',
      'Summary lists possibilities instead of a supported state.'
    );
  if (/An earlier .* issue also remains unresolved:/i.test(detail))
    add(
      'Review',
      'carry-forward-review',
      'Long summary contains a carried earlier issue; verify it is causally active.'
    );
  return findings;
}

function shortDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${String(Number(match[2]))}/${String(Number(match[3]))}` : '';
}

function parseSummaryDate(value: string, year = 2026): Date | null {
  const match = /(?:^|\b)(\d{1,2})\/(\d{1,2})\/(\d{2,4})|(?:^|\b)(\d{1,2})\/(\d{1,2})/.exec(value);
  if (!match) return null;
  let resolvedYear = match[3] ? Number(match[3]) : year;
  if (resolvedYear < 100) resolvedYear += 2000;
  return new Date(
    Date.UTC(resolvedYear, Number(match[1] ?? match[4]) - 1, Number(match[2] ?? match[5]))
  );
}

export function auditWorkbookChronology(context: QualityRowContext): WorkbookQualityFinding[] {
  const { row, summary, currentDetail, action, updateDate } = context;
  const findings: WorkbookQualityFinding[] = [];
  const add = (rule: string, detail: string): void => {
    findings.push(qualityRowFinding(row, 'Critical', rule, detail));
  };
  if (updateDate && !summary.startsWith(`${shortDate(updateDate)}:`))
    add('summary-update-date', `Summary does not begin with ${shortDate(updateDate)}.`);
  const decisionMatch = /after the (\d{1,2}\/\d{1,2}) payer decision/i.exec(summary);
  if (decisionMatch) {
    const prefixDate = parseSummaryDate(summary);
    const decisionDate = parseSummaryDate(decisionMatch[1] ?? '');
    if (prefixDate && decisionDate && decisionDate > prefixDate)
      add('impossible-chronology', 'Summary update predates the payer decision it references.');
  }
  if (
    /state[- ]fair hearing|denied again after (?:an |a |)appeal/i.test(summary) &&
    /appeal is pending/i.test(currentDetail)
  )
    add(
      'obsolete-appeal-state',
      'Long summary carries a pending appeal after later appeal-denial or hearing evidence.'
    );
  if (
    /both parent assessments are now complete/i.test(summary) &&
    /Intake to (?:obtain|complete|collect).*(?:Vineland|BASC|assessment)/i.test(action)
  )
    add(
      'resolved-document-action',
      'Action asks Intake to collect a parent assessment already confirmed complete.'
    );
  return findings;
}
