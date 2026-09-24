import type { GateContext } from './gate-context.js';
import type { IdentityProfile } from './identity-profile.js';

export interface SourceEvidenceContext {
  readonly profile: Pick<IdentityProfile, 'opportunityId'> &
    Partial<Pick<IdentityProfile, 'currentCsm' | 'stage'>>;
  readonly gate?: GateContext | null;
  readonly asOf: string;
}
export function evidenceOwner(profile: SourceEvidenceContext['profile']): string {
  const csm = profile.currentCsm;
  const name: unknown = typeof csm === 'object' && csm !== null ? csm['name'] : undefined;
  const hasName = Boolean(name);
  if (!hasName) return 'CSM';
  if (typeof name !== 'string') throw new Error('Evidence action owner must be text');
  return name;
}
export function firstEvidenceText(
  ...values: readonly (string | null | undefined)[]
): string | undefined {
  return values.find((value): value is string => Boolean(value));
}
export function requiredEvidenceValue(value: string | null | undefined, field: string): string {
  if (!value) throw new Error(`EvidenceEvent missing ${field}`);
  return value;
}
export function latestEvidenceDate(
  ...values: readonly (string | null | undefined)[]
): string | undefined {
  return values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.valueOf()))
    .sort((left, right) => right.valueOf() - left.valueOf())[0]
    ?.toISOString();
}
