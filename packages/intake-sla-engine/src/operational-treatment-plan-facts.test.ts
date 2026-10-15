import { describe, expect, it } from 'vitest';

import {
  createOperationalFactContext,
  dedupeOperationalFacts,
} from './operational-fact-context.js';
import type { DatedOperationalFact, OperationalFactInput } from './operational-fact-context.js';
import { addTreatmentPlanOperationalFacts } from './operational-treatment-plan-facts.js';

function facts(text: string, extra: Partial<OperationalFactInput> = {}): DatedOperationalFact[] {
  const context = createOperationalFactContext({
    text,
    category: 'treatmentPlan',
    eventDate: '2026-09-24',
    asOf: '2026-09-24',
    context: { noteType: 'sla', sourceType: 'Chatter', taskSubject: 'Pending TP' },
    ...extra,
  });
  addTreatmentPlanOperationalFacts(context);
  return context.facts;
}

describe('approved treatment-plan conversation facts', () => {
  it('preserves payer submission and internal review as distinct prerequisites', () => {
    expect(facts('Treatment plan pending insurance submission.')).toEqual([
      {
        milestoneDate: null,
        followUpDate: '2026-09-25',
        type: 'payer-submission-pending',
        summary:
          'The treatment plan is awaiting submission to the payer; the payer-submission date is not recorded.',
        gateImpact: 'Treatment-plan payer submission remains unconfirmed',
        owner: 'Insurance Ops',
        actionType: 'Insurance Follow-Up',
        action:
          'Insurance Ops to confirm the treatment plan was submitted to the payer and document the submission date.',
        relevance: 12,
        issueKey: 'payer-submission',
      },
    ]);
    expect(facts('Treatment plan submitted for Headstart review.')).toMatchObject([
      { type: 'tp-clinical-review', issueKey: 'clinical-review', milestoneDate: null },
    ]);
    expect(facts('Treatment plan corrected and pending secondary review.')).toMatchObject([
      {
        type: 'tp-clinical-review',
        summary:
          'The corrected treatment plan is awaiting secondary Clinical Quality review; the final disposition is not recorded.',
      },
    ]);
  });
  it('preserves family dependencies and independently appended signature facts', () => {
    const signatures = facts('Treatment plan waiting for parent signature before submission.');
    expect(signatures).toMatchObject([
      { type: 'tp-signature', actionType: 'Family Outreach', relevance: 12 },
      { type: 'tp-signature', actionType: 'Provider Outreach', relevance: 10 },
    ]);
    expect(dedupeOperationalFacts(signatures)).toMatchObject([
      { type: 'tp-signature', actionType: 'Family Outreach', relevance: 12 },
    ]);
    expect(facts('Waiting for assessment from family.')).toMatchObject([
      { type: 'tp-family-assessment-pending', owner: 'Intake' },
    ]);
    expect(
      facts('Vineland is over 90 days old and needs new assessment; plan is ready to submit.')
    ).toMatchObject([
      {
        type: 'tp-assessment-validity',
        requestedInformation: 'Clinical Quality guidance on whether the Vineland must be repeated',
      },
    ]);
  });
  it('does not turn completion or reported submission into structured disposition', () => {
    expect(facts('Treatment plan completed but has not submitted.')).toMatchObject([
      { type: 'tp-ready', relevance: 12, milestoneDate: null },
    ]);
    expect(facts('Treatment plan is completed.')).toMatchObject([
      { type: 'tp-ready', relevance: 10, milestoneDate: null },
    ]);
    expect(facts('Provider submitted the treatment plan on 9/23.')).toMatchObject([
      { type: 'tp-submitted', milestoneDate: null, followUpDate: '2026-09-25' },
    ]);
    expect(facts('Provider submitted auth request yesterday.')).toMatchObject([
      { type: 'tp-submitted', milestoneDate: '2026-09-23' },
    ]);
    expect(
      facts('Provider submitted auth request.', {
        context: {
          sourceType: 'Chatter',
          taskSubject: 'Pending TP',
          reportedOccurrenceDate: '2026-09-22',
        },
      })
    ).toMatchObject([{ type: 'tp-submitted', milestoneDate: '2026-09-22' }]);
    expect(facts('Provider submitted auth request.', { context: {} })).toEqual([]);
  });
  it('monitors future commitments and follows up passed or undated submission targets', () => {
    for (const [phrase, type] of [
      ['Treatment plan will be submitted', 'tp-submission-planned'],
      ['Treatment plan will be complete by', 'tp-completion-planned'],
    ] as const) {
      expect(facts(`${phrase} 9/25.`)).toMatchObject([
        { type, milestoneDate: '2026-09-25', followUpDate: '2026-09-25', actionType: 'Monitor' },
      ]);
      expect(facts(`${phrase} 9/20.`)).toMatchObject([
        {
          type,
          milestoneDate: '2026-09-20',
          followUpDate: '2026-09-25',
          actionType: 'Provider Outreach',
        },
      ]);
    }
    expect(facts('Treatment plan will be submitted.')).toMatchObject([
      { type: 'tp-submission-planned', milestoneDate: null, actionType: 'Provider Outreach' },
    ]);
    expect(facts('Treatment plan will be complete by the target.')).toMatchObject([
      {
        type: 'tp-completion-planned',
        milestoneDate: null,
        followUpDate: null,
        actionType: 'Monitor',
      },
    ]);
  });
  it('retains not-started, drafting and requested-edit specificity', () => {
    expect(facts('Treatment plan not started while waiting for school schedule.')).toMatchObject([
      {
        type: 'tp-not-started',
        gateImpact: "Treatment-plan work is waiting on the family's school schedule",
      },
    ]);
    expect(facts('Treatment plan not started.')).toMatchObject([{ type: 'tp-not-started' }]);
    expect(
      facts('Treatment plan requires revisions to baseline data and measurable goals.')
    ).toMatchObject([{ type: 'tp-revisions', relevance: 11, issueKey: 'clinical-review' }]);
    expect(facts('Treatment plan needs corrections.')).toMatchObject([
      { type: 'tp-revisions', relevance: 10 },
    ]);
    for (const [suffix, gateImpact] of [
      [
        'while waiting for RBT staffing',
        'Treatment-plan submission is delayed while RBT staffing remains unresolved',
      ],
      [
        'during home renovation',
        'Treatment-plan drafting is delayed by a reported home disruption',
      ],
      ['', 'Treatment plan drafting remains incomplete'],
    ] as const) {
      expect(facts(`Provider working on treatment plan ${suffix}.`)).toMatchObject([
        { type: 'tp-drafting', gateImpact, milestoneDate: null },
      ]);
    }
    expect(facts('Provider out of office.')).toMatchObject([{ type: 'tp-provider-unavailable' }]);
  });
  it('preserves signature format and completed-signature exclusions', () => {
    expect(facts('Treatment plan typed name signature needs to sign again.')).toMatchObject([
      { type: 'tp-signature-format', actionType: 'Family Outreach' },
    ]);
    expect(facts('Treatment plan signatures are completed.')).toMatchObject([{ type: 'tp-ready' }]);
    expect(facts('Treatment plan no parent signatures are needed.')).toEqual([]);
    expect(facts('Treatment plan missing parent signature.', { context: {} })).toMatchObject([
      { type: 'tp-signature', relevance: 10, actionType: 'Provider Outreach' },
    ]);
  });
  it('keeps status questions, category routing and whitespace behavior unchanged', () => {
    expect(facts('Has treatment plan been completed?')).toEqual([]);
    expect(facts('Could you check the treatment plan status?')).toEqual([]);
    expect(facts('Treatment plan is completed.', { category: 'other', context: {} })).toEqual([]);
    expect(facts('Treatment plan is completed.', { category: 'other' })).toMatchObject([
      { type: 'tp-ready' },
    ]);
    expect(facts('Ordinary non-operational message.')).toEqual([]);
    for (const separator of [' ', '  ', '\t', '\n']) {
      expect(
        facts(['Treatment', 'plan', 'will', 'be', 'submitted', '9/25.'].join(separator))
      ).toEqual(facts('Treatment plan will be submitted 9/25.'));
    }
  });
});
