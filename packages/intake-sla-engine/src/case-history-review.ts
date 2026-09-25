export type CaseHistoryTable = readonly (readonly unknown[])[];
interface CaseHistoryRow {
  readonly 'Opportunity Name'?: unknown;
  readonly 'In-Depth Summary'?: unknown;
  readonly 'Ready to Copy'?: unknown;
  readonly 'Suggested Action'?: unknown;
  readonly 'Why Review Needed'?: unknown;
  readonly Stage?: unknown;
  readonly Freshness?: unknown;
}
export interface CaseHistoryReviewInput {
  readonly sheets: Readonly<Partial<Record<'Review Queue' | 'On-Hold Review', CaseHistoryTable>>>;
  readonly generatedAt: unknown;
}
const ESCAPES = new Map([
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
  ["'", '&#39;'],
]);
function escapeHtml(value: unknown): string {
  const text = String(value);
  return (value === null || value === undefined ? '' : text).replace(
    /[&<>"']/g,
    (character) => ESCAPES.get(character) ?? character
  );
}
function sheetTable(
  sheets: CaseHistoryReviewInput['sheets'],
  title: string
): CaseHistoryTable | undefined {
  return title === 'Review Queue' ? sheets['Review Queue'] : sheets['On-Hold Review'];
}
function reviewRow(headers: readonly unknown[], row: readonly unknown[]): CaseHistoryRow {
  return Object.fromEntries(headers.map((header, index) => [String(header), row.at(index)]));
}

// Local review companion: complete cell values, no external assets or scripts.
export function renderCaseHistoryReview({ sheets, generatedAt }: CaseHistoryReviewInput): string {
  const cases = ['Review Queue', 'On-Hold Review'].flatMap((title) => {
    const [headers = [], ...values] = sheetTable(sheets, title) ?? [];
    return values.map((row) => reviewRow(headers, row));
  });
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Intake case histories</title><style>body{font:17px/1.6 system-ui,sans-serif;max-width:960px;margin:40px auto;padding:0 24px;color:#203047;background:#f6f8fb}article{background:white;padding:28px;margin:24px 0;border:1px solid #d7dfea;border-radius:12px}h1,h2{line-height:1.25}p{white-space:pre-wrap;overflow-wrap:anywhere}summary{cursor:pointer;font-weight:650}nav{line-height:2}a{color:#16599a}small{color:#53647a}@media print{article{break-before:page}}</style>
<h1>Intake case histories</h1><p>Private review copy. Source cutoff: ${escapeHtml(generatedAt)}. Historical findings are assessed at the source cutoff and attributed to the supporting record dates. Unknown dates, transitions, and causes remain unverified.</p>
<nav>${cases.map((row, index) => `<a href="#case-${String(index)}">${escapeHtml(row['Opportunity Name'])}</a>`).join(' · ')}</nav>
${cases.map((row, index) => `<article id="case-${String(index)}"><h2>${escapeHtml(row['Opportunity Name'])}</h2><small>${escapeHtml(row.Stage)} · ${escapeHtml(row.Freshness)} · ${escapeHtml(row['Ready to Copy'])}</small><p>${escapeHtml(row['In-Depth Summary'])}</p><h3>Suggested action</h3><p>${escapeHtml(row['Suggested Action'])}</p><h3>Review needed</h3><p>${escapeHtml(row['Why Review Needed'])}</p></article>`).join('\n')}</html>`;
}
