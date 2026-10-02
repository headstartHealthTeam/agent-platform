import { assessmentCompletionResolved, explicitlyUnresolved } from './story-status.js';
import type { StoryFact } from './story-types.js';
import { normalizedStoryText } from './story-values.js';

const RESOLUTION_RULES = new Map<string, (event: StoryFact) => boolean>([
  [
    'family-availability',
    (event: StoryFact): boolean => {
      const value = normalizedStoryText(event);
      return (
        /family.*(?:is available|confirmed availability|agreed schedule|can proceed|ready to proceed|resumed)|family.*availability.*resolved.*(?:provider|assessment|service).*(?:schedule|proceed|resume)|(?:availability|schedule).*(?:confirmed|agreed)|services? resumed/.test(
          value
        ) &&
        !/must confirm|whether .*can proceed|whether services? can|not confirmed|remains? unresolved/.test(
          value
        ) &&
        !explicitlyUnresolved(event)
      );
    },
  ],
  [
    'provider-capacity',
    (event: StoryFact): boolean => {
      const value = normalizedStoryText(event);
      return (
        /provider.*(?:confirmed capacity|can accept|can proceed|reassigned)|(?:capacity|reassignment).*(?:confirmed|completed)|new provider.*assigned|provider.*treatment plan.*(?:complete|ready to submit)|provider.*(?:first direct-care|first 97153|start).*(?:planned|scheduled|confirmed)|provider reports?.*(?:service|start).*(?:planned|scheduled)/.test(
          value
        ) && !explicitlyUnresolved(event)
      );
    },
  ],
  [
    'initial-authorization',
    (event: StoryFact): boolean => {
      const value = normalizedStoryText(event);
      if (
        event.source === 'Authorization' &&
        event.issueKey === 'initial-authorization' &&
        ['auth-approved', 'auth-no-auth-needed'].includes(event.factType ?? '')
      )
        return true;
      return (
        /initial authorization.*(?:approved|no auth needed|requires no payer approval)|(?:approved|no auth needed|requires no payer approval).*initial authorization/.test(
          value
        ) &&
        !/initial authorization.{0,60}(?:pending|denied|partial|appeal|additional details)/.test(
          value
        )
      );
    },
  ],
  [
    'insurance-verification',
    (event: StoryFact): boolean => {
      const value = normalizedStoryText(event);
      return /\bvob\b.*(?:complete|completed)|eligibility.*active|insurance verification.*(?:complete|completed)/.test(
        value
      );
    },
  ],
  [
    'treatment-authorization',
    (event: StoryFact): boolean => {
      const value = normalizedStoryText(event);
      if (
        event.source === 'Authorization' &&
        event.issueKey === 'treatment-authorization' &&
        ['auth-approved', 'auth-no-auth-needed'].includes(event.factType ?? '')
      )
        return true;
      return (
        /treatment authorization.*(?:approved|no auth needed|requires no payer approval)|(?:approved|no auth needed|requires no payer approval).*treatment authorization/.test(
          value
        ) &&
        !/treatment authorization.{0,60}(?:pending|denied|partial|appeal|additional details)/.test(
          value
        )
      );
    },
  ],
  [
    'initial-assessment',
    (event: StoryFact): boolean => {
      return assessmentCompletionResolved(event);
    },
  ],
  [
    'treatment-plan',
    (event: StoryFact): boolean => {
      if (
        ['tp-drafting', 'tp-not-started', 'tp-revisions'].includes(
          (event.factType ?? '').toLowerCase()
        )
      )
        return false;
      const fact = (event.text ?? '').toLowerCase().replace(/\s+/g, ' ');
      if (
        /still (?:drafting|being drafted)|treatment plan.*(?:incomplete|not (?:yet )?complete|not ready|remain\w* pending)|(?:missing|awaiting|outstanding).*(?:parent|provider)? ?signature/.test(
          fact
        )
      ) {
        return false;
      }
      return /treatment plan.*(?:\bcomplete\b|\bcompleted\b|\bsubmitted\b|\breceived\b|ready to submit|both required signatures)|(?:\bcomplete\b|\bcompleted\b|\bsubmitted\b|\breceived\b|ready to submit).*treatment plan/.test(
        fact
      );
    },
  ],
  [
    'clinical-review',
    (event: StoryFact): boolean => {
      const value = normalizedStoryText(event);
      return /clinical (?:quality )?review.*(?:complete|approved)|(?:complete|approved).*clinical (?:quality )?review|clinical quality.*ready to submit/.test(
        value
      );
    },
  ],
  [
    'payer-submission',
    (event: StoryFact): boolean => {
      const value = normalizedStoryText(event);
      return /(?:submitted|sent).*(?:to )?(?:the )?payer|payer.*(?:received|accepted).*treatment plan/.test(
        value
      );
    },
  ],
  [
    'rbt-staffing',
    (event: StoryFact): boolean => {
      const value = normalizedStoryText(event);
      if (
        /(?:prior|former|previous) rbt|assignment.*(?:closed|ended|superseded)|(?:closed|ended|superseded).*assignment|replacement (?:staffing|coverage|request)|no confirmed (?:assignment|coverage|candidate|start)|no candidate|(?:0|zero) matched candidates?|staffing (?:is )?not confirmed|no longer (?:active|available)|coverage (?:fell through|was lost)/.test(
          value
        )
      ) {
        return false;
      }
      if (
        (event.factType ?? '').toLowerCase() === 'rbt-assigned' &&
        !['RBT Request', 'Staffing'].includes(event.source ?? '') &&
        /assignment|staffing|first 97153|start date/.test(value) &&
        /unconfirmed|not confirmed|not recorded|remain/.test(value)
      ) {
        return false;
      }
      return /\brbt\b.*(?:hired|assigned|matched)|(?:hired|assigned|matched).*\brbt\b/.test(value);
    },
  ],
  [
    'first-97153',
    (event: StoryFact): boolean => {
      const value = normalizedStoryText(event);
      return (
        !/(?:must|requires?|needs?) (?:to )?be confirmed|not confirmed|unconfirmed|structured.*confirm/.test(
          value
        ) &&
        /(?:first 97153|direct-care treatment).*(?:occurred|completed|started)|(?:occurred|completed|started).*(?:first 97153|direct-care treatment)/.test(
          value
        )
      );
    },
  ],
]);

export function explicitlyResolved(event: StoryFact, issueKey: string): boolean {
  const value = normalizedStoryText(event);
  if ((event.factType ?? '').toLowerCase() === 'auth-coverage-satisfied') {
    return false;
  }
  if (
    issueKey === 'treatment-plan' &&
    ['tp-completion-planned', 'tp-submission-planned'].includes(
      (event.factType ?? '').toLowerCase()
    )
  ) {
    return false;
  }
  if (
    issueKey === 'required-documentation' &&
    (event.factType ?? '').toLowerCase() === 'future-diagnostic-requirement'
  ) {
    return true;
  }
  if (
    issueKey === 'required-documentation' &&
    (event.factType ?? '').toLowerCase() === 'family-document-completed'
  ) {
    return true;
  }
  const rule = RESOLUTION_RULES.get(issueKey);
  if (rule) return rule(event);
  if (explicitlyUnresolved(event)) return false;
  return /\b(?:resolved|cleared|completed|received|obtained)\b/.test(value);
}
