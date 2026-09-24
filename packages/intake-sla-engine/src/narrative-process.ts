import type { NarrativePacket } from './narrative-types.js';

function authorizationPosition(
  packet: NarrativePacket,
  stage: string,
  process: string,
  lead: string
): string | null {
  const satisfied = packet.authorization?.satisfied === true;
  const sentenceLead = `${lead}${lead ? 'the' : 'The'}`;
  if (process === 'initial authorization' || (stage === 'ia requested' && satisfied)) {
    return satisfied
      ? `${sentenceLead} initial authorization prerequisite is satisfied; the next assessment milestone still needs confirmation.`
      : `${sentenceLead} case is waiting on the initial-authorization determination before the initial assessment can begin.`;
  }
  if (process === 'treatment authorization' || (stage === 'ta requested' && satisfied)) {
    return satisfied
      ? `${sentenceLead} treatment authorization prerequisite is satisfied; staffing and service readiness remain separate checks.`
      : `${sentenceLead} treatment plan has reached the payer-authorization phase, and treatment cannot begin until that determination is resolved.`;
  }
  return null;
}

export function processPositionSentence(packet: NarrativePacket): string {
  const stage = packet.stage;
  const normalized = stage.toLowerCase();
  const process = String(packet.processPosition).toLowerCase();
  const lead = packet.opportunityName
    ? `Salesforce currently lists ${packet.opportunityName} in ${stage}; `
    : '';
  const authorization = authorizationPosition(packet, normalized, process, lead);
  if (authorization) return authorization;
  const variants: readonly [RegExp, string][] = [
    [
      /ta approved/,
      `${lead}${lead ? 't' : 'T'}reatment authorization is approved, and the case is waiting on staffing and the first 97153 service.`,
    ],
    [
      /ta requested/,
      `${lead}${lead ? 'the' : 'The'} treatment plan has reached the payer-authorization phase, and treatment cannot begin until that determination is resolved.`,
    ],
    [
      /ia requested/,
      `${lead}${lead ? 'the' : 'The'} case is waiting on the initial-authorization determination before the initial assessment can begin.`,
    ],
    [
      /ia approved|ic completed|ia scheduled/,
      `${lead}${lead ? 'i' : 'I'}nitial authorization is approved, and the case is waiting for the initial assessment to occur or be confirmed complete.`,
    ],
    [
      /97151 started/,
      `${lead}${lead ? 'the' : 'The'} initial-assessment phase is underway or complete, and the case is waiting on the treatment plan.`,
    ],
    [
      /treatment plan in-review/,
      `${lead}${lead ? 'the' : 'The'} treatment plan is in review and must clear the remaining review or submission step before payer determination.`,
    ],
  ];
  return (
    variants.find(([pattern]) => pattern.test(normalized))?.[1] ??
    (packet.opportunityName
      ? `Salesforce currently lists ${packet.opportunityName} in ${stage}.`
      : `The client is currently in ${stage}.`)
  );
}
