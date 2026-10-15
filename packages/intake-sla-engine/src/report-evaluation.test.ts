import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FirefliesSuppliedInterpretation } from './fireflies-evidence-types.js';
import { createNoteAdjudicator } from './note-adjudication.js';
import { buildReportBillingRows } from './report-billing.js';
import { evaluateReportOpportunity, type ReportEvaluationContext } from './report-evaluation.js';
import { cutoff, reportEvaluationFixture } from './report-evaluation.test-support.js';
import { buildReportIdentityProfiles } from './report-identity.js';
import { indexReportStructuredSources } from './report-opportunity-context.js';
import { REPORT_QUEUE_HEADERS } from './report-vocabulary.js';
import { loadSavedReportSources } from './saved-source-context.js';

async function fixture(): Promise<ReportEvaluationContext<FirefliesSuppliedInterpretation>> {
  const data = await reportEvaluationFixture();
  const profiles = buildReportIdentityProfiles(data, cutoff);
  const runAt = new Date(cutoff);
  const billing = buildReportBillingRows(data, profiles, runAt);
  const saved = await loadSavedReportSources({
    collection: data,
    profiles,
    runId: 'synthetic',
    runAt,
    artifacts: {
      read: () => Promise.resolve(undefined),
      write: () => Promise.resolve(),
      readText: () => Promise.resolve(undefined),
      boundedProof: () => Promise.resolve(null),
      cacheProof: () => Promise.resolve(null),
    },
  });
  return {
    index: indexReportStructuredSources(data),
    identities: new Map(profiles.map((row) => [row.opportunityId, row])),
    billing: new Map(billing.map((row) => [row.opportunityId, row])),
    saved,
    ledgerRows: [],
    reviewerState: new Map(),
    noteAdjudicator: createNoteAdjudicator({ runId: 'synthetic', asOf: runAt }),
    interpretation: { requested: true, execution: { apiEnabled: false }, precomputed: new Map() },
    runId: 'synthetic',
    runAt,
    sfBaseUrl: 'https://example.invalid/Opportunity',
  };
}
describe('complete frozen report row composition', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(cutoff));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('composes every row layer and keeps reviewer values exact without a source call', async () => {
    const input = await fixture();
    const opp = input.index.data.opportunities[0];
    if (!opp) throw new Error('Synthetic Opportunity missing');
    const reviewer = {
      reviewerNotes: '  Retain spacing  ',
      copiedToSalesforce: false,
      needsCsmReview: null,
      reviewedBy: 0,
      reviewedAt: '',
    };
    const result = await evaluateReportOpportunity(opp, {
      ...input,
      reviewerState: new Map([[opp.Name, reviewer]]),
    });
    const value = (name: (typeof REPORT_QUEUE_HEADERS)[number]): unknown =>
      result.entry.main[REPORT_QUEUE_HEADERS.indexOf(name)];
    expect(value('Reviewer Notes')).toBe(reviewer.reviewerNotes);
    expect(value('Copied to Salesforce?')).toBe(false);
    expect(value('Needs CSM Review')).toBeNull();
    expect(result.sources).toHaveLength(22);
    // Missing authorization controls this fixture's gate; scheduling text is not promoted.
    expect(result.entry.normalizedEvidence).toEqual([]);
    expect(result.interpretation.mode).toBe('unavailable');
    expect(result.interpretationUsage).toEqual({ inputTokens: 0, outputTokens: 0 });
    expect(result.generationLedgerRow.slaId).toBe('sla');
    expect(result.generationLedgerRow.sourceCutoff).toBe(cutoff);
    expect(result.delayHistory.opportunityId).toBe(opp.Id);
    expect(result.searches.map((row) => row.source)).toEqual(['Calls / Texts']);
    expect(value('Ready to Copy')).toBe('Blocked');
    input.noteAdjudicator.assertConsumed();
  });
  it('retains absent SLA identity rather than inventing one and excludes missing report identities', async () => {
    const input = await fixture();
    const opp = input.index.data.opportunities[1];
    if (!opp) throw new Error('Synthetic Opportunity missing');
    const result = await evaluateReportOpportunity(opp, input);
    expect(result.generationLedgerRow.slaId).toBeUndefined();
    expect(result.entry.onHold).toBe(false);
    await expect(
      evaluateReportOpportunity(opp, { ...input, identities: new Map() })
    ).rejects.toThrow('Report identity missing');
  });
});
