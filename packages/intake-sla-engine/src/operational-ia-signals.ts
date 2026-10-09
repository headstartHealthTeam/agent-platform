import { normalizeOperationalText } from './conversation-text.js';
import { hasOperationalText as has } from './operational-fact-context.js';
import type { OperationalFactContext } from './operational-fact-context.js';
export interface IaSignals {
  readonly inboundFamilyProviderMeeting: boolean;
  readonly familyConsultBeforeIa: boolean;
  readonly iaUnderway: boolean;
  readonly needsAlohaProviderSetup: boolean;
  readonly explicitIaIncomplete: boolean;
  readonly explicitIaCompletion: boolean;
  readonly iaSchedulingOutreach: boolean;
  readonly currentSlaContactAttempt: boolean;
  readonly iaSchedulingCoordination: boolean;
  readonly familyResponseProviderHandoff: boolean;
  readonly deferredIaWindow: boolean;
  readonly exactDeferredIaDate: string | null;
  readonly providerObservationPlanned: boolean;
  readonly providerExpectedIaStep: boolean;
}
function occurrenceSignals(
  context: OperationalFactContext
): Pick<
  IaSignals,
  | 'inboundFamilyProviderMeeting'
  | 'familyConsultBeforeIa'
  | 'iaUnderway'
  | 'needsAlohaProviderSetup'
  | 'explicitIaIncomplete'
  | 'explicitIaCompletion'
