import { isAdministrativeOnly } from './freshness-administrative.js';
import type { FreshnessCandidateSummary, FreshnessFamily } from './freshness-candidate-types.js';
import { freshnessText } from './freshness-values.js';

function insuranceUpdate(candidate: FreshnessCandidateSummary, summary: string): boolean {
  if (
    /psychological report|diagnostic (?:evaluation|report)|signature/i.test(summary) &&
    /denied|blocked|required|does not meet|doesn['’]?t meet|missing|outstanding/i.test(summary)
  )
    return true;
  return (
    ['Authorization', 'Authorization Review', 'VOB'].includes(candidate.source) ||
    /submitted|approved|approval|denied|pending|awaiting|withdrawn|appeal|reconsider|resubmit|eligib|verification|payer/i.test(
      summary
    )
  );
}
function treatmentPlanUpdate(candidate: FreshnessCandidateSummary, summary: string): boolean {
  if (['Clinical Quality', 'Treatment plan status'].includes(candidate.source)) return true;
  if (
    /status changed from|follow[- ]?up/i.test(summary) &&
    !/submitted|sent for signatures|signed|edits|draft(?:ing)?|clinical review|returned|due|complete(?:d)? on/i.test(
      summary
    )
  )
    return false;
  const milestone =
    /treatment plan|\btp\b/i.test(summary) &&
    /submitted|sent for signatures|parent signed|provider signed|edits|draft(?:ing)?|clinical review|returned|due|complete(?:d)? on|will (?:complete|submit)/i.test(
      summary
    );
  const blocker =
    candidate.source === 'Fireflies' &&
    /parent|family|caregiver|custody|availability|commit/i.test(summary) &&
    /decid|waiting|uncertain|cannot|can't|limited|split|divorc|on the fence|not confident/i.test(
      summary
    );
  return milestone || blocker;
}
function rbtUpdate(candidate: FreshnessCandidateSummary, summary: string): boolean {
  if (candidate.source === 'Authorization' && /treatment authorization.*approved/i.test(summary))
    return true;
  if (candidate.source === 'RBT Request')
    return /recruiting activated|recruiting launched|sourcing|screening|provider interview|closed|cancel(?:ed|led)|assigned/i.test(
      summary
    );
  if (candidate.source === 'RBT First Interview')
    return /interview|screen|qualified|rejected|declined|completed|scheduled|pending/i.test(
      summary
    );
  if (candidate.source === 'Staffing')
    return /active|assigned|billable|start|credential|fingerprint|inactive|closed/i.test(summary);
  return (
    /first 97153|97153 (?:appointment|scheduled)|start(?:ing| date| readiness)|onboarding|coverage fell through|restaff|hired|declined|no longer available/i.test(
      summary
    ) &&
    /\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2}|scheduled|confirmed|missing|pending|incomplete|hired|fell through|declined|unavailable|start(?:ing|s|ed)?\s+(?:next|this)\s+(?:week|month)|start(?:ing|s|ed)?\s+(?:on\s+|)(?:monday|tuesday|wednesday|thursday|friday)/i.test(
      summary
    )
  );
}
export function freshnessSchedulingCleared(summary: string): boolean {
  return (
    /insurance.{0,40}(?:resolved|cleared)|(?:resolved|cleared).{0,40}insurance/i.test(summary) &&
    /can|ready|proceed|schedule/i.test(summary)
  );
}
function schedulingUpdate(candidate: FreshnessCandidateSummary, summary: string): boolean {
  if (candidate.source === 'Authorization' && /initial authorization.*approved/i.test(summary))
    return true;
  if (
    /status changed from|follow[- ]?up/i.test(summary) &&
    !/scheduled (?:for|on)|appointment (?:is|was)|family (?:declined|requested|confirmed)|provider (?:cannot|can|confirmed)|documents? (?:missing|received)|availability/i.test(
      summary
    )
  )
    return false;
  const familyDelay =
    /(?:parent|family|mom|mother|dad|father|caregiver|guardian)/i.test(summary) &&
    /assessment|packet|form|ables|vineland|basc/i.test(summary) &&
    /slow|unresponsive|not responding|without responding|hasn['’]?t responded|haven['’]?t heard back|incomplete|not completed|waiting/i.test(
      summary
    );
  const unresponsive =
    /(?:no|not (?:received|gotten)|haven['’]?t (?:received|gotten)).{0,24}responses?\s+from|(?:client|family|parent|mom|mother|dad|father|caregiver|guardian).{0,24}(?:unresponsive|not responding|hasn['’]?t responded)/i.test(
      summary
    );
  return (
    familyDelay ||
    unresponsive ||
    freshnessSchedulingCleared(summary) ||
    /scheduled (?:for|on)|appointment (?:is|was)|\bIA\b.*\d{1,2}\/\d{1,2}|\bIC\b.*\d{1,2}\/\d{1,2}|family (?:declined|requested|confirmed|is unavailable)|provider (?:cannot|can|confirmed)|can['’]?t intake|cannot intake|documents? (?:missing|received)|(?:need|needs|missing|waiting for).*(?:diagnostic|evaluation|referral|school report)|coverage correction|interpreter|hospital|illness/i.test(
      summary
    )
  );
}
export function isConcreteOperationalUpdate(
  family: FreshnessFamily,
  candidate: FreshnessCandidateSummary | null | undefined
): boolean {
  if (!candidate || candidate.kind === 'search-bundle') return false;
  const summary = freshnessText(candidate.summary);
  if (!summary || candidate.matchQuality === 'Weak' || isAdministrativeOnly(summary)) return false;
  if (candidate.operationalFacts?.length || candidate.source === 'SLA update') return true;
  if (family === 'insurance') return insuranceUpdate(candidate, summary);
  if (family === 'treatmentPlan') return treatmentPlanUpdate(candidate, summary);
  if (family === 'rbt') return rbtUpdate(candidate, summary);
  return schedulingUpdate(candidate, summary);
}
export function isGenericOperationalPlaceholder(value = ''): boolean {
  return (
    /stage-relevant operational update was recorded/i.test(value) ||
    /unresolved gate is described in the sla summary/i.test(value)
  );
}
