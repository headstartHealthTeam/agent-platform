import { describe, expect, it } from 'vitest';

import { renderCaseHistoryReview } from './case-history-review.js';
import { validateDelayHistoryReceipt } from './delay-history-receipt.js';
import type { DelayHistoryEvent, DelayHistoryReceiptInput } from './delay-history-types.js';
import {
  buildDelayHistory,
  currentNarrative,
  delayHistoryOmissions,
  historyEntryText,
  renderDelayHistory,
  reviewExplanation,
} from './delay-history.js';
import { createEvidenceEvent } from './evidence.js';
import { sha256Json } from './json-fingerprint.js';
import { buildSlaStory } from './storyline.js';

const opportunity = {
  id: 'synthetic',
  stage: '97151 Started - Pending Treatment Plan',
  slaCreatedDate: '2026-08-01',
};
const asOf = '2026-08-31T21:00:00Z';
function event(
  date: string,
  text: string,
  issueKey: string,
  extra: Partial<DelayHistoryEvent> = {}
): DelayHistoryEvent {
  return {
    opportunityId: opportunity.id,
    source: 'SLA / Intake / On-Hold Notes',
    sourceRecordId: `${date}-${issueKey}`,
    eventDate: date,
    text,
    substantive: true,
    matchQuality: 'Direct',
    relationship: 'Supports',
    issueKey,
    factType: 'tp-pending',
    ...extra,
  };
}
const timeline = [
  event('2026-07-30', 'Family forms were requested.', 'forms'),
  event('2026-08-03', 'Family forms remained missing.', 'forms'),
  event('2026-08-05', 'The provider also needed assessment results.', 'assessment'),
  event('2026-08-08', 'Family forms were received.', 'forms', {
    factType: 'forms-complete',
    lifecycleState: 'Resolved',
  }),
  event('2026-08-11', 'The assessment results were received.', 'assessment', {
    factType: 'assessment-complete',
  }),
  event('2026-08-15', 'The treatment plan remained unfinished.', 'plan'),
  event('2026-08-20', 'The treatment plan remained unfinished.', 'plan'),
  event('2026-08-25', 'The provider reported the treatment plan complete.', 'plan', {
    factType: 'tp-ready',
  }),
  event('2026-08-29', 'The provider reported additional treatment plan edits pending.', 'plan'),
];
function history(): ReturnType<typeof buildDelayHistory> {
  return buildDelayHistory({ opportunity, story: { timeline }, asOf });
}

