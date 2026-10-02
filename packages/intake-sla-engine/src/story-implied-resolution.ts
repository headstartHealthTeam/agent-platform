import { explicitlyResolved } from './story-resolution.js';
import { assessmentCompletionResolved } from './story-status.js';
import type { StoryFact } from './story-types.js';
import { normalizedStoryText, STORY_STRUCTURED_SOURCES } from './story-values.js';

const STORY_INSURANCE_VERIFICATION = 'insurance-verification';
const STORY_INITIAL_AUTHORIZATION = 'initial-authorization';
const STORY_INITIAL_ASSESSMENT = 'initial-assessment';
const STORY_REQUIRED_DOCUMENTATION = 'required-documentation';
const STORY_TREATMENT_PLAN = 'treatment-plan';
const STORY_CLINICAL_REVIEW = 'clinical-review';
const STORY_PAYER_SUBMISSION = 'payer-submission';
const STORY_TREATMENT_AUTHORIZATION = 'treatment-authorization';
const STORY_AUTHORIZATION = 'Authorization';
const STORY_AUTH_APPROVED = 'auth-approved';
const STORY_AUTH_NO_AUTH_NEEDED = 'auth-no-auth-needed';
const STORY_PROVIDER_CAPACITY = 'provider-capacity';

interface ResolutionContext {
  readonly event: StoryFact;
  readonly value: string;
  readonly factType: string;
  readonly issueKey: string;
}
const IMPLIED_RESOLUTION_RULES = [
  {
    when: ({ value }: ResolutionContext): boolean =>
      /opportunity entered 97151 started|opportunity entered treatment plan in.review/.test(value),
    resolves: [
      STORY_INSURANCE_VERIFICATION,
      STORY_INITIAL_AUTHORIZATION,
      STORY_INITIAL_ASSESSMENT,
      STORY_REQUIRED_DOCUMENTATION,
    ],
  },
  {
    when: ({ value }: ResolutionContext): boolean =>
      value.includes('opportunity entered ta requested'),
    resolves: [
      STORY_INSURANCE_VERIFICATION,
      STORY_INITIAL_AUTHORIZATION,
      STORY_INITIAL_ASSESSMENT,
      STORY_REQUIRED_DOCUMENTATION,
      STORY_TREATMENT_PLAN,
      STORY_CLINICAL_REVIEW,
      STORY_PAYER_SUBMISSION,
    ],
  },
  {
    when: ({ value }: ResolutionContext): boolean =>
      value.includes('opportunity entered ta approved'),
    resolves: [STORY_TREATMENT_AUTHORIZATION],
  },
  {
    when: ({ event, value }: ResolutionContext): boolean =>
      /initial authorization.*(?:approved|no auth needed)/.test(value) ||
      (event.source === STORY_AUTHORIZATION &&
        event.issueKey === STORY_INITIAL_AUTHORIZATION &&
        [STORY_AUTH_APPROVED, STORY_AUTH_NO_AUTH_NEEDED].includes(event.factType ?? '')),
    resolves: [STORY_INITIAL_AUTHORIZATION, STORY_INSURANCE_VERIFICATION],
  },
  {
    when: ({ event }: ResolutionContext): boolean => assessmentCompletionResolved(event),
    resolves: [STORY_INSURANCE_VERIFICATION, STORY_INITIAL_AUTHORIZATION, STORY_INITIAL_ASSESSMENT],
  },
  {
    when: ({ value }: ResolutionContext): boolean =>
      /provider reports?.*(?:initial assessment|assessment).*(?:has started|is underway)|provider.*(?:started|began).*(?:initial assessment|assessment)/.test(
        value
      ) && !/provider capacity|cannot take|can'?t take|reassignment.*unresolved/.test(value),
    resolves: [STORY_PROVIDER_CAPACITY],
  },
  {
    when: ({ event }: ResolutionContext): boolean =>
      explicitlyResolved(event, STORY_TREATMENT_PLAN),
    resolves: [STORY_INITIAL_ASSESSMENT, STORY_TREATMENT_PLAN, STORY_REQUIRED_DOCUMENTATION],
  },
  {
    when: ({ event, value, factType }: ResolutionContext): boolean =>
      event.source === 'Clinical Quality' &&
      ['tp-signature', 'tp-clinical-review', 'tp-revisions'].includes(factType) &&
      /both parent and provider signatures|clinical quality (?:began|records|shows)/.test(value),
    resolves: [STORY_INITIAL_ASSESSMENT, STORY_TREATMENT_PLAN, STORY_REQUIRED_DOCUMENTATION],
  },
  {
    when: ({ value }: ResolutionContext): boolean =>
      /provider.*treatment plan.*(?:complete|ready to submit)/.test(value),
    resolves: [STORY_PROVIDER_CAPACITY],
  },
  {
    when: ({ value }: ResolutionContext): boolean =>
      /provider.*(?:first direct-care|first 97153|service|start).*(?:planned|scheduled|confirmed)|(?:first direct-care|first 97153|service|start).*(?:planned|scheduled|confirmed).*provider/.test(
        value
      ) &&
      !/provider.*(?:cannot|can'?t|declined|unresponsive)|capacity.*(?:unresolved|not confirmed)|reassignment.*unresolved/.test(
        value
      ),
    resolves: [STORY_PROVIDER_CAPACITY],
  },
  {
    when: ({ value }: ResolutionContext): boolean =>
      /treatment authorization.*(?:submitted|resubmitted|pending|approved|no auth needed)/.test(
        value
      ),
    resolves: [
      STORY_INSURANCE_VERIFICATION,
      STORY_INITIAL_AUTHORIZATION,
      STORY_INITIAL_ASSESSMENT,
      STORY_REQUIRED_DOCUMENTATION,
      STORY_TREATMENT_PLAN,
      STORY_CLINICAL_REVIEW,
      STORY_PAYER_SUBMISSION,
    ],
  },
  {
    when: ({ value }: ResolutionContext): boolean =>
      /initial authorization.*(?:submitted|resubmitted|pending|approved|no auth needed)/.test(
        value
      ),
    resolves: [STORY_INSURANCE_VERIFICATION, STORY_REQUIRED_DOCUMENTATION],
  },
  {
    when: ({ event, factType, issueKey }: ResolutionContext): boolean =>
      issueKey === STORY_INITIAL_AUTHORIZATION &&
      STORY_STRUCTURED_SOURCES.has(event.source ?? '') &&
      ['auth-submitted', 'auth-pending', STORY_AUTH_APPROVED, STORY_AUTH_NO_AUTH_NEEDED].includes(
        factType
      ),
    resolves: [STORY_INSURANCE_VERIFICATION, STORY_REQUIRED_DOCUMENTATION],
  },
  {
    when: ({ event, factType, issueKey }: ResolutionContext): boolean =>
      issueKey === STORY_TREATMENT_AUTHORIZATION &&
      STORY_STRUCTURED_SOURCES.has(event.source ?? '') &&
      ['auth-submitted', 'auth-pending', STORY_AUTH_APPROVED, STORY_AUTH_NO_AUTH_NEEDED].includes(
        factType
      ),
    resolves: [
      STORY_INSURANCE_VERIFICATION,
      STORY_INITIAL_AUTHORIZATION,
      STORY_INITIAL_ASSESSMENT,
      STORY_REQUIRED_DOCUMENTATION,
      STORY_TREATMENT_PLAN,
      STORY_CLINICAL_REVIEW,
      STORY_PAYER_SUBMISSION,
    ],
  },
  {
    when: ({ event, factType, issueKey }: ResolutionContext): boolean =>
      [STORY_INITIAL_AUTHORIZATION, STORY_TREATMENT_AUTHORIZATION].includes(issueKey) &&
      factType === 'auth-additional-info' &&
      event.source === STORY_AUTHORIZATION &&
      Boolean(event.requestedInformation) &&
      event.specificityMissing !== true,
    resolves: [STORY_REQUIRED_DOCUMENTATION],
  },
  {
    when: ({ event, value }: ResolutionContext): boolean =>
      /treatment authorization.*(?:approved|no auth needed)/.test(value) ||
      (event.source === STORY_AUTHORIZATION &&
        event.issueKey === STORY_TREATMENT_AUTHORIZATION &&
        [STORY_AUTH_APPROVED, STORY_AUTH_NO_AUTH_NEEDED].includes(event.factType ?? '')),
    resolves: [STORY_TREATMENT_AUTHORIZATION],
  },
  {
    when: ({ value }: ResolutionContext): boolean =>
      !/(?:prior|former|previous) rbt|assignment.*(?:closed|ended|superseded)|(?:closed|ended|superseded).*assignment|replacement (?:staffing|coverage|request)|no confirmed (?:assignment|coverage|candidate|start)|no candidate|(?:0|zero) matched candidates?|staffing (?:is )?not confirmed|no longer (?:active|available)|coverage (?:fell through|was lost)/.test(
        value
      ) && /\brbt\b.*(?:hired|assigned|matched)|(?:hired|assigned|matched).*\brbt\b/.test(value),
    resolves: ['rbt-staffing'],
  },
  {
    when: ({ value }: ResolutionContext): boolean =>
      /(?:first 97153|direct-care treatment).*(?:occurred|completed|started)/.test(value),
    resolves: [STORY_TREATMENT_AUTHORIZATION, 'rbt-staffing', 'first-97153'],
  },
];

export function impliedResolvedIssues(event: StoryFact): string[] {
  const context: ResolutionContext = {
    event,
    value: normalizedStoryText(event),
    factType: (event.factType ?? '').toLowerCase(),
    issueKey: (event.issueKey ?? '').toLowerCase(),
  };
  const resolved = new Set<string>();
  for (const rule of IMPLIED_RESOLUTION_RULES) {
    if (rule.when(context)) for (const key of rule.resolves) resolved.add(key);
  }
  return [...resolved];
}
