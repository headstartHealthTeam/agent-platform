import { describe, expect, it } from 'vitest';

import { activeIssueGateOverride, prerequisiteGateOverride } from './story-gate-overrides.js';
import { impliedResolvedIssues } from './story-implied-resolution.js';
import { inferIssueKey } from './story-issues.js';
import {
  isGenericOperationalPlaceholder,
  latestStoryEvent,
  storySourcePriority,
} from './story-ranking.js';
import { compatibleRbtHireAndPrerequisite } from './story-rbt-compatibility.js';
import { explicitlyResolved } from './story-resolution.js';
import {
  assessmentCompletionResolved,
  explicitProgression,
  explicitlyUnresolved,
  issueStatus,
} from './story-status.js';
import { successorGateFrom } from './story-successor.js';
import type { StoryEvent, StoryFact, StoryIssue } from './story-types.js';
import {
  canonicalStoryFactText,
  normalizedStoryText,
  storyEventId,
  storyTime,
} from './story-values.js';
import { storyWindowStart } from './story-window.js';

function event(input: StoryFact & Partial<StoryEvent> = {}): StoryEvent {
  return {
    source: 'Task',
    sourceRecordId: 'synthetic-event',
    eventDate: '2026-09-22T12:00:00Z',
    matchQuality: 'Direct',
    relationship: 'Supports',
    substantive: true,
    ...input,
  };
}

