import { describe, expect, it } from 'vitest';

import { createEvidenceEvent } from './evidence.js';
import { buildFactPacket } from './fact-packet.js';
import { renderRecommendation } from './recommendation.js';
import { auditRecommendationSpecificity } from './specificity-audit.js';
import { SPECIFICITY_SEARCH_PATHWAYS } from './specificity-pathways.js';
import type { SpecificityInput } from './specificity-types.js';

function audit(
  summary: string,
  overrides: Partial<SpecificityInput> = {}
): ReturnType<typeof auditRecommendationSpecificity> {
  return auditRecommendationSpecificity({
    packet: { processPosition: 'Initial authorization', newestUpdate: { fact: summary } },
    recommendation: {
      suggestedSlaSummary: summary,
      operationalSummary: 'Confirm the current state.',
    },
    ...overrides,
  });
}

describe('approved specificity audit and agent search pathways', () => {
  it('requests focused investigation without upgrading routine review to an error', () => {
    const result = audit('No substantive payer update was found.', {
      packet: { processPosition: 'Initial authorization' },
    });
    expect(result.issues).toEqual([
      {
        code: 'NO_CURRENT_SUBSTANTIVE_UPDATE',
        description:
          'No current substantive update was selected; run the stage-specific deep-search pathway before accepting outreach as the answer.',
        severity: 'Review',
        searchPathway: SPECIFICITY_SEARCH_PATHWAYS.insurance,
      },
    ]);
    expect(result.requiresReview).toBe(true);
    expect(result.pathways).toEqual(SPECIFICITY_SEARCH_PATHWAYS.insurance);
  });

  it.each([
    ['A required document remains outstanding.', 'UNNAMED_REQUIRED_ITEM'],
    ['IA was denied because explanation: provider action required.', 'RAW_PAYER_BOILERPLATE'],
    ['IA was denied because other.', 'DENIAL_REASON_UNRESOLVED'],
  ])('preserves specific evidence-quality findings: %s', (summary, code) => {
    expect(audit(summary).issues.map((issue) => issue.code)).toContain(code);
  });

  it('distinguishes generic staffing status from available candidate evidence', () => {
    const packet = {
      processPosition: 'RBT staffing',
      newestUpdate: { fact: 'A candidate is active.' },
      structuredGateDetail: { factType: 'rbt-candidate' },
      approvedFacts: [{ candidateName: 'Synthetic Avery', candidateStep: 'Interview' }],
    };
    const result = audit('The linked candidate is in screening, interview, or offer.', { packet });
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'GENERIC_RBT_STEP',
      'CANDIDATE_IDENTITY_MISSING',
      'RBT_SPECIFIC_FACT_NOT_USED',
    ]);
    expect(audit('Synthetic Avery is at interview.', { packet }).passed).toBe(true);
    expect(audit('An RBT is assigned.', { packet }).passed).toBe(true);
  });

  it('does not turn an old plan-completion fact into a current Clinical Quality gap', () => {
    const packet = {
      processPosition: 'Treatment plan',
      newestUpdate: { fact: 'The treatment plan is complete.' },
      story: { currentGateIssueKey: 'family-availability' },
      approvedFacts: [],
    };
    expect(audit('Family availability remains unresolved.', { packet }).passed).toBe(true);
    expect(
      audit('Family availability remains unresolved.', {
        packet: { ...packet, story: { currentGateIssueKey: 'clinical-review' } },
      }).issues[0]?.code
    ).toBe('CLINICAL_QUALITY_STATE_MISSING');
    expect(
      audit('The treatment plan is complete.', {
        packet: { ...packet, approvedFacts: [{ source: 'Clinical Quality' }] },
      }).passed
    ).toBe(true);
  });

  it('retains Error only when available structured detail is actually lost in the summary', () => {
    const result = audit('No substantive assessment update was found.', {
      packet: {
        processPosition: 'Initial assessment',
        structuredGateDetail: { fact: 'An assessment is scheduled.' },
      },
    });
    expect(result.issues.map((issue) => [issue.code, issue.severity])).toEqual([
      ['NO_CURRENT_SUBSTANTIVE_UPDATE', 'Review'],
      ['STRUCTURED_DETAIL_LOST_IN_SUMMARY', 'Error'],
    ]);
    expect(result.pathways).toEqual(SPECIFICITY_SEARCH_PATHWAYS.intakeScheduling);
  });

  it('composes the real evidence packet and renderer without mutating their judgments', () => {
    const evidence = createEvidenceEvent({
      opportunityId: 'synthetic',
      source: 'Task',
      sourceRecordId: 'task',
      eventDate: '2026-09-23',
      category: 'intakeScheduling',
      text: 'The assessment is scheduled for September 30.',
      factType: 'ia-planned',
      substantive: true,
      matchQuality: 'Direct',
      relationship: 'Supports',
      processRelevance: 10,
      milestoneDate: '2026-09-30',
    });
    const packet = buildFactPacket({
      opportunity: { id: 'synthetic', stage: 'IA Approved', slaCreatedDate: '2026-09-20' },
      gate: {
        processPosition: 'Initial assessment',
        unresolvedGate: 'Confirm assessment completion',
      },
      evidenceEvents: [evidence],
      sourceResults: [],
      asOf: '2026-09-24',
    });
    const recommendation = renderRecommendation(packet);
    const before = structuredClone({ packet, recommendation });
    expect(auditRecommendationSpecificity({ packet, recommendation }).passed).toBe(true);
    expect({ packet, recommendation }).toEqual(before);
  });
});
