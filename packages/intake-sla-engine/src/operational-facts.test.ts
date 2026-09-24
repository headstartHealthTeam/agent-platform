import { describe, expect, it } from 'vitest';

import type { DatedOperationalFact, OperationalFactInput } from './operational-fact-context.js';
import { extractOperationalFacts } from './operational-facts.js';

function facts(text: string, extra: Partial<OperationalFactInput> = {}): DatedOperationalFact[] {
  return extractOperationalFacts({
    text,
    category: 'other',
    eventDate: '2026-09-24',
    asOf: '2026-09-24',
    context: { noteType: 'sla' },
    ...extra,
  });
}
describe('approved complete operational fact extraction', () => {
  it.each([
    ['Provider may not continue working with Headstart.', 'provider-viability'],
    ['Provider declined the case; need replacement provider.', 'provider-viability'],
    ['Provider outside their scope and transfer needed.', 'provider-viability'],
    ['Family contact difficult; likely close the case.', 'intake-continuation-decision'],
    ['Family availability changed; may discharge.', 'intake-continuation-decision'],
    ['Provider missed meetings.', 'provider-unresponsive'],
    ['RBT credentialing pending.', 'rbt-credentialing'],
    [
      'Partial approval 20 hours a week approved; reconsideration for more hours.',
      'auth-partial-approval',
    ],
    ['Family still needs to sign.', 'family-signature-pending'],
    [
      'Family and provider working on requirement, not in a hurry.',
      'family-prerequisite-in-progress',
    ],
    ['Sick family canceled assessment.', 'ia-medical-reschedule'],
    ['Case on hold pending restart.', 'provider-hold'],
    ['Provider requested hold for sibling.', 'paired-hold'],
    [
      'State fair hearing requested for both siblings, traditional Medicaid.',
      'auth-state-fair-hearing',
    ],
    ['Parent portion completed; remaining assessment session pending.', 'ia-partial'],
    ['Provider at capacity.', 'provider-capacity'],
    ['BCBA missing, needs to be added to Aloha.', 'rendering-provider-missing'],
    ['No response to family outreach.', 'family-unresponsive'],
    ['Insurance coverage inactive.', 'insurance-eligibility-inactive'],
    ['Family trying to close other authorization.', 'auth-overlap-closure-pending'],
    ['Outreach for overlapping prior provider authorization.', 'auth-overlap-family-outreach'],
    ['Pending insurance approval.', 'auth-pending'],
  ] as const)('retains the existing fact for %s', (text, type) => {
    expect(facts(text).map((fact) => fact.type)).toContain(type);
  });
  it('preserves common/category ordering and relevance-based deduplication', () => {
    expect(
      facts('Provider missed meetings. Provider is unresponsive.', { category: 'rbt' }).filter(
        (fact) => fact.type === 'provider-unresponsive'
      )
    ).toMatchObject([
      {
        relevance: 12,
        summary:
          'The provider missed repeated CSM follow-ups, so the current clinical milestone and committed next date remain unconfirmed.',
      },
    ]);
    expect(
      facts('Treatment plan waiting for parent signature before submission.', {
        category: 'treatmentPlan',
      }).filter((fact) => fact.type === 'tp-signature')
    ).toMatchObject([{ relevance: 12, actionType: 'Family Outreach' }]);
    expect(
      facts(
        'Parent-focused and child-focused assessment sessions both occurred. Initial assessment completed on 9/23.',
        { category: 'treatmentPlan' }
      ).filter((fact) => fact.type === 'ia-completed')
    ).toMatchObject([
      {
        summary:
          'The provider reports that both parent- and child-focused initial-assessment appointments occurred, but the structured IA completion date still requires verification.',
        milestoneDate: null,
      },
    ]);
    expect(
      facts('Authorization denied but effective date needs correction.', {
        category: 'insurance',
      }).map((fact) => fact.type)
    ).toEqual(['auth-date-correction', 'auth-denied']);
  });
  it('keeps service constraints specific to the controlling gate', () => {
    expect(facts('School cannot accommodate an RBT.', { category: 'rbt' })).toMatchObject([
      { type: 'rbt-service-setting-constraint' },
    ]);
    expect(
      facts('Split custody and availability conflict.', { category: 'treatmentPlan' })
    ).toMatchObject([{ type: 'family-availability' }]);
    expect(facts('RBT candidate available schedule hours.', { category: 'treatmentPlan' })).toEqual(
      []
    );
    expect(facts('Interpreter needed.', { category: 'insurance' })).toMatchObject([
      { type: 'interpreter' },
    ]);
    expect(facts('Interpreter needed.')).toEqual([]);
    expect(
      facts('Provider may not continue working with Headstart.', { category: 'rbt' })
    ).toMatchObject([
      {
        summary:
          'The client is ready for direct-care scheduling, but the provider has not confirmed continuing with Headstart; the first 97153 plan remains unconfirmed.',
      },
    ]);
  });
  it('does not infer family nonresponse from an inbound message or third-party complaint', () => {
    expect(facts('From mom: we have not heard from provider.')).toEqual([]);
    expect(facts('No response.', { context: { direction: 'Inbound', line: 'Intake' } })).toEqual(
      []
    );
    expect(facts('Family unresponsive, inactive coverage.')).toMatchObject([
      { type: 'family-unresponsive', relevance: 11 },
    ]);
    expect(
      facts(
        'Assessment authorization overlap; treatment authorization is in place, services can start.'
      )
    ).toEqual([]);
  });
  it('preserves diagnostic-document progress and future-cycle exclusions', () => {
    expect(facts('Need psychological evaluation.', { category: 'insurance' })).toMatchObject([
      {
        type: 'required-document',
        requestedInformation: 'a current diagnostic evaluation or report',
      },
    ]);
    expect(
      facts('Need wet signature on diagnostic evaluation.', { category: 'insurance' })
    ).toMatchObject([{ type: 'auth-signature-documentation' }]);
    expect(
      facts('Updated diagnosis required before next authorization.', { category: 'insurance' })
    ).toMatchObject([{ type: 'future-diagnostic-requirement', actionType: 'Monitor' }]);
    expect(
      facts('BASC shows as completed; Vineland outstanding. I have now completed it.', {
        category: 'treatmentPlan',
        context: { direction: 'Inbound', line: 'Intake' },
      })
    ).toMatchObject([{ type: 'family-document-completed', relevance: 12 }]);
    expect(
      facts('Psychiatrist working on appointment for an evaluation, updated diagnosis needed.', {
        category: 'insurance',
        context: { direction: 'Inbound', line: 'Intake' },
      }).find((fact) => fact.type === 'family-document-update')
    ).toMatchObject({
      summary:
        'The psychiatrist has the latest IEP and is arranging the diagnostic-evaluation appointment; the updated report has not been received.',
    });
    expect(
      facts('Family planning to obtain new diagnosis.', { category: 'insurance' }).find(
        (fact) => fact.type === 'family-document-update'
      )
    ).toMatchObject({
      summary:
        'The family plans to obtain a new diagnostic evaluation; the updated report has not been received.',
    });
  });
  it('keeps reported completion and insurance statements qualified', () => {
    expect(facts('Initial assessment completed on 9/23.')).toMatchObject([
      { type: 'ia-completed', kind: 'IA_REPORTED_COMPLETED', milestoneDate: '2026-09-23' },
    ]);
    expect(facts('Initial assessment not yet completed.')).toEqual([]);
    expect(
      facts('Once assessment completed then treatment plan.').some(
        (fact) => fact.type === 'ia-completed'
      )
    ).toBe(false);
    expect(facts('Pending insurance approval.')).toMatchObject([
      { category: 'insurance', specificityMissing: true },
    ]);
    expect(facts('IA pending insurance approval.')).toMatchObject([{ specificityMissing: false }]);
    expect(facts('Not pending insurance approval.')).toEqual([]);
    expect(facts('Pending insurance approval?')).toEqual([]);
  });
});
