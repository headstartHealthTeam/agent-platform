import assert from 'node:assert/strict';

import { it as test } from 'vitest';

import { createEvidenceEvent } from './evidence.js';
import { buildFactPacket } from './fact-packet.js';
import { narrativeSentenceCount } from './publication-narrative.js';
import { renderRecommendation } from './recommendation.js';

for (const dates of [
  { followUpDate: '2026-09-17', milestoneDate: null },
  { followUpDate: null, milestoneDate: '2026-09-17' },
])
  test(`a pending status date or reminder never becomes an invented missed plan: ${JSON.stringify(dates)}`, () => {
    const opportunity = {
      id: 'synthetic',
      name: 'Synthetic Client',
      stage: 'IA Requested',
      slaCreatedDate: '2026-09-01',
      csm: 'CSM',
    };
    const evidence = createEvidenceEvent({
      opportunityId: opportunity.id,
      source: 'Fireflies',
      sourceRecordId: 'meeting:1',
      eventDate: '2026-09-17',
      category: 'insurance',
      factType: 'auth-pending',
      text: 'Initial authorization is still pending, so the assessment has not started.',
      substantive: true,
      matchQuality: 'Direct',
      relationship: 'Supports',
      processRelevance: 10,
      actionOwner: 'CSM',
      actionType: 'Monitor',
      recommendedAction: 'CSM to monitor the initial authorization determination.',
      ...dates,
    });
    const gate = {
      gateCategory: 'insurance',
      processPosition: 'Initial authorization',
      unresolvedGate: 'Initial authorization pending',
      readyToCopy: 'Yes',
    };
    const packet = buildFactPacket({
      opportunity,
      gate,
      evidenceEvents: [evidence],
      sourceResults: [],
      asOf: '2026-09-18T20:00:00Z',
    });
    const report = renderRecommendation(packet);
    assert.equal(report.type, 'Monitor');
    assert.match(report.text, /monitor.*authorization determination/i);
    assert.doesNotMatch(report.text, /planned.*milestone|occurred/i);
    assert.equal(report.date, '2026-09-21');
  });

test('an explicitly planned milestone still requires confirmation after its date', () => {
  const opportunity = {
    id: 'synthetic',
    name: 'Synthetic Client',
    stage: 'Treatment Plan In-review',
    slaCreatedDate: '2026-09-01',
    csm: 'CSM',
  };
  const evidence = createEvidenceEvent({
    opportunityId: opportunity.id,
    source: 'Fireflies',
    sourceRecordId: 'meeting:2',
    eventDate: '2026-09-16',
    category: 'treatmentPlan',
    factType: 'tp-submission-planned',
    text: 'The provider planned to submit the treatment plan on September 17.',
    substantive: true,
    matchQuality: 'Direct',
    relationship: 'Supports',
    processRelevance: 10,
    actionOwner: 'CSM',
    actionType: 'Monitor',
    recommendedAction: 'CSM to monitor the planned submission.',
    milestoneDate: '2026-09-17',
  });
  const gate = {
    gateCategory: 'treatmentPlan',
    processPosition: 'Treatment plan',
    unresolvedGate: 'Treatment-plan submission pending',
    readyToCopy: 'Yes',
  };
  const report = renderRecommendation(
    buildFactPacket({
      opportunity,
      gate,
      evidenceEvents: [evidence],
      sourceResults: [],
      asOf: '2026-09-18T20:00:00Z',
    })
  );
  assert.equal(report.type, 'Provider Outreach');
  assert.match(report.text, /confirm whether the planned 9\/17 milestone occurred/);
});

test('explicit date meaning controls outreach independently of prose and legacy fact-type wording', () => {
  const opportunity = {
    id: 'synthetic',
    name: 'Synthetic Client',
    stage: 'Treatment Plan In-review',
    slaCreatedDate: '2026-09-01',
    csm: 'CSM',
  };
  const gate = {
    gateCategory: 'treatmentPlan',
    processPosition: 'Treatment plan',
    unresolvedGate: 'Confirm review status',
    readyToCopy: 'Review',
  };
  for (const [milestoneKind, milestoneDate, factType, expectedType] of [
    ['observed', '2026-09-17', 'tp-submission-planned', 'Monitor'],
    [null, '2026-09-17', 'tp-submission-planned', 'Monitor'],
    ['planned', '2026-09-17', 'ai-interpreted-conversation', 'Provider Outreach'],
    ['planned', '2026-09-21', 'ai-interpreted-conversation', 'Monitor'],
  ]) {
    const evidence = createEvidenceEvent({
      opportunityId: opportunity.id,
      source: 'Fireflies',
      sourceRecordId: 'meeting:typed',
      eventDate: '2026-09-17',
      category: 'treatmentPlan',
      factType,
      text: 'The provider gave a dated update on the plan review.',
      substantive: true,
      matchQuality: 'Direct',
      relationship: 'Supports',
      processRelevance: 10,
      actionOwner: 'CSM',
      actionType: 'Monitor',
      recommendedAction: 'CSM to monitor the review status.',
      milestoneDate,
      milestoneKind,
    });
    const report = renderRecommendation(
      buildFactPacket({
        opportunity,
        gate,
        evidenceEvents: [evidence],
        sourceResults: [],
        asOf: '2026-09-18T20:00:00Z',
      })
    );
    assert.equal(report.type, expectedType, `${String(milestoneKind)} ${String(milestoneDate)}`);
    if (expectedType === 'Monitor') assert.doesNotMatch(report.text, /confirm whether the planned/);
  }
});

