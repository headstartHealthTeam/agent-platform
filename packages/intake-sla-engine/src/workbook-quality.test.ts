import { describe, expect, it } from 'vitest';

import { duplicateOperationalSummaries } from './publication-quality.js';
import { auditWorkbookQuality } from './workbook-quality.js';

const auditedAt = '2026-09-24T16:00:00.000Z';
const baseline = {
  'Opportunity Name': 'Synthetic Opportunity',
  Salesforce: 'synthetic-opportunity-id',
  Stage: '97151 Started - Pending Treatment Plan',
  'Last Substantive Update Date': '2026-09-04',
  'Suggested SLA Summary':
    '9/4: Supporting assessments are complete while treatment-plan drafting continues.',
  'In-Depth Summary':
    'The initial assessment phase is complete. Supporting assessments were confirmed on 9/4. Treatment-plan drafting remains underway. No payer submission is yet confirmed.',
  'Suggested Action':
    'No separate action is needed for the completed assessments; continue monitoring treatment-plan submission.',
  'Action Type': 'No Action',
  'Action Owner': 'Synthetic CSM',
  'Ready to Copy': 'Review',
  'Why Review Needed': 'The latest substantive update should be reconfirmed.',
  'Evidence Status': 'Partial',
};

function workbook(
  rows: readonly Readonly<Record<string, unknown>>[],
  onHold: readonly Readonly<Record<string, unknown>>[] = []
): Parameters<typeof auditWorkbookQuality>[0]['workbook'] {
  const headers = [...new Set([...rows, ...onHold].flatMap((row) => Object.keys(row)))];
  const values = (records: readonly Readonly<Record<string, unknown>>[]): unknown[][] => [
    headers,
    ...records.map((row) => {
      const fields = new Map(Object.entries(row));
      return headers.map((header) => fields.get(header));
    }),
  ];
  return {
    runId: 'synthetic-run',
    sheets: { 'Review Queue': values(rows), 'On-Hold Review': values(onHold) },
  };
}

function audit(
  overrides: Readonly<Record<string, unknown>> = {}
): ReturnType<typeof auditWorkbookQuality> {
  return auditWorkbookQuality({ workbook: workbook([{ ...baseline, ...overrides }]), auditedAt });
}

