import { describe, expect, it } from 'vitest';

import { slackSweepCoverage } from './slack-coverage.js';
import { isUsableStageEvidence, sourceOutcome } from './source-outcome.js';
import {
  applyStageSourceRequirements,
  blockingRequiredSources,
  enforceConversationInterpretationRequirement,
  requiredSourcesForContext,
} from './source-requirements.js';
import { resolveStageEntryDate } from './stage-entry.js';

const AS_OF = '2026-09-11T17:31:07.000Z';
const usable = { substantive: true, matchQuality: 'Direct', processGateRelevance: 'Current' };

describe('stage entry provenance', () => {
  it('prefers latest matching history, then actual stage transition, then SLA entry', () => {
    const opportunity = {
      StageName: 'IA Scheduled',
      LastStageChangeDate: '2026-09-03',
      SLA_Entry_Date__c: '2026-09-10',
    };
    const transition = { Field: 'StageName', NewValue: 'IA Scheduled', CreatedDate: '2026-09-01' };
    expect(
      resolveStageEntryDate({
        opportunity,
        stageHistory: [
          transition,
          { ...transition, CreatedDate: '2026-09-02' },
          { ...transition, NewValue: 'Other', CreatedDate: '2026-09-11' },
        ],
      })
    ).toBe('2026-09-02');
    expect(resolveStageEntryDate({ opportunity })).toBe('2026-09-03');
    expect(
      resolveStageEntryDate({ opportunity: { ...opportunity, LastStageChangeDate: 'bad' } })
    ).toBe('2026-09-10');
    expect(
      resolveStageEntryDate({
        opportunity: { stage: 'IA Scheduled' },
        stageHistory: [{ field: 'StageName', newValue: ' IA Scheduled ', eventDate: '2026-09-01' }],
      })
    ).toBe('2026-09-01');
    expect(
      resolveStageEntryDate({
        opportunity,
        stageHistory: [{}, { ...transition, CreatedDate: 'bad' }],
      })
    ).toBe('2026-09-03');
  });
  it('preserves the reviewed legacy scheduling fallback and missing result', () => {
    expect(resolveStageEntryDate()).toBeNull();
    const opportunity = {
      stage: 'TA Approved - Pending Scheduling',
      TA_Approval_Checked_Timestamp__c: '2026-09-03',
      Treatment_Auth_Approval_Date__c: '2026-09-01',
      Active_RBT_Checked_At__c: '2026-09-02',
    };
    expect(resolveStageEntryDate({ opportunity })).toBe('2026-09-01');
    expect(resolveStageEntryDate({ opportunity: { stage: opportunity.stage } })).toBeNull();
  });
});

