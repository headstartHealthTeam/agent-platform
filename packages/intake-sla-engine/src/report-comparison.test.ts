import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { comparisonAction } from './report-comparison-action.js';
import { comparisonFutureDate, comparisonPartialHours } from './report-comparison-authorization.js';
import { classifyReportComparison } from './report-comparison-classification.js';
import { prepareReportComparison } from './report-comparison-context.js';
import { comparisonNarrative } from './report-comparison-narrative.js';
import { comparisonGateSummary, comparisonProcessPosition } from './report-comparison-position.js';
import { reportComparisonGoldens } from './report-comparison.test-goldens.js';
import { reportComparisonFixture } from './report-comparison.test-support.js';

describe('approved comparison context (not final recommendation)', () => {
  it('retains the original composed family override, action, date anchor and narrative bytes', () => {
    const hash = createHash('sha256');
    for (let index = 0; index < 240; index++) {
      const input = reportComparisonFixture(index);
      const tasks =
        index % 2
          ? [
              {
                Id: 'task',
                Description: 'Family decided not to pursue treatment',
                LastModifiedDate: '2026-09-23',
              },
            ]
          : [];
      const calls =
        index % 3
          ? []
          : [
              {
                Id: 'call',
                aircall__Message_Content__c: 'Family decided not to pursue treatment',
                aircall__Call_Start_Date_Time__c: '2026-09-24T12:00:00Z',
              },
            ];
      const before = structuredClone({ input, tasks, calls });
      hash.update(`${JSON.stringify(prepareReportComparison(input, tasks, calls))}\n`);
      expect({ input, tasks, calls }).toEqual(before);
    }
    // All 240 results independently matched the pinned original builder before recording this digest.
    expect(hash.digest('hex')).toBe(
      '3d7f23716bc9653bdf52e547dad7191d7b4f7824f00be4236d243dc9cd9dae40'
    );
  });
  it('preserves partial signatures and does not invent submission or staffing completion', () => {
    const input = reportComparisonFixture(0);
    const context = {
      ...input,
      position: 'Initial assessment is complete.',
      detail: 'parent signed',
      blocker: 'Treatment plan ready for submission',
      provider: '',
    };
    expect(comparisonNarrative(context)).toBe(
      'Initial assessment is complete. the treatment plan is ready to submit with parent signature recorded; the submission date is not recorded.'
    );
    expect(comparisonNarrative({ ...context, detail: 'parent signed; provider signed' })).toContain(
      'both required signatures recorded'
    );
    expect(
      comparisonNarrative({
        ...context,
        detail: '',
        blocker: 'RBT staffing',
        rbts: [],
        ticketMatches: [],
      })
    ).toBe(
      'Initial assessment is complete. The provider must confirm start readiness and the first 97153 appointment date.'
    );
  });
  it('retains all fields, source priority and input values across 240 original-source goldens', () => {
    const hashes = reportComparisonGoldens.map((_expected, index) => {
      const input = reportComparisonFixture(index);
      const before = structuredClone(input);
      const expanded = classifyReportComparison(input);
      const position = comparisonProcessPosition(input, expanded.blocker);
      const gateSummary = comparisonGateSummary(input);
      expect(input).toEqual(before);
      return createHash('sha256')
        .update(JSON.stringify({ expanded, position, gateSummary }))
        .digest('hex');
    });
    expect(hashes).toEqual(reportComparisonGoldens);
  });
  it('keeps partial authorization and future dates in the comparison context without claiming completion', () => {
    expect(
      comparisonPartialHours({
        Notes__c: 'Requested intensity of 30.5 hours per week; approved for 20 hours per week.',
      })
    ).toEqual({ requested: '30.5', approved: '20' });
    const input = reportComparisonFixture(4);
    expect(comparisonFutureDate('scheduled for 9/30', input.runAt)).toBe('9/30');
    expect(comparisonFutureDate('scheduled for 9/1', input.runAt)).toBe('');
    expect(comparisonFutureDate('starting date is 9/25/26', input.runAt)).toBe('9/25/26');
    expect(comparisonFutureDate('no date stated', input.runAt)).toBe('');
    expect(
      comparisonAction(
        { ...input, freshness: { ...input.freshness, latestUpdateSummary: 'scheduled for 9/30' } },
        'Initial assessment completion'
      )
    ).toBe(
      'CSM to confirm on 9/30 that the IA occurred and record the completion date; if it did not occur, document the new blocker and date.'
    );
  });
  it('retains conflicting authorization/family communications for review instead of changing the source', () => {
    const input = reportComparisonFixture(1);
    const result = classifyReportComparison({
      ...input,
      commsText: 'The family was told it remains pending with insurance.',
      freshness: { ...input.freshness, latestUpdateSource: 'Salesforce SMS' },
    });
    expect(result.evidenceConflict).toBe(true);
    expect(result.confidence).toBe('Low');
    expect(result.action).toContain('verify the current determination');
    expect(result.summary).toContain('A newer family message');
  });
});
