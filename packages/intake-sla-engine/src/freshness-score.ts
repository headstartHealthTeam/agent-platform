import type { FreshnessCandidateSummary, FreshnessFamily } from './freshness-candidate-types.js';
import { freshnessSchedulingCleared } from './freshness-classification.js';
import { freshnessText } from './freshness-values.js';

const OPPORTUNITY_SOURCE = 'Salesforce Opportunity / SLA';
const SLA_NOTE_SOURCE = 'SLA update';

function insuranceScore(source: string, summary: string): number {
  if (
    /psychological report|diagnostic (?:evaluation|report)|signature/i.test(summary) &&
    /denied|blocked|required|does not meet|doesn['’]?t meet|missing|outstanding/i.test(summary)
  )
    return 15;
  if (source === 'VOB' || source === OPPORTUNITY_SOURCE) return 10;
  if (/authorization|\bauth\b|payer|approval|denial|appeal|pending|submitted/i.test(summary))
    return source === SLA_NOTE_SOURCE ? 10 : 8;
  return /vob|eligib|verification|insurance card|cob/i.test(summary) ? 7 : 1;
}
function treatmentPlanScore(source: string, summary: string): number {
  if (['Clinical Quality', 'Treatment plan status'].includes(source)) return 12;
  if (source === OPPORTUNITY_SOURCE) return 10;
  if (/treatment plan|\btp\b|signature|clinical review/i.test(summary))
    return source === SLA_NOTE_SOURCE ? 10 : 9;
  return 1;
}
function rbtScore(source: string, summary: string): number {
  if (source === 'Linked Billing / Claims') return 16;
  if (source === OPPORTUNITY_SOURCE) return 10;
  if (/\brbt\b|staff|candidate|interview|start|97153/i.test(summary))
    return source === SLA_NOTE_SOURCE ? 10 : 9;
  return 1;
}
function schedulingScore(source: string, summary: string): number {
  if (source === 'Linked Billing / Claims') return 13;
  if (freshnessSchedulingCleared(summary)) return 15;
  if (source === OPPORTUNITY_SOURCE) return 10;
  if (
    source === SLA_NOTE_SOURCE &&
    /assessment|schedule|appointment|family|provider|document|packet|availability/i.test(summary)
  )
    return 8;
  if (source === 'Authorization' && /initial authorization.*approved/i.test(summary)) return 6;
  return /assessment|schedule|appointment|family|provider|document|packet|availability|respond|response|unresponsive/i.test(
    summary
  )
    ? 8
    : 1;
}
export function processGateScore(
  family: FreshnessFamily,
  candidate: FreshnessCandidateSummary
): number {
  const summary = freshnessText(candidate.summary);
  if (
    family === 'insurance' &&
    ['Authorization', 'Authorization Review'].includes(candidate.source)
  )
    return 15;
  if (
    family === 'rbt' &&
    (['RBT Request', 'Staffing', 'Candidate / Ticket Match', 'RBT First Interview'].includes(
      candidate.source
    ) ||
      (candidate.source === 'Authorization' && /treatment authorization.*approved/i.test(summary)))
  )
    return 15;
  const facts = candidate.operationalFacts ?? [];
  const relevance = Math.max(0, ...facts.map((fact) => fact.relevance ?? 0));
  if (
    facts.some((fact) =>
      [
        'ia-partial',
        'ia-medical-reschedule',
        'ia-reschedule',
        'provider-capacity',
        'rendering-provider-missing',
        'rbt-lost',
        'auth-date-correction',
      ].includes(fact.type)
    )
  )
    return 15;
  if (relevance) return relevance;
  if (family === 'insurance') return insuranceScore(candidate.source, summary);
  if (family === 'treatmentPlan') return treatmentPlanScore(candidate.source, summary);
  if (family === 'rbt') return rbtScore(candidate.source, summary);
  return schedulingScore(candidate.source, summary);
}