describe('complete approved workbook-quality audit', () => {
  it('preserves the original informational-owner No Action regression and a legitimate review exception', () => {
    expect(audit()).toEqual({
      version: '2026-08-12.2',
      auditedAt,
      runId: 'synthetic-run',
      rowCount: 1,
      duplicateOpportunityCount: 0,
      counts: {},
      passed: true,
      findings: [],
    });
    expect(
      audit({ 'Action Type': 'Provider Outreach' }).findings.map((finding) => finding.rule)
    ).toContain('action-owner-language');
  });

  it.each([
    [{ 'Suggested SLA Summary': '' }, 'missing-summary', 'Critical'],
    [{ 'Suggested SLA Summary': 'x'.repeat(255) }, 'summary-length', 'Critical'],
    [{ 'In-Depth Summary': 'One sentence.' }, 'in-depth-sentence-count', 'Critical'],
    [
      { 'Suggested SLA Summary': '9/4: Treatment plan awaits review' },
      'summary-punctuation',
      'Warning',
    ],
    [
      { 'Suggested SLA Summary': '9/4: A stage-relevant operational update was recorded.' },
      'vague-placeholder',
      'Critical',
    ],
    [{ 'Why Review Needed': 'Publication QA: source gap.' }, 'publication-qa', 'Critical'],
    [
      { 'Suggested SLA Summary': '9/4: Subject: treatment plan.' },
      'raw-source-leakage',
      'Critical',
    ],
    [{ 'Suggested SLA Summary': '9/4: Treatment plan..' }, 'malformed-formatting', 'Warning'],
    [
      { 'Suggested SLA Summary': '9/4: Treatment plan might be ready.' },
      'noncommittal-summary',
      'Warning',
    ],
    [
      {
        'In-Depth Summary': `${baseline['In-Depth Summary']} An earlier document issue also remains unresolved: identify it.`,
      },
      'carry-forward-review',
      'Review',
    ],
    [
      { 'Suggested SLA Summary': '9/3: Treatment plan remains underway.' },
      'summary-update-date',
      'Critical',
    ],
    [
      { 'Suggested SLA Summary': '9/4: Treatment plan changed after the 9/5 payer decision.' },
      'impossible-chronology',
      'Critical',
    ],
    [
      {
        'Suggested SLA Summary': '9/4: State-fair hearing requested.',
        'In-Depth Summary': `${baseline['In-Depth Summary']} The appeal is pending.`,
      },
      'obsolete-appeal-state',
      'Critical',
    ],
    [
      {
        'Suggested SLA Summary': '9/4: Both parent assessments are now complete.',
        'Suggested Action': 'Intake to collect Vineland assessment.',
      },
      'resolved-document-action',
      'Critical',
    ],
    [
      {
        Stage: 'Insurance Verification',
        'In-Depth Summary': `${baseline['In-Depth Summary']} Insurance verification was resolved.`,
      },
      'overbroad-resolved-stage',
      'Warning',
    ],
    [
      {
        'Last Substantive Update Source': 'Fireflies',
        'Why Review Needed': 'Failed segments were not admitted as evidence.',
      },
      'source-gap-contradiction',
      'Critical',
    ],
    [{ 'Ready to Copy': 'Yes' }, 'copy-readiness', 'Critical'],
    [
      { Stage: 'IA Requested', 'Suggested SLA Summary': '9/4: Something happened.' },
      'stage-language',
      'Warning',
    ],
    [{ 'Last Substantive Update Date': '9/4/2026' }, 'update-date-format', 'Critical'],
  ])('retains severity for %s', (overrides, rule, severity) => {
    expect(audit(overrides).findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule, severity })])
    );
  });

  it('retains complete finding order, and warning-only results remain publishable under the existing audit', () => {
    expect(
      audit({ 'Suggested SLA Summary': 'Treatment plan may be ready' }).findings.map(
        (finding) => finding.rule
      )
    ).toEqual(['summary-punctuation', 'noncommittal-summary', 'summary-update-date']);
    const warning = audit({ 'Suggested SLA Summary': '9/4: Treatment plan may be ready' });
    expect(warning.passed).toBe(true);
    expect(warning.counts).toEqual({ Warning: 2 });
  });

  it('audits duplicate summaries across both tabs and preserves duplicate cohort counting separately', () => {
    const duplicate = auditWorkbookQuality({
      workbook: workbook(
        [baseline],
        [{ ...baseline, Salesforce: 'second', 'Opportunity Name': 'Second' }]
      ),
      auditedAt,
    });
    expect(duplicate.findings.map((finding) => finding.rule)).toEqual([
      'duplicate-in-depth-summary',
      'duplicate-in-depth-summary',
    ]);
    expect(duplicate.findings.map((finding) => finding.sheet)).toEqual([
      'Review Queue',
      'On-Hold Review',
    ]);
    expect(duplicate.duplicateOpportunityCount).toBe(0);
    const repeated = auditWorkbookQuality({ workbook: workbook([baseline, baseline]), auditedAt });
    expect(repeated.duplicateOpportunityCount).toBe(1);
    expect(repeated.passed).toBe(false);
    expect(repeated.findings).toEqual([]);
  });

  it('checks every sheet for cell overflow without truncating literal evidence', () => {
    const input = {
      workbook: {
        ...workbook([baseline]),
        sheets: {
          ...workbook([baseline]).sheets,
          'Evidence Detail': [['Timeline'], ['😀'.repeat(25_001)]],
        },
      },
      auditedAt,
    };
    const before = structuredClone(input);
    const report = auditWorkbookQuality(input);
    expect(report.findings).toEqual([
      {
        sheet: 'Evidence Detail',
        rowIndex: 1,
        columnIndex: 0,
        length: 50_002,
        severity: 'Critical',
        rule: 'google-cell-length',
        detail:
          "Cell exceeds Google's 50,000-character limit (50002); preserve evidence while correcting its representation.",
      },
    ]);
    expect(report.passed).toBe(false);
    expect(input).toEqual(before);
  });

  it('checks delay-history receipts before row findings and keeps absent tabs valid', () => {
    expect(
      audit({
        'In-Depth Summary': `${baseline['In-Depth Summary']} Delay history: previous event.`,
      }).findings[0]?.rule
    ).toBe('delay-history-omission');
    expect(auditWorkbookQuality({ workbook: { sheets: {} }, auditedAt }).passed).toBe(true);
  });

  it('preserves raw spreadsheet identity values rather than adding identity coercion', () => {
    const rows = [
      { opportunityId: 1, opportunityName: false, operationalSummary: 'Same' },
      { opportunityId: 2, opportunityName: true, operationalSummary: 'Same' },
    ];
    expect(duplicateOperationalSummaries(rows)[0]?.rows).toEqual(rows);
    const result = auditWorkbookQuality({
      workbook: workbook([
        { ...baseline, Salesforce: 1 },
        { ...baseline, Salesforce: 2 },
      ]),
      auditedAt,
    });
    expect(result.findings).toHaveLength(2);
    expect(result.duplicateOpportunityCount).toBe(0);
  });
});
