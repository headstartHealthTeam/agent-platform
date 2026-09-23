export const DEFAULT_PUBLICATION_MAX_AGE_MS = 2 * 60 * 60 * 1000;

/** A write lease only: expired gates do not disable read-only reconciliation or final readback. */
export function assertPublicationGateFreshness(
  gate?: { readonly evaluatedAt?: string | null | undefined } | null,
  now = Date.now()
): true {
  const age = now - Date.parse(String(gate?.evaluatedAt));
  if (!Number.isFinite(age) || age < 0 || age > DEFAULT_PUBLICATION_MAX_AGE_MS)
    throw new Error(
      'Publication gate expired, future-dated, or missing a valid timestamp; refresh all required checks before resuming'
    );
  return true;
}
export function publicationTimestamp(value: string | null | undefined, label: string): number {
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) throw new Error(`${label} has no valid timestamp`);
  return parsed;
}
export function assertPublicationInputFreshness(
  value: string | null | undefined,
  label: string,
  now: string,
  maxAgeMs: number
): void {
  const age =
    publicationTimestamp(value, label) - publicationTimestamp(now, 'Publication gate time');
  if (age > 0) throw new Error(`${label} is future-dated`);
  if (Math.abs(age) > maxAgeMs) throw new Error(`${label} is older than two hours`);
}
