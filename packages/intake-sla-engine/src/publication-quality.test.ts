import { describe, expect, it } from 'vitest';

import { startsWithUpdateDate } from './publication-quality-signals.js';
import type { PublicationQualityInput } from './publication-quality-types.js';
import {
  duplicateOperationalSummaries,
  readyToCopyForEvidenceStatus,
  validatePublicationRow,
} from './publication-quality.js';
import { formatLifecycleTimeline, oversizedWorkbookCells } from './publication-timeline.js';

const valid: PublicationQualityInput = {
  summary: '9/23: The provider is drafting the treatment plan.',
  operationalSummary:
    'The assessment is complete. The provider is drafting the treatment plan. Clinical review has not begun. The CSM will confirm submission timing.',
  action: 'CSM to confirm the planned submission date.',
  actionOwner: 'CSM',
  actionType: 'Provider Outreach',
  readyToCopy: 'Yes',
  evidenceStatus: 'Complete',
  latestUpdateDate: '2026-09-23',
  asOf: '2026-09-24',
};

describe('approved publication quality rules', () => {
  it('accepts a complete narrative without imposing a maximum sentence count', () => {
    expect(validatePublicationRow(valid)).toEqual({ valid: true, issues: [] });
    expect(
      validatePublicationRow({
        ...valid,
        operationalSummary: `${valid.operationalSummary ?? ''} The family provided the requested forms. A separate service order was signed. Payer submission remains the next milestone.`,
      }).valid
    ).toBe(true);
  });

  it.each<readonly [Partial<PublicationQualityInput>, string]>([
    [{ summary: '' }, 'Suggested SLA Summary is blank.'],
    [{ summary: 'x'.repeat(255) }, 'Suggested SLA Summary is 255 characters; maximum is 254.'],
    [{ operationalSummary: '' }, 'In-Depth Summary is blank.'],
    [
      { operationalSummary: 'Only one sentence.' },
      'In-Depth Summary contains 1 sentences; expected at least 4.',
    ],
    [
      { summary: '9/23: The provider is waiting because' },
      'Suggested SLA Summary ends with an incomplete thought.',
    ],
    [
      { summary: '9/22: The provider is drafting the plan.' },
      'Suggested SLA Summary does not begin with the latest substantive update date.',
    ],
    [
      { summary: '9/23: A stage-relevant operational update was recorded.' },
      'Suggested SLA Summary uses vague or multi-option language instead of one committed operational update.',
    ],
    [
      { summary: '9/23: A required document remains outstanding.' },
      'Suggested SLA Summary contains unresolved source boilerplate or omits an available specific item.',
    ],
    [
      { unparsedAdmittedNote: true },
      'A substantive human SLA note was admitted but did not produce a normalized evidence event.',
    ],
    [{ actionOwner: '' }, 'Actionable row requires both a Suggested Action and one Action Owner.'],
    [{ followUpDate: 'bad' }, 'Suggested Follow-Up Date is invalid.'],
    [
      { evidenceStatus: 'Missing' },
      'Ready to Copy cannot be Yes unless Evidence Status is Complete.',
    ],
    [
      { conflicts: ['Records disagree.'] },
      'Ready to Copy cannot be Yes while material evidence conflicts remain.',
    ],
    [
      { identityConflict: 'Ambiguous family match.' },
      'Ready to Copy cannot be Yes while an identity match conflict remains.',
    ],
  ])('retains the existing finding for %j', (change, expected) => {
    expect(validatePublicationRow({ ...valid, ...change }).issues).toContain(expected);
  });

  it('permits correctly marked review exceptions while rejecting unsupported copy readiness', () => {
    expect(
      validatePublicationRow({
        ...valid,
        readyToCopy: 'Review',
        evidenceStatus: 'Partial',
        conflicts: ['Records disagree.'],
        identityConflict: 'Needs review.',
      }).valid
    ).toBe(true);
    expect(readyToCopyForEvidenceStatus('Complete')).toBe('Yes');
    expect(readyToCopyForEvidenceStatus('Missing')).toBe('Blocked');
    expect(readyToCopyForEvidenceStatus('Blocked')).toBe('Blocked');
    expect(readyToCopyForEvidenceStatus('Partial')).toBe('Review');
  });

  it('distinguishes a future plan from falsely completed future activity', () => {
    const dates = ['2026-09-30'];
    expect(
      validatePublicationRow({
        ...valid,
        summary: '9/23: The assessment completed on 2026-09-30.',
        futureMilestoneDates: dates,
      }).issues
    ).toContain('A future milestone is described as already completed.');
    expect(
      validatePublicationRow({
        ...valid,
        summary: '9/23: The assessment is planned for 2026-09-30.',
        futureMilestoneDates: dates,
      }).valid
    ).toBe(true);
  });

  it('preserves update-prefix boundary semantics without a dynamic regular expression', () => {
    for (const text of ['9/23: Update.', 'As of 9/23: Update.', '9/23. Update.'])
      expect(startsWithUpdateDate(text, '2026-09-23')).toBe(true);
    for (const text of [
      '09/23: Update.',
      '9/230: Update.',
      '9/23a: Update.',
      'as of 9/23: Update.',
    ])
      expect(startsWithUpdateDate(text, '2026-09-23')).toBe(false);
  });

  it('retains repeated-clause and raw-text checks with their distinct existing thresholds', () => {
    expect(
      validatePublicationRow({
        ...valid,
        operationalSummary:
          'The provider needs one specific required document. The provider needs one specific required document.',
      }).issues
    ).toContain('Generated narrative repeats the same substantive clause.');
    const raw =
      'This is synthetic raw text that deliberately exceeds eighty characters and must never be copied verbatim into the final narrative.';
    expect(
      validatePublicationRow({ ...valid, summary: `9/23: ${raw}`, rawEvidence: [raw] }).issues
    ).toContain('Generated summary reproduces raw source text.');
    expect(
      validatePublicationRow({
        ...valid,
        rawEvidence: ['The provider is drafting the treatment plan.'],
      }).valid
    ).toBe(true);
  });

  it('finds shared narratives across distinct identities but not repeated rows of one identity', () => {
    expect(
      duplicateOperationalSummaries([
        { opportunityId: 'one', operationalSummary: 'Same   text.' },
        { opportunityId: 'two', operationalSummary: 'same text.' },
      ])[0]?.rows
    ).toHaveLength(2);
    expect(
      duplicateOperationalSummaries([
        { opportunityId: 'one', operationalSummary: 'same' },
        { opportunityId: 'one', operationalSummary: 'same' },
      ])
    ).toEqual([]);
  });
});

