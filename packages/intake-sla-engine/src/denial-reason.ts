import { cleanConversationSentence, normalizeOperationalText } from './conversation-text.js';
import { extractRequestedInformation } from './requested-information.js';

export function cleanDenialReason(value = ''): string {
  return cleanConversationSentence(value)
    .replace(/^explanation\s*:\s*/i, '')
    .replace(/^provider action required (?:aba provider)? */i, '')
    .replace(/^does not meet p\w{2,8}y guidelines?\s*/i, '')
    .replace(/^thank you for (?:submitting|providing|sending)[^,.;:]*[,.;:]?\s*/i, '')
    .replace(/^(?:the )?(?:payer|plan|insurance) (?:said|states?|reported) (?:that )?/i, '')
    .replace(/^(?:it|this|the request|the authorization|the auth)\s+(?:was|is)\s+/i, '')
    .replace(/\b(?:correction|appeal|reconsideration|resubmission|next steps?)\b.*$/i, '')
    .replace(/\bcurrent (?:determination|status)\s*:.*$/i, '')
    .replace(/[;|].*$/, '')
    .replace(/[.?!]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const STANDARD_REASONS: readonly (readonly [RegExp, string])[] = [
  [
    /\bablls(?:r|[- ]r)?\b.{0,260}\b(?:graph|grid)\b[\s\S]{0,900}\b(overlap(?:ping)?|another provider|active treatment prior authorization)\b|\b(overlap(?:ping)?|another provider|active treatment prior authorization)\b[\s\S]{0,900}\bablls(?:r|[- ]r)?\b/i,
    'the ABLLS-R graph is missing and a prior provider has an overlapping authorization',
  ],
  [
    /\bbehavior reduction\b.{0,260}\bbaseline\b.{0,260}\b(?:assessment|measurement system|inconsisten|physical aggression|tantrum)\b|\b(?:physical aggression|tantrum)\b.{0,260}\bbaseline\b/i,
    'the behavior-reduction baselines and measurement definitions must be corrected to match the assessment',
  ],
  [
    /\b(?:behavior intervention plan|bip)\b[\s\S]{0,420}\b(?:replacement behavior|function(?:-matched)?|function of behavior)\b/i,
    'the behavior plan needs function-matched replacement behaviors and goals aligned with the assessment',
  ],
  [
    /\btreatment plan\b[\s\S]{0,600}\bgoals?\b[\s\S]{0,500}\b(?:function-specific|operational(?:ly)? defined|clear criteria|assessment results?|transition plan)\b/i,
    'the treatment-plan goals must be function-specific, measurable, and aligned with the assessment, with a defined transition plan',
  ],
  [
    /\b(overlap(?:ping)?|same service|another provider|existing provider|duplicate services?)\b/i,
    'the payer shows overlapping or duplicate services with another provider',
  ],
  [
    /\b(out[- ]of[- ]network|\boon\b|network exception|single case agreement|\bsca\b)\b/i,
    'the provider is out of network',
  ],
  [
    /\b(coordination of benefits|\bcob\b|primary payer|secondary payer)\b/i,
    'coordination of benefits or payer order must be corrected',
  ],
  [
    /\b(medical necessity|not medically necessary|criteria (?:was|were|is|are)?\s*not met|does not meet (?:the )?(?:payer )?criteria)\b/i,
    'the payer says medical-necessity criteria were not met',
  ],
  [
    /\b(updated?|current|new)\s+(?:diagnostic|psychological)\s+(?:evaluation|report)|\bdiagnostic\s+(?:evaluation|report).{0,35}\b(missing|required|expired|outdated)\b/i,
    'a current diagnostic evaluation or report is required',
  ],
  [
    /\b(missing|insufficient|incomplete) (?:clinical )?(?:documentation|records?|information)|\b(?:documentation|records?|information) (?:was|were|is|are)? *(?:missing|insufficient|incomplete)\b/i,
    'the payer says required clinical documentation is missing or insufficient',
  ],
  [
    /\b(signature|signed).{0,30}\b(missing|required|invalid|incorrect)|\b(missing|required|invalid|incorrect).{0,30}\b(signature|signed)\b/i,
    'a required signature is missing or invalid',
  ],
  [
    /\b(?:typed|electronic) signature\b.{0,80}\b(?:not verifiable|does not meet|invalid|wet|handwritten|signature requirements?)\b|\b(?:verifiable|wet|handwritten) signature\b.{0,80}\b(?:psychological|diagnostic) evaluation\b/i,
    'the psychological evaluation requires a verifiable clinician signature',
  ],
  [
    /\bservice order\b.{0,120}\b(?:wrong|incorrect|eligible|required|correct)\s+provider(?: type)?\b|\b(?:wrong|incorrect|eligible|required|correct)\s+provider(?: type)?\b.{0,120}\bservice order\b/i,
    'the service order must be signed by an eligible provider type',
  ],
  [
    /\b(parent tools?|parent measures?)\b.{0,80}\b(?:clinician|clinical)\s+(?:observation|assessment)\b|\b(?:missing|without|no)\s+(?:clinician|clinical)\s+observation/i,
    'the diagnostic evaluation lacks a required clinician-observation measure',
  ],
  [
    /\bablls(?:r|[- ]r)?\b.{0,80}\b(?:grid|date|mm\/dd\/yy|format)/i,
    'the payer requires the ABLLS-R grid with the assessment date in the required format',
  ],
  [
    /\bcompulsory education|\beducational program\b|\bschool enrollment\b/i,
    "the payer requires documentation of the child's educational enrollment or applicable exception",
  ],
  [
    /\bname mismatch|member name.{0,40}(?:does not match|mismatch|incorrect)|diagnostic.{0,40}name.{0,40}(?:does not match|mismatch|incorrect)/i,
    'the client name on the submitted documentation does not match the payer record',
  ],
  [
    /\bmissing assessment tools?\b.{0,40}\b(?:dx|diagnostic|evaluation)\b|\b(?:dx|diagnostic|evaluation)\b.{0,40}\bmissing assessment tools?\b/i,
    'the diagnostic evaluation is missing required assessment tools',
  ],
  [
    /\btarget behaviors?\b.{0,120}\boperational definitions?\b.{0,120}\bonset\b.{0,80}\boffset\b|\boperational definitions?\b.{0,120}\btarget behaviors?\b.{0,120}\b(?:onset|offset)\b/i,
    'the payer requires measurable operational definitions with onset and offset criteria for each target behavior',
  ],
  [
    /\bbehavioral skills assessment\b.{0,120}\b(?:outdated|older than|60 days)\b/i,
    'the behavioral skills assessment is outdated and must be refreshed',
  ],
  [
    /\b(?:ados[- ]?2|cars[- ]?2|adi[- ]?r)\b|\bscientifically validated\b.{0,160}\b(?:autism|asd|diagnostic)\b.{0,80}\b(?:tool|assessment)|\b(?:diagnosed with|diagnosis of)\s+(?:autism|asd)\b.{0,100}\bvalid(?:ated)? diagnostic tool\b|\bvalid(?:ated)? diagnostic tool\b.{0,100}\b(?:autism|asd)\b/i,
    'the diagnostic evaluation lacks a validated autism-specific assessment tool',
  ],
];

export function extractDenialReason(text = ''): string | null {
  const value = cleanConversationSentence(text);
  const normalized = normalizeOperationalText(value);
  const denied = /\bden(?:ied|ial)\b/.test(normalized);
  const withdrawn =
    /\bwithdrawn\b/.test(normalized) &&
    /\b(?:because|due to|after (?:the )?payer (?:found|determined|identified)|reason)\b/.test(
      normalized
    );
  if (!denied && !withdrawn) return null;
  const standardized = STANDARD_REASONS.find(([pattern]) => pattern.test(value));
  if (standardized) return standardized[1];
  const requested = extractRequestedInformation(value);
  if (
    requested &&
    /provider action required|additional (?:info|information|details)|before .* (?:approved|authorization)|following is need/i.test(
      value
    )
  ) {
    return `the payer requires ${requested}`;
  }
  const explicit =
    /(?:denied|denial) (?:because|due to|for|reason(?: is| was)?|based on) ([^\n.!?;|]{5,180})/i.exec(
      value
    ) ??
    /(?:reason for (?:the )?denial|denial reason) *(?:is|was|:|-)? *([^\n.!?;|]{5,180})/i.exec(
      value
    );
  if (!explicit?.[1]) return null;
  const reason = cleanDenialReason(explicit[1]);
  if (
    reason.length < 5 ||
    /^(?:provider action required|thank you for (?:the )?additional information|thank you for submitting)/i.test(
      reason
    ) ||
    /^(?:unknown|unclear|not sure|pending|denied|denial|payer response|other|the updated information has been reviewed)$/i.test(
      reason
    )
  )
    return null;
  return reason;
}
