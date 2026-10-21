import { cleanConversationSentence } from './conversation-text.js';

const DIAGNOSTIC_REPORT = 'a current diagnostic evaluation or report';

export function extractRequestedInformation(text = ''): string | null {
  const value = cleanConversationSentence(text);
  const requested: string[] = [];
  const add = (label: string): void => {
    if (!requested.includes(label)) requested.push(label);
  };

  const tricareReferral =
    /\btricare\b.{0,160}\breferral\b|\breferral\b.{0,160}\btricare\b|\btricare\b.{0,180}\bauthorization\b.{0,100}\bin (?:[A-Z][A-Za-z'-]+ [A-Z][A-Za-z'-]+ [A-Z][A-Za-z'-]+|[A-Z][A-Za-z'-]+ [A-Z][A-Za-z'-]+)['’]s name\b/i.test(
      value
    );
  if (tricareReferral) {
    const renderingProvider =
      /\bin ([A-Z][A-Za-z'-]+ [A-Z][A-Za-z'-]+ [A-Z][A-Za-z'-]+|[A-Z][A-Za-z'-]+ [A-Z][A-Za-z'-]+)['’]s name\b/.exec(
        value
      )?.[1];
    add(
      `the Tricare ABA referral/authorization${
        renderingProvider ? ` in ${renderingProvider}'s name` : ''
      }`
    );
  }

  const patterns: readonly (readonly [RegExp, string])[] = [
    [
      /\b(?:updated?|current|new|missing|required|outdated|expired) *(?:autism|psychological|diagnostic) (?:evaluation|report)\b|\b(?:autism|psychological|diagnostic) (?:evaluation|report)\b|\b(?:new|updated|current) (?:autism )?diagnosis\b|\b(?:updated?|current|new|missing|required|outdated|expired) (?:de|dx)\b|\b(?:update|replace|obtain|get|complete) (?:(?:the|their|his|her) )?(?:de|dx)\b|\b(?:de|dx)\b.{0,20}\b(updated?|current|new|missing|required|outdated|expired)\b/i,
      DIAGNOSTIC_REPORT,
    ],
    [
      /\b(?:psychiatrist|diagnostician|diagnosing provider)\b.{0,140}\b(?:evaluation (?:appointment|appt)|appointment for (?:a |an )?evaluation)\b|\b(?:evaluation (?:appointment|appt)|appointment for (?:a |an )?evaluation)\b.{0,140}\b(?:psychiatrist|diagnostician|diagnosing provider)\b/i,
      DIAGNOSTIC_REPORT,
    ],
    [
      /\b(?:ados[- ]?2|cars[- ]?2|adi[- ]?r)\b|\bscientifically validated\b.{0,160}\b(?:asd|autism)\b.{0,120}\b(?:tool|assessment)/i,
      'a diagnostic evaluation using a validated autism-specific assessment tool',
    ],
    [
      /\b(service order agreement|service order|signed order|physician order|doctor(?:'s)? order|\bsoa\b)\b/i,
      'a signed service order',
    ],
    [/\bvineland\b/i, 'the Vineland assessment'],
    [/\bbasc\b/i, 'the BASC assessment'],
    [/\bpddbi\b/i, 'the PDDBI assessment'],
    [/\b(new client |intake |onboarding )?packet\b/i, 'the new-client onboarding packet'],
    [
      /\b(parent|guardian|caregiver)\b.{0,30}\b(signature|sign(?:ed|ature)?)\b|\b(signature|sign(?:ed|ature)?)\b.{0,30}\b(parent|guardian|caregiver)\b/i,
      'the parent or guardian signature',
    ],
    [
      /\b(provider|bcba|clinician)\b.{0,30}\b(signature|sign(?:ed|ature)?)\b|\b(signature|sign(?:ed|ature)?)\b.{0,30}\b(provider|bcba|clinician)\b/i,
      'the provider signature',
    ],
    [
      /\b(clinical records?|progress notes?|medical records?|supporting documentation|treatment records?)\b/i,
      'the requested clinical records',
    ],
    [
      /\b(treatment plan|plan of care)\b.{0,60}\b(edit|revision|correction|change|update|clarif)/i,
      'the requested treatment-plan corrections',
    ],
    [
      /\b(coordination of benefits|\bcob\b|primary payer|secondary payer)\b/i,
      'corrected coordination-of-benefits information',
    ],
    [
      /\b(prior|previous|current|existing)\b.{0,30}\b(auth(?:orization)?|aba services?|provider)\b.{0,50}\b(end date|terminate|termination|withdraw|discharge|close)/i,
      'confirmation that the prior ABA authorization was terminated',
    ],
    [
      /\b(end date|terminate|termination|withdraw|discharge|close)\b.{0,50}\b(prior|previous|current|existing)\b.{0,30}\b(auth(?:orization)?|aba services?|provider)\b/i,
      'confirmation that the prior ABA authorization was terminated',
    ],
    [
      /\b(front|back|copy|photo).{0,25}\binsurance card\b|\binsurance card\b/i,
      'a copy of the insurance card',
    ],
    [
      /\b(npi|credential(?:ing)?|provider enrollment|provider information|rendering provider)\b/i,
      'the required provider or credentialing information',
    ],
    [
      /\bsrs[- ]?2\b.{0,420}\b(?:parent|caregiver)\b.{0,160}\b(?:rater|respondent)\b|\b(?:parent|caregiver)\b.{0,160}\b(?:rater|respondent)\b.{0,420}\bsrs[- ]?2\b/i,
      'an updated SRS-2 completed by the parent or caregiver',
    ],
    [
      /\bsipa\b.{0,520}\b(?:child name|client name|respondent|rater|relationship)\b/i,
      'corrected SIPA child, rater, and relationship fields',
    ],
    [
      /\bvineland\b.{0,220}\b(?:examiner|credential)\b/i,
      'the Vineland examiner name and credential',
    ],
    [
      /\bpsi\b.{0,220}\b(?:child name|client name|respondent|rater|relationship)\b/i,
      'corrected PSI child, rater, respondent, and relationship fields',
    ],
    [
      /\bbehavioral skills assessment\b.{0,120}\b(?:outdated|older than|60 days)\b/i,
      'an updated behavioral skills assessment',
    ],
    [/\bablls(?:r|[- ]r)?\b.{0,180}\b(?:graph|grid)\b/i, 'the ABLLS-R graph or grid'],
  ];
  for (const [pattern, label] of patterns) {
    if (pattern.test(value)) add(label);
  }
  if (!tricareReferral && /\b(?:referral\/authorization|referral\/auth|referral)\b/i.test(value)) {
    add(
      /\breferral\/auth(?:orization)?\b/i.test(value)
        ? 'the ABA referral/authorization'
        : 'the ABA referral'
    );
  }
  let resolved = requested;
  if (resolved.includes('the Vineland examiner name and credential')) {
    resolved = resolved.filter(
      (item) =>
        !['the Vineland assessment', 'the required provider or credentialing information'].includes(
          item
        )
    );
  }
  if (
    resolved.includes('a diagnostic evaluation using a validated autism-specific assessment tool')
  ) {
    resolved = resolved.filter((item) => item !== DIAGNOSTIC_REPORT);
  }
  return resolved.slice(0, 3).join(' and ') || null;
}
