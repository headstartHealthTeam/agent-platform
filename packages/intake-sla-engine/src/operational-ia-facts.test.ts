import { describe, expect, it } from 'vitest';

import { createOperationalFactContext } from './operational-fact-context.js';
import type { DatedOperationalFact, OperationalFactInput } from './operational-fact-context.js';
import { addIaOperationalFacts } from './operational-ia-facts.js';

function facts(text: string, extra: Partial<OperationalFactInput> = {}): DatedOperationalFact[] {
  const context = createOperationalFactContext({
    text,
    category: 'intakeScheduling',
    eventDate: '2026-09-24',
    asOf: '2026-09-24',
    ...extra,
  });
  addIaOperationalFacts(context);
  return context.facts;
}
const sla = { context: { noteType: 'sla' } };
describe('approved assessment conversation facts', () => {
  it('keeps a family meeting and a precursor consultation separate from the IA', () => {
    expect(
      facts('Meeting with provider next week.', {
        context: { direction: 'Inbound', line: 'Intake' },
      })
    ).toEqual([
      {
        milestoneDate: null,
        followUpDate: '2026-09-25',
        type: 'ia-family-consult-planned',
        summary:
          'The family reports a meeting with the assigned provider is planned for next week, but the source does not establish an exact date or confirm that the meeting is the initial assessment.',
        gateImpact:
          'A family-reported meeting is planned, but the IA appointment remains unconfirmed',
        owner: 'CSM',
        actionType: 'Provider Outreach',
        action:
          'CSM to confirm the meeting purpose and exact date and document the committed initial-assessment appointment.',
        relevance: 12,
        kind: 'IA_PRECURSOR_CONSULT',
      },
    ]);
    expect(facts('Initial consult with mom before assessment on 9/25.')).toMatchObject([
      {
        type: 'ia-family-consult-planned',
        actionType: 'Monitor',
        milestoneDate: '2026-09-25',
        followUpDate: '2026-09-25',
      },
    ]);
    expect(facts('Initial consult with mom before assessment on 9/20.')).toMatchObject([
      { actionType: 'Provider Outreach', followUpDate: '2026-09-25' },
    ]);
  });
  it('distinguishes underway, incomplete and reported completed assessments', () => {
    expect(
      facts('Initial assessment has started; provider needs to be added to Aloha.')
    ).toMatchObject([
      { type: 'ia-underway', actionType: 'Salesforce Update', milestoneDate: null },
    ]);
    expect(facts('Assessment is underway but not completed.')).toMatchObject([
      { type: 'ia-underway' },
    ]);
    expect(facts('Not yet completed the initial assessment.')).toMatchObject([
      { type: 'ia-incomplete' },
    ]);
    expect(facts('Assessment has been not yet completed.')).toMatchObject([
      { type: 'ia-incomplete' },
    ]);
    expect(facts('Assessment was completed.')).toMatchObject([
      {
        type: 'ia-completed',
        kind: 'IA_REPORTED_COMPLETED',
        milestoneDate: null,
        actionType: 'Salesforce Update',
      },
    ]);
    expect(facts('Once assessment is completed then treatment plan.')).toEqual([]);
  });
  it('retains expected steps and tentative planned dates without asserting occurrence', () => {
    expect(facts('Provider expected to complete IA on 9/25.', sla)).toMatchObject([
      { type: 'ia-planned-unconfirmed', actionType: 'Monitor', milestoneDate: '2026-09-25' },
    ]);
    expect(facts('IA to be completed on 9/20.', sla)).toMatchObject([
      {
        type: 'ia-planned-unconfirmed',
        actionType: 'Provider Outreach',
        followUpDate: '2026-09-25',
      },
    ]);
    expect(facts('Initial assessment scheduled for 9/25.')).toMatchObject([
      { type: 'ia-planned', actionType: 'Monitor', plannedDate: '2026-09-25', kind: 'IA_PLANNED' },
    ]);
    expect(facts('Tentative assessment scheduled for 9/20.')).toMatchObject([
      {
        type: 'ia-planned',
        actionType: 'Provider Outreach',
        summary:
          "The provider's tentative initial assessment date of 2026-09-20 passed without structured completion evidence.",
      },
    ]);
  });
  it('does not turn family contact into a scheduled assessment', () => {
    expect(facts('Family emailed on 9/25 for assessment scheduling.', sla)).toMatchObject([
      { type: 'ia-scheduling-outreach', milestoneDate: null },
    ]);
    expect(facts('Family never emailed for assessment scheduling.', sla)).toEqual([]);
    expect(facts('Family replied and contacted provider.', sla)).toMatchObject([
      {
        type: 'ia-scheduling-outreach',
        relevance: 11,
        gateImpact: 'Family contact is restored; provider scheduling remains unconfirmed',
      },
    ]);
    expect(facts('Provider working with family to schedule assessment.', sla)).toMatchObject([
      { type: 'ia-scheduling-outreach', relevance: 11 },
    ]);
    expect(facts('Following up to schedule assessment.')).toMatchObject([
      { type: 'ia-scheduling-outreach', relevance: 10 },
    ]);
  });
  it('retains observation and deferred-window distinctions', () => {
    expect(facts('Provider going out to observe.', sla)).toMatchObject([
      { type: 'ia-observation-planned', milestoneDate: null },
    ]);
    expect(facts('Provider going out to observe on 9/20.', sla)).toMatchObject([
      {
        type: 'ia-observation-planned',
        actionType: 'Provider Outreach',
        milestoneDate: '2026-09-20',
      },
    ]);
    expect(
      facts('Provider and family agreed to wait assessment closer to October.', sla)
    ).toMatchObject([
      { type: 'ia-deferred-window', milestoneDate: null, actionType: 'Provider Outreach' },
    ]);
    expect(
      facts('Provider and family agreed to wait until 9/25 for assessment.', sla)
    ).toMatchObject([
      { type: 'ia-deferred-window', milestoneDate: '2026-09-25', actionType: 'Monitor' },
    ]);
  });
  it('preserves an additional cancellation fact after the primary branch', () => {
    expect(facts('Assessment scheduled for 9/25 but canceled.').map((fact) => fact.type)).toEqual([
      'ia-planned',
      'ia-reschedule',
    ]);
    expect(facts('IA canceled.')).toMatchObject([{ type: 'ia-reschedule', milestoneDate: null }]);
    expect(facts('IA canceled.', { category: 'other' })).toEqual([]);
  });
  it('normalizes whitespace without changing the original occurrence distinctions', () => {
    for (const separator of [' ', '  ', '\t', '\n']) {
      const text = ['Not', 'yet', 'completed', 'the', 'initial', 'assessment.'].join(separator);
      expect(facts(text)).toEqual(facts('Not yet completed the initial assessment.'));
    }
  });
});
