import { describe, expect, it } from 'vitest';

import { generationHash } from './generation-ledger.js';
import { sha256Json } from './json-fingerprint.js';
import { assembleReport } from './report-assembly.js';
import { projectReportRow } from './report-row.js';
import { reportRowFixture } from './report-row.test-support.js';
import { REPORT_EVIDENCE_HEADERS, REPORT_QUEUE_HEADERS } from './report-vocabulary.js';
import { resolveSourceAuthorizationGate } from './source-authorization-gate.js';

describe('approved final report row projection', () => {
  it('composes actual packet, renderer, freshness, authorization and Task producers without mutation', () => {
    const input = reportRowFixture();
    const before = structuredClone(input);
    const result = projectReportRow(input);
    // Complete output digest from the pure row expressions at approved Intake 15b66ac.
    expect(sha256Json(result)).toBe(
      '3ce94e9be5140b92b4d5005a95e7153a5c6376a584da1b3b577dd66a3662740b'
    );
    expect(result.entry.main).toHaveLength(REPORT_QUEUE_HEADERS.length);
    expect(result.entry.evidence).toHaveLength(REPORT_EVIDENCE_HEADERS.length);
    expect(result.entry.main[0]).toBe(input.opp.Name);
    expect(result.entry.main[7]).toBe(input.expanded.blocker);
    expect(result.entry.main[13]).toBe(input.expanded.summary);
    expect(result.entry.main[14]).toBe(input.inDepthSummary);
    expect(result.entry.main[20]).toBe(input.expanded.action);
    expect(result.entry.normalizedEvidence).toBe(input.combinedEvidence);
    expect(result.entry.evidence[24]).toBe('Authorization');
    expect(result.entry.evidence[34]).toBe('Portal: Found');
    expect(result.entry.holdFields[2]).toBe('');
    expect(input).toEqual(before);
  });
  it.each([false, 0, null, undefined, '', '  exact  '])(
    'preserves own checkbox/copy values %s',
    (value) => {
      const input = reportRowFixture();
      const result = projectReportRow({
        ...input,
        reviewerState: { copiedToSalesforce: value, needsCsmReview: value },
      });
      expect(result.entry.main[27]).toBe(value);
      expect(result.entry.main[28]).toBe(value);
      expect(projectReportRow(input).entry.main[27]).toBe('');
    }
  );
  it('retains original text-field falsey fallback and exact nonempty reviewer text', () => {
    const result = projectReportRow({
      ...reportRowFixture(),
      reviewerState: { reviewerNotes: '  keep  ', reviewedBy: false, reviewedAt: 0 },
    });
    expect(result.entry.main[26]).toBe('  keep  ');
    expect(result.entry.main.slice(35)).toEqual(['', '']);
  });
  it('orders material, identity, interpretation and QA gaps without turning Review into Blocked', () => {
    const input = reportRowFixture();
    const result = projectReportRow({
      ...input,
      gap: 'Material gap.',
      identityMatchReview: 'Verify name.',
      aiInterpretationGap: 'Interpretation incomplete.',
      qualityReview: { valid: false, issues: ['First.', 'Second.'] },
      finalReadyToCopy: 'Review',
      finalEvidenceStatus: 'Partial',
      portal: { gap: 'Portal gap.', result: 'Partial' },
      firefliesWasSearched: false,
      freshness: { ...input.freshness, needsFireflies: true, firefliesReason: '' },
      unavailableEnrichmentSources: [{ source: 'Gmail' }],
    });
    expect(result.finalGap).toBe(
      'Material gap. Identity verification required: Verify name. Interpretation incomplete. Publication QA: First. Second.'
    );
    expect(result.gaps).toBe(
      `Portal gap.; Fireflies check required: source not searched; ${result.finalGap}; Non-blocking enrichment unavailable: Gmail.`
    );
    expect(result.entry.main[24]).toBe('Review');
    expect(result.entry.evidence[14]).toBe('Likely - verification required');
    expect(result.entry.evidence[15]).toBe('Partial');
  });
  it('uses existing routine-review explanation and exact source-coverage priority', () => {
    const result = projectReportRow({
      ...reportRowFixture(),
      finalReadyToCopy: 'Review',
      blockingSources: [{ source: 'Fireflies' }],
      unavailableEnrichmentSources: [{ source: 'Gmail' }],
    });
    expect(result.finalGap).toContain('Routine human review');
    expect(result.entry.evidence[15]).toBe('Blocked');
    expect(result.entry.main[24]).toBe('Review');
  });
  it('preserves authorization-not-required and concrete required-gate displays', () => {
    const input = reportRowFixture();
    const noGate = resolveSourceAuthorizationGate({
      opp: { StageName: 'Insurance Verification' },
      asOf: input.runAt,
    });
    expect(projectReportRow({ ...input, authorizationGate: noGate }).entry.evidence[12]).toBe(
      'No authorization prerequisite applies to the current gate.'
    );
    expect(projectReportRow(input).entry.evidence[12]).toContain('initial; Unresolved; Missing');
  });
  it('retains existing due fallback, provider columns, hold fallback and evidence date truncation', () => {
    const input = reportRowFixture();
    const result = projectReportRow({
      ...input,
      opp: {
        ...input.opp,
        SL_Due__c: null,
        On_Hold__c: true,
        Last_On_Hold_Reason__c: 'Old reason',
        On_Hold_Start_Date__c: '2026-09-20T08:00:00Z',
        Off_Hold_Reason__c: 'Restart',
        IA_Rendering_Provider__r: { Name: 'IA' },
        TA_Rendering_Provider__r: { Name: 'TA' },
        Rendering_Provider__r: { Name: 'General' },
      },
      sla: { ...input.sla, Due__c: '-7' },
      freshness: {
        ...input.freshness,
        latestUpdateAt: '2026-09-24T14:00:00Z',
        latestUpdateFact: 'x'.repeat(300),
        latestUpdateSummary: 'y'.repeat(550),
      },
    });
    expect(result.entry.main[6]).toBe(7);
    expect(result.entry.main[9]).toBe('2026-09-24');
    expect(result.entry.main[11]).toHaveLength(260);
    expect(result.entry.evidence[35]).toHaveLength(500);
    expect(result.entry.evidence.slice(21, 24)).toEqual(['IA', 'TA', 'General']);
    expect(result.entry.holdFields).toEqual(['Old reason', '2026-09-20', 4, 'Restart']);
  });
  it('creates pending ledger provenance and composes with complete report assembly', () => {
    const input = reportRowFixture();
    const row = projectReportRow(input);
    expect(row.generationLedgerRow).toMatchObject({
      runId: input.runId,
      opportunityId: input.opp.Id,
      slaId: input.opp.Current_SLA__c,
      engineVersion: input.engineVersion,
      sourceCutoff: input.runAt.toISOString(),
      generatedAt: input.runAt.toISOString(),
      publicationStatus: 'Built - Pending Publish',
      summaryHash: generationHash(input.expanded.summary),
    });
    const report = assembleReport({
      runId: input.runId,
      runAt: input.runAt,
      runAtEastern: 'ET',
      expectedRows: 1,
      entries: [row.entry],
      sourceStatusRecords: input.sourceOutcomes,
      combinedGenerationLedgerRows: [row.generationLedgerRow],
      delayHistoryRows: [],
      noteAdjudications: { inputHash: 'hash', receipts: [] },
      priorRunHistoryRows: [],
    });
    expect(report.rows[1]).toBe(row.entry.main);
    expect(report.evidenceRows[1]).toBe(row.entry.evidence);
    expect(report.runManifest.processedRows).toBe(1);
  });
});
