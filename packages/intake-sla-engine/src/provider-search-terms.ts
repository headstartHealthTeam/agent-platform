import { normalizeIdentityValue, uniqueIdentityValues } from './provider-identity-values.js';

export function firefliesClientSearchVariants(
  name = '',
  aliases: readonly string[] = []
): string[] {
  const output: string[] = [];
  for (const value of [name, ...aliases].filter(Boolean)) {
    const normalized = normalizeIdentityValue(value);
    const parts = normalized.split(' ').filter(Boolean);
    const displayParts = value
      .trim()
      .split(/\s+/)
      .map((part) => part.replace(/[^A-Za-z0-9'-]/g, ''))
      .filter(Boolean);
    if (parts.length === 0) continue;
    output.push(value, normalized, parts.join(''));
    const first = parts[0] ?? '';
    const last = parts.at(-1) ?? '';
    if (parts.length > 1)
      output.push(
        displayParts[0] ?? first,
        `${first} ${last[0] ?? ''}`,
        `${first[0] ?? ''} ${last}`,
        `${first} ${last}`
      );
  }
  return uniqueIdentityValues(output);
}
export function firefliesStageTerms(stage: unknown = ''): string[] {
  const value = normalizeIdentityValue(String(stage));
  if (/ta approved|97153|first day/.test(value))
    return ['RBT', 'staffing', 'candidate', 'interview', 'first day', 'start date', '97153'];
  if (/treatment plan|97151 started/.test(value))
    return ['treatment plan', 'TP', 'signature', 'clinical review', 'submission'];
  if (value.includes('ta requested'))
    return ['treatment authorization', 'TA', 'payer', 'denial', 'approval'];
  if (/insurance verification|ia requested/.test(value))
    return ['VOB', 'eligibility', 'initial authorization', 'IA authorization', 'payer'];
  return ['initial assessment', 'IA', '97151', 'schedule', 'appointment', 'reschedule'];
}
