import { describe, expect, it } from 'vitest';

import { buildFactPacket } from './fact-packet.js';
import { analyzeOpportunityFreshness } from './freshness-analysis.js';
import { renderRecommendation } from './recommendation.js';
import {
  reportEvidenceReviewStatus,
  reportMaterialGap,
  reportNextMilestone,
  type ReportMaterialGapInput,
} from './report-row-review.js';

function input(overrides: Partial<ReportMaterialGapInput> = {}): ReportMaterialGapInput {
  return {
    expanded: { blocker: 'Review', summary: 'Dated update.', sourceQuality: 'Direct' },
    freshness: { updateFreshness: 'Current' },
    firefliesResult: '',
    ...overrides,
  };
}
const gapCases: readonly {
  readonly name: string;
  readonly changes: Partial<ReportMaterialGapInput>;
  readonly expected: string;
}[] = [
  {
    name: 'authorization conflict first',
    changes: {
      authorizationGate: { conflict: true, conflictReason: 'Specific conflict' },
      freshness: { updateFreshness: 'Missing' },
    },
    expected: 'Specific conflict',
  },
  {
    name: 'blank authorization conflict',
    changes: { authorizationGate: { conflict: true, conflictReason: '' } },
    expected: 'Authorization records contain conflicting status or date fields.',
  },
  {
    name: 'assessment evidence conflict',
    changes: {
      packet: {
        iaCompletionDocumentationConflict: {
          reportedDate: null,
          requiredItem: null,
          requiredItemDate: null,
        },
      },
    },
    expected:
      'Provider-reported IA completion conflicts with missing Salesforce completion evidence and outstanding assessment records.',
  },
  {
    name: 'first-service conflict',
    changes: { packet: { startEvidenceConflict: { reportedDate: null, plannedDate: null } } },
    expected:
      'Provider-reported treatment start conflicts with Salesforce staffing and first-service records.',
  },
  {
    name: 'payer disagreement',
    changes: { expanded: { summary: '', evidenceConflict: 'Authorization mismatch' } },
    expected: 'Authorization sources disagree on the controlling payer status or determination.',
  },
  {
    name: 'generic disagreement',
    changes: { expanded: { summary: '', evidenceConflict: true } },
    expected:
      'Relevant sources disagree on the current gate; the controlling operational status must be verified.',
  },
  {
    name: 'missing',
    changes: { freshness: { updateFreshness: 'Missing' } },
    expected: 'No dated, stage-relevant evidence was found.',
  },
  {
    name: 'stale date',
    changes: { freshness: { updateFreshness: 'Stale', latestUpdateAt: '2026-09-01T12:00:00Z' } },
    expected: 'Current status has not been substantively confirmed since 2026-09-01.',
  },
  {
    name: 'stale without date',
    changes: { freshness: { updateFreshness: 'Stale' } },
    expected: 'Current status has not been substantively confirmed since the last recorded update.',
  },
  {
    name: 'semi-stale without valid milestone',
    changes: { freshness: { updateFreshness: 'Semi-Stale', daysSinceUpdate: 4 } },
    expected:
      'The latest substantive update is 4 days old and has no still-valid explicit milestone.',
  },
  {
    name: 'nonsubstantive',
    changes: { expanded: { summary: 'No substantive update' } },
    expected: 'A recent activity exists, but it does not confirm the current operational status.',
  },
  {
    name: 'verification advance',
    changes: { expanded: { summary: '', blocker: 'Verification complete' } },
    expected:
      'The remaining prerequisite preventing advancement from Insurance Verification is not documented.',
  },
  {
    name: 'missing assessment date',
    changes: { expanded: { summary: '', blocker: 'Initial assessment' } },
    expected: 'A provider-confirmed initial assessment date is missing.',
  },
  {
    name: 'availability not first service',
    changes: { expanded: { summary: '', blocker: 'Hired RBT' } },
    expected:
      'A provider-confirmed first 97153 appointment is missing; an RBT availability date is not confirmation.',
  },
  {
    name: 'unnamed authorization',
    changes: { packet: { gaps: ['Note does not identify the authorization'] } },
    expected:
      'The SLA note reports pending insurance approval without identifying the authorization; Insurance Ops must reconcile it with linked records.',
  },
  {
    name: 'unnamed item',
    changes: { packet: { gaps: ['Request does not name the exact item'] } },
    expected: 'The payer request is documented, but the exact required item is not identified.',
  },
  {
    name: 'missing requirement',
    changes: {
      expanded: {
        summary: 'Requirement remains unresolved',
        blocker: 'Required document or coverage correction',
      },
    },
    expected: 'The specific missing requirement is not identified.',
  },
  {
    name: 'likely transcript identity',
    changes: {
      freshness: { updateFreshness: 'Current', latestUpdateSource: 'Fireflies' },
      firefliesResult: 'Likely: match',
    },
    expected: 'The Fireflies client match is likely and should be identity-confirmed.',
  },
];
describe('approved row explanation and evidence review status', () => {
  it.each(gapCases)('preserves $name', ({ changes, expected }) => {
    const value = input(changes);
    const before = structuredClone(value);
    expect(reportMaterialGap(value)).toBe(expected);
    expect(value).toEqual(before);
  });
  it('does not turn future milestones or known dates into an additional gap', () => {
    expect(
      reportMaterialGap(
        input({
          freshness: { updateFreshness: 'Semi-Stale', daysSinceUpdate: 4 },
          hasValidMilestone: true,
        })
      )
    ).toBe('');
    expect(
      reportMaterialGap(
        input({ expanded: { summary: 'Scheduled for 9/8.', blocker: 'Initial assessment' } })
      )
    ).toBe('');
    expect(
      reportMaterialGap(
        input({
          opp: { X97153_Scheduled_For__c: '2026-09-08' },
          expanded: { summary: '', blocker: 'Hired RBT' },
        })
      )
    ).toBe('');
  });
  it('preserves status priority and does not automatically block Review evidence', () => {
    const base = {
      expanded: { summary: '', sourceQuality: 'Direct' },
      freshness: { updateFreshness: 'Current' },
      gap: '',
    };
    expect(reportEvidenceReviewStatus(base)).toBe('Complete');
    expect(reportEvidenceReviewStatus({ ...base, gap: 'Review' })).toBe('Partial');
    expect(
      reportEvidenceReviewStatus({ ...base, expanded: { summary: '', sourceQuality: 'Likely' } })
    ).toBe('Partial');
    expect(reportEvidenceReviewStatus({ ...base, freshness: { updateFreshness: 'Stale' } })).toBe(
      'Partial'
    );
    expect(
      reportEvidenceReviewStatus({
        ...base,
        freshness: { updateFreshness: 'Missing' },
        gap: 'Review',
      })
    ).toBe('Missing');
    expect(
      reportEvidenceReviewStatus({
        ...base,
        expanded: { summary: '', evidenceConflict: 'Conflict' },
        freshness: { updateFreshness: 'Missing' },
      })
    ).toBe('Conflicting');
    expect(
      reportEvidenceReviewStatus({
        ...base,
        sourceBlocked: true,
        expanded: { summary: '', evidenceConflict: 'Conflict' },
      })
    ).toBe('Blocked');
  });
  it('accepts actual freshness, packet and recommendation producers without adapting their meanings', () => {
    const freshness = analyzeOpportunityFreshness({
      opp: { Id: 'synthetic-opp', Name: 'Synthetic Avery', StageName: 'IA Scheduled' },
      asOf: '2026-09-04',
    });
    const packet = buildFactPacket({
      opportunity: { id: 'synthetic-opp', name: 'Synthetic Avery', stage: 'IA Scheduled' },
      gate: {
        processPosition: 'Initial assessment',
        unresolvedGate: 'Initial assessment completion',
      },
      evidenceEvents: [],
      sourceResults: [],
      asOf: '2026-09-04',
    });
    const recommendation = renderRecommendation(packet);
    const value = input({
      freshness,
      packet,
      expanded: {
        blocker: packet.unresolvedGate,
        summary: recommendation.suggestedSlaSummary,
        evidenceConflict: packet.conflicts.join('; '),
      },
    });
    const gap = reportMaterialGap(value);
    expect(gap).toBe('No dated, stage-relevant evidence was found.');
    expect(reportEvidenceReviewStatus({ ...value, gap })).toBe('Missing');
  });
});

