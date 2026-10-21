import { freshnessText } from './freshness-values.js';

// Optional groups containing repetitions are written as ordered empty alternatives.
// This keeps the approved matching language without nested quantified expressions.
const ADMINISTRATIVE_PATTERNS = [
  /^has\s+(?:the\s+|)(?:family|parent|caregiver|provider)\s+(?:responded|replied)(?:\s+yet|)\?$/i,
  /^(?:csm|intake|insurance ops|rbt team)\s+(?:is\s+|)meeting\s+with\s+(?:the\s+|)provider(?:\s+on\s+\d{1,2}\/\d{1,2}|)\s+for\s+(?:an?\s+|)(?:status\s+|)update$/i,
  /^update\s+(?:req'?d|required|needed)$/i,
  /^(?:still\s+|)no\s+(?:substantive\s+|)update(?:\s+yet|)(?:[,;:]?\s*(?:csm|provider|intake|insurance ops|rbt team)\s+(?:to|will|needs?\s+to|)\s*(?:f\/?u|follow\s*up|get\s+(?:an?\s+|)update)(?:\s+.*|)|)$/i,
  /^awaiting\s+(?:a\s+|)(?:csm|provider|intake|insurance ops|rbt team)\s+update$/i,
  /^(?:csm|intake|insurance ops|rbt team|provider)\s+(?:to|will|needs?\s+to)\s+(?:f\/?u|follow\s*up|get\s+(?:an?\s+|)update|request\s+an?\s+update)(?:\s+(?:with|from)\s+(?:the\s+|)(?:provider|family|payer)|)(?:\s+for\s+(?:a\s+|)(?:start date|status|update)|)(?:\s+(?:on|by)\s+\d{1,2}\/\d{1,2}|)$/i,
  /^(?:the\s+|)provider\s+(?:to|will)\s+schedule(?:\s+(?:soon|this week|next week)|)$/i,
  /^(?:csm|intake|insurance ops|rbt team)\s+(?:sent|emailed|messaged)\s+(?:the\s+|)provider\s+(?:for|requesting)\s+(?:a\s+|)(?:status\s+|)update$/i,
  /^(?:email|message)\s+sent\s+to\s+(?:the\s+|)provider\s+requesting\s+updates?\s+(?:on|about|regarding)\s+.+$/i,
  /^(?:has\s+|)transitioned\s+to\s+[^.;]+$/i,
  /^on (?:the )?agenda to discuss(?:\s+with\s+.*|)$/i,
];
export function isAdministrativeOnly(value: unknown): boolean {
  const normalized = freshnessText(value)
    .replace(/^\d{1,2}\/\d{1,2}(?:\/\d{2,4}|)\s*[-:]?\s*/, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[|.;]+$/g, '')
    .trim();
  return !normalized || ADMINISTRATIVE_PATTERNS.some((pattern) => pattern.test(normalized));
}
