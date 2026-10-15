import { describe, expect, it } from 'vitest';

import { createOperationalFactContext } from './operational-fact-context.js';
import type { DatedOperationalFact, OperationalFactInput } from './operational-fact-context.js';
import { addInsuranceOperationalFacts } from './operational-insurance-facts.js';

function facts(
  text: string,
  extra: Partial<OperationalFactInput> = {},
  futureDiagnostic = false
): DatedOperationalFact[] {
  const context = createOperationalFactContext({
    text,
    category: 'insurance',
    eventDate: '2026-09-24',
    asOf: '2026-09-24',
    context: { noteType: 'sla' },
    ...extra,
  });
  addInsuranceOperationalFacts(context, futureDiagnostic);
  return context.facts;
}
describe('approved payer conversation facts', () => {
  it.each([
    ['Insurance feedback; speaking with family.', 'auth-additional-info', 'CSM', 11],
    ['ABLLS-R grid added to plan, submit ASAP.', 'auth-corrections-complete', 'CSM', 13],
    [
      'Prior authorization overlap cleared; has it been resubmitted?',
      'auth-overlap-remediation',
      'Intake',
      13,
    ],
    [
      'Overlap resolved; termination letter not received; not yet resubmitted.',
      'auth-overlap-remediation',
      'Intake',
      13,
    ],
    ['Secondary pending after denial.', 'auth-resubmitted-pending', 'Insurance Ops', 12],
    ['Waiting for parent signature before resubmission.', 'auth-resubmission-signature', 'CSM', 12],
    ['Authorization denied; provider working on revisions.', 'auth-denial-corrections', 'CSM', 12],
    ['Authorization denied then resubmitted.', 'auth-resubmitted-pending', 'Insurance Ops', 12],
    [
      'Authorization denied then resubmitted and pending.',
      'auth-resubmitted-pending',
      'Insurance Ops',
      11,
    ],
    [
      'Family plans to terminate existing ABA services because insurance overlap.',
      'auth-prior-service-termination',
      'Intake',
      11,
    ],
    ['Denial overturned.', 'auth-denial-overturned', 'Insurance Ops', 10],
    ['Reversed approval.', 'auth-denied', 'Insurance Ops', 10],
    ['Payer requested additional information.', 'auth-additional-info', 'Insurance Ops', 10],
    ['Peer review pending.', 'auth-appeal', 'Insurance Ops', 10],
    ['Reconsideration submitted.', 'auth-appeal', 'Insurance Ops', 10],
    ['Appeal under review.', 'auth-appeal', 'Insurance Ops', 10],
    ['Authorization pending.', 'auth-pending', 'Insurance Ops', 9],
  ] as const)('retains the primary fact for %s', (text, type, owner, relevance) => {
    expect(facts(text)).toMatchObject([
      { type, owner, relevance, milestoneDate: null, followUpDate: '2026-09-25' },
    ]);
  });
  it('keeps historical, hypothetical and merely available appeal paths from current-denial assertions', () => {
    for (const text of [
      'Prior denial on file; returning to care.',
      'Avoid denial; authorization pending.',
      'Authorization may be denied.',
      'Reconsideration is available.',
    ])
      expect(facts(text)).toEqual([]);
    expect(facts('New denial today after prior denial.')).toMatchObject([{ type: 'auth-denied' }]);
    expect(facts('Authorization pending.', {}, true)).toEqual([]);
    expect(facts('Authorization denied.', { category: 'other' })).toEqual([]);
  });
  it('routes overlap, clinical corrections and payer follow-up without changing the denial meaning', () => {
    expect(
      facts('Authorization denied due to overlapping services with another provider.')
    ).toMatchObject([
      {
        type: 'auth-denial-reason',
        owner: 'Intake',
        actionType: 'Family Outreach',
        denialReason: 'the payer shows overlapping or duplicate services with another provider',
      },
    ]);
    expect(
      facts('Authorization denied due to an incomplete treatment plan; appeal pending.')
    ).toMatchObject([
      {
        type: 'auth-denial-reason',
        owner: 'CSM',
        appealKind: 'appeal',
        gateImpact: 'Authorization denial remains unresolved while appeal is pending',
      },
    ]);
    expect(facts('Reconsideration denied; not yet resubmitted.')).toMatchObject([
      {
        type: 'auth-denied',
        appealKind: null,
        gateImpact: 'Authorization remains denied after reconsideration',
        action:
          'Insurance Ops to confirm whether a new authorization request was submitted after the second denial and document the current payer status and next follow-up date.',
      },
    ]);
    expect(
      facts(
        'Appeal was denied because treatment plan missing baseline data. New prior authorization is required.'
      )
    ).toMatchObject([
      {
        owner: 'CSM',
        appealKind: null,
        action:
          'CSM to have the provider address the remaining payer-requested treatment-plan revisions and route the corrected plan to Insurance Ops for a new prior authorization.',
      },
    ]);
    expect(
      facts('Authorization denied because Synthetic Example.', {
        context: { opportunityName: 'Synthetic Example' },
      })
    ).toMatchObject([{ type: 'auth-denied', denialReason: null }]);
  });
  it('retains missing specificity and documented requested information', () => {
    expect(facts('Payer requested additional information.')).toMatchObject([
      { specificityMissing: true, requestedInformation: null },
    ]);
    expect(
      facts('Payer requested additional information: updated diagnostic evaluation.')
    ).toMatchObject([
      {
        specificityMissing: false,
        requestedInformation: 'a current diagnostic evaluation or report',
      },
    ]);
    expect(facts('Insurance feedback; speaking with family.')).toMatchObject([
      { specificityMissing: true },
    ]);
  });
  it('appends date corrections independently and retains known follow-up dates', () => {
    expect(
      facts('Authorization denied but effective date needs correction.').map((fact) => fact.type)
    ).toEqual(['auth-denied', 'auth-date-correction']);
    expect(facts('Authorization start date wrong.')).toMatchObject([
      { type: 'auth-date-correction' },
    ]);
    expect(facts('Authorization pending until 9/28.')).toMatchObject([
      { milestoneDate: null, followUpDate: '2026-09-28' },
    ]);
    expect(
      facts('Family plans to terminate existing ABA services because insurance overlap.', {
        context: { processPosition: 'Treatment authorization' },
      })
    ).toMatchObject([
      {
        gateImpact:
          'The other ABA authorization must end before the current treatment authorization can proceed',
      },
    ]);
  });
});
