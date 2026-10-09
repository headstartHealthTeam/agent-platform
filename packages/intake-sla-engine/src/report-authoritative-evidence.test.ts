import { describe, expect, it } from 'vitest';

import { normalizeBillingClaimAppointments } from './billing-normalization.js';
import { createEvidenceEvent } from './evidence.js';
import {
  assembleReportAuthoritativeEvidence,
  reportAdapterGate,
} from './report-authoritative-evidence.js';
import { classifyReportComparison } from './report-comparison-classification.js';
import { reportComparisonFixture } from './report-comparison.test-support.js';
import { cutoff, reportEvaluationFixture } from './report-evaluation.test-support.js';
import { buildReportIdentityProfiles } from './report-identity.js';
import {
  indexReportStructuredSources,
  prepareReportOpportunity,
  type ReportOpportunityContext,
} from './report-opportunity-context.js';

async function context(): Promise<ReportOpportunityContext> {
  const data = await reportEvaluationFixture();
  const opportunity = data.opportunities[0];
  const identity = buildReportIdentityProfiles(data, cutoff)[0];
  if (!opportunity || !identity) throw new Error('Synthetic fixture missing');
  return prepareReportOpportunity({
    opportunity,
    identity,
    index: indexReportStructuredSources(data),
    ledgerRows: [],
    runAt: new Date(cutoff),
  });
}
describe('authoritative report adapter composition', () => {
  it('preserves Date fallback values, adapter ordering and current-run event identity', async () => {
    const base = await context();
    const runAt = new Date(cutoff);
    const prepared = {
      ...base,
      history: [{ Id: 'stage', Field: 'StageName', NewValue: 'IA Scheduled' }],
    };
    const supplied = createEvidenceEvent({
      opportunityId: base.opp.Id,
      source: 'Fireflies',
      sourceRecordId: 'meeting',
      eventDate: '2026-09-23',
      category: 'rbt',
      text: 'The candidate interview is pending.',
      matchQuality: 'Direct',
      substantive: true,
    });
    const input = {
      context: prepared,
      runAt,
      gate: { gateCategory: 'rbt' },
      reviewedNoteIds: new Set<string>(),
      interpretedNoteEvents: [],
      portalRequests: [],
      billing: undefined,
      portal: undefined,
      firefliesEvents: [supplied],
      slackEvents: [],
    };
    const before = structuredClone(input);
    const events = assembleReportAuthoritativeEvidence(input);
    expect(events.at(-1)).toBe(supplied);
    expect(events.find((event) => event.source === 'Salesforce Stage History')?.eventDate).toBe(
      runAt
    );
    expect(events.find((event) => event.source === 'Ticket Match')?.eventDate).toBe(runAt);
    expect(events.findIndex((event) => event.source === 'Salesforce Stage History')).toBeLessThan(
      events.findIndex((event) => event.source === 'Ticket Match')
    );
    expect(input).toEqual(before);
  });
  it('does not rerun note heuristics after an accepted empty current-run note decision', async () => {
    const prepared = await context();
    const events = assembleReportAuthoritativeEvidence({
      context: prepared,
      runAt: new Date(cutoff),
      gate: { gateCategory: 'intakeScheduling' },
      reviewedNoteIds: new Set(['sla']),
      interpretedNoteEvents: [],
      portalRequests: [],
      billing: undefined,
      portal: undefined,
      firefliesEvents: [],
      slackEvents: [],
    });
    expect(events.filter((event) => event.source === 'SLA / Intake / On-Hold Notes')).toEqual([]);
    expect(prepared.sla.Reason_for_Delay_Notes__c).not.toBe('');
  });
  it('retains the authorization resolver and stage contract without adding comparison conflicts', async () => {
    const prepared = await context();
    const comparison = classifyReportComparison(reportComparisonFixture(4));
    const gate = reportAdapterGate(prepared, 'intakeScheduling', comparison);
    expect(gate).toMatchObject({
      processPosition: 'Initial authorization',
      gateCategory: 'insurance',
    });
    expect(gate.authorization).toBe(prepared.authorizationGate);
    expect(gate).not.toHaveProperty('conflicts');
  });
  it('accepts the actual Date cutoff with the original Date.parse coercion and post-cutoff exclusion', () => {
    const records = [
      {
        Id: 'prior',
        Billing_Code__c: '97151',
        CreatedDate: '2026-09-24T15:00:00Z',
        Appt_Date__c: '2026-09-23',
        Completed__c: 'Yes',
      },
      {
        Id: 'later',
        Billing_Code__c: '97151',
        CreatedDate: '2026-09-24T17:00:00Z',
        Appt_Date__c: '2026-09-23',
        Completed__c: 'Yes',
      },
    ];
    expect(normalizeBillingClaimAppointments(records, { asOf: new Date(cutoff) })).toEqual(
      normalizeBillingClaimAppointments(records, { asOf: cutoff })
    );
    expect(
      normalizeBillingClaimAppointments(records, { asOf: new Date(cutoff) }).map(
        (row) => row.billingClaimId
      )
    ).toEqual(['prior']);
  });
});
