import { describe, expect, it } from 'vitest';

import { analyzeOpportunityFreshness } from './freshness-analysis.js';
import { createGenerationLedgerRow } from './generation-ledger.js';
import { matchReportCommunication } from './report-communication-match.js';
import { prepareReportComparison } from './report-comparison-context.js';
import {
  cutoff,
  id,
  reportEvaluationFixture as fixture,
} from './report-evaluation.test-support.js';
import { buildReportIdentityProfiles } from './report-identity.js';
import {
  indexReportStructuredSources,
  prepareReportOpportunity,
} from './report-opportunity-context.js';

describe('report Opportunity preparation', () => {
  it('composes actual collected records without mutating source rows or losing linkage/order', async () => {
    const data = await fixture();
    const index = indexReportStructuredSources(data);
    const identity = buildReportIdentityProfiles(data, cutoff)[0];
    const opportunity = data.opportunities[0];
    if (!identity || !opportunity) throw new Error('Synthetic fixture missing');
    const before = structuredClone(data);
    const prepared = prepareReportOpportunity({
      opportunity,
      identity,
      index,
      ledgerRows: [],
      runAt: new Date(cutoff),
    });
    expect(prepared.tasks.map((row) => row.Id)).toEqual(['own']);
    expect(prepared.tasks[0]?._matchQuality).toBe('Direct');
    expect(prepared.taskUpdates[0]?.FeedItemId).toBe('feed');
    expect(prepared.firstInterviews.map((row) => row.Id)).toEqual(['interview']);
    // The original report repeats talent per match, while interviews are deduplicated by ID.
    expect(prepared.talent.map((row) => row.Id)).toEqual(['candidate', 'candidate']);
    expect(prepared.staffing[0]).toMatchObject({ _linkedViaRbtRequestId: 'request' });
    expect(prepared.summaries.comms.text).toContain('Assessment scheduling follow-up');
    expect(prepared.evidenceSla.Reason_for_Delay_Notes__c).toBe(
      'Provider will confirm the assessment date.'
    );
    expect(prepared.opp).toBe(opportunity);
    expect(prepared.sla).toBe(opportunity.Current_SLA__r);
    expect(data).toEqual(before);
    const freshness = analyzeOpportunityFreshness({
      opp: prepared.evidenceOpp,
      identity,
      asOf: new Date(cutoff),
    });
    const comparison = prepareReportComparison(
      {
        ...prepared,
        freshness,
        sla: prepared.evidenceSla,
        interviews: prepared.firstInterviews,
        commsText: prepared.summaries.comms.text,
        runAt: new Date(cutoff),
      },
      prepared.tasks,
      prepared.aircalls
    );
    expect(comparison.processPosition).toBe('Initial authorization is missing.');
    expect(comparison.expanded.summary).not.toBe('');
  });
  it('excludes exact generated notes only from the evidence projection, retaining the displayed source', async () => {
    const data = await fixture();
    const identity = buildReportIdentityProfiles(data, cutoff)[0];
    const opportunity = data.opportunities[0];
    if (!identity || !opportunity) throw new Error('Synthetic fixture missing');
    const ledger = createGenerationLedgerRow({
      runId: 'prior',
      slaId: 'sla',
      opportunityId: id,
      generatedSummary: opportunity.Current_SLA__r?.Reason_for_Delay_Notes__c,
      generatedAt: cutoff,
    });
    const result = prepareReportOpportunity({
      opportunity,
      identity,
      index: indexReportStructuredSources(data),
      ledgerRows: [ledger],
      runAt: new Date(cutoff),
    });
    expect(result.slaNoteClassification.provenance).toBe('Generated - Exact');
    expect(result.evidenceSla.Reason_for_Delay_Notes__c).toBe('');
    expect(result.sla.Reason_for_Delay_Notes__c).toBe('Provider will confirm the assessment date.');
    expect(result.evidenceOpp.Current_SLA__r).toBe(result.evidenceSla);
  });
  it('gives SMS content precedence over a transcript and preserves arbitrary record metadata', () => {
    const opportunity = { Id: id, Name: 'Synthetic Alpha' };
    const record = {
      Id: 'sms',
      WhatId: id,
      aircall__Message_Content__c: 'Confirm the assessment date.',
      Headstart_Full_Transcript__c: 'For Synthetic Beta: postpone assessment.',
      extra: { keep: true },
    };
    const result = matchReportCommunication(opportunity, record, {}, [
      'synthetic alpha',
      'synthetic beta',
    ]);
    expect(result).toMatchObject({ _matchQuality: 'Direct' });
    expect(result?.extra).toBe(record.extra);
    expect(
      matchReportCommunication(opportunity, { ...record, aircall__Message_Content__c: '' }, {}, [
        'synthetic alpha',
        'synthetic beta',
      ])
    ).toBeNull();
  });
});
