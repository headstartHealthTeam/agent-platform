import { describe, expect, it } from 'vitest';

import {
  cleanConversationSentence,
  isTreatmentPlanStatusInquiry,
  normalizeOperationalText,
  reportsTreatmentPlanSubmission,
  stripConversationHtml,
  treatmentPlanRevisionTopics,
} from './conversation-text.js';
import { extractRequestedInformation } from './requested-information.js';

describe('existing conversation text projection', () => {
  it('keeps its distinct normalization and HTML entity semantics', () => {
    expect(normalizeOperationalText('Café + TP@Provider.')).toBe('cafe tp provider');
    expect(
      stripConversationHtml('<p>A<br/>B &nbsp;&amp; &apos; &#39; &quot; &gt; &lt; &#65;</p>')
    ).toBe("A B & ' ' \" > < &#65;");
    expect(cleanConversationSentence('[Synthetic speaker] <p>Plan is ready.</p>')).toBe(
      'Plan is ready.'
    );
    expect(stripConversationHtml(null)).toBe('null');
    expect(normalizeOperationalText()).toBe('');
    expect(cleanConversationSentence()).toBe('');
  });
  it.each([
    'Can you confirm the treatment plan?',
    'When will the provider complete the plan?',
    'Has the treatment plan been submitted?',
    'Treatment plan ready?',
  ])('preserves a status inquiry: %s', (text) => {
    expect(isTreatmentPlanStatusInquiry(text)).toBe(true);
    expect(reportsTreatmentPlanSubmission(text)).toBe(false);
  });
  it('retains affirmative provider-submission evidence but not a future plan or authorization request', () => {
    expect(reportsTreatmentPlanSubmission('The provider submitted the plan.')).toBe(true);
    expect(reportsTreatmentPlanSubmission('Found it, it was sent.')).toBe(true);
    expect(reportsTreatmentPlanSubmission('They sent the plan.')).toBe(true);
    expect(reportsTreatmentPlanSubmission('The provider will have submitted tomorrow.')).toBe(
      false
    );
    expect(reportsTreatmentPlanSubmission('The provider submitted an authorization request.')).toBe(
      false
    );
    expect(
      reportsTreatmentPlanSubmission(
        'Has the provider submitted the treatment plan?\n--- Reply 1 of 1 ---\nThey submitted the plan.'
      )
    ).toBe(true);
    expect(reportsTreatmentPlanSubmission('=== Synthetic thread ===\n')).toBe(false);
    expect(isTreatmentPlanStatusInquiry()).toBe(false);
    expect(reportsTreatmentPlanSubmission()).toBe(false);
  });
  it('retains the existing treatment-plan revision topic order', () => {
    expect(
      treatmentPlanRevisionTopics(
        'Baseline data; measurable goals; overall progress summary; requested hours; discharge plan'
      )
    ).toEqual([
      'behavior definitions, baselines, and reduction goals',
      'measurable acquisition goals and scoring',
      'an overall progress summary',
      'clinical rationale for the requested services',
      'the transition or discharge plan',
    ]);
    expect(treatmentPlanRevisionTopics()).toEqual([]);
  });
});
describe('existing requested-information projection', () => {
  it.each([
    ['Need a current diagnostic report', 'a current diagnostic evaluation or report'],
    ['The psychiatrist has an evaluation appointment', 'a current diagnostic evaluation or report'],
    ['Need ADOS-2', 'a diagnostic evaluation using a validated autism-specific assessment tool'],
    ['Need service order', 'a signed service order'],
    ['Need Vineland', 'the Vineland assessment'],
    ['Need BASC', 'the BASC assessment'],
    ['Need PDDBI', 'the PDDBI assessment'],
    ['Intake packet', 'the new-client onboarding packet'],
    ['Guardian signature', 'the parent or guardian signature'],
    ['BCBA signature', 'the provider signature'],
    ['Clinical records', 'the requested clinical records'],
    ['Treatment plan corrections', 'the requested treatment-plan corrections'],
    ['Coordination of benefits', 'corrected coordination-of-benefits information'],
    [
      'Existing authorization termination',
      'confirmation that the prior ABA authorization was terminated',
    ],
    [
      'Terminate existing authorization',
      'confirmation that the prior ABA authorization was terminated',
    ],
    ['Insurance card', 'a copy of the insurance card'],
    ['NPI', 'the required provider or credentialing information'],
    ['SRS-2 caregiver respondent', 'an updated SRS-2 completed by the parent or caregiver'],
    ['SIPA rater', 'corrected SIPA child, rater, and relationship fields'],
    ['Vineland examiner credential', 'the Vineland examiner name and credential'],
    ['PSI child name', 'corrected PSI child, rater, respondent, and relationship fields'],
    ['Behavioral skills assessment outdated', 'an updated behavioral skills assessment'],
    ['ABLLS-R graph', 'the ABLLS-R graph or grid'],
    ['Referral', 'the ABA referral'],
    ['Referral/auth', 'the ABA referral/authorization'],
  ])('retains the approved mapping for %s', (text, expected) => {
    expect(extractRequestedInformation(text)).toBe(expected);
  });
  it('preserves specific referral identity, supersession, deduplication and the existing three-item limit', () => {
    expect(extractRequestedInformation("Tricare referral in Synthetic Provider's name")).toBe(
      "the Tricare ABA referral/authorization in Synthetic Provider's name"
    );
    expect(
      extractRequestedInformation("Tricare authorization in Synthetic Test Provider's name")
    ).toBe("the Tricare ABA referral/authorization in Synthetic Test Provider's name");
    expect(extractRequestedInformation('Tricare referral')).toBe(
      'the Tricare ABA referral/authorization'
    );
    expect(extractRequestedInformation('Need diagnostic report and ADOS-2')).toBe(
      'a diagnostic evaluation using a validated autism-specific assessment tool'
    );
    expect(extractRequestedInformation('Vineland examiner credential and Vineland')).toBe(
      'the Vineland examiner name and credential'
    );
    expect(extractRequestedInformation('BASC BASC Vineland PDDBI intake packet')).toBe(
      'the Vineland assessment and the BASC assessment and the PDDBI assessment'
    );
    expect(extractRequestedInformation('Unrelated update')).toBeNull();
    expect(extractRequestedInformation()).toBeNull();
  });
});
