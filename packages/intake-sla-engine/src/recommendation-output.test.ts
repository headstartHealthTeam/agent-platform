import { describe, expect, it } from 'vitest';

import { adaptBillingClaims } from './billing-evidence.js';
import { currentNarrative, delayHistoryOmissions } from './delay-history.js';
import { createEvidenceEvent, type EvidenceInput } from './evidence.js';
import { buildFactPacket } from './fact-packet.js';
import type { NarrativeFact, NarrativePacket } from './narrative-types.js';
import { assertNoRawLeakage, renderRecommendation } from './recommendation.js';

const asOf = '2026-09-24T20:00:00Z';
function fact(overrides: Partial<NarrativeFact> = {}): NarrativeFact {
  return {
    id: 'current',
    source: 'Slack',
    date: '2026-09-23',
    fact: 'The assessment plan needs confirmation.',
    matchQuality: 'Direct',
    ...overrides,
  };
}
function packet(overrides: Partial<NarrativePacket> = {}): NarrativePacket {
  return {
    asOf,
    stage: 'IA Approved',
    processPosition: 'Initial assessment',
    unresolvedGate: 'Confirm assessment completion',
    freshness: 'Current',
    conflicts: [],
    action: {
      type: 'Provider Outreach',
      owner: 'Synthetic CSM',
      text: 'Confirm the current milestone.',
      date: '2026-09-25',
    },
    newestUpdate: fact(),
    ...overrides,
  };
}
function evidence(extra: Partial<EvidenceInput> = {}): ReturnType<typeof createEvidenceEvent> {
  return createEvidenceEvent({
    opportunityId: 'synthetic',
    source: 'Task',
    sourceRecordId: 'task',
    eventDate: '2026-09-23',
    category: 'intakeScheduling',
    text: 'The assessment remains scheduled.',
    substantive: true,
    matchQuality: 'Direct',
    relationship: 'Supports',
    collectionDate: asOf,
    ...extra,
  });
}

