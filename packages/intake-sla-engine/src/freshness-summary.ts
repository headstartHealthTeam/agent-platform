import type {
  FreshnessAuthorizationSummary,
  FreshnessCandidateSummary,
  FreshnessFamily,
} from './freshness-candidate-types.js';
import { freshnessSchedulingCleared } from './freshness-classification.js';
import { freshnessText } from './freshness-values.js';
import { firstEvidenceText } from './source-evidence-context.js';

function insuranceSummary(
  summary: string,
  gate: FreshnessAuthorizationSummary | null | undefined
): string | null {
  const phase = gate?.phase === 'treatment' ? 'Treatment' : 'Initial';
  const payer =
    gate?.payer && !/^(primary|secondary|tertiary|other)$/i.test(gate.payer)
      ? ` with ${gate.payer}`
      : '';
  if (/additional details required/i.test(summary))
    return `${phase} authorization requires additional payer information${payer}.`;
  if (/pending appeal/i.test(summary))
    return `${phase} authorization appeal remains pending${payer}.`;
  if (/peer review/i.test(summary)) return `${phase} authorization is in peer review${payer}.`;
  if (/clinical review/i.test(summary))
    return `${phase} authorization is in clinical review${payer}.`;
  if (/partially approved/i.test(summary))
    return `${phase} authorization was partially approved${payer}; the unapproved services and next payer action are not documented.`;
  if (/denied/i.test(summary))
    return `${phase} authorization was denied${payer}; the denial basis and next payer action are not documented.`;
  if (/withdrawn/i.test(summary))
    return `${phase} authorization was withdrawn${payer}; the next payer action is not documented.`;
  if (
    /awaiting (?:ia|ta|initial|treatment)?\s*(?:auth(?:orization)?\s*|)approval|pending|still with insurance/i.test(
      summary
    )
  )
    return `${phase} authorization remains pending${payer}.`;
  if (/submitted|sent via|sent to/i.test(summary))
    return `${phase} authorization was submitted${payer}; a determination is not recorded.`;
  if (/vob|eligib|verification/i.test(summary)) return '';
  // The approved insurance branch falls through to scheduling wording when none match.
  return null;
}
function treatmentPlanSummary(summary: string): string {
  if (/custody|divorc|guardian|family situation/i.test(summary))
    return 'The provider and CSM identified a family or custody constraint that may prevent a workable care plan.';
  if (/parent signed/i.test(summary) && /provider signed/i.test(summary))
    return 'The treatment plan has both required signatures and is awaiting the next submission or review milestone.';
  if (/parent signed/i.test(summary))
    return 'The parent signed the treatment plan; the remaining provider or submission milestone is unresolved.';
  if (/provider signed/i.test(summary))
    return 'The provider signed the treatment plan; the remaining parent or submission milestone is unresolved.';
  if (
    /(?:submit|submission|send|sent).{0,45}(?:for|to) (?:headstart |clinical quality )?clinical review|(?:encourage|ask|waiting on).{0,45}(?:provider|bcba).{0,45}(?:submit|send).{0,45}(?:treatment plan|\btp\b)/i.test(
      summary
    )
  )
    return 'The provider has not yet submitted the treatment plan for clinical review.';
  if (/submitted/i.test(summary))
    return 'The treatment plan was reported submitted; payer or clinical disposition remains the next gate.';
  if (/clinical review|in review/i.test(summary))
    return 'The treatment plan remains in clinical review.';
  return '';
}
function rbtSummary(candidate: FreshnessCandidateSummary, summary: string): string {
  if (/family.{0,60}(?:asked|requested|wants|agreed|plans).{0,35}(?:start|begin)/i.test(summary)) {
    const date = candidate.operationalFacts?.find((fact) =>
      Boolean(fact.milestoneDate)
    )?.milestoneDate;
    return date
      ? `The family requested a treatment start on ${date}; the first 97153 appointment is not yet recorded.`
      : 'The family requested a later treatment start; the first 97153 appointment is not yet recorded.';
  }
  if (/later start window|extended start/i.test(summary))
    return 'The family requested a later treatment start; the first 97153 appointment is not yet recorded.';
  if (/first 97153|97153 appointment/i.test(summary) && /scheduled/i.test(summary))
    return 'The first 97153 appointment was reported scheduled; completion remains to be confirmed.';
  if (candidate.candidateName && /hired/i.test(summary))
    return `${candidate.candidateName} is hired and proposed to this case, but assignment and the first 97153 appointment are not yet confirmed.`;
  if (candidate.candidateName && /interview/i.test(summary))
    return `${candidate.candidateName} is at ${firstEvidenceText(candidate.candidateStep) ?? 'the interview step'}; the staffing decision and treatment start remain unconfirmed.`;
  if (/hired/i.test(summary))
    return 'An RBT was hired, but the first 97153 appointment is not yet confirmed.';
  if (/interview/i.test(summary))
    return 'An RBT candidate is in the interview process; staffing and treatment start remain unconfirmed.';
  if (/restaff|coverage fell through|no longer available|declined|unavailable/i.test(summary))
    return 'RBT coverage changed or fell through; replacement staffing and the treatment start date remain unresolved.';
  return '';
}
function schedulingSummary(summary: string): string {
  if (/interpreter|translation service|language support/i.test(summary))
    return 'Interpreter or translation support is required before the initial assessment can be scheduled.';
  if (freshnessSchedulingCleared(summary))
    return 'The insurance prerequisite was reported resolved; the provider can now schedule the initial assessment with the family.';
  if (/scheduled (?:for|on)|appointment (?:is|was)/i.test(summary))
    return 'An assessment or intake appointment was reported scheduled; completion remains to be confirmed.';
  if (
    /documents? (?:missing|required|received)|diagnostic|referral|school report|packet|vineland|basc/i.test(
      summary
    )
  )
    return '';
  if (/family (?:declined|requested|confirmed|is unavailable)|custody|availability/i.test(summary))
    return 'A family availability or care-plan constraint was recorded; readiness and timing remain unresolved.';
  return '';
}
export function synthesizedFact(
  family: FreshnessFamily,
  candidate: FreshnessCandidateSummary | null | undefined,
  authorizationGate?: FreshnessAuthorizationSummary | null
): string {
  if (!candidate) return '';
  const operational = candidate.operationalFacts?.[0];
  if (operational?.summary) return operational.summary;
  const summary = freshnessText(candidate.summary);
  if (candidate.source === 'Authorization' && /treatment authorization.*approved/i.test(summary))
    return 'Treatment authorization was approved; the first 97153 appointment remains to be scheduled.';
  if (candidate.source === 'Authorization' && /initial authorization.*approved/i.test(summary))
    return 'Initial authorization was approved; a committed assessment date remains to be confirmed.';
  if (family === 'insurance') {
    const result = insuranceSummary(summary, authorizationGate);
    if (result !== null) return result;
  }
  if (family === 'treatmentPlan') return treatmentPlanSummary(summary);
  if (family === 'rbt') return rbtSummary(candidate, summary);
  return schedulingSummary(summary);
}
