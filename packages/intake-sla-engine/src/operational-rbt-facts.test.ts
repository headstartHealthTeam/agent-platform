import { describe, expect, it } from 'vitest';

import {
  createOperationalFactContext,
  dedupeOperationalFacts,
} from './operational-fact-context.js';
import type { DatedOperationalFact, OperationalFactInput } from './operational-fact-context.js';
import { addRbtOperationalFacts } from './operational-rbt-facts.js';

function facts(text: string, extra: Partial<OperationalFactInput> = {}): DatedOperationalFact[] {
  const context = createOperationalFactContext({
    text,
    category: 'rbt',
    eventDate: '2026-09-24',
    asOf: '2026-09-24',
    ...extra,
  });
  addRbtOperationalFacts(context);
  return context.facts;
}
describe('approved staffing and first-service conversation facts', () => {
  it('reports stated occurrence but requires structured first-service verification', () => {
    expect(facts('Treatment started.')).toEqual([
      {
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
        milestoneDate: null,
        followUpDate: '2026-09-25',
      },
    ]);
    expect(facts('Treatment started but will start soon.')).toEqual([]);
    expect(facts('Treatment started.', { category: 'other' })).toEqual([]);
  });
  it('keeps future, past and conditional first-service commitments distinct', () => {
    expect(facts('First day is 9/25.')).toMatchObject([
      {
        type: 'treatment-start-planned',
        actionType: 'Monitor',
        milestoneDate: '2026-09-25',
        followUpDate: '2026-09-25',
      },
    ]);
    expect(facts('First day is 9/20.')).toMatchObject([
      { actionType: 'Provider Outreach', milestoneDate: '2026-09-20', followUpDate: '2026-09-25' },
    ]);
    expect(
      facts('The family tentatively requested to start on 9/25 using current RBT.')
    ).toMatchObject([
      {
        type: 'treatment-start-conditional',
        owner: 'RBT Team',
        actionType: 'RBT Follow-Up',
        milestoneDate: '2026-09-25',
        relevance: 12,
      },
    ]);
    expect(facts('The family requested to start on the 25th.')).toMatchObject([
      { milestoneDate: '2026-09-25' },
    ]);
  });
  it('does not manufacture a milestone from readiness or coordination', () => {
    expect(facts('Ready to schedule direct care.')).toMatchObject([
      { type: 'treatment-ready-to-schedule', milestoneDate: null, actionType: 'Provider Outreach' },
    ]);
    expect(facts('Provider coordinating with family on start date.')).toEqual([]);
    expect(facts('Provider will coordinate with family on start date.')).toMatchObject([
      { type: 'treatment-start-coordination', milestoneDate: null },
    ]);
    expect(facts('Provider onboarding handbook with RBT this week.')).toMatchObject([
      {
        type: 'treatment-start-coordination',
        summary:
          'Provider onboarding with the assigned RBT is underway, but the first 97153 appointment date is not yet confirmed.',
      },
    ]);
    expect(
      facts('Current RBT and family scheduling remain unresolved.', {
        context: { noteType: 'sla' },
      })
    ).toMatchObject([{ type: 'rbt-existing-coverage-scheduling', relevance: 12 }]);
    expect(facts('Current RBT and family scheduling remain unresolved.')).toEqual([]);
  });
  it('retains independent nonresponse and lost-coverage signals and priority', () => {
    expect(facts('Provider is not responding to calls.').map((fact) => fact.type)).toEqual([
      'provider-unresponsive',
      'rbt-lost',
    ]);
    expect(facts('RBT left after candidate hired.')).toMatchObject([{ type: 'rbt-lost' }]);
    expect(facts('Candidate hired after first interview.')).toMatchObject([
      { type: 'rbt-assigned' },
    ]);
  });
  it.each([
    ['Background check.', 'background screening'],
    ['Second interview.', 'second interview'],
    ['First interview.', 'first interview'],
    ['Offer accepted; offer letter.', 'offer accepted'],
    ['Pending offer.', 'offer pending'],
    ['Offer extended.', 'offer extended'],
    ['Provider interview.', 'provider interview'],
    ['Candidate screening.', 'screening'],
    ['Candidate proposed.', 'proposed to the provider'],
    ['Offer letter.', 'candidate review'],
  ])('retains candidate step for %s', (text, candidateStep) => {
    expect(facts(text)).toMatchObject([
      { type: 'rbt-candidate', candidateStep, milestoneDate: null, followUpDate: '2026-09-25' },
    ]);
  });
  it('retains recruiting without treating the source header as progress', () => {
    expect(facts('Staffing and scheduling update')).toEqual([]);
    expect(facts('Need an RBT.')).toMatchObject([
      { type: 'rbt-recruiting', milestoneDate: null, relevance: 8 },
    ]);
    expect(facts('Start\nservices on 9/25.')).toEqual([]);
    expect(facts('Family requested to start\nservices on 9/25.')).toMatchObject([
      { type: 'treatment-start-planned' },
    ]);
  });
});
describe('operational fact dates and deduplication', () => {
  it.each([
    ['First day 9/25.', {}, '2026-09-25'],
    ['This afternoon.', {}, '2026-09-24'],
    ['Tonight.', {}, '2026-09-24'],
    ['Yesterday.', {}, '2026-09-23'],
    ['Last night.', { occurrenceDateAnchored: true }, null],
    ['Tomorrow.', {}, '2026-09-25'],
    ['No date.', {}, null],
  ])('retains contextual date meaning for %s', (text, context, date) => {
    expect(
      createOperationalFactContext({
        text,
        context,
        category: 'other',
        eventDate: '2026-09-24',
        asOf: '2026-09-24',
      }).date
    ).toBe(date);
  });
  it('uses next business day only for the fallback and never invents a milestone', () => {
    const context = createOperationalFactContext({
      text: 'No date.',
      category: 'other',
      eventDate: '2026-09-25',
      asOf: '2026-09-25',
    });
    const fact = {
      type: 'synthetic',
      summary: 'Synthetic fact',
      owner: 'Owner',
      actionType: 'Monitor',
      action: 'Monitor',
      relevance: 1,
    };
    context.add(fact);
    context.add({ ...fact, relevance: 3, milestoneDate: '2026-09-30', followUpDate: null });
    expect(context.facts).toEqual([
      { ...fact, milestoneDate: null, followUpDate: '2026-09-28' },
      { ...fact, relevance: 3, milestoneDate: '2026-09-30', followUpDate: null },
    ]);
    expect(dedupeOperationalFacts(context.facts)).toEqual([context.facts[1]]);
    expect(context.facts).toHaveLength(2);
  });
});
