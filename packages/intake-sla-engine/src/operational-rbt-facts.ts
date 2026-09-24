import { isoDate, nextBusinessDay } from './dates.js';
import { hasOperationalText as has } from './operational-fact-context.js';
import type { OperationalFact, OperationalFactContext } from './operational-fact-context.js';

const PROVIDER_OUTREACH = 'Provider Outreach';
const RBT_FOLLOW_UP = 'RBT Follow-Up';

interface RbtSignals {
  readonly explicitTreatmentStart: boolean;
  readonly futureOrConditionalStart: boolean;
  readonly readyForDirectCareScheduling: boolean;
  readonly plannedFirstDay: boolean;
  readonly conditionalCurrentRbtStart: boolean;
}
function rbtSignals(context: OperationalFactContext): RbtSignals {
  const { text, value, date } = context;
  const explicitTreatmentStart =
    has(value, /\b97153\b.{0,35}\b(occurred|completed|started|began)\b/) ||
    has(
      value,
      /\b(first (?:direct care )?session|first day of (?:treatment|services))\b.{0,35}\b(occurred|completed|started|began)\b/
    ) ||
    has(
      value,
      /\b(treatment|direct care|aba services|97153 services)\b.{0,25}\b(started|began|commenced)\b/
    ) ||
    has(
      value,
      /\b(started|began|commenced)\b.{0,25}\b(treatment|direct care|aba services|97153 services)\b/
    );
  const futureOrConditionalStart =
    has(
      value,
      /\b(can|could|will|would|ready to|on track to|going to|plan(?:ned)? to|trying to)\b.{0,35}\b(start|begin|commence)\b/
    ) || has(value, /\b(start|begin|commence)\b.{0,25}\b(soon|once|after|when|if|pending)\b/);
  const readyForDirectCareScheduling =
    has(
      value,
      /\b(good|cleared|approved|ready)\b.{0,35}\b(schedule|scheduling|start|begin)\b.{0,35}\b(direct care|97153|treatment|services)\b/
    ) ||
    has(
      value,
      /\b(direct care|97153|treatment|services)\b.{0,35}\b(good|cleared|approved|ready)\b.{0,35}\b(schedule|scheduling|start|begin)\b/
    );
  const requestedStartWithDate =
    has(
      value,
      /\b(family|parent|caregiver|provider|rbt)\b.{0,45}\b(asked|requested|wants|would like|plans|agreed|expects|will)\b.{0,35}\b(start|begin)\b/
    ) ||
    has(
      value,
      /\b(asked|requested|wants|would like|plans|agreed|expects|will)\b.{0,35}\b(start|begin)\b.{0,45}\b(family|parent|caregiver|provider|rbt)\b/
    );
  const startLanguageHasDate =
    has(
      text,
      /\b(?:first day|start date|first session|97153)\b.{0,30}\b(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])\b/i
    ) ||
    has(
      text,
      /\b(?:(?:start|begin)|(?:start|begin)\s+(?:services?|treatment|direct care))\b.{0,20}\bon\s+(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])\b/i
    ) ||
    has(value, /\b(?:start|begin)\b.{0,25}\b(?:on|for) (?:the )?\d{1,2}(?:st|nd|rd|th)\b/) ||
    has(
      text,
      /\b(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])\b.{0,20}\b(?:first day|start date|first session|97153)\b/i
    );
  const plannedFirstDay = Boolean(
    date &&
    startLanguageHasDate &&
    (has(value, /\b(first day|start date|first session|97153)\b/) || requestedStartWithDate)
  );
  const conditionalCurrentRbtStart =
    plannedFirstDay &&
    has(
      value,
      /\b(?:potentially|tentative|tentatively|pending|if|assuming|utilizing current rbt|using current rbt)\b/
    );
  return {
    explicitTreatmentStart,
    futureOrConditionalStart,
    readyForDirectCareScheduling,
    plannedFirstDay,
    conditionalCurrentRbtStart,
  };
}
function candidateStepFromText(value = ''): string | null {
  const steps: readonly (readonly [RegExp, string])[] = [
    [/\bbackground (?:check|screening)\b/, 'background screening'],
    [/\bsecond interview|2nd interview\b/, 'second interview'],
    [/\bfirst interview|1st interview\b/, 'first interview'],
    [/\boffer accepted|accepted (?:the )?offer\b/, 'offer accepted'],
    [/\bpending offer|offer pending\b/, 'offer pending'],
    [/\boffer (?:extended|sent)\b/, 'offer extended'],
    [/\bprovider interview\b/, 'provider interview'],
    [/\bscreening\b/, 'screening'],
    [/\bcandidate proposed|proposed candidate\b/, 'proposed to the provider'],
  ];
  return steps.find(([pattern]) => pattern.test(value))?.[1] ?? null;
}
function plannedStartDescription(
  context: OperationalFactContext,
  conditional: boolean
): Pick<
  OperationalFact,
  'type' | 'summary' | 'gateImpact' | 'owner' | 'actionType' | 'action' | 'relevance'
