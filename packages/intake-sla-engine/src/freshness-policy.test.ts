import { describe, expect, it } from 'vitest';

import type { FreshnessCandidateSummary, FreshnessFamily } from './freshness-candidate-types.js';
import {
  isConcreteOperationalUpdate,
  isGenericOperationalPlaceholder,
} from './freshness-classification.js';
import { processGateScore } from './freshness-score.js';
import { synthesizedFact } from './freshness-summary.js';

function candidate(
  summary: string,
  source = 'Gmail',
  extra: Partial<FreshnessCandidateSummary> = {}
): FreshnessCandidateSummary {
  return { source, summary, kind: 'discussion', matchQuality: 'Direct', ...extra };
}
describe('existing freshness candidate policy', () => {
  it('does not promote weak identity, search bundles or administrative requests even with facts', () => {
    const facts = [{ type: 'typed', summary: 'Typed operational update', relevance: 20 }];
    for (const row of [
      candidate('Awaiting approval', 'Gmail', { kind: 'search-bundle', operationalFacts: facts }),
      candidate('Awaiting approval', 'Gmail', { matchQuality: 'Weak', operationalFacts: facts }),
      candidate('Has the family responded?', 'SLA update', { operationalFacts: facts }),
    ]) {
      expect(isConcreteOperationalUpdate('insurance', row)).toBe(false);
    }
    expect(isConcreteOperationalUpdate('insurance', null)).toBe(false);
    expect(isConcreteOperationalUpdate('insurance', candidate(''))).toBe(false);
    expect(isConcreteOperationalUpdate('insurance', candidate('Human context', 'SLA update'))).toBe(
      true
    );
  });
  it.each<{
    family: FreshnessFamily;
    summary: string;
    source: string;
    concrete: boolean;
    score: number;
  }>([
    {
      family: 'insurance',
      summary: 'pending authorization',
      source: 'Authorization',
      concrete: true,
      score: 15,
    },
    {
      family: 'insurance',
      summary: 'Verification complete',
      source: 'VOB',
      concrete: true,
      score: 10,
    },
    {
      family: 'insurance',
      summary: 'pending authorization',
      source: 'SLA update',
      concrete: true,
      score: 10,
    },
    {
      family: 'insurance',
      summary: 'missing diagnostic report',
      source: 'Gmail',
      concrete: true,
      score: 15,
    },
    { family: 'insurance', summary: 'insurance card', source: 'Gmail', concrete: false, score: 7 },
    {
      family: 'treatmentPlan',
      summary: 'In review',
      source: 'Clinical Quality',
      concrete: true,
      score: 12,
    },
    {
      family: 'treatmentPlan',
      summary: 'Treatment plan submitted',
      source: 'Gmail',
      concrete: true,
      score: 9,
    },
    {
      family: 'treatmentPlan',
      summary: 'Family custody decision waiting',
      source: 'Fireflies',
      concrete: true,
      score: 1,
    },
    {
      family: 'treatmentPlan',
      summary: 'Follow-up treatment plan',
      source: 'Gmail',
      concrete: false,
      score: 9,
    },
    {
      family: 'rbt',
      summary: 'Recruiting launched',
      source: 'RBT Request',
      concrete: true,
      score: 15,
    },
    {
      family: 'rbt',
      summary: 'Interview scheduled',
      source: 'RBT First Interview',
      concrete: true,
      score: 15,
    },
    { family: 'rbt', summary: 'Staffing inactive', source: 'Staffing', concrete: true, score: 15 },
    {
      family: 'rbt',
      summary: 'first 97153 scheduled',
      source: 'Linked Billing / Claims',
      concrete: true,
      score: 16,
    },
    { family: 'rbt', summary: 'RBT outreach', source: 'Gmail', concrete: false, score: 9 },
    {
      family: 'intakeScheduling',
      summary: 'Assessment scheduled for 9/25',
      source: 'Linked Billing / Claims',
      concrete: true,
      score: 13,
    },
    {
      family: 'intakeScheduling',
      summary: 'Insurance resolved, can schedule',
      source: 'Gmail',
      concrete: true,
      score: 15,
    },
    {
      family: 'intakeScheduling',
      summary: 'Initial authorization approved',
      source: 'Authorization',
      concrete: true,
      score: 6,
    },
    {
      family: 'intakeScheduling',
      summary: 'Family assessment packet not completed',
      source: 'Gmail',
      concrete: true,
      score: 8,
    },
    {
      family: 'intakeScheduling',
      summary: 'Follow-up only',
      source: 'Gmail',
      concrete: false,
      score: 1,
    },
  ])(
    'retains $family / $source priority for $summary',
    ({ family, summary, source, concrete, score }) => {
      const row = candidate(summary, source);
      expect(isConcreteOperationalUpdate(family, row)).toBe(concrete);
      expect(processGateScore(family, row)).toBe(score);
    }
  );
  it('preserves source priority, critical-fact overrides and relevance order', () => {
    const typed = candidate('Text', 'Gmail', {
      operationalFacts: [{ type: 'typed', summary: 'Supported fact', relevance: 20 }],
    });
    expect(processGateScore('insurance', typed)).toBe(20);
    expect(processGateScore('insurance', { ...typed, source: 'Authorization' })).toBe(15);
    expect(
      processGateScore('intakeScheduling', {
        ...typed,
        operationalFacts: [{ type: 'ia-partial', summary: 'Partial progress', relevance: 20 }],
      })
    ).toBe(15);
    expect(synthesizedFact('insurance', typed)).toBe('Supported fact');
    expect(isConcreteOperationalUpdate('insurance', typed)).toBe(true);
  });
  it('retains phase/payer wording and the insurance branch fallthrough', () => {
    expect(
      synthesizedFact('insurance', candidate('Pending appeal'), {
        phase: 'treatment',
        payer: 'Fiction Payer',
      })
    ).toBe('Treatment authorization appeal remains pending with Fiction Payer.');
    expect(synthesizedFact('insurance', candidate('Denied'), { payer: 'Primary' })).toBe(
      'Initial authorization was denied; the denial basis and next payer action are not documented.'
    );
    expect(synthesizedFact('insurance', candidate('VOB verification'))).toBe('');
    expect(synthesizedFact('insurance', candidate('interpreter required'))).toBe(
      'Interpreter or translation support is required before the initial assessment can be scheduled.'
    );
  });
  it('does not equate proposed staffing, scheduled service or unsigned plans with completion', () => {
    expect(
      synthesizedFact('rbt', candidate('Candidate hired', 'Staffing', { candidateName: 'Fiction' }))
    ).toContain('assignment and the first 97153 appointment are not yet confirmed');
    expect(
      synthesizedFact(
        'rbt',
        candidate('Candidate interview', 'Staffing', {
          candidateName: 'Fiction',
          candidateStep: '',
        })
      )
    ).toContain('the interview step');
    expect(synthesizedFact('rbt', candidate('First 97153 scheduled'))).toContain(
      'completion remains to be confirmed'
    );
    expect(synthesizedFact('treatmentPlan', candidate('Parent signed'))).toContain(
      'remaining provider or submission milestone is unresolved'
    );
    expect(synthesizedFact('treatmentPlan', candidate('parent signed; provider signed'))).toContain(
      'awaiting the next submission or review milestone'
    );
    expect(synthesizedFact('intakeScheduling', candidate('appointment was scheduled'))).toContain(
      'completion remains to be confirmed'
    );
  });
  it('retains meaningful empty summaries and exact placeholder exclusions', () => {
    expect(synthesizedFact('intakeScheduling', candidate('documents missing'))).toBe('');
    expect(synthesizedFact('rbt', null)).toBe('');
    expect(
      isGenericOperationalPlaceholder('A stage-relevant operational update was recorded')
    ).toBe(true);
    expect(
      isGenericOperationalPlaceholder('The unresolved gate is described in the SLA summary')
    ).toBe(true);
    expect(isGenericOperationalPlaceholder('Family requested a later start')).toBe(false);
  });
});