describe('approved story classification and lifecycle rules', () => {
  it.each([
    ['provider cannot take the case', 'provider-capacity'],
    ['family availability requires confirmation', 'family-availability'],
    ['missing diagnostic evaluation', 'required-documentation'],
    ['initial authorization approved', 'initial-authorization'],
    ['treatment authorization start date', 'treatment-authorization'],
    ['first 97153 scheduled', 'first-97153'],
    ['RBT candidate interview', 'rbt-staffing'],
    ['VOB complete', 'insurance-verification'],
    ['clinical quality review', 'clinical-review'],
    ['payer submission readiness', 'payer-submission'],
    ['treatment plan drafting', 'treatment-plan'],
    ['initial assessment scheduled', 'initial-assessment'],
  ])('maps %s without changing priority', (text, expected) => {
    expect(inferIssueKey({ text })).toBe(expected);
  });
  it('prefers typed findings, then gate context, then normalized category', () => {
    expect(inferIssueKey({ factType: 'tp-ready', text: 'RBT' })).toBe('payer-submission');
    expect(inferIssueKey({ factType: 'tp-submission-planned' })).toBe('clinical-review');
    expect(
      inferIssueKey({
        factType: 'tp-signature',
        source: 'Clinical Quality',
        text: 'clinical review',
      })
    ).toBe('clinical-review');
    expect(inferIssueKey({ factType: 'tp-signature', source: 'Task' })).toBe('treatment-plan');
    expect(
      inferIssueKey({ factType: 'auth-pending' }, { processPosition: 'Initial authorization' })
    ).toBe('initial-authorization');
    expect(inferIssueKey({ factType: 'auth-pending' })).toBe('treatment-authorization');
    expect(inferIssueKey({}, { unresolvedGate: 'RBT interview required' })).toBe('rbt-staffing');
    expect(inferIssueKey({ category: ' /Custom Category/ ' })).toBe('custom-category');
    expect(inferIssueKey({ category: '' })).toBe('other');
  });
  it.each([
    'family-document-completed',
    'ia-partial',
    'ia-session-completed',
    'ia-session-unverified',
    'ia-start-date-recorded',
    'billing-completion-review',
  ])('does not promote %s to whole-assessment completion', (factType) => {
    const fact = { factType, text: 'Initial assessment completed' };
    expect(assessmentCompletionResolved(fact)).toBe(false);
    expect(explicitlyResolved(fact, 'initial-assessment')).toBe(false);
    expect(impliedResolvedIssues(fact)).not.toContain('initial-assessment');
  });
  it('honors explicit negatives, planned plan work and whole-coverage progress', () => {
    for (const text of [
      'Initial assessment not completed',
      'Initial assessment completion remains unconfirmed',
      'Whole-assessment completion is not confirmed',
    ])
      expect(assessmentCompletionResolved({ text })).toBe(false);
    expect(assessmentCompletionResolved({ text: 'Initial assessment completed' })).toBe(true);
    for (const factType of [
      'tp-completion-planned',
      'tp-submission-planned',
      'tp-drafting',
      'tp-not-started',
      'tp-revisions',
    ])
      expect(
        explicitlyResolved({ factType, text: 'Treatment plan completed' }, 'treatment-plan')
      ).toBe(false);
    expect(
      explicitlyResolved({ text: 'Treatment plan remains incomplete' }, 'treatment-plan')
    ).toBe(false);
    expect(
      explicitlyResolved(
        { factType: 'auth-coverage-satisfied', text: 'Treatment authorization approved' },
        'treatment-authorization'
      )
    ).toBe(false);
    expect(issueStatus({ factType: 'auth-coverage-satisfied', text: 'approved' })).toBe('Pending');
  });
  it.each([
    ['family is available', 'family-availability'],
    ['provider confirmed capacity', 'provider-capacity'],
    ['VOB completed', 'insurance-verification'],
    ['treatment plan submitted', 'treatment-plan'],
    ['clinical quality review approved', 'clinical-review'],
    ['submitted to the payer', 'payer-submission'],
    ['RBT hired', 'rbt-staffing'],
    ['first 97153 service completed', 'first-97153'],
    ['received', 'other'],
  ])('resolves supported %s', (text, issue) => {
    expect(explicitlyResolved({ text }, issue)).toBe(true);
  });
  it('keeps incomplete or missing prerequisites unresolved', () => {
    for (const [text, issue] of [
      ['family is available but must confirm', 'family-availability'],
      ['provider confirmed capacity but pending', 'provider-capacity'],
      ['initial authorization partially approved', 'initial-authorization'],
      ['treatment authorization denied', 'treatment-authorization'],
      ['prior RBT hired; assignment closed', 'rbt-staffing'],
      ['first 97153 completed but must be confirmed', 'first-97153'],
      ['pending received', 'other'],
    ])
      expect(explicitlyResolved({ text }, issue ?? '')).toBe(false);
    expect(
      explicitlyResolved(
        { factType: 'rbt-assigned', source: 'Task', text: 'RBT hired; assignment unconfirmed' },
        'rbt-staffing'
      )
    ).toBe(false);
    expect(
      explicitlyResolved(
        { factType: 'rbt-assigned', source: 'Staffing', text: 'RBT hired; assignment unconfirmed' },
        'rbt-staffing'
      )
    ).toBe(true);
    for (const issueKey of ['initial-authorization', 'treatment-authorization'])
      expect(
        explicitlyResolved(
          {
            source: 'Authorization',
            issueKey,
            factType: 'auth-no-auth-needed',
            text: 'Structured determination',
          },
          issueKey
        )
      ).toBe(true);
    expect(
      explicitlyResolved({ factType: 'future-diagnostic-requirement' }, 'required-documentation')
    ).toBe(true);
  });
  it('preserves ordered implied prerequisites and structured information specificity', () => {
    expect(impliedResolvedIssues({ text: 'Opportunity entered TA Requested' })).toEqual([
      'insurance-verification',
      'initial-authorization',
      'initial-assessment',
      'required-documentation',
      'treatment-plan',
      'clinical-review',
      'payer-submission',
    ]);
    const fact = {
      source: 'Authorization',
      issueKey: 'initial-authorization',
      factType: 'auth-additional-info',
      requestedInformation: 'diagnostic report',
    };
    expect(impliedResolvedIssues(fact)).toEqual(['required-documentation']);
    expect(impliedResolvedIssues({ ...fact, specificityMissing: true })).toEqual([]);
    expect(impliedResolvedIssues({ text: 'First 97153 service started' })).toEqual([
      'treatment-authorization',
      'rbt-staffing',
      'first-97153',
    ]);
  });
  it('keeps authorization status ordering and explicit progression', () => {
    expect(issueStatus({ text: 'appeal denied' })).toBe('Appeal');
    expect(issueStatus({ text: 'denied pending' })).toBe('Denied');
    expect(issueStatus({ text: 'additional details approved' })).toBe('Additional Details');
    expect(issueStatus({ text: 'partially approved' })).toBe('Partial Approval');
    expect(issueStatus({ text: 'resolved' })).toBe('Resolved');
    expect(issueStatus({ text: 'pending' })).toBe('Pending');
    expect(issueStatus({})).toBeNull();
    expect(explicitProgression({ text: 'denied' }, 'Pending')).toBe(true);
    expect(explicitProgression({ text: 'correction sent' }, 'Denied')).toBe(true);
    expect(explicitProgression({ text: 'denied' }, 'Appeal')).toBe(false);
    expect(explicitProgression({ text: 'resubmitted' }, null)).toBe(true);
    expect(explicitlyUnresolved({ text: 'still waiting' })).toBe(true);
  });
  it('allows only an affirmed hire plus its remaining prerequisite', () => {
    const hire = {
      factType: 'rbt-assigned',
      text: 'The provider hired an RBT.',
      candidateName: 'Synthetic Worker',
    };
    const prerequisite = {
      factType: 'rbt-candidate',
      text: 'The hired RBT still needs credentialing.',
      candidateName: 'synthetic worker',
    };
    expect(compatibleRbtHireAndPrerequisite(hire, prerequisite)).toBe(true);
    expect(compatibleRbtHireAndPrerequisite(prerequisite, hire)).toBe(true);
    for (const variant of [
      null,
      { ...prerequisite, candidateActive: false },
      { ...prerequisite, candidateName: 'Different Worker' },
      { ...prerequisite, factType: 'rbt-lost' },
      { ...prerequisite, text: 'RBT is not hired' },
      {
        ...prerequisite,
        text: 'The hired RBT still needs replacement after resigning; no longer active',
      },
    ])
      expect(compatibleRbtHireAndPrerequisite(hire, variant)).toBe(false);
  });
});

