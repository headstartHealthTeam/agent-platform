import type { StoryFact, StoryGateOverride } from './story-types.js';
import { normalizedStoryText } from './story-values.js';

const STORY_CSM = 'CSM';
const STORY_PROVIDER_OUTREACH = 'Provider Outreach';
const STORY_FIRST_97153 = 'first-97153';

interface SuccessorContext {
  readonly event: StoryFact;
  readonly value: string;
  readonly planReadyForSubmission: boolean;
}
const SUCCESSOR_RULES = [
  {
    test: ({ event }: SuccessorContext): boolean =>
      event.factType === 'tp-portal-submitted-awaiting-clinical-quality',
    value: (): StoryGateOverride => {
      return {
        issueKey: 'clinical-review',
        unresolvedGate:
          'Create the Salesforce Treatment Authorization and Clinical Quality records and move the Opportunity to Treatment Plan In-review',
        owner: 'Insurance Ops',
        recommendedAction:
          'Insurance Ops to create the Salesforce Treatment Authorization and Clinical Quality records and move the Opportunity to Treatment Plan In-review.',
        recommendedActionType: 'Salesforce Update',
      };
    },
  },
  {
    test: ({ value, planReadyForSubmission }: SuccessorContext): boolean =>
      !planReadyForSubmission &&
      /treatment plan.*(?:reported )?(?:submitted|sent)/.test(value) &&
      !/(?:submitted|sent).*(?:to )?(?:the )?payer/.test(value),
    value: (): StoryGateOverride => {
      return {
        issueKey: 'clinical-review',
        unresolvedGate: 'Confirm Clinical Quality disposition and any requested edits',
        owner: STORY_CSM,
        recommendedAction:
          'CSM to confirm the submitted treatment plan entered Clinical Quality review and identify any requested edits.',
        recommendedActionType: STORY_PROVIDER_OUTREACH,
      };
    },
  },
  {
    test: ({ value, planReadyForSubmission }: SuccessorContext): boolean =>
      planReadyForSubmission ||
      (/treatment plan.*(?:complete|ready to submit)/.test(value) &&
        !/(?:submitted|sent).*(?:to )?(?:the )?payer/.test(value)),
    value: (): StoryGateOverride => {
      return {
        issueKey: 'payer-submission',
        unresolvedGate:
          'Submit the completed treatment plan for Headstart review and record the submission date',
        owner: STORY_CSM,
        recommendedAction:
          'CSM to confirm the completed treatment plan was submitted for review and record the submission date.',
        recommendedActionType: STORY_PROVIDER_OUTREACH,
      };
    },
  },
  {
    test: ({ value }: SuccessorContext): boolean =>
      /(?:submitted|sent).*(?:to )?(?:the )?payer/.test(value),
    value: (): StoryGateOverride => {
      return {
        issueKey: 'treatment-authorization',
        unresolvedGate: 'Receive the current treatment authorization determination',
        owner: 'Insurance Ops',
        recommendedAction:
          'Insurance Ops to confirm the current payer determination and document the response and next follow-up date.',
        recommendedActionType: 'Insurance Follow-Up',
      };
    },
  },
  {
    test: ({ event, value }: SuccessorContext): boolean =>
      /initial authorization.*(?:approved|no auth needed)/.test(value) ||
      (event.source === 'Authorization' &&
        event.issueKey === 'initial-authorization' &&
        ['auth-approved', 'auth-no-auth-needed'].includes(event.factType ?? '')),
    value: (): StoryGateOverride => {
      return {
        issueKey: 'initial-assessment',
        unresolvedGate:
          'Confirm a committed initial-assessment plan and evidence that the assessment occurred',
        owner: STORY_CSM,
        recommendedAction:
          'CSM to confirm the planned or completed initial-assessment date with the provider and update the structured record.',
        recommendedActionType: STORY_PROVIDER_OUTREACH,
      };
    },
  },
  {
    test: ({ event, value }: SuccessorContext): boolean =>
      /treatment authorization.*(?:approved|no auth needed)/.test(value) ||
      (event.source === 'Authorization' &&
        event.issueKey === 'treatment-authorization' &&
        ['auth-approved', 'auth-no-auth-needed'].includes(event.factType ?? '')),
    value: (): StoryGateOverride => {
      return {
        issueKey: STORY_FIRST_97153,
        unresolvedGate: 'Confirm RBT staffing and the first 97153 service date',
        owner: STORY_CSM,
        recommendedAction:
          'CSM to confirm RBT coverage and the agreed first 97153 date with the provider.',
        recommendedActionType: STORY_PROVIDER_OUTREACH,
      };
    },
  },
  {
    test: ({ value }: SuccessorContext): boolean =>
      /(?:initial assessment|97151).*(?:occurred|completed)/.test(value),
    value: (): StoryGateOverride => {
      return {
        issueKey: 'treatment-plan',
        unresolvedGate: 'Complete treatment-plan drafting and required signatures',
        owner: STORY_CSM,
        recommendedAction:
          'CSM to confirm the treatment-plan status, outstanding prerequisites, and committed submission date with the provider.',
        recommendedActionType: STORY_PROVIDER_OUTREACH,
      };
    },
  },
  {
    test: ({ value }: SuccessorContext): boolean =>
      /\brbt\b.*(?:hired|assigned|matched)|(?:hired|assigned|matched).*\brbt\b/.test(value),
    value: (event: StoryFact): StoryGateOverride => {
      if (event.milestoneDate) {
        return {
          issueKey: STORY_FIRST_97153,
          unresolvedGate: 'Confirm the first 97153 service date',
          owner: STORY_CSM,
          recommendedAction:
            'CSM to monitor the planned first 97153 milestone and confirm the completed service date.',
          recommendedActionType: 'Monitor',
          recommendedFollowUpDate: event.milestoneDate,
        };
      }
      return {
        issueKey: STORY_FIRST_97153,
        unresolvedGate: 'Confirm the first 97153 service date',
        owner: STORY_CSM,
        recommendedAction:
          'CSM to confirm the agreed first 97153 date with the provider and document it in Salesforce.',
        recommendedActionType: STORY_PROVIDER_OUTREACH,
      };
    },
  },
];

export function successorGateFrom(event: StoryFact | null | undefined): StoryGateOverride | null {
  if (!event) return null;
  const context: SuccessorContext = {
    event,
    value: normalizedStoryText(event),
    planReadyForSubmission: event.factType === 'tp-ready',
  };
  const rule = SUCCESSOR_RULES.find((candidate) => candidate.test(context));
  return rule ? rule.value(event) : null;
}