describe('approved delay history', () => {
  it('retains changing, overlapping and recurrent findings without inventing durations', () => {
    const original = structuredClone(timeline);
    const value = history();
    const text = renderDelayHistory(value);
    expect(value.entries).toHaveLength(8);
    for (const item of timeline) expect(text).toContain(item.text);
    expect(text).toContain('Earlier context 2026-07-30');
    expect(text).toContain('available dated findings begin on 2026-08-03');
    expect(text).toContain('source dates through 2026-08-20');
    expect(text).toContain('exact durations and overlaps remain unverified');
    expect(
      value.entries.find((entry) => entry.firstDate === '2026-08-15')?.references
    ).toHaveLength(2);
    expect(text.indexOf('forms remained')).toBeLessThan(text.indexOf('forms were received'));
    expect(text).not.toMatch(/(?:blocked for|caused) 30 days/);
    expect(timeline).toEqual(original);
  });
  it('preserves the exact admission and frozen cutoff rules', () => {
    const variants: Partial<DelayHistoryEvent>[] = [
      { opportunityId: 'other' },
      { matchQuality: 'Weak' },
      { relationship: 'Neutral' },
      { eventDate: null },
      { eventDate: 'invalid' },
      { eventDate: '2026-09-01' },
      { substantive: false },
      { text: '   ' },
    ];
    const events = variants.map((extra) => event('2026-08-03', 'Excluded finding', 'forms', extra));
    const value = buildDelayHistory({ opportunity, story: { timeline: events }, asOf });
    expect(value.entries).toEqual([]);
    expect(renderDelayHistory(value)).toContain('No dated substantive finding establishes');
    expect(renderDelayHistory(value)).toContain('No dated substantive history was admitted');
    const atCutoff = event(asOf, 'Admitted at cutoff', 'forms', {
      matchQuality: 'Likely',
      relationship: 'Conflicts',
    });
    expect(
      buildDelayHistory({ opportunity, story: { timeline: [atCutoff] }, asOf }).entries
    ).toHaveLength(1);
  });
  it('collapses only consecutive same-issue findings and retains source provenance', () => {
    const events = [
      event('2026-08-02', 'Forms missing.', 'forms'),
      event('2026-08-03', ' forms   missing! ', 'forms', {
        source: 'Task',
        lifecycleState: 'Progressed',
      }),
      event('2026-08-04', 'Forms received', 'forms', {
        resolvedByEventId: 'resolved',
        resolutionDate: '2026-08-04',
      }),
      event('2026-08-05', 'Forms missing.', 'forms'),
    ];
    const value = buildDelayHistory({
      opportunity,
      story: { timeline: [...events].reverse() },
      asOf,
    });
    expect(value.entries).toHaveLength(3);
    expect(value.entries[0]?.references).toHaveLength(2);
    expect(value.entries[0]?.references[0]).toHaveProperty('lifecycleState', undefined);
    expect(value.entries[1]?.references[0]).toMatchObject({
      resolvedByEventId: 'resolved',
      resolutionDate: '2026-08-04',
    });
    expect(renderDelayHistory(value)).toContain('SLA / Intake / On-Hold Notes and Task');
  });
  it('requires both every admitted fact and the complete attribution context', () => {
    const value = history();
    const rendered = renderDelayHistory(value);
    expect(delayHistoryOmissions(value, rendered)).toEqual([]);
    expect(
      delayHistoryOmissions(value, rendered.replace('Findings reflect', 'Facts prove'))
    ).toEqual([{ issueKey: 'history-context', date: opportunity.slaCreatedDate, references: [] }]);
    expect(
      delayHistoryOmissions(value, rendered.replace('Dated 2026-08-29', 'Dated unknown date'))
    ).toHaveLength(1);
    expect(delayHistoryOmissions(null, rendered)).toEqual([]);
    expect(renderDelayHistory(null)).toBe('');
  });
  it('keeps identical findings on both sides of the opening and accepts the story anchor', () => {
    const events = [
      event('2026-07-30', 'Forms requested.', 'forms'),
      event('2026-08-01', 'Forms requested.', 'forms'),
    ];
    const value = buildDelayHistory({
      opportunity: { id: opportunity.id },
      story: { timeline: events, storyAnchorDate: opportunity.slaCreatedDate },
      asOf,
    });
    expect(value.entries).toHaveLength(2);
    expect(value.openingGap).toBe('');
    const unknown = buildDelayHistory({ opportunity: { id: opportunity.id }, story: {}, asOf });
    expect(unknown.startDate).toBeNull();
    expect(renderDelayHistory(unknown)).toContain('the SLA opening date is not established');
  });
  it('attributes cutoff-relative findings to source dates, not invented state-transition dates', () => {
    const value = buildDelayHistory({
      opportunity,
      story: {
        timeline: [
          event(
            '2026-08-02',
            'The planned assessment date of 2026-08-15 passed without completion evidence.',
            'assessment'
          ),
        ],
      },
      asOf,
    });
    const text = renderDelayHistory(value);
    expect(text).toContain('Findings reflect what can be established at the cutoff');
    expect(text).toContain('Dated 2026-08-02');
    expect(text).not.toMatch(/On 2026-08-02|2026-08-02.*recorded/);
  });
  it('consumes actual storyline output without changing source annotations', () => {
    const evidence = createEvidenceEvent({
      opportunityId: opportunity.id,
      source: 'Task',
      sourceRecordId: 'synthetic-task',
      eventDate: '2026-08-03',
      category: 'treatmentPlan',
      text: 'The treatment plan remains in drafting.',
      factType: 'tp-drafting',
      substantive: true,
      matchQuality: 'Direct',
      relationship: 'Supports',
    });
    const story = buildSlaStory({
      opportunity,
      gate: { processPosition: 'Treatment plan', unresolvedGate: 'Complete treatment plan' },
      events: [evidence],
      asOf,
    });
    const original = structuredClone(story);
    const value = buildDelayHistory({ opportunity, story, asOf });
    expect(value.entries[0]?.references[0]?.lifecycleState).toBe('Opened');
    expect(story).toEqual(original);
    expect(value.entries[0] && historyEntryText(value.entries[0])).toContain(evidence.text);
  });
  it('separates the current narrative and leaves existing review explanations untouched', () => {
    expect(
      currentNarrative(
        'prefix Current position and next step: Do this. Delay history: Earlier context'
      )
    ).toBe('Do this.');
    expect(currentNarrative('Current only.')).toBe('Current only.');
    expect(currentNarrative()).toBe('');
    expect(reviewExplanation('Review', '')).toContain('Routine human review');
    expect(reviewExplanation('Review', 'Source unavailable')).toBe('Source unavailable');
    expect(reviewExplanation('Blocked', '')).toBe('');
    expect(reviewExplanation('Ready', undefined)).toBeUndefined();
  });
});

