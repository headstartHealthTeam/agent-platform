import type { FreshnessAuthorization, FreshnessVob } from './freshness-source-types.js';
import type { ReportComparisonGate } from './report-comparison-types.js';
import {
  reportClean,
  reportPlainText,
  reportShortDate,
  reportText,
  reportTimestamp,
  reportTruncate,
} from './report-display-values.js';

function latestAuthorization(
  records: readonly FreshnessAuthorization[]
): FreshnessAuthorization | undefined {
  return [...records].sort(
    (a, b) => reportTimestamp(b.LastModifiedDate) - reportTimestamp(a.LastModifiedDate)
  )[0];
}
export function comparisonAuthorization(
  records: readonly FreshnessAuthorization[],
  stage: string
): FreshnessAuthorization {
  const pattern = stage.startsWith('TA')
    ? /treatment auth request|treatment/i
    : /initial(?! consultation)/i;
  return (
    latestAuthorization(
      records.filter((row) => pattern.test(reportText(row.Authorization_Type__c, row.Name)))
    ) ??
    latestAuthorization(records) ??
    {}
  );
}
export function comparisonVob(records: readonly FreshnessVob[]): FreshnessVob {
  return (
    [...records].sort(
      (a, b) =>
        reportTimestamp(reportText(b.Verification_Date__c, b.CreatedDate)) -
        reportTimestamp(reportText(a.Verification_Date__c, a.CreatedDate))
    )[0] ?? {}
  );
}
export function comparisonVobComplete(record: FreshnessVob): boolean {
  return (
    /completed/i.test(record.Verification_Status__c ?? '') &&
    /active/i.test(record.Eligibility_Status__c ?? '')
  );
}
export function comparisonDisplayPayer(value: unknown): string {
  return reportClean(value)
    .replace(/\s*\|\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
export function comparisonPayerLabel(value: unknown): string {
  const valueText = reportClean(value);
  return /^(primary|secondary|other)$/i.test(valueText)
    ? 'the payer'
    : reportText(valueText, 'the payer');
}
export function comparisonDenialDetail(auth: FreshnessAuthorization): string {
  const detail = reportPlainText(
    `${auth.Denial_Reason_Explanation__c ?? ''} ${auth.Notes__c ?? ''}`
  );
  if (/behavioral skills assessment.*missing|missing.*behavioral skills assessment/i.test(detail))
    return 'a missing approvable Behavioral Skills Assessment';
  if (/overlap|same service|another provider/i.test(detail))
    return 'overlapping services with another provider';
  if (/out[- ]of[- ]network|\boon\b/i.test(detail)) return 'an out-of-network determination';
  const sentence = detail
    .split(/(?<=[.!?])\s+/)
    .find((part) => /denied|missing|does not meet|not meet|insufficient|require/i.test(part));
  return sentence ? reportTruncate(sentence.replace(/^.*?denied\s*[-:]?\s*/i, ''), 105) : '';
}
export function comparisonPartialHours(auth: FreshnessAuthorization): {
  requested: string | undefined;
  approved: string | undefined;
} {
  const detail = reportPlainText(
    `${auth.Denial_Reason_Explanation__c ?? ''} ${auth.Notes__c ?? ''}`
  );
  return {
    // eslint-disable-next-line security/detect-unsafe-regex -- Approved numeric grammar; decimal digits are separated by a mandatory literal point, not overlapping repetition.
    requested: /requested (?:services|intensity) of (\d+(?:\.\d+)?) hours? per week/i.exec(
      detail
    )?.[1],
    approved:
      // eslint-disable-next-line security/detect-unsafe-regex -- Same approved decimal grammar; retaining its accepted phrases is a migration requirement.
      /(?:treatment plan consisting of|approved(?: for)?) (\d+(?:\.\d+)?) hours? per week/i.exec(
        detail
      )?.[1],
  };
}
export function comparisonAuthorizationOutcome(
  stage: string,
  auth: FreshnessAuthorization
): string {
  const date = reportShortDate(auth.LastModifiedDate);
  const authType = stage.startsWith('TA') ? 'TA' : 'IA';
  const state = reportText(auth.Insurance_Determination__c, auth.Auth_Status__c).toLowerCase();
  const detail = reportClean(
    `${auth.Denial_Reason_Explanation__c ?? ''} ${auth.Notes__c ?? ''}`
  ).replace(/\s+/g, ' ');
  if (state.includes('withdrawn')) {
    const provider = /continue with\s+([^.;,]+)/i.exec(detail)?.[1]?.trim();
    return `${date}: ${authType} withdrawn after the family chose${provider ? ` to continue with ${provider}` : ' another provider'}; confirm closure or discharge.`;
  }
  if (state.includes('partially approved')) {
    const { requested, approved } = comparisonPartialHours(auth);
    const hours =
      approved && requested ? ` for ${approved} of ${requested} requested weekly hours` : '';
    return `${date}: ${authType} partially approved${hours}; provider acceptance or appeal decision is required.`;
  }
  if (/overlap|same service|another provider/i.test(detail))
    return `${date}: ${authType} denied because the payer shows overlapping services with another provider; correction or appeal is needed.`;
  if (/out[- ]of[- ]network|\boon\b/i.test(detail))
    return `${date}: ${authType} denied as out of network; confirm the appeal, SCA, or alternate-provider path.`;
  if (/missing|insufficient|does not meet|did not meet/i.test(detail)) {
    const reason = comparisonDenialDetail(auth);
    return `${date}: ${authType} denied${reason ? ` because of ${reason}` : ' because payer requirements were not met'}; correction or resubmission is required.`;
  }
  return `${date}: ${authType} ${state || 'authorization decision received'}; Insurance Ops must document the reason and next path.`;
}
export function comparisonGateAction(gate: ReportComparisonGate): string {
  const payer =
    gate.payer && !/^(primary|secondary|tertiary|other)$/i.test(gate.payer)
      ? comparisonDisplayPayer(gate.payer)
      : 'the payer';
  const type = gate.phase === 'treatment' ? 'treatment authorization' : 'initial authorization';
  const determination = gate.determination ?? '';
  if (/additional details required/i.test(determination))
    return `Insurance Ops to identify and submit the additional information requested by ${payer}, then record the submission and next payer follow-up date.`;
  if (/denied/i.test(determination))
    return `Insurance Ops to document the denial reason, assign the correction or appeal path, and record the next submission date with ${payer}.`;
  if (/pending appeal|peer review/i.test(determination))
    return `Insurance Ops to confirm the ${type} review status with ${payer} and record the next determination or follow-up date.`;
  if (/partially approved/i.test(determination))
    return 'Insurance Ops to confirm whether the partial authorization will be accepted or appealed and document the next payer action.';
  if (/withdrawn/i.test(determination))
    return `Insurance Ops to confirm why the ${type} was withdrawn and document whether a corrected request or closure is required.`;
  return `Insurance Ops to confirm the pending ${type} determination with ${payer} and document the payer response and next follow-up date.`;
}
export function comparisonFutureDate(notes: unknown, asOf: Date): string {
  const match =
    // eslint-disable-next-line security/detect-unsafe-regex -- Preserve the approved start-date grammar (fixed optional words and bounded numeric date); do not invent a new phrase/date policy during migration.
    /(?:(?:(?:new|estimated|est\.?|anticipated)\s+)?start(?:ing)?(?:\s+(?:est\.?\s+)?start)?(?:\s+date)?|scheduled(?:\s+for)?)\s*(?:date\s*)?(?:is\s*)?(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i.exec(
      reportClean(notes)
    );
  if (!match?.[1]) return '';
  const [month = NaN, day = NaN, rawYear] = match[1].split('/').map(Number);
  const year = rawYear ? (rawYear < 100 ? 2000 + rawYear : rawYear) : asOf.getUTCFullYear();
  const parsed = new Date(Date.UTC(year, month - 1, day, 12));
  if (!Number.isFinite(parsed.valueOf())) return '';
  return parsed.toISOString().slice(0, 10) >= asOf.toISOString().slice(0, 10) ? match[1] : '';
}