describe('source outcome preserves evidence and failure precedence', () => {
  it('distinguishes current meaningful evidence from weak/irrelevant candidates', () => {
    expect(isUsableStageEvidence()).toBe(false);
    expect(isUsableStageEvidence({ substantive: true })).toBe(false);
    expect(isUsableStageEvidence(usable)).toBe(true);
    expect(isUsableStageEvidence({ ...usable, matchQuality: 'Likely' })).toBe(true);
    expect(isUsableStageEvidence({ ...usable, matchQuality: 'Weak' })).toBe(false);
    expect(isUsableStageEvidence({ ...usable, processGateRelevance: 'Not Relevant' })).toBe(false);
    const base = { source: 'Fireflies', asOf: AS_OF, row: { searchedAt: AS_OF } };
    expect(sourceOutcome({ ...base, items: [usable] })).toMatchObject({
      status: 'Found',
      found: 1,
      recordsRetrieved: 1,
      required: true,
    });
    expect(sourceOutcome(base)).toMatchObject({
      status: 'Searched - Not Found',
      found: 0,
      detail: 'Current-run search completed without stage-relevant evidence.',
    });
    expect(
      sourceOutcome({ ...base, items: [{ ...usable, matchQuality: 'Weak' }] }).detail
    ).toContain('Retrieved 1 candidate record,');
    expect(sourceOutcome({ ...base, recordsRetrieved: 2 }).detail).toContain(
      'Retrieved 2 candidate records,'
    );
  });
  it('does not let useful evidence erase unsupported, coverage, stale, timeout or access failures', () => {
    const base = { source: 'Fireflies', asOf: AS_OF, items: [usable], row: { searchedAt: AS_OF } };
    expect(sourceOutcome({ ...base, row: { unsupported: true } })).toMatchObject({
      status: 'Unsupported',
      found: 0,
      recordsRetrieved: 0,
      detail: 'The authorized connector does not expose this source.',
    });
    expect(sourceOutcome({ ...base, row: { unsupported: true, error: 'safe error' } }).detail).toBe(
      'safe error'
    );
    expect(sourceOutcome({ ...base, coverageStatus: 'Partial' })).toMatchObject({
      status: 'Blocked',
      coverageStatus: 'Partial',
      detail: 'Fireflies identity or retrieval coverage is partial.',
    });
    expect(
      sourceOutcome({ ...base, coverageStatus: 'Partial', coverageDetail: 'explicit detail' })
        .detail
    ).toBe('explicit detail');
    expect(sourceOutcome({ ...base, row: { searchedAt: '2026-09-01' } }).detail).toContain(
      'Historical evidence retained'
    );
    expect(sourceOutcome({ source: 'Slack', asOf: AS_OF }).detail).toBe(
      'Required source was not checked in the current run.'
    );
    expect(sourceOutcome({ source: 'Slack', asOf: AS_OF, required: false }).detail).toContain(
      'Non-blocking enrichment'
    );
    expect(sourceOutcome({ ...base, row: { searchedAt: AS_OF, timedOut: true } })).toMatchObject({
      status: 'Timed Out',
      found: 1,
      detail: 'Source timed out.',
    });
    expect(
      sourceOutcome({ ...base, row: { searchedAt: AS_OF, timedOut: true, error: 'safe timeout' } })
        .detail
    ).toBe('safe timeout');
    expect(sourceOutcome({ ...base, row: { searchedAt: AS_OF, blocked: true } }).detail).toBe(
      'Source access blocked.'
    );
    expect(
      sourceOutcome({ ...base, row: { searchedAt: AS_OF, error: 'safe blocked' } }).detail
    ).toBe('safe blocked');
    for (const row of [
      { collectedAt: AS_OF },
      { checkedAt: AS_OF },
      { searchedAt: '2026-09-11T05:31:07.000Z' },
      { searchedAt: '2026-09-12T05:31:07.000Z' },
    ])
      expect(sourceOutcome({ ...base, row }).status).toBe('Found');
    expect(sourceOutcome({ ...base, row: { searchedAt: '2026-09-12T05:31:07.001Z' } }).status).toBe(
      'Blocked'
    );
  });
});

