import type {
  DelayHistoryFinding,
  DelayHistoryReceipt,
  DelayHistoryReceiptInput,
} from './delay-history-types.js';
import { delayHistoryOmissions } from './delay-history.js';
import { sha256Json } from './json-fingerprint.js';

function finding(detail: string): DelayHistoryFinding {
  return { severity: 'Critical', rule: 'delay-history-omission', detail };
}
function isReceiptArray(
  value: DelayHistoryReceiptInput['histories']
): value is readonly DelayHistoryReceipt[] {
  return Array.isArray(value);
}
function incomplete(
  receipt: DelayHistoryReceipt,
  ids: ReadonlySet<string | null | undefined>,
  rows: DelayHistoryReceiptInput['rows']
): boolean {
  const id = receipt.opportunityId;
  const matches = rows.filter((row) =>
    String(row.Salesforce)
      .split(/[/?#]/)
      .some((segment) => segment === id)
  );
  return (
    !id ||
    ids.has(id) ||
    matches.length !== 1 ||
    !Array.isArray(receipt.history?.entries) ||
    delayHistoryOmissions(receipt.history, matches[0]?.['In-Depth Summary']).length > 0
  );
}

export function validateDelayHistoryReceipt({
  binding,
  histories,
  rows,
}: DelayHistoryReceiptInput): DelayHistoryFinding[] {
  if (!binding) {
    return rows.some((row) => String(row['In-Depth Summary']).includes('Delay history:'))
      ? [finding('Delay-history manifest binding is missing.')]
      : [];
  }
  if (
    binding.version !== 1 ||
    !isReceiptArray(histories) ||
    binding.rows !== rows.length ||
    histories.length !== rows.length ||
    binding.artifactHash !== sha256Json(histories)
  ) {
    return [
      finding('Delay-history artifact does not match its manifest and complete queue cohort.'),
    ];
  }
  const findings: DelayHistoryFinding[] = [];
  const ids = new Set<string | null | undefined>();
  for (const receipt of histories) {
    if (incomplete(receipt, ids, rows)) {
      findings.push(
        finding(
          `Missing, duplicated, or incomplete case history for ${receipt.opportunityId ?? 'unknown Opportunity'}.`
        )
      );
    }
    ids.add(receipt.opportunityId);
  }
  return findings;
}
