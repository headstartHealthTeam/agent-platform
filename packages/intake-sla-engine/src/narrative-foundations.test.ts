import { describe, expect, it } from 'vitest';

import { futureMilestoneLabels, futureMilestoneSentence } from './narrative-future.js';
import { gateSentence } from './narrative-gate.js';
import { latestUpdateSentence } from './narrative-latest.js';
import { processPositionSentence } from './narrative-process.js';
import {
  freshnessSentence,
  nextStepSentence,
  structuredDetailSentence,
} from './narrative-state.js';
import { conciseFact, humanizeConflict, materiallyOverlaps } from './narrative-text.js';
import type { NarrativePacket } from './narrative-types.js';

function packet(overrides: Partial<NarrativePacket> = {}): NarrativePacket {
  return {
    asOf: '2026-09-24',
    stage: 'IA Scheduled',
    processPosition: 'initial assessment',
    unresolvedGate: 'assessment completion',
    freshness: 'Current',
    conflicts: [],
    action: { type: 'Monitor', text: 'Confirm the assessment outcome.', date: '2026-09-30' },
    ...overrides,
  };
}

describe('approved narrative foundations', () => {
  it('reports unfinished assessment work without claiming that a completed session finishes the assessment', () => {
    expect(
      gateSentence(
        packet({
          newestUpdate: {
            fact: 'One session completed, another remains scheduled.',
            factType: 'ia-partial',
          },
        })
      )
    ).toBe(
      'Assessment work remains; completed sessions alone do not establish whole-assessment completion.'
    );
  });

  it('retains higher-priority provider capacity and treatment-plan readiness wording', () => {
    expect(
      gateSentence(
        packet({
          unresolvedGate: 'provider capacity',
          newestUpdate: { fact: 'A session completed.', factType: 'ia-partial' },
        })
      )
    ).toContain('provider capacity or reassignment');
    expect(
      gateSentence(
        packet({
          unresolvedGate: 'provider capacity',
          newestUpdate: { fact: 'Ready.', factType: 'tp-ready' },
        })
      )
    ).toBe('The treatment plan is ready, but submission for review is not yet recorded.');
  });

  it('does not invent a payer wait after an authorization is satisfied', () => {
    const input = packet({
      stage: 'IA Requested',
      processPosition: 'initial authorization',
      authorization: { satisfied: true },
    });
    expect(gateSentence(input)).toBe(
      'The next assessment milestone and current stage still need confirmation.'
    );
    expect(processPositionSentence(input)).toContain(
      'initial authorization prerequisite is satisfied'
    );
  });

  it.each([
    ['denial', 'the payer denial is resolved'],
    ['reconsideration', 'the payer completes reconsideration'],
    ['appeal', 'the payer completes the appeal'],
    ['correction', 'the corrected authorization is issued'],
    ['partial', 'the payer resolves the remaining authorization scope'],
  ])('retains the specific unresolved authorization phase: %s', (unresolvedGate, expected) => {
    expect(
      gateSentence(packet({ processPosition: 'treatment authorization', unresolvedGate }))
    ).toBe(`Treatment cannot begin until ${expected}.`);
  });

  it('preserves the original distinction between explicit and contextual initial partial authorization', () => {
    expect(
      gateSentence(
        packet({ processPosition: 'other', unresolvedGate: 'initial authorization partial' })
      )
    ).toBe('The IA cannot begin until the initial authorization is approved.');
  });

  it('retains planned dates and explicitly separates them from completion', () => {
    const input = packet({
      futureMilestones: [{ id: 'future', fact: 'Scheduled.', milestoneDate: '2026-09-30' }],
    });
    expect(futureMilestoneSentence(input)).toBe(
      'The initial assessment is planned for 9/30, but completion still must be confirmed.'
    );
    expect(nextStepSentence(input)).toBe(
      'Next step: Confirm the assessment outcome; follow up on 9/30.'
    );
  });

  it('orders and deduplicates explicit and mentioned future dates without treating them as completed', () => {
    expect(
      futureMilestoneLabels(
        packet({
          futureMilestones: [{ fact: 'Plan.', milestoneDate: '2026-10-02' }],
          evidenceTimeline: [{ fact: 'September 30 or October 2; September 20 was earlier.' }],
        })
      )
    ).toEqual(['9/30', '10/2']);
  });

  it('reports completed prerequisites separately from the missing assessment milestone', () => {
    expect(
      latestUpdateSentence(
        packet({
          evidenceTimeline: [
            {
              fact: 'BASC complete.',
              factType: 'family-document-completed',
              requestedInformation: 'BASC',
              date: '2026-09-23',
            },
          ],
        })
      )
    ).toBe(
      '9/23: Salesforce shows BASC complete, but no scheduled or completed IA date is documented.'
    );
  });

  it('reports passed plans as unconfirmed, not completed', () => {
    expect(
      latestUpdateSentence(
        packet({ unresolvedGate: 'planned initial assessment date of 2026-09-20 passed' })
      )
    ).toContain('has passed without completion evidence');
  });

  it('preserves conflicting later resubmission and earlier structured revisions', () => {
    expect(
      structuredDetailSentence(
        packet({
          newestUpdate: {
            id: 'new',
            fact: 'Resubmitted.',
            factType: 'tp-resubmitted-for-review',
            date: '2026-09-24',
          },
          structuredGateDetail: {
            id: 'old',
            source: 'Portal',
            fact: 'Edits requested.',
            factType: 'tp-revisions',
            date: '2026-09-22',
          },
        })
      )
    ).toBe(
      'The structured Portal record still lists requested edits as of 9/22; the later provider-reported resubmission needs confirmation against that record.'
    );
  });

  it('keeps future plans valid while noting semi-stale evidence', () => {
    expect(
      freshnessSentence(
        packet({
          freshness: 'Semi-Stale',
          newestUpdate: { fact: 'Plan.', date: '2026-09-20' },
          futureMilestones: [{ fact: 'Scheduled.', milestoneDate: '2026-09-30' }],
        })
      )
    ).toContain('documented future milestone remains valid');
  });

  it('retains concise specificity and suppresses only already-covered conflict clauses', () => {
    expect(
      conciseFact(
        'RBT recruiting is active: 1 screened, 0 active, 0 proposed, and 0 matched candidates. No candidate or start date is confirmed'
      )
    ).toBe(
      'Replacement RBT recruiting is active with 1 screened candidate, but no candidate has advanced and no start date is confirmed'
    );
    expect(
      humanizeConflict('auth-state: Pending. A later source reports Approved.', 'Pending.')
    ).toBe('The structured record conflicts with a later source reporting approved');
    expect(
      materiallyOverlaps(
        'The treatment plan requires measurable goals.',
        'Measurable goals are required in the treatment plan.'
      )
    ).toBe(true);
  });
});
