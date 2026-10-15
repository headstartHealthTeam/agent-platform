import type { RecommendationOpportunity } from './recommendation-types.js';

type OwnerOpportunity = Pick<RecommendationOpportunity, 'csm'> | null | undefined;

export function ownerName(owner: 'CSM', opportunity: OwnerOpportunity): string;
export function ownerName(
  owner: string | null | undefined,
  opportunity: OwnerOpportunity
): string | null | undefined;
export function ownerName(
  owner: string | null | undefined,
  opportunity: OwnerOpportunity
): string | null | undefined {
  if (owner !== 'CSM') return owner;
  return [opportunity?.csm].find(Boolean) ?? 'CSM';
}

interface AccountableActionFields {
  readonly owner?: string | null | undefined;
  readonly text?: string | null | undefined;
  readonly type?: string | null | undefined;
}
export function accountableAction<T extends AccountableActionFields>(
  action: T
): T | (T & { readonly text: string }) {
  const owner = (action.owner ?? '').trim();
  const text = (action.text ?? '').trim();
  if (!owner || !text || action.type === 'No Action') return action;
  if (text.toLowerCase().startsWith(owner.toLowerCase())) return action;
  if (owner !== 'CSM' && /^CSM\s+to\b/i.test(text))
    return { ...action, text: text.replace(/^CSM/i, owner) };
  if (/^(?:Insurance Ops|Intake|RBT Team|Provider|Family)\s+to\b/i.test(text)) return action;
  return { ...action, text: `${owner} to ${text.charAt(0).toLowerCase()}${text.slice(1)}` };
}

export function accountableOwner(
  actionText: string | null | undefined,
  fallbackOwner: string | null | undefined,
  opportunity: OwnerOpportunity
): string | null | undefined {
  const csm = opportunity?.csm;
  const named = /^(.+?)\s+to\b/i.exec(actionText ?? '')?.[1]?.trim();
  if (csm && named?.toLowerCase() === csm.toLowerCase()) return csm;
  if (/^(?:CSM)$/i.test(named ?? '')) return ownerName('CSM', opportunity);
  if (/^Intake Ops$/i.test(named ?? '')) return 'Intake';
  if (/^(?:Insurance Ops|RBT Team|Intake|Scheduling)$/i.test(named ?? '')) return named;
  return ownerName(fallbackOwner, opportunity);
}

export function actionTypeForOwner(
  actionType: string,
  owner: string | null | undefined,
  opportunity: OwnerOpportunity
): string {
  return opportunity?.csm && owner === opportunity.csm && actionType === 'RBT Follow-Up'
    ? 'Provider Outreach'
    : actionType;
}
