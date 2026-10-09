import type { StoryFact, StoryGate } from './story-types.js';
import { normalizedStoryText } from './story-values.js';

const STORY_FAMILY_AVAILABILITY = 'family-availability';
const STORY_CLINICAL_REVIEW = 'clinical-review';

const ISSUE_TEXT_RULES: readonly (readonly [RegExp, string])[] = [
  [
    /provider capacity|provider.{0,50}capacity|capacity.{0,50}provider|cannot take|can'?t take|bcba resigned|provider reassignment|new provider.*assigned/,
    'provider-capacity',
  ],
  [
    /family.{0,80}availability|availability.{0,80}family|family (?:response|contact).{0,60}required|family.{0,80}(?:unresponsive|not respond|has not responded|cannot be reached|can'?t be reached)|(?:provider|csm|intake).{0,80}(?:cannot|can'?t|unable to|has not been able to) reach (?:the )?family|custody|paired sibling|family requested.*hold|care-plan feasibility/,
    STORY_FAMILY_AVAILABILITY,
  ],
  [
    /diagnostic evaluation|psychological report|secure.*signature|soa\b|vineland|basc|missing document|required document|intake documentation/,
    'required-documentation',
  ],
  [/initial[- ]authorization|\bia authorization\b|initial auth/, 'initial-authorization'],
  [/treatment[- ]authorization|\bta authorization\b|treatment auth/, 'treatment-authorization'],
  [/first 97153|direct-care treatment|treatment start|start date/, 'first-97153'],
  [/rbt|candidate|staffing|ticket match|interview|recruit/, 'rbt-staffing'],
  [/vob|eligibility|insurance verification/, 'insurance-verification'],
  [
    /clinical quality|clinical review|edits sent for review|treatment plan in.review/,
    STORY_CLINICAL_REVIEW,
  ],
  [
    /payer submission|submit(?:ted)? (?:the )?(?:plan )?to (?:the )?payer|submission readiness|completed treatment plan.*headstart review|headstart review.*submission date/,
    'payer-submission',
  ],
  [/treatment plan|parent signature|provider signature|drafting/, 'treatment-plan'],
  [
    /initial assessment|\bia\b|97151|assessment occurrence|assessment schedul|assessment or intake appointment.{0,40}scheduled/,
    'initial-assessment',
  ],
];

function classifyIssueText(value: string): string | null {
  return ISSUE_TEXT_RULES.find(([pattern]) => pattern.test(value))?.[1] ?? null;
}

function typedIssueKey(event: StoryFact, gate: StoryGate): string | null {
  const factType = (event.factType ?? '').toLowerCase();
  if (factType === 'tp-ready') return 'payer-submission';
  if (factType === 'tp-submission-planned') return STORY_CLINICAL_REVIEW;
  if (
    factType === 'tp-clinical-review' ||
    (event.source === 'Clinical Quality' &&
      ['tp-revisions', 'tp-signature'].includes(factType) &&
      /clinical quality|clinical review|review outcome/i.test(
        `${event.text ?? ''} ${event.gateImpact ?? ''}`
      ))
  ) {
    return STORY_CLINICAL_REVIEW;
  }
  if (['provider-viability', 'provider-unresponsive'].includes(factType)) {
    return 'provider-capacity';
  }
  if (factType === 'insurance-eligibility-inactive') {
    return 'insurance-verification';
  }
  if ([STORY_FAMILY_AVAILABILITY, 'intake-continuation-decision'].includes(factType)) {
    return STORY_FAMILY_AVAILABILITY;
  }
  if (
    ['required-document', 'family-document-update', 'family-document-completed'].includes(factType)
  ) {
    return 'required-documentation';
  }
  if (factType.startsWith('tp-')) return 'treatment-plan';
  if (factType.startsWith('ia-')) return 'initial-assessment';
  if (factType.startsWith('rbt-')) return 'rbt-staffing';
  if (/^treatment-(?:start|ready)/.test(factType)) return 'first-97153';
  if (factType.startsWith('auth-')) {
    const gateText = `${gate.processPosition ?? ''} ${gate.unresolvedGate ?? ''}`.toLowerCase();
    return /initial|\bia\b/.test(gateText) ? 'initial-authorization' : 'treatment-authorization';
  }
  return null;
}

export function inferIssueKey(event: StoryFact, gate: StoryGate = {}): string {
  const typed = typedIssueKey(event, gate);
  if (typed) return typed;
  const direct = classifyIssueText(normalizedStoryText(event));
  if (direct) return direct;
  const gateFallback = classifyIssueText(
    `${gate.gateCategory ?? ''} ${gate.processPosition ?? ''} ${gate.unresolvedGate ?? ''}`
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  );
  if (gateFallback) return gateFallback;
  return (
    (event.category ?? gate.gateCategory ?? 'other')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'other'
  );
}