describe('lossless lifecycle timeline rendering', () => {
  it('uses readable text for small timelines and removes only separator padding when that is sufficient', () => {
    const events = Array.from({ length: 250 }, (_, index) => ({
      date: '2026-09-14',
      issueKey: 'rbt-staffing',
      lifecycleState: 'Progressed',
      source: 'Source',
      fact: `${String(index)}: ${'x'.repeat(146)}`,
    }));
    const rendered = formatLifecycleTimeline(events);
    expect(rendered.length).toBeLessThan(50_000);
    expect(rendered.split('\n').map((line) => line.split('|').at(-1))).toEqual(
      events.map((event) => event.fact)
    );
    expect(formatLifecycleTimeline(events.slice(0, 1))).toBe(
      events
        .slice(0, 1)
        .map((event) =>
          [event.date, event.issueKey, event.lifecycleState, event.source, event.fact].join(' | ')
        )
        .join('\n')
    );
  });

  it('groups consecutive metadata without dropping recurring issue transitions or literal facts', () => {
    const events = Array.from({ length: 280 }, (_, index) => ({
      date: index < 140 || index >= 270 ? '2026-09-14' : '2026-09-15',
      issueKey: index < 100 || index >= 260 ? 'staffing-reconciliation' : 'authorization-followup',
      lifecycleState: index % 2 ? 'Progressed' : 'Opened',
      source: 'Ticket Match',
      fact: `${String(index)}: ${'x'.repeat(150)}${index === 135 ? ' literal | pipe\nDate: not metadata 😀' : ''}`,
    }));
    const expected: string[] = [];
    let date: string | undefined;
    let issue: string | undefined;
    for (const event of events) {
      if (issue !== event.issueKey) {
        expected.push(`Issue: ${event.issueKey}`);
        issue = event.issueKey;
      }
      if (date !== event.date) {
        expected.push(`Date: ${event.date}`);
        date = event.date;
      }
      expected.push([event.lifecycleState, event.source, event.fact].join('|'));
    }
    expect(formatLifecycleTimeline(events)).toBe(expected.join('\n'));
  });

  it('uses source/state legends only for metadata while retaining every fact and oversized result', () => {
    const events = Array.from({ length: 304 }, (_, index) => ({
      date: index < 160 ? '2026-09-01' : '2026-09-02',
      issueKey: index < 200 ? 'rbt-staffing' : 'clinical-review',
      lifecycleState: index % 2 ? 'Progressed' : 'Opened',
      source: index % 2 ? 'Talent Acquisition' : 'RBT First Interview',
      fact: `${String(index)}: ${'x'.repeat(143)}`,
    }));
    const rendered = formatLifecycleTimeline(events);
    expect(rendered).toMatch(
      /^L1 = Opened\nL2 = Progressed\nS1 = RBT First Interview\nS2 = Talent Acquisition/
    );
    for (const event of events) expect(rendered).toContain(event.fact);
    const oversized = formatLifecycleTimeline([{ fact: 'x'.repeat(50_001) }]);
    expect(oversized).toContain('x'.repeat(50_001));
    expect(oversizedWorkbookCells({ Evidence: [['Header'], [oversized]] })).toEqual([
      { sheet: 'Evidence', rowIndex: 1, columnIndex: 0, length: oversized.length },
    ]);
    expect(
      formatLifecycleTimeline([{ fact: 'Audit only.', narrativeContribution: 'Audit Only' }])
    ).toBe('');
  });
});
