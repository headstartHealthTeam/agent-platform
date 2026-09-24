import type { NarrativePacket } from './narrative-types.js';
import { asSentence } from './recommendation-text.js';

const CAPACITY =
  'The next intake milestone cannot proceed until provider capacity or reassignment is resolved.';
const INITIAL_AUTHORIZATION = 'initial authorization';
const TREATMENT_AUTHORIZATION = 'treatment authorization';

function eventGate(
  packet: NarrativePacket,
  context: string,
  unresolved: string
): string | null | undefined {
  const factType = packet.newestUpdate?.factType;
  if (factType === 'tp-ready')
    return 'The treatment plan is ready, but submission for review is not yet recorded.';
  if (
    factType === 'treatment-start-planned' &&
    /first 97153|direct-care|treatment start/.test(context)
  )
    return null;
  if (/provider capacity|provider reassignment|cannot take|can'?t take/.test(unresolved))
    return CAPACITY;
  const messages = new Map([
    [
      'ia-partial',
      'Assessment work remains; completed sessions alone do not establish whole-assessment completion.',
    ],
    ['ia-medical-reschedule', 'A replacement initial-assessment date is still needed.'],
    ['ia-reschedule', 'A replacement initial-assessment date is still needed.'],
    ['provider-capacity', CAPACITY],
    [
      'family-availability',
      'The provider and family must confirm whether services can proceed on a workable schedule.',
    ],
    [
      'rendering-provider-missing',
      'The correct rendering provider must be assigned before the case can advance.',
    ],
    ['rbt-lost', 'Replacement RBT coverage and the first 97153 date remain unconfirmed.'],
    [
      'auth-date-correction',
      'The corrected authorization effective dates must be recorded before the planned service can proceed.',
    ],
  ]);
  return messages.get(factType ?? '');
}

function authorizationGate(
  phase: 'initial' | 'treatment',
  context: string,
  includePartial: boolean
): string {
  const lead = phase === 'initial' ? 'The IA' : 'Treatment';
  const variants: readonly [RegExp, string][] = [
    [/denial|denied/, 'the payer denial is resolved'],
    [/reconsider/, 'the payer completes reconsideration'],
    [/appeal/, 'the payer completes the appeal'],
    [/correction/, 'the corrected authorization is issued'],
  ];
  const condition = variants.find(([pattern]) => pattern.test(context))?.[1];
  if (condition) return `${lead} cannot begin until ${condition}.`;
  if (includePartial && context.includes('partial'))
    return `${lead} cannot begin until the payer resolves the remaining authorization scope.`;
  return `${lead} cannot begin until the ${phase} authorization is approved.`;
}

function explicitAuthorizationGate(
  packet: NarrativePacket,
  process: string,
  unresolved: string
): string | undefined {
  if (
    /headstart review|submit the completed treatment plan|payer submission readiness/.test(
      unresolved
    )
  )
    return 'The completed treatment plan must enter Headstart review before payer submission.';
  const satisfied = packet.authorization?.satisfied === true;
  const initial =
    process === INITIAL_AUTHORIZATION ||
    (satisfied && process.startsWith(INITIAL_AUTHORIZATION)) ||
    /current initial authorization|initial authorization determination|receive .*initial authorization/.test(
      unresolved
    );
  const treatment =
    process === TREATMENT_AUTHORIZATION ||
    (satisfied && process.startsWith(TREATMENT_AUTHORIZATION)) ||
    /current treatment authorization|treatment authorization determination|receive .*treatment authorization/.test(
      unresolved
    );
  if (initial)
    return satisfied
      ? 'The next assessment milestone and current stage still need confirmation.'
      : authorizationGate('initial', unresolved, true);
  if (treatment)
    return satisfied
      ? 'Staffing readiness and the next service milestone still require confirmation.'
      : authorizationGate('treatment', unresolved, true);
  return undefined;
}

function assessmentGate(
  packet: NarrativePacket,
  process: string,
  unresolved: string
): string | undefined {
  if (
    /ta approved|first day of 97153|97153 scheduled/.test(packet.stage.toLowerCase()) ||
    /rbt|97153|staff|candidate|direct-care|treatment start/.test(unresolved)
  )
    return 'The first 97153 service is not yet confirmed by Salesforce or linked billing records.';
  if (
    process.includes('initial authorization approved') ||
    (/ia approved|ia scheduled/.test(packet.stage.toLowerCase()) &&
      !/initial authorization|payer approval|denial|appeal/.test(unresolved))
  ) {
    return /reschedul|cancel/.test(unresolved)
      ? 'A new initial-assessment date is still needed.'
      : 'The initial assessment is not yet confirmed as completed.';
  }
  return undefined;
}

function treatmentPlanGate(context: string, unresolved: string): string {
  if (/ready for payer submission|ready to submit/.test(unresolved))
    return 'The treatment plan is ready, but payer submission is not yet confirmed.';
  if (
    /missing|required (?:parent|provider|treatment-plan)? ?signature|awaiting (?:parent|provider)? ?signature/.test(
      unresolved
    )
  )
    return 'The required treatment-plan signatures must be completed before payer submission.';
  if (/clinical quality|review|correction|edit/.test(context))
    return 'Clinical Quality review must be completed before the plan can be submitted to the payer.';
  return 'The treatment plan must be completed before treatment authorization can be submitted.';
}

export function gateSentence(packet: NarrativePacket): string | null {
  const process = String(packet.processPosition).toLowerCase();
  const unresolved = String(packet.unresolvedGate).toLowerCase();
  const context = `${packet.stage} ${process} ${unresolved}`.toLowerCase();
  const event = eventGate(packet, context, unresolved);
  if (event !== undefined) return event;
  const authorization = explicitAuthorizationGate(packet, process, unresolved);
  if (authorization !== undefined) return authorization;
  const assessment = assessmentGate(packet, process, unresolved);
  if (assessment !== undefined) return assessment;
  if (context.includes(INITIAL_AUTHORIZATION)) return authorizationGate('initial', context, false);
  if (
    context.includes(TREATMENT_AUTHORIZATION) &&
    !process.includes('treatment authorization approved')
  )
    return authorizationGate('treatment', context, true);
  if (/insurance verification|\bvob\b|eligibility/.test(context))
    return 'Insurance verification and required intake documents must be complete before the case can advance.';
  if (/treatment.?plan|clinical quality|signature/.test(context))
    return treatmentPlanGate(context, unresolved);
  if (/reschedul|cancel/.test(context) && /assessment|\bia\b/.test(context))
    return 'A new initial-assessment date is still needed.';
  if (/assessment|\bia\b|initial consultation/.test(context))
    return 'The initial assessment is not yet confirmed as completed.';
  return asSentence(packet.unresolvedGate);
}