describe('existing source requirements', () => {
  it('keeps Slack mandatory and uses stage/context source policy without new requirements', () => {
    expect(requiredSourcesForContext()).toEqual([
      'Salesforce Opportunity / SLA',
      'Salesforce Stage History',
      'SLA / Intake / On-Hold Notes',
      'Tasks / Task Chatter',
      'Slack',
    ]);
    expect(requiredSourcesForContext({ stage: ' Insurance Verification ' })).toContain('VOB');
    expect(requiredSourcesForContext({ stage: 'TA Requested' })).toContain('Authorization Review');
    const treatment = requiredSourcesForContext({
      stage: '97151 Started - Pending Treatment Plan',
      unresolvedGate: 'Family forms',
    });
    for (const source of [
      'Clinical Quality',
      'Portal Auth Requests',
      'Fireflies',
      'Portal',
      'Calls / Texts',
      'Linked Billing / Claims',
    ])
      expect(treatment).toContain(source);
    const staffing = requiredSourcesForContext({ stage: 'TA Approved - Pending Scheduling' });
    for (const source of [
      'RBT Request',
      'Ticket Match',
      'Talent Acquisition',
      'RBT First Interview',
      'Staffing',
      'Slack',
    ])
      expect(staffing).toContain(source);
    expect(
      requiredSourcesForContext({ blocker: 'Candidate unavailable', summary: 'Family unreachable' })
    ).toContain('Calls / Texts');
    expect(applyStageSourceRequirements()).toEqual([]);
    const results = applyStageSourceRequirements(
      [
        { source: 'Slack', status: 'Blocked', required: false },
        { source: 'Portal', status: 'Blocked' },
      ],
      { stage: 'Insurance Verification' }
    );
    expect(results).toMatchObject([
      { required: true, requirementBasis: 'Required for the current process gate' },
      {
        required: false,
        requirementBasis: 'Searched for enrichment; failure does not block this gate',
      },
    ]);
    expect(blockingRequiredSources(results).map((row) => row.source)).toEqual(['Slack']);
    expect(blockingRequiredSources()).toEqual([]);
  });
  it('requires interpretation only for applicable candidate segments, preserving nonblocking empty results', () => {
    const results = [
      { source: 'Fireflies', status: 'Searched - Not Found' },
      { source: 'Slack', status: 'Found' },
    ];
    const base = { results, context: { stage: 'IA Scheduled' }, firefliesCandidateSegments: 1 };
    expect(enforceConversationInterpretationRequirement({ results })).toBe(results);
    expect(enforceConversationInterpretationRequirement({ context: base.context })).toEqual([]);
    expect(
      enforceConversationInterpretationRequirement({
        ...base,
        firefliesCandidateSegments: 0,
        aiInterpretationAvailable: false,
      })
    ).toEqual(results);
    expect(enforceConversationInterpretationRequirement(base)).toEqual(results);
    expect(
      enforceConversationInterpretationRequirement({ ...base, aiInterpretationAvailable: false })
    ).toMatchObject([
      {
        status: 'Blocked',
        required: true,
        detail:
          'Candidate Fireflies transcript segments were found, but model interpretation was unavailable.',
      },
      { status: 'Found' },
    ]);
    expect(
      enforceConversationInterpretationRequirement({ ...base, aiInterpretationFailures: 2 })[0]
    ).toMatchObject({
      status: 'Blocked',
      detail: 'AI transcript interpretation failed for 2 candidate segment(s).',
    });
  });
  it('requires both cohort and individual Slack coverage, including denial context', () => {
    const execution = {
      cohortComplete: true,
      expectedOpportunities: 2,
      opportunities: 2,
      threadExpansionComplete: true,
    };
    const row = { paginationComplete: true, threadExpansionComplete: true };
    expect(slackSweepCoverage({ execution, row, expectedOpportunities: 2 })).toEqual({
      status: 'Complete',
      complete: true,
      detail: '',
    });
    expect(slackSweepCoverage().detail).toContain('execution artifact is missing');
    for (const changed of [
      { cohortComplete: false },
      { expectedOpportunities: 3 },
      { opportunities: 1 },
      { blocked: 1 },
      { unassignedExactRows: 1 },
      { unassignedPageTwoRecords: 1 },
      { threadExpansionComplete: false },
    ])
      expect(
        slackSweepCoverage({
          execution: { ...execution, ...changed },
          row,
          expectedOpportunities: 2,
        }).complete
      ).toBe(false);
    for (const changed of [
      { blocked: true },
      { blocked: true, error: 'safe error' },
      { paginationComplete: false },
      { threadExpansionComplete: false },
    ])
      expect(
        slackSweepCoverage({ execution, row: { ...row, ...changed }, expectedOpportunities: 2 })
          .complete
      ).toBe(false);
    expect(
      slackSweepCoverage({
        execution,
        row,
        expectedOpportunities: 2,
        denialContext: { required: true, complete: false, detail: 'Missing thread' },
      }).detail
    ).toBe('Denial-context coverage is incomplete. Missing thread');
    expect(
      slackSweepCoverage({
        execution,
        row,
        expectedOpportunities: 2,
        denialContext: { required: false, complete: false },
      }).complete
    ).toBe(true);
  });
});
