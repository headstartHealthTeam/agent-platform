import { describe, expect, it } from 'vitest';

import { createConversationSearchResult } from './conversation-search-result.js';
import {
  reportConversationMatchAudit,
  reportCurrentActionItem,
  reportCurrentSlaSummary,
  reportFinalReadiness,
  reportInterpretationGap,
  reportInterpretationStatus,
  reportRelevantProvider,
} from './report-row-labels.js';

describe('report comparison and interpretation labels', () => {
  it.each([
    ['IA Scheduled', 'IA'],
    ['Insurance Verification', 'IA'],
    ['IC Scheduled – Pending Start', 'IA'],
    ['97151 Started - Pending Treatment Plan', 'TA'],
    ['Treatment Plan In-review', 'TA'],
    ['TA Requested', 'TA'],
    ['First Day of 97153 Scheduled', 'TA'],
    ['Other', 'General'],
  ])('uses the existing provider role preference for %s', (StageName, expected) => {
    expect(
      reportRelevantProvider({
        StageName,
        IA_Rendering_Provider__r: { Name: ' IA ' },
        TA_Rendering_Provider__r: { Name: 'TA' },
        Rendering_Provider__r: { Name: 'General' },
      })
    ).toBe(expected);
  });
  it('retains provider fallback and comparison-only action precedence', () => {
    expect(
      reportRelevantProvider({
        StageName: 'IA Scheduled',
        Rendering_Provider__r: { Name: 'General' },
        TA_Rendering_Provider__r: { Name: 'TA' },
      })
    ).toBe('General');
    expect(reportRelevantProvider({})).toBe('');
    expect(
      reportCurrentSlaSummary({
        Reason_for_Delay__c: 'Awaiting Ins Approval',
        Reason_for_Delay_Notes__c: '(LF) current details',
      })
    ).toBe('Awaiting insurance approval: current details');
    expect(reportCurrentSlaSummary({ Reason_for_Delay_Notes__c: 'Only notes' })).toBe('Only notes');
    expect(
      reportCurrentActionItem({
        Action_Item_Update__c: 'In progress',
        Provider_Action_Items__c: 'Provider to call',
        Action_Item__c: 'Fallback',
      })
    ).toBe('Provider to call');
    expect(
      reportCurrentActionItem({
        Action_Item_Update__c: 'Complete',
        Provider_Action_Items__c: 'Open',
        Action_Item__c: 'Closed',
      })
    ).toBe('');
  });
  it.each([
    [0, 'unavailable', 0, 0, 0, 'No candidate transcript', ''],
    [1, 'disabled', 0, 0, 0, 'Disabled', ''],
    [
      1,
      'unavailable',
      0,
      0,
      0,
      'Blocked - no API or precomputed interpretation',
      'AI transcript interpretation was unavailable; candidate transcript segments were not admitted as evidence.',
    ],
    [
      1,
      'api',
      1,
      1,
      0,
      'Partial - 1 unrecovered segment',
      'AI transcript interpretation failed for 1 segment; those segments produced no recoverable deterministic finding.',
    ],
    [
      2,
      'api',
      2,
      2,
      1,
      'Partial - 2 unrecovered segments',
      'AI transcript interpretation failed for 2 segments; those segments produced no recoverable deterministic finding.',
    ],
    [
      1,
      'precomputed',
      0,
      1,
      1,
      'Complete with deterministic recovery - 1 segment',
      'AI transcript interpretation was unavailable for 1 segment; constrained deterministic transcript findings were admitted for review.',
    ],
    [
      2,
      'precomputed',
      0,
      2,
      2,
      'Complete with deterministic recovery - 2 segments',
      'AI transcript interpretation was unavailable for 2 segments; constrained deterministic transcript findings were admitted for review.',
    ],
    [1, 'api', 0, 0, 1, 'Complete (api) - 1 finding', ''],
    [1, 'precomputed', 0, 0, 2, 'Complete (precomputed) - 2 findings', ''],
    [1, 'api', 0, 0, 0, 'Complete (api) - no substantive finding', ''],
  ])(
    'preserves interpretation state %s/%s/%s/%s/%s',
    (candidateCount, mode, unrecoveredCount, failureCount, eventCount, status, gap) => {
      const input = { candidateCount, mode, unrecoveredCount, failureCount, eventCount };
      expect(reportInterpretationStatus(input)).toBe(status);
      expect(reportInterpretationGap(input)).toBe(gap);
    }
  );
  it('uses actual conversation-search output without promoting weak matches', () => {
    const fireflies = createConversationSearchResult({
      source: 'Fireflies',
      opportunityId: 'synthetic-opp',
      recordsScanned: 2,
      segmentsScanned: 3,
      matches: [
        {
          quality: 'Weak',
          matchedAs: 'Approximate',
          opportunityName: '',
          score: 6,
          reason: 'Needs verification',
        },
        {
          quality: 'Weak',
          matchedAs: '',
          opportunityName: 'Synthetic Avery',
          score: 5,
          reason: '',
        },
      ],
    });
    const calls = createConversationSearchResult({
      source: 'Calls / Texts',
      opportunityId: 'synthetic-opp',
      recordsScanned: 1,
      matches: [{ quality: 'Direct' }],
    });
    expect(
      reportConversationMatchAudit({ opportunityName: 'Synthetic Avery', fireflies, calls })
    ).toBe(
      'Fireflies: Searched - Not Found; scanned 2 meeting(s) and 3 segment(s); Direct 0, Likely 0, Weak 2. Top weak matches: heard as Approximate; Synthetic Avery; score 6; Needs verification | unconfirmed name; Synthetic Avery; score 5 Calls / Texts: Found; scanned 1 record(s); Direct 1, Likely 0, Weak 0.'
    );
    expect(reportConversationMatchAudit({ opportunityName: 'Synthetic Avery', calls })).toBe(
      'Fireflies: no conversation-search audit record. Calls / Texts: Found; scanned 1 record(s); Direct 1, Likely 0, Weak 0.'
    );
    expect(fireflies.status).toBe('Searched - Not Found');
  });
  it('keeps blocked rows blocked and limits quality/identity failures to Review otherwise', () => {
    expect(
      reportFinalReadiness({
        qualityValid: true,
        identityMatchReview: '',
        evidenceStatus: 'Complete',
        preliminaryReadyToCopy: 'Yes',
      })
    ).toEqual({ evidenceStatus: 'Complete', readyToCopy: 'Yes' });
    expect(
      reportFinalReadiness({
        qualityValid: false,
        identityMatchReview: '',
        evidenceStatus: 'Blocked',
        preliminaryReadyToCopy: 'Blocked',
      })
    ).toEqual({ evidenceStatus: 'Blocked', readyToCopy: 'Blocked' });
    expect(
      reportFinalReadiness({
        qualityValid: true,
        identityMatchReview: 'Verify identity',
        evidenceStatus: 'Complete',
        preliminaryReadyToCopy: 'Yes',
      })
    ).toEqual({ evidenceStatus: 'Partial', readyToCopy: 'Review' });
  });
});
