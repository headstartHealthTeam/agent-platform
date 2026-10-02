import type { SpecificityIssue } from './specificity-types.js';

export const SPECIFICITY_SEARCH_PATHWAYS = {
  insurance: [
    'Current phase-matched Authorization, Denial Reason Explanation, and dated Authorization notes',
    'Authorization Review and VOB records for the same authorization episode',
    'Insurance Ops tasks/chatter and calls or texts matched by authorization number and payer',
    'Client Intake Slack denial context, then portal conversations',
  ],
  intakeScheduling: [
    'Opportunity IA milestone fields and dated SLA, intake, and on-hold notes',
    'Salesforce-linked 97151 billing or claims records',
    'Provider portal, calls or texts, and provider-qualified Fireflies transcripts',
    'Family replies and tasks/chatter for cancellation, prerequisites, or rescheduling',
  ],
  treatmentPlan: [
    'Clinical Quality status, review dates, edits, barriers, and signature fields',
    'Provider tasks/chatter and dated SLA or intake notes',
    'Provider portal and provider-qualified Fireflies transcripts for drafting or submission status',
    'Confirm whether a completed plan has entered Headstart review before treating it as payer-ready',
  ],
  rbt: [
    'RBT Request and assigned-RBT fields',
    'Ticket Match joined to Talent Acquisition and RBT First Interview by candidate ID',
    'Staffing status, inactive reason, and planned billable start',
    'RBT or provider calls, texts, portal conversations, and provider-qualified Fireflies transcripts',
  ],
  other: [
    'Dated SLA, intake, and on-hold notes',
    'Stage-relevant structured child records',
    'Tasks/chatter, calls/texts, portal, Fireflies, and Slack using the Opportunity identity profile',
  ],
};

export function addSpecificityIssue(
  issues: SpecificityIssue[],
  code: string,
  description: string,
  category: string,
  severity: 'Review' | 'Error' = 'Review'
): void {
  const pathways = new Map(Object.entries(SPECIFICITY_SEARCH_PATHWAYS));
  issues.push({
    code,
    description,
    severity,
    searchPathway: pathways.get(category) ?? SPECIFICITY_SEARCH_PATHWAYS.other,
  });
}
