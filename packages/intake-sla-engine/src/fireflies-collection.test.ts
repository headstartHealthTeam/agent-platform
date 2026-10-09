import { describe, expect, it } from 'vitest';

import {
  buildFirefliesCollectionPlan,
  buildFirefliesTranscriptRetrievalPlan,
  buildRunLevelFirefliesCollectionPlan,
} from './fireflies-collection.js';
import type { FirefliesProfile } from './fireflies-collection.js';
import { assessFirefliesSearchExecution } from './fireflies-search-execution.js';

const profile: FirefliesProfile = {
  opportunityId: 'synthetic-a',
  opportunityName: 'Synthetic Client',
  renderingProvider: { name: 'Synthetic Provider', email: 'provider@example.test' },
  practice: 'Synthetic Practice',
  currentCsm: { name: 'Synthetic CSM', email: 'csm@example.test' },
  stageEntryDate: '2026-01-02',
  asOf: '2026-01-10',
};
describe('Intake Fireflies collection planning', () => {
  it('preserves phased primary/fallback requests and per-opportunity transcript matching', () => {
    const plan = buildFirefliesCollectionPlan(profile);
    expect(plan.meetingRequests).toHaveLength(5);
    expect(plan.meetingRequests.map((request) => request.executionTier)).toEqual([
      'Primary',
      'Identity Fallback',
      'Identity Fallback',
      'CSM Fallback',
      'CSM Fallback',
    ]);
    expect(plan.meetingRequests[0]).toMatchObject({
      participantEmail: 'provider@example.test',
      fromDate: '2026-01-02',
      toDate: '2026-01-10',
      limit: 50,
      paginate: true,
    });
    expect(plan.transcriptMatch).toMatchObject({
      requireFullTranscript: true,
      weakMatchesAuditOnly: true,
    });
    expect(buildFirefliesTranscriptRetrievalPlan(['one', 'two', 'one', ''])).toEqual(
      ['one', 'two'].map((meetingId) => ({
        meetingId,
        primaryTool: 'fireflies_fetch',
        fallbackTool: 'fireflies_get_transcript',
        maxAttemptsPerTool: 2,
        retryableStatuses: [429, 500, 502, 503, 504],
        requireFullTranscript: true,
      }))
    );
    expect(buildFirefliesTranscriptRetrievalPlan()).toEqual([]);
    expect(
      buildFirefliesCollectionPlan({ opportunityId: 'empty', opportunityName: 'Empty' })
        .meetingRequests
    ).toEqual([]);
  });
  it('deduplicates requests across shared identities using the full run window, without losing cohort membership', () => {
    const second = {
      ...profile,
      opportunityId: 'synthetic-b',
      opportunityName: 'Synthetic Second',
      searchWindow: { fromDate: '2026-01-01', toDate: '2026-01-12' },
    };
    const plan = buildRunLevelFirefliesCollectionPlan([profile, second, profile]);
    expect(plan).toMatchObject({
      version: '2026-08-11.1',
      fromDate: '2026-01-01',
      toDate: '2026-01-12',
      opportunityCount: 3,
      opportunityRequestCount: 15,
      inventoryRequestCount: 5,
      primaryRequestCount: 1,
      fallbackRequestCount: 4,
    });
    expect(
      plan.meetingRequests.every(
        (request) => request.opportunityIds.join(',') === 'synthetic-a,synthetic-b'
      )
    ).toBe(true);
    expect(plan.meetingRequests[0]?.requestKey).toBe(
      'Participant email|provider@example.test||||2026-01-01|2026-01-12'
    );
    expect(plan.conversationMatching).toEqual({
      scoringVersion: 'provider-roster-100-point-v1',
      likelyThreshold: 75,
      weakThreshold: 50,
      minimumWinnerMargin: 6,
      retainTopWeakMatches: 3,
    });
    expect(plan.transcriptRetrieval.retainCurrentRunInventory).toBe(true);
    expect(buildRunLevelFirefliesCollectionPlan()).toMatchObject({
      fromDate: null,
      toDate: null,
      inventoryRequestCount: 0,
    });
    const duplicateRoles = {
      ...profile,
      iaRenderingProvider: { name: 'Other', email: 'other@example.test' },
    };
    const one = buildFirefliesCollectionPlan(duplicateRoles);
    expect(
      one.meetingRequests.filter((request) => request.keyword === 'Synthetic Practice')
    ).toHaveLength(1);
  });
});
describe('Intake collection execution accounting', () => {
  it('accounts for explicit phase pagination and complete candidate transcript retrieval', () => {
    expect(assessFirefliesSearchExecution({ profile })).toMatchObject({
      status: 'Partial',
      attempts: 0,
      missingPhases: ['Participant email', 'Provider and practice title', 'Current and prior CSM'],
    });
    const attempts = [
      'Participant email',
      'Provider and practice title',
      'Current and prior CSM',
    ].map((phase) => ({ phase, completed: true, meetingIds: ['meeting', 'meeting'] }));
    const complete = assessFirefliesSearchExecution({
      profile,
      execution: { attempts, transcripts: [{ id: 'meeting' }] },
    });
    expect(complete).toMatchObject({
      status: 'Complete',
      candidateMeetings: 1,
      transcriptsRetrieved: 1,
      missingTranscripts: [],
      pagesComplete: true,
    });
    expect(complete.reason).toBe(
      'Every provider identity path, page, candidate meeting, and full transcript was checked.'
    );
    const incomplete = assessFirefliesSearchExecution({
      profile,
      execution: {
        attempts: attempts.map((attempt) => ({ ...attempt, paginationComplete: false })),
        transcripts: [{ transcriptId: 'meeting', complete: false }],
      },
    });
    expect(incomplete).toMatchObject({
      status: 'Partial',
      pagesComplete: false,
      missingTranscripts: ['meeting'],
    });
  });
  it('keeps discovered external email follow-up scoped to original fallback phases and proven searches', () => {
    const attempts = [
      {
        phase: 'Participant email',
        completed: true,
        participantEmail: 'provider@example.test',
        discoveredParticipantEmails: ['ignored@example.test'],
      },
      {
        phase: 'Provider and practice title',
        completed: true,
        discoveredParticipantEmails: [
          'NEW@example.test',
          'staff@headstart.health',
          'bot@fireflies.ai',
          '',
        ],
        meetings: [
          { participants: ['provider@example.test'] },
          { meetingAttendees: [{ email: 'attendee@example.test' }] },
        ],
      },
      {
        phase: 'Current and prior CSM',
        completed: true,
        meetings: [
          { participants: [], meetingAttendees: [{ email: 'not-selected@example.test' }] },
        ],
      },
    ];
    const missing = assessFirefliesSearchExecution({ profile, execution: { attempts } });
    expect(missing.discoveredParticipantEmails).toEqual([
      'new@example.test',
      'provider@example.test',
      'attendee@example.test',
    ]);
    expect(missing.missingDiscoveredParticipantSearches).toEqual([
      'new@example.test',
      'attendee@example.test',
    ]);
    expect(missing.reason).toContain('still require a complete search');
    const searched = {
      phase: 'Participant email',
      completed: true,
      participantEmails: ['new@example.test', 'attendee@example.test'],
    };
    expect(
      assessFirefliesSearchExecution({ profile, execution: { attempts: [...attempts, searched] } })
        .status
    ).toBe('Complete');
  });
});