describe('delay-history receipts and private review companion', () => {
  function input(): DelayHistoryReceiptInput {
    const histories = [{ opportunityId: opportunity.id, history: history() }];
    const rows = [
      {
        Salesforce: `https://example.test/lightning/r/Opportunity/${opportunity.id}/view`,
        'In-Depth Summary': `Delay history:\n${renderDelayHistory(history())}`,
      },
    ];
    return {
      histories,
      rows,
      binding: { version: 1, rows: 1, artifactHash: sha256Json(histories) },
    };
  }
  it('accepts an exact binding and catches missing artifacts, cohorts and narrative omissions', () => {
    const value = input();
    expect(validateDelayHistoryReceipt(value)).toEqual([]);
    const patches: Partial<DelayHistoryReceiptInput>[] = [
      { binding: null },
      { histories: [] },
      { histories: null },
      { rows: [] },
      { binding: { version: 2 } },
      { rows: [{ Salesforce: 'synthetic', 'In-Depth Summary': 'History omitted.' }] },
      { histories: [{ opportunityId: 'other', history: history() }] },
    ];
    for (const patch of patches)
      expect(validateDelayHistoryReceipt({ ...value, ...patch })).not.toEqual([]);
    expect(
      validateDelayHistoryReceipt({
        rows: [{ 'In-Depth Summary': 'No history in this legacy row' }],
      })
    ).toEqual([]);
  });
  it('rejects duplicate, unmatched or absent identities and missing entry arrays after a matching hash', () => {
    for (const histories of [
      [
        { opportunityId: opportunity.id, history: history() },
        { opportunityId: opportunity.id, history: history() },
      ],
      [{ opportunityId: 'other', history: history() }],
      [{ history: history() }],
      [{ opportunityId: opportunity.id }],
    ]) {
      const value = input();
      const rows =
        histories.length === 2
          ? [...value.rows, { Salesforce: 'another', 'In-Depth Summary': '' }]
          : value.rows;
      expect(
        validateDelayHistoryReceipt({
          histories,
          rows,
          binding: { version: 1, rows: rows.length, artifactHash: sha256Json(histories) },
        })
      ).toContainEqual(
        expect.objectContaining({ severity: 'Critical', rule: 'delay-history-omission' })
      );
    }
  });
  it('escapes every field, includes both queues and retains the complete narrative', () => {
    const narrative = renderDelayHistory(history());
    const html = renderCaseHistoryReview({
      generatedAt: asOf,
      sheets: {
        'Review Queue': [
          ['Opportunity Name', 'In-Depth Summary'],
          ['<script>unsafe</script>', narrative],
        ],
        'On-Hold Review': [
          ['Opportunity Name', 'Suggested Action', 'Why Review Needed'],
          ['Second & "test"', "Review 'evidence'", 'Review'],
        ],
      },
    });
    expect(html).toContain(narrative);
    expect(html).toContain('&lt;script&gt;unsafe&lt;/script&gt;');
    expect(html).toContain('Second &amp; &quot;test&quot;');
    expect(html).toContain('Review &#39;evidence&#39;');
    expect(html).toContain('id="case-1"');
    expect(html).not.toContain('<script>');
    expect(renderCaseHistoryReview({ sheets: {}, generatedAt: null })).not.toContain('<article');
  });
});
