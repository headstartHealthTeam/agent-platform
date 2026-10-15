export const TRANSCRIPT_INTERPRETATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'matchedOpportunityId',
          'synthesizedFact',
          'gateImpact',
          'substantive',
          'relationship',
          'supportSpan',
          'actionOwner',
          'actionType',
          'recommendedAction',
          'milestoneDate',
          'followUpDate',
          'category',
          'issueKey',
          'factType',
          'milestoneKind',
        ],
        properties: {
          matchedOpportunityId: { type: ['string', 'null'] },
          synthesizedFact: { type: 'string' },
          gateImpact: { type: 'string' },
          substantive: { type: 'boolean' },
          relationship: {
            type: 'string',
            enum: ['Supports', 'Conflicts', 'Neutral'],
          },
          supportSpan: { type: 'string' },
          actionOwner: { type: 'string' },
          actionType: {
            type: 'string',
            enum: [
              'Provider Outreach',
              'Family Outreach',
              'Insurance Follow-Up',
              'RBT Follow-Up',
              'Salesforce Update',
              'Monitor',
              'Close / Discharge',
              'No Action',
            ],
          },
          recommendedAction: { type: 'string' },
          milestoneDate: { type: ['string', 'null'] },
          followUpDate: { type: ['string', 'null'] },
          category: { type: ['string', 'null'] },
          issueKey: { type: ['string', 'null'] },
          factType: { type: ['string', 'null'] },
          milestoneKind: { type: ['string', 'null'], enum: ['planned', 'observed', null] },
        },
      },
    },
  },
};

export const INTERPRETER_INSTRUCTIONS = `
You interpret one bounded operational conversation segment for an Intake SLA.
Return only facts that change understanding of the supplied current process gate.
Do not summarize the whole meeting. Do not determine or change the process gate.
Do not use an existing SLA action item. Do not infer missing documents, signatures,
candidates, appointments, payer outcomes, or completion without explicit support.
Distinguish planned, completed, canceled, rescheduled, provider-reported, and
structured-confirmed milestones. A future milestone is not a completed event.
Each finding must commit to one explicit operational fact: identify the actor,
the current state, the concrete reason when stated, and the relevant date.
For treatment plans, distinguish not started, drafting, ready, submitted, and
returned for edits. For staffing, distinguish recruiting, proposed, interviewed,
matched, hired, start planned, and service completed. Do not write placeholders
such as "an update was recorded," "activity was recorded," or lists of possible
next paths. Use synthesized human-readable language and never reproduce long raw wording.
Every substantive finding requires a short exact support span from the segment.
Set matchedOpportunityId to the supplied target Opportunity ID. Never select an
Opportunity outside the supplied provider roster. If the segment is ambiguous,
return no finding rather than attributing another roster client's update.
Return no findings when the segment does not contain a target-client operational fact.
Supply category, issueKey and factType together when the meaning is supported;
these are interpretation, not keywords for the renderer to rediscover. Categories
include intakeScheduling, insurance, treatmentPlan and rbt. Reuse established
fact types where applicable (for example tp-resubmitted-for-review with issueKey
clinical-review, or rbt-recruiting-paused with issueKey rbt-staffing). Otherwise
use ai-interpreted-conversation with the supported category and current issue;
do not invent a new lifecycle rule. Null all three when the category is uncertain.
Set milestoneKind to planned only for an explicit planned event, observed for
a reported event/status date, or null when no date meaning is established.
A follow-up reminder or pending-status date is not a planned appointment.
An exact or approved roster-matched client named in a short list may inherit one
explicit shared status stated for that list (for example, "A, B, and C are pending
scheduling"). Do not inherit nearby details that apply to only another listed client.
`.trim();