> {
  const { value } = context;
  const inboundFamilyMessage =
    normalizeOperationalText(context.context.direction ?? '').includes('inbound') &&
    normalizeOperationalText(context.context.line ?? '').includes('intake');
  const inboundFamilyProviderMeeting =
    inboundFamilyMessage &&
    has(value, /\b(?:meet(?:ing)?|appointment|consult(?:ation)?)\b/) &&
    has(value, /\bnext week\b/);
  const familyConsultBeforeIa =
    has(value, /\b(first|initial) consult(?:ation)?\b/) &&
    has(value, /\b(mom|mother|dad|father|parent|family|caregiver)\b/) &&
    has(value, /\b(initial assessment|assessment|97151|\bia\b)\b/) &&
    has(value, /\b(?:then|after|once|before)\b/);
  const iaUnderway =
    has(
      value,
      /\b(initial assessment|assessment|97151|\bia\b) (?:has |is |was )?(?:started|underway|in progress)\b/
    ) || has(value, /\b(started|began) (?:the )?(initial assessment|assessment|97151|\bia\b)\b/);
  const needsAlohaProviderSetup = has(
    value,
    /\b(provider|bcba|rendering provider)\b.{0,45}\b(needs? to be added|not (?:yet )?added|missing)\b.{0,25}\baloha\b|\baloha\b.{0,35}\b(provider|bcba|rendering provider)\b.{0,35}\b(needs? to be added|not (?:yet )?added|missing)\b/
  );
  const explicitIaIncomplete =
    has(
      value,
      /\b(?:not|haven t|hasn t|hadn t|wasn t|isn t|aren t|weren t) (?:yet )?(?:finished|completed|done|conducted|performed) (?:with )?(?:the )?(initial assessment|assessment|97151|\bia\b)\b/
    ) ||
    has(
      value,
      /\b(initial assessment|assessment|97151|\bia\b) (?:is|was|has been|had been)? ?(?:not|n't) (?:yet )?(?:finished|completed|done|conducted|performed)\b/
    );
  const explicitIaCompletion =
    !explicitIaIncomplete &&
    !has(
      value,
      /\b(?:once|after|when|if|before)\b.{0,80}\b(initial assessment|assessment|97151|\bia\b)\b.{0,45}\b(completed|finished|conducted|done|held|performed|occurred|happened)\b/
    ) &&
    (has(
      value,
      /\b(initial assessment|assessment|97151|\bia\b) (?:was |is |has been |got )?(completed|finished|conducted|done|held|performed|occurred|happened)\b/
    ) ||
      has(
        value,
        /\b(completed|finished|conducted|did|performed|held) (?:the )?(initial assessment|assessment|97151|\bia\b)\b/
      ));
  return {
    inboundFamilyProviderMeeting,
    familyConsultBeforeIa,
    iaUnderway,
    needsAlohaProviderSetup,
    explicitIaIncomplete,
    explicitIaCompletion,
  };
}
function outreachSignals(
  context: OperationalFactContext
): Pick<
  IaSignals,
  | 'iaSchedulingOutreach'
  | 'currentSlaContactAttempt'
  | 'iaSchedulingCoordination'
  | 'familyResponseProviderHandoff'
> {
  const { value, date, currentSlaNote } = context;
  const iaSchedulingOutreach =
    has(value, /\b(?:outreach|follow(?:ing)? up|contact(?:ed|ing)?|try(?:ing)? to reach)\b/) &&
    has(value, /\b(?:schedule|scheduling|assessment|97151|\bia\b|appointment|date)\b/) &&
    !date;
  const currentSlaContactAttempt =
    currentSlaNote &&
    has(value, /\b(?:family|parent|caregiver|mom|dad)\b/) &&
    has(
      value,
      /\b(?:reach(?:ing)? out|attempted to reach|trying to reach|email(?:ing|ed)|text(?:ing|ed))\b/
    ) &&
    !has(value, /\b(?:not|never) (?:emailing|emailed|texting|texted|reaching out)\b/) &&
    !has(
      value,
      /\b(?:assessment|ia|appointment)\b (?:is |was |has been )?(?:scheduled|booked|confirmed)\b/
    );
  const iaSchedulingCoordination =
    currentSlaNote &&
    has(
      value,
      /\bprovider\b.{0,80}\b(?:working|coordinating|following up)\b.{0,80}\b(?:family|parent|caregiver)\b/
    ) &&
    has(value, /\b(?:schedule|scheduled|scheduling|assessment|\bia\b)\b/);
  const familyResponseProviderHandoff =
    currentSlaNote &&
    has(value, /\b(?:family|parent|caregiver)\b.{0,45}\b(?:responded|replied|called back)\b/) &&
    (has(value, /\b(?:messaged|contacted|notified)\b.{0,35}\b(?:provider|bcba)\b/) ||
      has(value, /\b(?:provider|bcba)\b.{0,35}\b(?:messaged|contacted|notified)\b/));
  return {
    iaSchedulingOutreach,
    currentSlaContactAttempt,
    iaSchedulingCoordination,
    familyResponseProviderHandoff,
  };
}
function planningSignals(
  context: OperationalFactContext
): Pick<
  IaSignals,
  | 'deferredIaWindow'
  | 'exactDeferredIaDate'
  | 'providerObservationPlanned'
  | 'providerExpectedIaStep'
> {
  const { value, date, currentSlaNote } = context;
  const deferredIaWindow =
    currentSlaNote &&
    has(value, /\b(?:provider|family)\b/) &&
    has(
      value,
      /\b(?:agreed to wait|ready to start|assessment closer to|likely assessing|assessment (?:is )?scheduled for (?:the )?(?:first|second|third|fourth|last|next) week)\b/
    ) &&
    has(value, /\b(?:assessment|\bia\b|start|september|october|november|december|next week)\b/);
  const exactDeferredIaDate =
    date &&
    !has(value, /\b(?:beginning|start|middle|mid|end) of (?:september|october|november|december)\b/)
      ? date
      : null;
  const providerObservationPlanned =
    currentSlaNote &&
    has(value, /\bprovider\b.{0,60}\b(?:going out|visit(?:ing)?|observ(?:e|ing|ation))\b/) &&
    has(value, /\b(?:observe|observation|assessment|\bia\b|visit)\b/);
  const providerExpectedIaStep =
    currentSlaNote &&
    date &&
    !has(value, /\b(?:not|never) to be completed\b/) &&
    (has(value, /\b(?:ia|initial assessment|97151) to be completed\b/) ||
      has(
        value,
        /\bprovider\b.{0,90}\b(?:was )?(?:supposed|expected|planned) to\b.{0,80}\b(?:initial assessment|assessment|97151|\bia\b)\b/
      ) ||
      has(
        value,
        /\b(?:initial assessment|assessment|97151|\bia\b)\b.{0,80}\b(?:was )?(?:supposed|expected|planned)\b/
      ));
  return {
    deferredIaWindow,
    exactDeferredIaDate,
    providerObservationPlanned,
    providerExpectedIaStep: Boolean(providerExpectedIaStep),
  };
}
export function iaSignals(context: OperationalFactContext): IaSignals {
  return {
    ...occurrenceSignals(context),
    ...outreachSignals(context),
    ...planningSignals(context),
  };
}