test('multi-sentence source facts preserve partial approval and reconsideration within the narrative limit', () => {
  const packet = {
    stage: 'TA Approved - Pending Scheduling',
    processPosition: 'Treatment authorization approved; staffing is in progress',
    unresolvedGate: 'Treatment authorization reconsideration remains pending for the denied scope',
    newestUpdate: {
      id: 'Staffing:staff-1',
      date: '2026-09-04',
      source: 'Staffing',
      fact: 'An RBT candidate has a first interview scheduled, but no assignment or first 97153 date is confirmed.',
      factType: 'rbt-candidate',
    },
    structuredGateDetail: {
      id: 'Authorization:auth-1',
      date: '2026-09-03',
      source: 'Authorization',
      fact: 'The payer partially approved the treatment authorization. Reconsideration of the denied scope remains pending.',
      factType: 'auth-appeal',
    },
    story: {
      currentGateIssueKey: 'rbt-staffing',
      timeline: [
        {
          id: 'Authorization:auth-1',
          eventDate: '2026-09-03',
          issueKey: 'treatment-authorization',
          fact: 'The payer partially approved the treatment authorization. Reconsideration of the denied scope remains pending.',
          factType: 'auth-appeal',
          matchQuality: 'Direct',
          substantive: true,
        },
      ],
      resolvedIssues: [],
    },
    action: {
      type: 'RBT Follow-Up',
      owner: 'RBT Team',
      text: 'RBT Team to complete the first interview, record the staffing decision, and confirm the first 97153 date.',
      date: '2026-09-09',
    },
    futureMilestones: [
      {
        id: 'Staffing:future-1',
        milestoneDate: '2026-09-10',
        factType: 'rbt-candidate',
        fact: 'A first interview is scheduled for 2026-09-10.',
      },
    ],
    priorContext: [],
    evidenceTimeline: [],
    approvedFacts: [],
    conflicts: [],
    freshness: 'Current',
    csm: 'CSM',
  };

  const { operationalSummary } = renderRecommendation(packet);
  assert.ok(narrativeSentenceCount(operationalSummary) >= 4);
  assert.match(operationalSummary, /partially approved/i);
  assert.match(operationalSummary, /reconsideration of the denied scope remains pending/i);
  assert.match(operationalSummary, /first interview/i);
  assert.match(operationalSummary, /first 97153/i);
});

test('conflict narration does not repeat a structured fact when date formats differ', () => {
  const structuredFact =
    'The secondary initial authorization with Payer Beta was approved on 2026-09-03, but the primary initial authorization with Payer Alpha remains pending.';
  const packet = {
    opportunityName: 'Synthetic Client',
    stage: 'IA Requested',
    processPosition: 'Initial authorization',
    unresolvedGate: 'Initial authorization records conflict',
    newestUpdate: {
      id: 'Note:1',
      date: '2026-09-08',
      source: 'SLA / Intake / On-Hold Notes',
      fact: 'The payer requested additional information, but the available evidence does not identify the requested item.',
      factType: 'auth-additional-info',
    },
    structuredGateDetail: {
      id: 'Authorization:1',
      date: '2026-09-03',
      source: 'Authorization',
      fact: structuredFact,
    },
    story: {
      currentGateIssueKey: 'initial-authorization',
      timeline: [],
      resolvedIssues: [],
    },
    action: {
      type: 'Insurance Follow-Up',
      owner: 'Insurance Ops',
      text: 'Insurance Ops to confirm the controlling payer status and document the next action.',
      date: '2026-09-10',
      basis: 'Recommended',
    },
    futureMilestones: [],
    priorContext: [],
    evidenceTimeline: [],
    approvedFacts: [],
    conflicts: [
      `Current initial authorization records conflict; approval and unresolved states both exist. A later source reports ${structuredFact}`,
    ],
    freshness: 'Current',
    csm: 'Synthetic CSM',
  };

  const { operationalSummary } = renderRecommendation(packet);
  assert.equal((operationalSummary.match(/Payer Beta/g) ?? []).length, 1);
  assert.equal((operationalSummary.match(/Payer Alpha/g) ?? []).length, 1);
});

test('parallel evidence still produces opportunity-specific operational summaries', () => {
  const base = {
    stage: 'IC Scheduled – Pending Start',
    processPosition: 'Initial authorization',
    unresolvedGate: 'Initial authorization pending',
    newestUpdate: {
      id: 'Note:1',
      date: '2026-09-08',
      source: 'SLA / Intake / On-Hold Notes',
      fact: 'The authorization remains pending with the payer; no final determination is recorded.',
      factType: 'auth-pending',
    },
    structuredGateDetail: {
      id: 'Authorization:1',
      date: '2026-09-02',
      source: 'Authorization',
      fact: 'The current initial authorization remains pending; no final determination is recorded.',
    },
    story: {
      currentGateIssueKey: 'initial-authorization',
      timeline: [],
      resolvedIssues: [],
    },
    action: {
      type: 'Insurance Follow-Up',
      owner: 'Insurance Ops',
      text: 'Insurance Ops to confirm the pending payer determination and document the response.',
      date: '2026-09-10',
      basis: 'Recommended',
    },
    futureMilestones: [],
    priorContext: [],
    evidenceTimeline: [],
    approvedFacts: [],
    conflicts: [],
    freshness: 'Current',
    csm: 'Synthetic CSM',
  };

  const first = renderRecommendation({ ...base, opportunityName: 'Synthetic Alpha' });
  const second = renderRecommendation({ ...base, opportunityName: 'Synthetic Beta' });
  assert.notEqual(first.operationalSummary, second.operationalSummary);
  assert.match(first.operationalSummary, /Synthetic Alpha/);
  assert.match(second.operationalSummary, /Synthetic Beta/);
});
