import { createHash } from 'node:crypto';

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry: unknown): unknown => canonicalValue(entry));
  if (value !== null && typeof value === 'object') {
    const entries: [string, unknown][] = Object.entries(value);
    entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return Object.fromEntries(entries.map(([key, entry]) => [key, canonicalValue(entry)]));
  }
  return value;
}

export function canonicalJson(value: unknown): string | undefined {
  return JSON.stringify(canonicalValue(value));
}

export function sha256Json(value: unknown): string {
  const canonical = canonicalJson(value);
  if (canonical === undefined) throw new Error('A serializable JSON fingerprint input is required');
  return createHash('sha256').update(canonical).digest('hex');
}