describe('next milestone display priority', () => {
  it.each([
    [
      'family declined services',
      'Close or discharge the Opportunity with the family decision documented.',
    ],
    ['verification complete', 'Advance to IA Requested with the IA authorization path initiated.'],
    ['insurance verification pending', 'Complete VOB and confirm eligibility.'],
    [
      'partially approved denial',
      'Document provider acceptance of the reduced authorization or submit the appeal.',
    ],
    ['denial', 'Document the denial correction or appeal and submit the next payer action.'],
    ['authorization pending', 'Receive and record the payer determination.'],
    ['clinical review', 'Clinical Quality records approval or returns specific edits.'],
    ['parent signature', 'Parent signature is completed and recorded.'],
    ['provider signature', 'Provider signature is completed and recorded.'],
    ['signature', 'All required treatment-plan signatures are completed.'],
    ['treatment plan ready for submission', 'Submit the treatment plan for authorization.'],
    ['treatment plan', 'Complete and submit the treatment plan with a committed submission date.'],
    [
      'paired-client dependency',
      'Document the hold decision and restart condition, or schedule the initial assessment.',
    ],
    [
      'interpreter',
      'Secure interpreter or translation support and confirm the initial assessment date.',
    ],
    ['provider scheduling', 'Confirm and record the initial assessment date.'],
    ['candidate', 'Confirm staffing and the expected first 97153 appointment.'],
    ['document', 'Complete and record the missing document or coverage correction.'],
    ['family availability', 'Confirm whether and when the family can proceed.'],
    ['unknown', 'Document the next completed intake milestone.'],
  ])('%s', (blocker, expected) => {
    expect(reportNextMilestone(blocker)).toBe(expected);
  });
  it('uses the active candidate and keeps earlier assessment rules ahead of staffing', () => {
    const matches = [
      { Ticket_Match_Status__c: 'Hired' },
      { Ticket_Match_Status__c: 'Rejected', Candidate__r: { Applicant_Status__c: 'Hired' } },
    ];
    expect(reportNextMilestone('RBT', matches)).toBe(
      'Provider schedules the first 97153 appointment; Salesforce scheduling or linked billing confirms the service date.'
    );
    expect(reportNextMilestone('Initial assessment and RBT', matches)).toBe(
      'Confirm and record the initial assessment date.'
    );
  });
});
