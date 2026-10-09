function stringValue(value: unknown): string {
  return String(value);
}
export function cleanSearchText(value: unknown): string {
  const present = Boolean(value);
  return stringValue(present ? value : '')
    .replace(/\s+/g, ' ')
    .trim();
}
export function normalizeSearchText(value: unknown): string {
  return cleanSearchText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}
export function compactPhone(value: unknown): string {
  const digits = cleanSearchText(value).replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}
export function buildNameVariants(value: unknown): string[] {
  const raw = cleanSearchText(value);
  if (!raw) return [];
  const parts = raw.split(/\s+/).filter(Boolean);
  const first = parts[0] ?? '';
  const last = parts.at(-1) ?? '';
  return [
    ...new Set(
      [
        raw,
        normalizeSearchText(raw),
        parts.join(''),
        `${first} ${last}`,
        `${first}${last}`,
        first && last ? `${first.slice(0, 1)} ${last}` : '',
        first && last ? `${last} ${first}` : '',
        first,
        last,
      ]
        .map(normalizeSearchText)
        .filter(Boolean)
    ),
  ];
}
export function hasCompetingNamedClient({
  text,
  targetName,
  cohortNames = [],
}: {
  readonly text: unknown;
  readonly targetName: unknown;
  readonly cohortNames?: readonly unknown[];
}): boolean {
  const body = normalizeSearchText(text);
  const target = normalizeSearchText(targetName);
  if (!body || !target || body.includes(target)) return false;
  return cohortNames.some((name) => {
    const normalized = normalizeSearchText(name);
    return Boolean(normalized) && normalized !== target && body.includes(normalized);
  });
}
export function normalizedSearchList(values: readonly unknown[]): string[] {
  return [...new Set(values.flat().map(normalizeSearchText).filter(Boolean))];
}
export function searchContact(value: unknown): {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
} {
  if (typeof value !== 'object' || value === null) return {};
  return {
    name: 'name' in value ? value.name : undefined,
    email: 'email' in value ? value.email : undefined,
    phone: 'phone' in value ? value.phone : undefined,
  };
}
export function stageSearchVernacular(stage: string | null | undefined): string[] {
  const value = stage ?? '';
  if (/Insurance Verification/i.test(value))
    return [
      'insurance',
      'vob',
      'verification of benefits',
      'eligibility',
      'payer',
      'insurance card',
      'cob',
    ];
  if (/IA Requested|IC Completed/i.test(value))
    return [
      'ia',
      'initial authorization',
      'assessment authorization',
      'payer approval',
      'pending authorization',
      'insurance',
    ];
  if (/IA Approved|IA Scheduled/i.test(value))
    return ['initial assessment', 'assessment', '97151', 'schedule', 'availability', 'appointment'];
  if (/97151|Treatment Plan|Treatment Plan In-review/i.test(value))
    return ['treatment plan', 'tp', 'signature', 'clinical review', '97151', 'assessment report'];
  if (/TA Requested/i.test(value))
    return ['ta', 'treatment authorization', 'payer approval', 'denial', 'appeal', 'resubmission'];
  if (/TA Approved|97153|First Day/i.test(value))
    return ['rbt', 'staffing', 'candidate', 'start date', 'first day', '97153', 'restaffing'];
  return ['intake', 'schedule', 'provider', 'family', 'next step'];
}
