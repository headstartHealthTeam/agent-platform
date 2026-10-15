import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createEvidenceEvent } from './evidence.js';
import { analyzeOpportunityFreshness } from './freshness-analysis.js';
import { createNoteAdjudicator } from './note-adjudication.js';
import {
  assembleReportAuthoritativeEvidence,
  reportAdapterGate,
} from './report-authoritative-evidence.js';
import { buildReportBillingRows } from './report-billing.js';
import { prepareReportCommunicationEvidence } from './report-communication-evidence.js';
import { prepareReportComparison } from './report-comparison-context.js';
import { cutoff, reportEvaluationFixture } from './report-evaluation.test-support.js';
import type { ReportCollectedSourceOutcome } from './report-finalization.js';
import { buildReportIdentityProfiles } from './report-identity.js';
import {
  indexReportStructuredSources,
  prepareReportOpportunity,
} from './report-opportunity-context.js';
import { buildReportRecommendation } from './report-recommendation.js';
import type { ReportSourceOutcomesInput } from './report-source-outcome-types.js';
import { evaluateReportSourceOutcomes } from './report-source-outcomes.js';

async function fixture(): Promise<ReportSourceOutcomesInput> {
  const data = await reportEvaluationFixture();
  const profiles = buildReportIdentityProfiles(data, cutoff);
  const identity = profiles[0];
  const opportunity = data.opportunities[0];
  if (!identity || !opportunity) throw new Error('Synthetic fixture missing');
  const runAt = new Date(cutoff);
  const context = prepareReportOpportunity({
    opportunity,
    identity,
    index: indexReportStructuredSources(data),
    ledgerRows: [],
    runAt,
  });
  const freshness = analyzeOpportunityFreshness({
    opp: context.evidenceOpp,
    identity,
    asOf: runAt,
  });
  const comparison = prepareReportComparison(
    {
      ...context,
      sla: context.evidenceSla,
      interviews: context.firstInterviews,
      commsText: context.summaries.comms.text,
      freshness,
      runAt,
    },
    context.tasks,
    context.aircalls
  );
  const billing = buildReportBillingRows(data, profiles, runAt)[0];
  return {
    context,
    comparison,
    freshness,
    billing,
    runAt,
    communications: prepareReportCommunicationEvidence(
      context,
      data.aircalls.length,
      data.tasks.length,
      runAt
    ),
    events: assembleReportAuthoritativeEvidence({
      context,
      runAt,
      gate: reportAdapterGate(context, freshness.stageFamily, comparison.expanded),
      reviewedNoteIds: new Set(),
      interpretedNoteEvents: [],
      portalRequests: [],
      billing,
      portal: undefined,
      firefliesEvents: [],
      slackEvents: [],
    }),
    portal: { row: { searchedAt: cutoff }, count: 0 },
    fireflies: {
      row: { searchedAt: cutoff },
      count: 0,
      coverage: { identityComplete: true, coverageStatus: 'Complete', coverageDetail: '' },
    },
    slack: {
      row: { searchedAt: cutoff },
      count: 0,
      eventCount: 0,
      interpretedCount: 0,
      coverage: { status: 'Complete', complete: true, detail: '' },
    },
    gmail: { row: undefined, count: 0 },
    files: { row: undefined, count: 0 },
    portalRequests: { inventory: null, count: 0 },
    health: {
      portal: { status: 'Complete', reason: null },
      fireflies: { status: 'Complete', reason: null },
    },
    interpretation: { mode: 'precomputed', unrecoveredFailures: [], searchResult: undefined },
    noteAdjudicator: createNoteAdjudicator({ runId: 'synthetic', asOf: runAt }),
    reviewedSlaId: 'sla',
  };
}
describe('report source coverage composition', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(cutoff));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('composes actual producers in the original 22-source order and keeps empty vs non-blocking failures distinct', async () => {
    const input = await fixture();
    const before = structuredClone(input.context);
    const result = evaluateReportSourceOutcomes(input);
    expect(result.outcomes.map((row) => row.source)).toEqual([
      'Salesforce Opportunity / SLA',
      'Salesforce Stage History',
      'SLA / Intake / On-Hold Notes',
      'Authorization',
      'Authorization Review',
      'VOB',
      'Clinical Quality',
      'RBT Request',
      'Ticket Match',
      'Talent Acquisition',
      'RBT First Interview',
      'Staffing',
      'Tasks / Task Chatter',
      'Salesforce Emails',
      'Calls / Texts',
      'Portal Auth Requests',
      'Portal',
      'Fireflies',
      'Linked Billing / Claims',
      'Slack',
      'Gmail',
      'Linked Files',
    ]);
    expect(result.outcomes.find((row) => row.source === 'Portal')).toMatchObject({
      status: 'Searched - Not Found',
      required: true,
    });
    expect(result.outcomes.find((row) => row.source === 'Gmail')).toMatchObject({
      status: 'Blocked',
      required: false,
    });
    expect(result.outcomes.find((row) => row.source === 'Portal Auth Requests')).toMatchObject({
      status: 'Blocked',
      required: false,
    });
    expect(input.context).toEqual(before);
    const final = buildReportRecommendation({
      ...input,
      stageFamily: input.freshness.stageFamily,
      outcomes: result.outcomes,
    });
    expect(final.results).toHaveLength(22);
  });
  it('keeps collection-health failures and missing interpretation above successful candidate retrieval', async () => {
    const input = await fixture();
    const result = evaluateReportSourceOutcomes({
      ...input,
      portal: { ...input.portal, count: 5 },
      health: {
        ...input.health,
        portal: { status: 'Blocked', reason: 'Incomplete current-run inventory' },
      },
      interpretation: {
        mode: 'unavailable',
        unrecoveredFailures: [],
        searchResult: { source: 'Fireflies', status: 'Found', segmentsScanned: 1, failures: [] },
      },
    });
    expect(result.outcomes.find((row) => row.source === 'Portal')).toMatchObject({
      status: 'Blocked',
      recordsRetrieved: 5,
      detail: 'Incomplete current-run inventory',
    });
    expect(result.outcomes.find((row) => row.source === 'Fireflies')).toMatchObject({
      status: 'Blocked',
      required: true,
    });
  });
  it('preserves nullable health detail through the finalization record contract', async () => {
    const input = await fixture();
    const result = evaluateReportSourceOutcomes({
      ...input,
      health: { ...input.health, portal: { status: 'Blocked', reason: null } },
    });
    const records: ReportCollectedSourceOutcome[] = result.outcomes.map((outcome) => ({
      ...outcome,
      runId: 'synthetic',
      collectedAt: input.runAt.toISOString(),
      opportunityId: input.context.opp.Id,
      opportunityName: input.context.opp.Name,
    }));
    expect(records.find((record) => record.source === 'Portal')).toMatchObject({
      status: 'Blocked',
      detail: null,
    });
  });
  it('does not lose admitted human notes, and honors the current-run administrative decision', async () => {
    const input = await fixture();
    const missing = evaluateReportSourceOutcomes({ ...input, events: [] });
    expect(missing.unparsedAdmittedSlaNote).toBe(true);
    const administrative = evaluateReportSourceOutcomes({
      ...input,
      events: [],
      noteAdjudicator: { administrativeNote: () => true },
    });
    expect(administrative.unparsedAdmittedSlaNote).toBe(false);
    const supplied = createEvidenceEvent({
      opportunityId: input.context.opp.Id,
      source: 'SLA / Intake / On-Hold Notes',
      sourceRecordId: 'sla:1',
      eventDate: cutoff,
      category: 'intakeScheduling',
      text: 'Provider will confirm the assessment date.',
      substantive: true,
      matchQuality: 'Direct',
    });
    const admitted = evaluateReportSourceOutcomes({ ...input, events: [supplied] });
    expect(admitted.admittedSlaNoteEventCount).toBe(1);
    expect(admitted.unparsedAdmittedSlaNote).toBe(false);
    expect(admitted.combinedEvidence).toContain(supplied);
  });
  it('partitions linked email/SMS/task records and audits the complete scanned cohort count', async () => {
    const input = await fixture();
    const task = input.context.tasks[0];
    if (!task) throw new Error('Synthetic task missing');
    const context = {
      ...input.context,
      tasks: [
        { ...task, Id: 'email', Subject: 'Email' },
        { ...task, Id: 'sms', Subject: 'SMS' },
        { ...task, Id: 'both', Subject: 'Email text' },
        { ...task, Id: 'task', Subject: 'Call' },
      ],
    };
    const result = prepareReportCommunicationEvidence(context, 5, 12, input.runAt);
    expect(result.emails.map((row) => row.Id)).toEqual(['email', 'both']);
    expect(result.sms.map((row) => row.Id)).toEqual(['sms', 'both']);
    expect(result.tasks[0]).toBe(context.tasks[3]);
    expect(result.tasks.slice(1)).toEqual(context.taskUpdates);
    expect(result.searchResult.recordsScanned).toBe(17);
    expect(result.searchResult.segmentsScanned).toBe(2);
    expect(result.searchResult.directAndLikelyMatches.map((row) => row.sourceRecordId)).toEqual([
      'sms',
      'both',
    ]);
  });
});
