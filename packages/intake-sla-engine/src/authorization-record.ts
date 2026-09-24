import type {
  AuthorizationRecord,
  AuthorizationState,
  DenialDetails,
} from './authorization-types.js';

const TERMINAL = new Set(['cancelled', 'canceled', 'duplicate', 'void', 'voided']);
const UNRESOLVED_PATTERNS: readonly (readonly [RegExp, AuthorizationState])[] = [
  [/additional details/, 'Additional Details Required'],
  [/pending appeal|appeal pending/, 'Appeal'],
  [/peer review/, 'Peer Review'],
  [/clinical review|pending review/, 'Pending Review'],
  [/partially approved|partial approval/, 'Partial Approval'],
  [/denied|denial/, 'Denied'],
  [/withdrawn/, 'Withdrawn'],
  [/pending/, 'Pending'],
];
const UNRESOLVED_PRIORITIES = new Map<string, number>([
  ['Conflict', 9],
  ['Denied', 8],
  ['Appeal', 7],
  ['Peer Review', 6],
  ['Additional Details Required', 5],
  ['Partial Approval', 4],
  ['Withdrawn', 3],
  ['Pending Review', 2],
  ['Pending', 1],
]);

export function normalizeAuthorization(value: string | null = ''): string {
  // Preserve the approved core's null rejection; source projections may resolve nulls first.
  if (value === null) throw new TypeError("Cannot read properties of null (reading 'toLowerCase')");
  return value.toLowerCase().trim();
}

export function unresolvedState(record: AuthorizationRecord): AuthorizationState | null {
  const value = normalizeAuthorization(`${record.determination ?? ''} ${record.status ?? ''}`);
  return UNRESOLVED_PATTERNS.find(([pattern]) => pattern.test(value))?.[1] ?? null;
}

export function authorizationPhase(record: AuthorizationRecord): string {
  const type = normalizeAuthorization(record.authorizationType ?? record.type);
  if (type === 'initial') return 'Initial';
  if (type === 'treatment') return 'Treatment';
  if (type === 'initial consultation') return 'Initial Consultation';
  if (type === 'treatment auth request') return 'Treatment Plan Review';
  return 'Other';
}

export function authorizationRecordDate(
  record: AuthorizationRecord,
  phase: string
): string | Date | undefined {
  const phaseDates =
    phase === 'Initial'
      ? [record.initialApprovalDate, record.initialSubmissionDate]
      : [record.treatmentApprovalDate, record.treatmentSubmissionDate];
  return [...phaseDates, record.lastSubstantiveDate, record.createdDate]
    .filter((value): value is string | Date => Boolean(value))
    .sort((left, right) => new Date(right).valueOf() - new Date(left).valueOf())[0];
}

export function authorizationCurrent(record: AuthorizationRecord, asOf: string | Date): boolean {
  const at = new Date(asOf);
  if (record.superseded) return false;
  if (
    TERMINAL.has(normalizeAuthorization(record.status)) ||
    TERMINAL.has(normalizeAuthorization(record.determination))
  )
    return false;
  // Service windows constrain resolved coverage, not an operative denial/appeal/request.
  if (unresolvedState(record) !== null) return true;
  if (record.authStartDate && new Date(record.authStartDate) > at) return false;
  if (record.authExpirationDate && new Date(record.authExpirationDate) < at) return false;
  return record.active !== false && normalizeAuthorization(record.status) !== 'inactive';
}

export function sameAuthorizationEpisode(
  record: AuthorizationRecord,
  newest: AuthorizationRecord,
  phase: string
): boolean {
  if (record.id === newest.id) return true;
  if (
    record.authorizationNumber &&
    newest.authorizationNumber &&
    record.authorizationNumber === newest.authorizationNumber
  )
    return true;
  if (
    record.payer &&
    newest.payer &&
    normalizeAuthorization(record.payer) !== normalizeAuthorization(newest.payer)
  )
    return false;
  const recordTime = new Date(authorizationRecordDate(record, phase) ?? 0).valueOf();
  const newestTime = new Date(authorizationRecordDate(newest, phase) ?? 0).valueOf();
  return Math.abs(newestTime - recordTime) <= 24 * 60 * 60 * 1000;
}

export function authorizationCoverageKey(record: AuthorizationRecord): string {
  return normalizeAuthorization(
    record.insurancePosition ?? record.insuranceSlot ?? record.clientInsurance ?? 'unspecified'
  );
}

export function denialDetails(records: readonly AuthorizationRecord[]): DenialDetails {
  const record =
    records.find((item) =>
      /denied|denial/i.test(
        `${item.determination ?? ''} ${item.status ?? ''} ${item.denialReason ?? ''} ${item.denialExplanation ?? ''}`
      )
    ) ?? records.find((item) => Boolean(item.denialReason) || Boolean(item.denialExplanation));
  return {
    denialOccurred: record !== undefined,
    denialReason: record?.denialReason ?? null,
    denialExplanation: record?.denialExplanation ?? null,
    denialRecordId: record?.id ?? null,
  };
}

export function unresolvedPriority(state: string | null): number {
  return UNRESOLVED_PRIORITIES.get(state ?? '') ?? 0;
}

export function treatmentPlanEnteredReview(record: AuthorizationRecord): boolean {
  return (
    normalizeAuthorization(record.authorizationType ?? record.type) === 'treatment auth request' &&
    Boolean(record.portalSubmissionDate)
  );
}

export function treatmentAuthorizationSubmitted(record: AuthorizationRecord): boolean {
  return (
    normalizeAuthorization(record.authorizationType ?? record.type) === 'treatment' &&
    Boolean(record.treatmentSubmissionDate)
  );
}