describe('story date, rank and gate helpers', () => {
  it('preserves frozen windows and the original basis wording for custom lengths', () => {
    expect(
      storyWindowStart({
        slaCreatedDate: '2026-09-22',
        stageEntryDate: '2026-09-20',
        asOf: '2026-09-24',
        bufferDays: 2,
      })
    ).toEqual({
      startDate: '2026-09-18T00:00:00.000Z',
      anchorDate: '2026-09-20T00:00:00.000Z',
      basis: 'Earlier of current SLA creation or stage entry, minus 3 days',
    });
    expect(
      storyWindowStart({ slaCreatedDate: 'invalid', asOf: '2026-09-24', fallbackDays: 1 })
    ).toEqual({
      startDate: '2026-09-23T00:00:00.000Z',
      anchorDate: null,
      basis: '120-day fallback',
    });
    expect(storyTime(new Date('2026-09-24'))).toBe(Date.parse('2026-09-24'));
    expect(storyTime('invalid')).toBe(0);
    expect(storyTime(null)).toBe(0);
    expect(normalizedStoryText({ factType: 'TYPE', text: '  Two  Words ' })).toBe('type two words');
    expect(canonicalStoryFactText({ text: ' Two--WORDS! ' })).toBe('two words');
    expect(storyEventId(event())).toBe('Task:synthetic-event');
  });
  it('ranks day, relevance, specificity, source, then exact time without mutating inputs', () => {
    const lower = event({ processRelevance: 1, eventDate: '2026-09-22T22:00:00Z' });
    const higher = event({ processRelevance: 10, eventDate: '2026-09-22T01:00:00Z' });
    const input = [lower, higher];
    expect(latestStoryEvent(input)).toBe(higher);
    expect(input).toEqual([lower, higher]);
    expect(latestStoryEvent([])).toBeNull();
    expect(storySourcePriority({ source: 'Authorization' })).toBe(4);
    expect(storySourcePriority({ source: 'Linked Billing / Claims' })).toBe(3);
    expect(storySourcePriority({ source: 'Task', supportingOnly: true })).toBe(1);
    expect(storySourcePriority({ source: 'Task' })).toBe(2);
    expect(
      isGenericOperationalPlaceholder({
        text: 'The latest staffing note does not identify the candidate',
      })
    ).toBe(true);
  });
  it('keeps typed readiness separate from submission and preserves planned monitoring', () => {
    expect(successorGateFrom(null)).toBeNull();
    expect(
      successorGateFrom({
        factType: 'tp-ready',
        text: 'Treatment plan ready; submitted to payer unconfirmed',
      })?.issueKey
    ).toBe('payer-submission');
    expect(
      successorGateFrom({ factType: 'tp-portal-submitted-awaiting-clinical-quality' })
        ?.recommendedActionType
    ).toBe('Salesforce Update');
    expect(successorGateFrom({ text: 'Treatment plan submitted to Headstart' })?.issueKey).toBe(
      'clinical-review'
    );
    expect(successorGateFrom({ text: 'Treatment plan submitted to the payer' })?.issueKey).toBe(
      'treatment-authorization'
    );
    expect(successorGateFrom({ text: 'Initial authorization approved' })?.issueKey).toBe(
      'initial-assessment'
    );
    expect(successorGateFrom({ text: 'Treatment authorization approved' })?.issueKey).toBe(
      'first-97153'
    );
    expect(successorGateFrom({ text: 'Initial assessment completed' })?.issueKey).toBe(
      'treatment-plan'
    );
    expect(successorGateFrom({ text: 'RBT hired', milestoneDate: '2026-09-30' })).toMatchObject({
      recommendedActionType: 'Monitor',
      recommendedFollowUpDate: '2026-09-30',
    });
    expect(successorGateFrom({ text: 'RBT hired' })?.recommendedActionType).toBe(
      'Provider Outreach'
    );
    expect(successorGateFrom({ text: 'unknown' })).toBeNull();
  });
  it('retains explicit gate fields before fallback wording', () => {
    const issue: StoryIssue = {
      issueKey: 'required-documentation',
      state: 'Opened',
      openedDate: null,
      lastUpdatedDate: null,
      openedByEventId: null,
      resolvedDate: null,
      resolvedByEventId: null,
      latestEventId: null,
      latestEvent: null,
      latestFact: null,
      currentGate: false,
    };
    expect(prerequisiteGateOverride(issue, { owner: 'Intake' })?.owner).toBe('Intake');
    expect(prerequisiteGateOverride({ issueKey: 'unknown' }, {})).toBeNull();
    expect(activeIssueGateOverride(issue, {})).toBeNull();
    issue.latestEvent = {
      ...event({
        gateImpact: 'Specific requirement',
        actionOwner: 'Named CSM',
        recommendedAction: 'Named CSM to confirm',
        followUpDate: '2026-09-25',
      }),
      issueKey: issue.issueKey,
      lifecycleState: 'Opened',
      resolvedByEventId: null,
      resolutionDate: null,
      narrativeContribution: 'Current',
      preWindowContext: false,
    };
    expect(activeIssueGateOverride(issue, { processPosition: 'Assessment' })).toMatchObject({
      processPosition: 'Assessment',
      unresolvedGate: 'Specific requirement',
      owner: 'Named CSM',
      recommendedFollowUpDate: '2026-09-25',
    });
  });
});
