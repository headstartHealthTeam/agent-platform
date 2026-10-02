import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EvidenceEvent } from './evidence.js';
import { createEvidenceEvent } from './evidence.js';
import { analyzeOpportunityFreshness } from './freshness-analysis.js';
import {
  assembleReportAuthoritativeEvidence,
  reportAdapterGate,
} from './report-authoritative-evidence.js';
import { buildReportBillingRows } from './report-billing.js';
import { prepareReportComparison } from './report-comparison-context.js';
import { cutoff, reportEvaluationFixture } from './report-evaluation.test-support.js';
import { projectReportFinalContext, reportCalendarDaysSince } from './report-final-context.js';
import { buildReportIdentityProfiles } from './report-identity.js';
import {
  indexReportStructuredSources,
  prepareReportOpportunity,
} from './report-opportunity-context.js';
import {
  buildReportRecommendation,
  reportCoreSourceResults,
  type ReportRecommendationInput,
} from './report-recommendation.js';
import { reportMaterialGap } from './report-row-review.js';

async function fixture(): Promise<ReportRecommendationInput<EvidenceEvent>> {
  const collection = await reportEvaluationFixture();
  const profiles = buildReportIdentityProfiles(collection, cutoff);
  const opportunity = collection.opportunities[0];
  const identity = profiles[0];
  if (!opportunity || !identity) throw new Error('Synthetic fixture missing');
  const runAt = new Date(cutoff);
  const context = prepareReportOpportunity({
    opportunity,
    identity,
    index: indexReportStructuredSources(collection),
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
      freshness,
      sla: context.evidenceSla,
      interviews: context.firstInterviews,
      commsText: context.summaries.comms.text,
      runAt,
    },
    context.tasks,
    context.aircalls
  );
  const billing = buildReportBillingRows(collection, profiles, runAt)[0];
  const events = assembleReportAuthoritativeEvidence({
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
  });
  return {
    context,
    comparison,
    billing,
    events,
    runAt,
    stageFamily: freshness.stageFamily,
    outcomes: [
      {
        source: 'SLA / Intake / On-Hold Notes',
        status: 'Found',
        found: 1,
        recordsRetrieved: 1,
        required: true,
        detail: 'Synthetic coverage',
      },
    ],
  };
}
describe('final report recommendation composition', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(cutoff));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('replaces comparison fields with final conclusions and retains the exact timeline projection', async () => {
    const base = await fixture();
    const input = {
      ...base,
      events: [
        ...base.events,
        createEvidenceEvent({
          opportunityId: base.context.opp.Id,
          source: 'Authorization Review',
          sourceRecordId: 'review:detail',
          eventDate: '2026-09-23',
          category: 'insurance',
          issueKey: 'initial-authorization',
          text: 'The payer requested a signed referral before authorizing assessment.',
          factType: 'payer-requested-information',
          substantive: true,
          matchQuality: 'Direct',
          relationship: 'Supports',
          processRelevance: 10,
          gateImpact: 'The signed referral is outstanding.',
        }),
      ],
    };
    const evaluated = buildReportRecommendation(input);
    const before = structuredClone(input.comparison);
    const projected = projectReportFinalContext(
      input.comparison,
      evaluated,
      input.events,
      input.runAt
    );
    expect(projected.expanded.summary).toBe(evaluated.recommendation.suggestedSlaSummary);
    expect(projected.expanded.evidenceConflict).toBe(evaluated.packet.conflicts.join('; '));
    expect(projected.freshness.story).toBe(evaluated.packet.story);
    expect(projected.freshness.evidence.length).toBeGreaterThan(0);
    for (const event of projected.freshness.evidence) {
      expect(event.collectedAt).toBe(cutoff);
      expect(Object.hasOwn(event, 'milestoneKind')).toBe(true);
      expect(Object.hasOwn(event, 'interpretationProvenance')).toBe(true);
      expect(Object.hasOwn(event, 'followUpDate')).toBe(true);
      expect(event.milestoneKind).toBeUndefined();
      expect(event.followUpDate).toBeUndefined();
    }
    expect(input.comparison).toEqual(before);
    expect(
      typeof reportMaterialGap({
        opp: input.context.opp,
        expanded: projected.expanded,
        freshness: projected.freshness,
        firefliesResult: '',
        hasValidMilestone: projected.hasValidMilestone,
        authorizationGate: input.context.authorizationGate,
        packet: evaluated.packet,
      })
    ).toBe('string');
    expect(reportCalendarDaysSince('2026-09-23T23:59:00Z', input.runAt)).toBe(1);
    expect(reportCalendarDaysSince('2026-09-30', input.runAt)).toBe(0);
    expect(reportCalendarDaysSince('invalid', input.runAt)).toBeNull();
  });
  it('composes actual producers, retains event metadata, and leaves comparison/source inputs unchanged', async () => {
    const input = await fixture();
    const before = structuredClone(input);
    const result = buildReportRecommendation(input);
    expect(result.packet.opportunityId).toBe(input.context.opp.Id);
    expect(result.packet.asOf).toBe(input.runAt);
    expect(result.packet.specificityAudit).toBe(result.specificityAudit);
    expect(result.recommendation.operationalSummary).toContain('Synthetic Alpha');
    expect(result.results[0]?.relevantMatches[0]).toBe(
      input.events.find(
        (event) => event.source === 'SLA / Intake / On-Hold Notes' && event.substantive
      )
    );
    expect(input).toEqual(before);
  });
  it('does not promote comparison conflicts or proposed comparison actions into the final gate', async () => {
    const input = await fixture();
    const result = buildReportRecommendation({
      ...input,
      comparison: {
        ...input.comparison,
        expanded: {
          ...input.comparison.expanded,
          evidenceConflict: true,
          action: 'Invented comparison correction.',
        },
      },
    });
    expect(result.gate.conflicts).toEqual([]);
    expect(result.gate.recommendedAction).toBeNull();
    expect(result.packet.conflicts).not.toContain('Invented comparison correction.');
    expect(result.recommendation.text).not.toBe('Invented comparison correction.');
  });
  it('preserves missing-stage output without inventing a stage and enforces original explicit-null lookup failure', async () => {
    const input = await fixture();
    const context = { ...input.context, opp: { ...input.context.opp, StageName: undefined } };
    const result = buildReportRecommendation({ ...input, context });
    expect(result.packet.stage).toBeUndefined();
    expect(result.recommendation.operationalSummary).toContain('undefined');
    expect(() =>
      buildReportRecommendation({
        ...input,
        context: { ...context, opp: { ...context.opp, StageName: null } },
      })
    ).toThrow(TypeError);
  });
  it('keeps exact source names and required failures even when similarly named evidence exists', async () => {
    const input = await fixture();
    const result = reportCoreSourceResults(
      [
        {
          source: 'Portal Auth Requests',
          status: 'Blocked',
          found: 0,
          recordsRetrieved: 2,
          required: true,
          detail: 'Coverage incomplete',
        },
      ],
      input.events,
      cutoff
    );
    expect(result[0]).toMatchObject({
      source: 'Portal Auth Requests',
      status: 'Blocked',
      failureReason: 'Coverage incomplete',
      recordCount: 2,
      relevantMatches: [],
      required: true,
    });
  });
});