> {
  const date = String(context.date);
  if (conditional)
    return {
      type: 'treatment-start-conditional',
      summary: `The family tentatively requested a ${date} start, contingent on using the current RBT; staffing and the first 97153 appointment remain unconfirmed.`,
      gateImpact: `Tentative ${date} start depends on confirming the current RBT`,
      owner: 'RBT Team',
      actionType: RBT_FOLLOW_UP,
      action: `RBT Team to confirm whether the current RBT can cover the case, then have the CSM record the agreed ${date} first 97153 appointment.`,
      relevance: 12,
    };
  if (context.datePassed)
    return {
      type: 'treatment-start-planned',
      summary: `The planned first direct-care date of ${date} passed without a completed 97153 appointment.`,
      gateImpact: `Planned first 97153 date of ${date} passed; treatment start remains unconfirmed`,
      owner: 'CSM',
      actionType: PROVIDER_OUTREACH,
      action: `CSM to confirm whether the ${date} start occurred and record the completed or replacement 97153 date.`,
      relevance: 10,
    };
  return {
    type: 'treatment-start-planned',
    summary: `The provider reports the first direct-care service is planned for ${date}, but no appointment is recorded in Salesforce; it has not yet been entered in Aloha.`,
    gateImpact: `First 97153 service is planned for ${date}`,
    owner: 'CSM',
    actionType: 'Monitor',
    action: `CSM to ensure the ${date} first 97153 appointment is entered for Aloha synchronization, confirm it appears in Salesforce, and verify completion after the service date.`,
    relevance: 10,
  };
}
function addRbtStart(context: OperationalFactContext, signals: RbtSignals): void {
  const { date, datePassed, asOf, add } = context;
  const {
    explicitTreatmentStart,
    futureOrConditionalStart,
    readyForDirectCareScheduling,
    plannedFirstDay,
    conditionalCurrentRbtStart,
  } = signals;
  if (explicitTreatmentStart && !futureOrConditionalStart) {
    add({
      type: 'treatment-started',
      summary:
        'The provider reports direct-care treatment started, but the structured first-service record must be confirmed.',
      gateImpact: 'Provider-reported treatment start requires structured verification',
      owner: 'CSM',
      actionType: 'Salesforce Update',
      action:
        'CSM to verify the first 97153 service date in Salesforce or linked billing and correct Salesforce if needed.',
      relevance: 10,
      kind: 'TREATMENT_REPORTED_STARTED',
    });
  } else if (plannedFirstDay) {
    add({
      ...plannedStartDescription(context, conditionalCurrentRbtStart),
      kind: 'TREATMENT_START_PLANNED',
      plannedDate: date,
      milestoneDate: date,
      followUpDate: datePassed ? nextBusinessDay(asOf) : date,
    });
  } else if (readyForDirectCareScheduling) {
    add({
      type: 'treatment-ready-to-schedule',
      summary:
        'The client is cleared to schedule direct-care treatment, but the first 97153 appointment date is not yet confirmed.',
      gateImpact: 'Direct care is cleared for scheduling; first 97153 date remains unconfirmed',
      owner: 'CSM',
      actionType: PROVIDER_OUTREACH,
      action:
        'CSM to coordinate the first 97153 appointment with the provider and family and record the confirmed date.',
      milestoneDate: null,
      followUpDate: nextBusinessDay(asOf),
      relevance: 10,
    });
  }
}
function addStartCoordination(context: OperationalFactContext, signals: RbtSignals): void {
  const { value, asOf, add } = context;
  const { readyForDirectCareScheduling, plannedFirstDay } = signals;
  const providerStartCoordination =
    !plannedFirstDay &&
    !readyForDirectCareScheduling &&
    ((has(
      value,
      /\b(?:provider|bcba|csm)\b.{0,50}\b(?:follow(?:ing)? up|outreach|contact(?:ed|ing)?|coordinate|schedule)\b/
    ) &&
      has(value, /\b(?:family|start date|first 97153|direct care|schedule|scheduling)\b/)) ||
      (has(value, /\b(?:handbook|onboarding)\b/) &&
        has(value, /\b(?:rbt|candidate)\b/) &&
        has(value, /\b(?:schedule|start|this week|next week)\b/)));
  if (providerStartCoordination) {
    add({
      type: 'treatment-start-coordination',
      summary: has(value, /\b(?:handbook|onboarding)\b/)
        ? 'Provider onboarding with the assigned RBT is underway, but the first 97153 appointment date is not yet confirmed.'
        : 'The provider is coordinating with the family on a start date, but the first 97153 appointment remains unconfirmed.',
      gateImpact: 'Start-date coordination is underway with no confirmed first 97153 appointment',
      owner: 'CSM',
      actionType: PROVIDER_OUTREACH,
      action:
        'CSM to confirm the agreed first 97153 date with the provider and family and ensure the appointment is recorded for Salesforce synchronization.',
      milestoneDate: null,
      followUpDate: nextBusinessDay(asOf),
      relevance: 11,
    });
  }
}
function addExistingCoverage(context: OperationalFactContext): void {
  const { value, currentSlaNote, add } = context;
  const existingRbtSchedulingIssue =
    currentSlaNote &&
    has(value, /\b(?:existing|current) rbt\b/) &&
    has(value, /\b(?:family|provider)\b.{0,60}\b(?:schedule|scheduling|availability)\b/);
  if (existingRbtSchedulingIssue) {
    add({
      type: 'rbt-existing-coverage-scheduling',
      summary:
        'An existing RBT is available, but provider-family scheduling remains unresolved and the first 97153 appointment is not confirmed.',
      gateImpact:
        'Existing RBT coverage is identified; first-service scheduling remains unresolved',
      owner: 'CSM',
      actionType: PROVIDER_OUTREACH,
      action:
        'CSM to align the provider, family, and existing RBT on a workable schedule and record the confirmed first 97153 date.',
      relevance: 12,
    });
  }
}
function addProviderNonresponse(context: OperationalFactContext): void {
  const { value, asOf, add } = context;
  const providerNonresponse =
    has(value, /\b(?:provider|bcba)\b/) &&
    has(
      value,
      /\b(?:no comms?|no response|not responding|unresponsive|hasn t responded|has not responded)\b/
    ) &&
    has(value, /\b(?:texts?|calls?|messages?|outreach|contact(?:ed|ing)?)\b/);
  if (providerNonresponse) {
    add({
      type: 'provider-unresponsive',
      summary:
        'The CSM has attempted to confirm the first 97153 date, but the provider has not responded; scheduling remains unconfirmed.',
      gateImpact: 'Provider response is required to confirm the first 97153 date',
      owner: 'CSM',
      actionType: PROVIDER_OUTREACH,
      action:
        'CSM to escalate provider outreach, confirm the first 97153 date, and document whether staffing or scheduling must be reopened.',
      milestoneDate: null,
      followUpDate: nextBusinessDay(asOf),
      relevance: 11,
    });
  }
}
function addStaffingProgress(context: OperationalFactContext): void {
  const { value, eventDate, add } = context;
  const coverageFailed = has(
    value,
    /\b(rbt left|rbt quit|lost (?:the )?rbt|coverage fell through|candidate withdrew|offer declined|restaff|re recruit|rerecruit|unable to work|cannot work|required schedule|stopped responding|not responding|unresponsive|no response after accepting|did not respond after accepting)\b/
  );
  if (coverageFailed) {
    add({
      type: 'rbt-lost',
      summary:
        'The prior RBT or leading candidate is no longer viable, so replacement staffing is required before treatment can start.',
      gateImpact: 'RBT coverage fell through and restaffing is required',
      owner: 'RBT Team',
      actionType: RBT_FOLLOW_UP,
      action:
        'RBT Team to reopen or advance replacement recruiting, document the strongest active candidate, and record the next staffing decision date.',
      relevance: 11,
    });
  } else if (
    has(
      value,
      /\b(rbt|candidate).{0,80}\b(hire|hired|assigned|matched|accepted offer)\b|\b(hire|hired|assigned|matched|accepted offer).{0,80}\b(rbt|candidate)\b/
    )
  ) {
    add({
      type: 'rbt-assigned',
      summary:
        'An RBT has been hired, assigned, or matched, but the first 97153 date is not confirmed.',
      gateImpact: 'RBT assigned; first 97153 scheduling remains unconfirmed',
      owner: 'CSM',
      actionType: PROVIDER_OUTREACH,
      action: 'CSM to confirm the assigned RBT and the agreed first 97153 date with the provider.',
      relevance: 10,
    });
  } else if (
    has(
      value,
      /\b(interview|screening|candidate proposed|offer letter|pending offer|offer pending|offer extended|background check)\b/
    )
  ) {
    const candidateStep = candidateStepFromText(value) ?? 'candidate review';
    add({
      type: 'rbt-candidate',
      summary: `RBT staffing activity shows a candidate reached ${candidateStep} on ${String(isoDate(eventDate))}; the outcome, staffing decision, and expected start date are not yet confirmed.`,
      gateImpact: `RBT candidate is at ${candidateStep}; staffing is not confirmed`,
      owner: 'RBT Team',
      actionType: RBT_FOLLOW_UP,
      action: `RBT Team to document the ${candidateStep} outcome, next decision date, and expected start date.`,
      relevance: 9,
      candidateStep,
    });
  } else if (
    has(
      value.replace(/^staffing and scheduling update\s*/, ''),
      /\b(recruit|sourcing|screening|looking for an rbt|need an rbt|staff(?:ing|ed|ing))\b/
    )
  ) {
    add({
      type: 'rbt-recruiting',
      summary:
        'RBT recruiting is active, but no confirmed candidate or first-service date is available.',
      gateImpact: 'RBT recruiting remains open with no confirmed start',
      owner: 'RBT Team',
      actionType: RBT_FOLLOW_UP,
      action:
        'RBT Team to document the recruiting status, strongest candidate, and expected staffing date.',
      milestoneDate: null,
      relevance: 8,
    });
  }
}
export function addRbtOperationalFacts(context: OperationalFactContext): void {
  if (context.category !== 'rbt') return;
  const signals = rbtSignals(context);
  addRbtStart(context, signals);
  addStartCoordination(context, signals);
  addExistingCoverage(context);
  addProviderNonresponse(context);
  addStaffingProgress(context);
}