describe('complete approved recommendation output', () => {
  it('composes linked completed and outstanding sessions without falsely correcting the Salesforce stage', () => {
    const events = adaptBillingClaims({
      profile: { opportunityId: 'synthetic' },
      asOf,
      opportunity: { StageName: 'IA Scheduled' },
      coverageComplete: true,
      records: [
        {
          Id: 'completed',
          Appointment_ID__c: 'one',
          Billing_Code__c: '97151',
          Service_Name__c: 'Assessment',
          CreatedDate: '2026-09-21',
          Appt_Date__c: '2026-09-22',
          Appointment_Status__c: 'Active',
          Completed__c: 'Yes',
          Completed_Date__c: '2026-09-22',
        },
        {
          Id: 'scheduled',
          Appointment_ID__c: 'two',
          Billing_Code__c: '97152',
          Service_Name__c: 'Assessment Support',
          CreatedDate: '2026-09-21',
          Appt_Date__c: '2026-09-28',
          Appointment_Status__c: 'Active',
          Completed__c: 'No',
        },
      ],
    });
    const input = buildFactPacket({
      opportunity: { id: 'synthetic', stage: 'IA Scheduled', slaCreatedDate: '2026-09-20' },
      gate: {
        processPosition: 'Initial assessment',
        unresolvedGate: 'Confirm assessment completion',
      },
      evidenceEvents: events,
      sourceResults: [],
      asOf,
    });
    const rendered = renderRecommendation(input);
    expect(
      input.story.resolvedIssues.some((issue) => issue.issueKey === 'initial-assessment')
    ).toBe(false);
    expect(rendered.operationalSummary).toContain(
      'completed sessions alone do not establish whole-assessment completion'
    );
    expect(rendered.operationalSummary).not.toMatch(
      /remaining client-facing|stage is incorrect|current gate is resolved/i
    );
    expect(rendered.operationalSummary).toContain('assessment-support appointment');
  });

  it('adds complete delay history without changing current action, readiness, freshness or inputs', () => {
    const input = buildFactPacket({
      opportunity: { id: 'synthetic', stage: 'IA Approved', slaCreatedDate: '2026-09-01' },
      gate: {
        processPosition: 'Initial assessment',
        unresolvedGate: 'Confirm assessment completion',
      },
      evidenceEvents: [
        evidence({
          sourceRecordId: 'early',
          eventDate: '2026-09-02',
          text: 'Family forms were requested.',
        }),
        evidence({ eventDate: '2026-09-20', text: 'The assessment remains scheduled.' }),
      ],
      sourceResults: [],
      asOf,
    });
    const before = structuredClone(input);
    const full = renderRecommendation(input);
    const current = renderRecommendation({ ...input, delayHistory: null });
    expect(full).toMatchObject({
      suggestedSlaSummary: current.suggestedSlaSummary,
      type: current.type,
      owner: current.owner,
      text: current.text,
      date: current.date,
      basis: current.basis,
    });
    expect(delayHistoryOmissions(input.delayHistory, full.operationalSummary)).toEqual([]);
    expect(full.operationalSummary).toContain('Family forms were requested.');
    expect(currentNarrative(full.operationalSummary)).not.toContain('Earlier context');
    expect(input).toEqual(before);
  });

  it('distinguishes assessment cutoff from the source date and retains action metadata', () => {
    const input = packet({
      newestUpdate: fact({
        date: '2026-09-02',
        fact: 'The planned assessment date of 2026-09-15 passed without completion evidence.',
        factType: 'ia-date-missed',
      }),
      freshness: 'Stale',
    });
    const rendered = renderRecommendation({
      ...input,
      action: { ...input.action, provenance: { mode: 'codex-current-run' } },
    });
    expect(rendered.operationalSummary).toContain(
      'Assessed through 9/24 using the 9/2 source update'
    );
    expect(rendered.provenance.mode).toBe('codex-current-run');
  });

  it.each([
    'auth-corrections-complete',
    'auth-resubmission-signature',
    'auth-denial-corrections',
    'auth-resubmitted-pending',
    'auth-appeal',
    'auth-overlap-remediation',
    'auth-state-fair-hearing',
    'family-document-update',
  ])('retains denial and documented follow-up progress: %s', (factType) => {
    const input = packet({
      stage: 'IA Requested',
      processPosition: 'Initial authorization',
      unresolvedGate: 'Initial authorization denial',
      authorization: { state: 'Denied', denialOccurred: true, appealKind: 'reconsideration' },
      structuredGateDetail: fact({
        id: 'denial',
        source: 'Authorization',
        date: '2026-09-20',
        factType: 'auth-denial-reason',
        fact: 'The payer denied the request because overlapping or duplicate services.',
        denialReason: 'overlapping or duplicate services',
      }),
      newestUpdate: fact({
        factType,
        fact: 'The corrected SIPA was submitted; payer receipt remains unconfirmed.',
      }),
      story: { currentGateIssueKey: 'initial-authorization', timeline: [], resolvedIssues: [] },
    });
    const rendered = renderRecommendation(input);
    expect(rendered.suggestedSlaSummary).toMatch(/denied|denial/i);
    expect(rendered.operationalSummary).toContain('On 9/20');
    expect(rendered.operationalSummary).toContain('payer receipt remains unconfirmed');
    expect(rendered.operationalSummary).toContain('Next step:');
    expect(rendered.suggestedSlaSummary.length).toBeLessThanOrEqual(254);
  });

  it('retains a second denial and a later confirmation without inventing a resubmission', () => {
    const rendered = renderRecommendation(
      packet({
        stage: 'TA Requested',
        unresolvedGate: 'Treatment authorization denial',
        authorization: { state: 'Denied' },
        structuredGateDetail: fact({
          id: 'decision',
          source: 'Authorization',
          date: '2026-09-20',
          factType: 'auth-denial-reason',
          denialReason: 'missing clinical rationale',
          fact: 'Denied again after peer review; any further request requires a new prior authorization.',
        }),
        newestUpdate: fact({ factType: 'auth-denied', fact: 'The authorization remains denied.' }),
      })
    );
    expect(rendered.suggestedSlaSummary).toContain(
      'remains denied after the 9/20 peer review decision'
    );
    expect(rendered.operationalSummary).toContain(
      'no new authorization submission was confirmed after the second denial'
    );
  });

  it('preserves withdrawn status and conflicting pending evidence as a reconciliation recommendation', () => {
    const rendered = renderRecommendation(
      packet({
        stage: 'IA Requested',
        processPosition: 'Initial authorization',
        unresolvedGate: 'Initial authorization withdrawn',
        authorization: { state: 'Withdrawn', denialReason: 'overlapping or duplicate services' },
        newestUpdate: fact({
          factType: 'auth-denied',
          fact: 'Initial authorization was withdrawn.',
        }),
        conflicts: [
          'The authorization was withdrawn. A later source reports authorization remains pending.',
        ],
        story: { currentGateIssueKey: 'initial-authorization' },
      })
    );
    expect(rendered.suggestedSlaSummary).toMatch(/withdrawn/i);
    expect(rendered.operationalSummary).toContain('must reconcile the controlling payer status');
  });

  it('retains same-day corrected-document progress alongside the controlling payer decision', () => {
    const rendered = renderRecommendation(
      packet({
        stage: 'IA Requested',
        processPosition: 'Initial authorization',
        unresolvedGate: 'Initial authorization denial',
        authorization: { state: 'Denied', denialReason: 'missing assessment' },
        newestUpdate: fact({ factType: 'auth-denied', fact: 'Authorization denied.' }),
        story: {
          currentGateIssueKey: 'initial-authorization',
          timeline: [
            fact({
              id: 'progress',
              factType: 'auth-corrections-complete',
              issueKey: 'initial-authorization',
              fact: 'The corrected SIPA was sent; payer receipt remains unconfirmed.',
            }),
          ],
        },
      })
    );
    expect(rendered.operationalSummary).toContain('same-day provider update');
    expect(rendered.operationalSummary).toContain('corrected SIPA');
  });

  it('keeps a concrete earlier document requirement when the newest update is nonspecific', () => {
    const rendered = renderRecommendation(
      packet({
        newestUpdate: fact({
          factType: 'required-document',
          specificityMissing: true,
          fact: 'Required documentation remains outstanding.',
        }),
        evidenceTimeline: [
          fact({
            id: 'old',
            factType: 'required-document',
            requestedInformation: 'the BASC assessment',
            fact: 'BASC remains outstanding.',
          }),
        ],
      })
    );
    expect(rendered.suggestedSlaSummary).toContain('The required item remains the BASC assessment');
    expect(rendered.operationalSummary).toContain('the BASC assessment');
  });

  it('corroborates portal revisions and preserves the reported submission date', () => {
    const rendered = renderRecommendation(
      packet({
        stage: 'Treatment Plan In-review',
        newestUpdate: fact({ factType: 'tp-revisions' }),
        structuredGateDetail: fact({ id: 'detail', factType: 'tp-revisions' }),
        approvedFacts: [
          {
            source: 'Portal',
            date: '2026-09-23',
            matchQuality: 'Direct',
            factType: 'tp-revisions',
            text: 'Behavior definitions, measurable goals and discharge plan need edits.',
          },
          {
            date: '2026-09-22',
            matchQuality: 'Direct',
            factType: 'tp-submitted',
            milestoneDate: '2026-09-21',
          },
        ],
      })
    );
    expect(rendered.suggestedSlaSummary).toContain('Provider reported submitting the plan on 9/21');
    expect(rendered.suggestedSlaSummary).toContain('behavior definitions');
    expect(rendered.suggestedSlaSummary).toContain('No resubmission');
  });

  it('carries unresolved earlier requirements without repeating an already covered current fact', () => {
    const rendered = renderRecommendation(
      packet({
        story: {
          currentGateIssueKey: 'initial-assessment',
          activeIssues: [
            {
              issueKey: 'required-documentation',
              latestEventId: 'forms',
              latestFact: 'A signed service order remains missing.',
            },
          ],
        },
      })
    );
    expect(rendered.operationalSummary).toContain('A signed service order remains missing');
    expect(rendered.operationalSummary).toContain(
      'still required before the current process milestone'
    );
  });

  it('retains the exact raw-leakage threshold and ignores short raw fragments', () => {
    const raw = 'This synthetic unprocessed transcript text is more than forty characters long.';
    const recommendation = { suggestedSlaSummary: raw, operationalSummary: 'Next step.' };
    expect(assertNoRawLeakage(recommendation, [{ rawText: raw }])).toBe(false);
    expect(assertNoRawLeakage(recommendation, [{ rawText: 'short' }, { rawText: null }])).toBe(
      true
    );
    expect(
      assertNoRawLeakage(
        { suggestedSlaSummary: 'Independent summary.', operationalSummary: 'Next step.' },
        [{ rawText: raw }]
      )
    ).toBe(true);
  });
});
