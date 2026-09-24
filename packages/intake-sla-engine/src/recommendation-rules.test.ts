import { describe, expect, it } from 'vitest';

import { actionFor, plannedActionDate, usableFollowUpDate } from './recommendation-action.js';
import {
  authorizationProgressAction,
  rawComplementaryAuthorizationProgress,
} from './recommendation-authorization-progress.js';
import {
  assignedRbtName,
  candidateStepSentence,
  requiredItemFromEvent,
  selectedRbtCandidate,
} from './recommendation-candidate.js';
import { dateValue, humanDate } from './recommendation-date.js';
import {
  accountableAction,
  accountableOwner,
  actionTypeForOwner,
  ownerName,
} from './recommendation-owner.js';
import { chronological, dedupeEvents, factView } from './recommendation-projection.js';
import {
  activeRequiredDocumentationEvent,
  shouldUseStructuredAction,
} from './recommendation-selection.js';
import { rbtControlEvent } from './recommendation-staffing.js';
import { structuredGateEvent } from './recommendation-structured.js';
import {
  asInlineSentence,
  asSentence,
  canonicalFact,
  cleanTerminalPunctuation,
  duplicateOnlyConflict,
  inlineFact,
  isGenericOperationalPlaceholder,
  normalizeCategory,
  normalizedFact,
  requiredItemIsPlural,
  shortenSentence,
  trimDanglingWords,
  truncate,
  withdrawnDenialClause,
} from './recommendation-text.js';
import type { RecommendationEvent, RecommendationGate } from './recommendation-types.js';
import type { StoryIssueView } from './story-types.js';

const asOf = '2026-09-24T12:00:00Z';
const opportunity = {
  id: 'synthetic',
  stage: 'IA Scheduled',
  csm: 'Synthetic CSM',
  provider: 'Synthetic Provider',
};
function event(extra: Partial<RecommendationEvent> = {}): RecommendationEvent {
  return {
    opportunityId: opportunity.id,
    source: 'Task',
    sourceRecordId: 'synthetic-task',
    eventDate: '2026-09-22',
    text: 'Initial assessment is scheduled.',
    factType: 'ia-scheduled',
    category: 'intakeScheduling',
    substantive: true,
    matchQuality: 'Direct',
    relationship: 'Supports',
    processRelevance: 9,
    ...extra,
  };
}

describe('approved recommendation text and projections', () => {
  it('normalizes punctuation and dates without losing acronym capitalization', () => {
    expect(cleanTerminalPunctuation(' The payer requested forms?!: ')).toBe(
      'The payer requested forms'
    );
    expect(withdrawnDenialClause('TA', 'the payer found other coverage.')).toBe(
      'TA was withdrawn because the payer found other coverage'
    );
    expect(withdrawnDenialClause('IA', 'other coverage was active!')).toContain(
      'after the payer found that other coverage'
    );
    expect(requiredItemIsPlural('BASC and Vineland')).toBe(true);
    expect(requiredItemIsPlural('the BASC assessment')).toBe(false);
    expect(inlineFact('The provider requested forms.')).toBe('the provider requested forms');
    expect(inlineFact('IA is scheduled.')).toBe('IA is scheduled');
    expect(asSentence('the date is 2026-09-24,, ;')).toBe('The date is 9/24,.');
    expect(asInlineSentence('The provider follows up 2026-09-24.')).toBe(
      'the provider follows up 9/24.'
    );
    expect(normalizedFact('  Forms   requested!? ')).toBe('forms requested');
    expect(canonicalFact('On 2026-09-04: Forms.')).toBe('on 9 4 forms');
    expect(
      duplicateOnlyConflict(
        'forms: Forms needed on 2026-09-04. A later source reports Forms needed on 9/4!'
      )
    ).toBe(true);
    expect(duplicateOnlyConflict(true)).toBe(false);
    expect(duplicateOnlyConflict('Forms remain missing.')).toBe(false);
  });
  it('preserves sentence and Unicode-aware truncation and placeholder classification', () => {
    expect(truncate('First complete sentence. More content continues here.', 35)).toBe(
      'First complete sentence.'
    );
    expect(shortenSentence('First. A long second clause.', 12)).toBe('First.');
    expect(shortenSentence('🧠 One long sentence with trailing words to', 20)).not.toContain(
      '\uFFFD'
    );
    expect(trimDanglingWords('Confirm the records with the ')).toBe('Confirm the records');
    expect(
      isGenericOperationalPlaceholder({
        text: 'Latest staffing note does not identify a candidate',
      })
    ).toBe(true);
    expect(isGenericOperationalPlaceholder(event())).toBe(false);
    expect(isGenericOperationalPlaceholder(null)).toBe(false);
    expect(normalizeCategory('Clinical Quality')).toBe('treatmentPlan');
    expect(normalizeCategory('Ticket Match')).toBe('rbt');
    expect(normalizeCategory('payer approval')).toBe('insurance');
    expect(normalizeCategory('IA')).toBe('intakeScheduling');
    expect(normalizeCategory('')).toBe('other');
  });
  it('retains exact date fallback, stable deduplication, rank tie and fact-view nullable fields', () => {
    expect(dateValue(undefined)).toBe(0);
    expect(dateValue(null)).toBe(0);
    expect(dateValue('invalid')).toBe(0);
    expect(humanDate('2026-09-24')).toBe('9/24');
    expect(humanDate('invalid')).toBeNull();
    const first = event({ text: 'Forms remain missing.' });
    const duplicate = event({ text: 'forms remain missing!', sourceRecordId: 'second' });
    const ranked = event({ text: 'Another finding', processRelevance: 10 });
    expect(dedupeEvents([first, duplicate, ranked])).toEqual([first, ranked]);
    expect(chronological([first, ranked])[0]).toBe(ranked);
    expect(factView(first, 'Used')).toMatchObject({
      id: 'Task:synthetic-task',
      date: '2026-09-22',
      fact: first.text,
      candidateActive: null,
      appealKind: null,
      requestedInformation: null,
      specificityMissing: false,
      assumedIdentityMatch: false,
      contribution: 'Used',
    });
  });
});

describe('approved candidate and structured evidence precedence', () => {
  it('distinguishes a confirmed assignment from a selected pipeline candidate', () => {
    const named = event({
      factType: 'rbt-assigned',
      candidateName: 'Synthetic RBT',
      source: 'Ticket Match',
    });
    expect(assignedRbtName(named)).toBeNull();
    expect(selectedRbtCandidate(named)).toBe('Synthetic RBT');
    expect(assignedRbtName({ ...named, source: 'RBT Request' })).toBe('Synthetic RBT');
    expect(selectedRbtCandidate({ ...named, source: 'Staffing' })).toBeNull();
    expect(
      assignedRbtName({
        source: 'Staffing',
        factType: 'rbt-assigned',
        text: 'Synthetic RBT was assigned today',
      })
    ).toBe('Synthetic RBT');
    expect(
      assignedRbtName({
        source: 'Staffing',
        factType: 'rbt-assigned',
        text: 'As of 2026-09-20, Synthetic RBT has reached hired',
      })
    ).toBe('Synthetic RBT');
    expect(assignedRbtName(null)).toBeNull();
    expect(candidateStepSentence({ candidateStep: 'proposed; interviewing' })).toBe(
      'is proposed to the provider while the candidate record is at interviewing'
    );
    expect(candidateStepSentence({ candidateStep: 'hired; credentialing' })).toBe(
      'reached hired and is marked credentialing'
    );
    expect(candidateStepSentence({ candidateStep: 'interviewing' })).toBe('is at interviewing');
    expect(candidateStepSentence(null)).toContain('requires confirmation');
  });
  it.each([
    ['BASC', 'the BASC assessment'],
    ['Vineland', 'the Vineland assessment'],
    ['SOA', 'the signed service order'],
    ['psychological report', 'the current diagnostic evaluation'],
    ['parent signature', 'the parent or guardian signature'],
    ['provider signature', 'the provider signature'],
  ])('retains existing named-item mapping for %s', (text, expected) => {
    expect(requiredItemFromEvent({ text })).toBe(expected);
    expect(requiredItemFromEvent({ text, requestedInformation: 'explicit item' })).toBe(
      'explicit item'
    );
  });
  it('does not substitute a later proposed candidate for a confirmed assignment', () => {
    const assigned = event({
      source: 'RBT Request',
      text: 'Synthetic RBT is assigned.',
      factType: 'rbt-assigned',
    });
    const proposed = event({
      source: 'Ticket Match',
      text: 'Another candidate is proposed.',
      factType: 'rbt-candidate',
      candidateName: 'Second RBT',
      candidateActive: true,
      eventDate: '2026-09-23',
    });
    expect(rbtControlEvent([assigned, proposed])).toBe(assigned);
    const replacement = event({
      source: 'RBT Request',
      text: 'Replacement recruiting is active.',
      factType: 'rbt-recruiting',
      eventDate: '2026-09-23',
    });
    expect(rbtControlEvent([assigned, proposed, replacement])).toBe(proposed);
    expect(rbtControlEvent([assigned, { ...replacement, text: 'Request is paused.' }])?.text).toBe(
      'Request is paused.'
    );
    expect(rbtControlEvent([assigned, { ...replacement, text: 'Request was closed.' }])?.text).toBe(
      'Request was closed.'
    );
  });
  it('preserves inactive same-day candidate handling, latest failed fallback and neutral-source exclusion', () => {
    const active = event({
      source: 'Ticket Match',
      factType: 'rbt-candidate',
      candidateName: 'RBT',
      candidateActive: true,
    });
    const failed = {
      ...active,
      text: 'Candidate withdrew.',
      candidateActive: false,
      factType: 'rbt-lost',
    };
    expect(rbtControlEvent([active, failed])).toBe(failed);
    expect(rbtControlEvent([failed, active])).toBe(failed);
    expect(rbtControlEvent([event()])).toBeNull();
    expect(rbtControlEvent()).toBeNull();
  });
  it('keeps gate source priority and old structured coverage without mutating evidence', () => {
    const billing = event({
      source: 'Linked Billing / Claims',
      narrativeContribution: 'Current',
      text: 'The assessment appointment is scheduled.',
    });
    const opportunityEvent = event({
      source: 'Salesforce Opportunity / SLA',
      narrativeContribution: 'Current',
    });
    const input = [opportunityEvent, billing];
    const original = structuredClone(input);
    expect(
      structuredGateEvent({ narrativeEvents: input }, { gateCategory: 'intakeScheduling' }, input)
    ).toBe(billing);
    expect(structuredGateEvent({}, { gateCategory: 'intakeScheduling' }, input)).toBe(billing);
    expect(structuredGateEvent({}, { gateCategory: 'other' }, input)).toBeNull();
    expect(input).toEqual(original);
  });
  it('does not replace an explicit later scheduling or resubmission action with prerequisite completion', () => {
    const current = event({
      sourceRecordId: 'later-scheduling-action',
      issueKey: 'initial-assessment',
      recommendedAction: 'Confirm schedule',
      actionType: 'Provider Outreach',
      eventDate: '2026-09-23',
    });
    const completed = event({
      sourceRecordId: 'earlier-prerequisite-completion',
      factType: 'family-document-completed',
      issueKey: 'required-documentation',
      recommendedAction: 'No action',
      processRelevance: 12,
    });
    expect(shouldUseStructuredAction(current, completed)).toBe(false);
    expect(shouldUseStructuredAction({ ...current, actionType: 'Monitor' }, completed)).toBe(true);
    expect(
      shouldUseStructuredAction(
        { ...current, factType: 'tp-resubmitted-for-review' },
        { ...completed, factType: 'tp-revisions' }
      )
    ).toBe(false);
    expect(
      shouldUseStructuredAction(
        { ...current, specificityMissing: true },
        { ...completed, factType: 'required-document', requestedInformation: 'BASC' }
      )
    ).toBe(true);
    expect(shouldUseStructuredAction(null, completed)).toBe(true);
    expect(shouldUseStructuredAction(current, null)).toBe(false);
  });
});

describe('approved actions and dated follow-up', () => {
  it('uses named owners and preserves already accountable or no-action text', () => {
    expect(ownerName('CSM', opportunity)).toBe('Synthetic CSM');
    expect(ownerName('CSM', { csm: '' })).toBe('CSM');
    expect(accountableOwner('Intake Ops to confirm', 'CSM', opportunity)).toBe('Intake');
    expect(accountableOwner('synthetic csm to confirm', 'RBT Team', opportunity)).toBe(
      'Synthetic CSM'
    );
    expect(actionTypeForOwner('RBT Follow-Up', 'Synthetic CSM', opportunity)).toBe(
      'Provider Outreach'
    );
    expect(
      accountableAction({ owner: 'Intake', text: 'CSM to confirm', type: 'Follow-Up' }).text
    ).toBe('Intake to confirm');
    expect(
      accountableAction({ owner: 'CSM', text: 'Confirm progress', type: 'Follow-Up' }).text
    ).toBe('CSM to confirm progress');
    const noAction = { owner: 'CSM', text: 'No action', type: 'No Action' };
    expect(accountableAction(noAction)).toBe(noAction);
  });
  it('requires a positively planned milestone before converting monitoring to outreach', () => {
    const input = event({
      recommendedAction: 'CSM to monitor appointment.',
      actionType: 'Monitor',
      milestoneDate: '2026-09-25',
    });
    const gate: RecommendationGate = { gateCategory: 'intakeScheduling', owner: 'CSM' };
    expect(actionFor(gate, asOf, input, opportunity)).toMatchObject({
      type: 'Monitor',
      date: '2026-09-25',
      basis: 'Explicit',
    });
    expect(
      actionFor(gate, asOf, { ...input, milestoneDate: '2026-09-23' }, opportunity)
    ).toMatchObject({ type: 'Provider Outreach', date: '2026-09-25' });
    expect(
      actionFor(
        gate,
        asOf,
        { ...input, milestoneDate: '2026-09-23', milestoneKind: null },
        opportunity
      ).type
    ).toBe('Monitor');
    expect(plannedActionDate({ ...input, milestoneKind: 'observed' })).toBeNull();
    expect(plannedActionDate({ ...input, milestoneKind: 'planned' })).toBe('2026-09-25');
    expect(plannedActionDate(null)).toBeNull();
    expect(usableFollowUpDate('invalid', asOf)).toEqual({ date: null, basis: 'Explicit' });
    expect(usableFollowUpDate('', asOf)).toEqual({ date: '2026-09-25', basis: 'Recommended' });
  });
  it('preserves gate-action, occurrence and default category ordering', () => {
    const gate: RecommendationGate = {
      recommendedAction: 'CSM to monitor schedule',
      recommendedActionType: 'Monitor',
      gateCategory: 'intakeScheduling',
    };
    const input = event({
      milestoneDate: '2026-09-20',
      recommendedAction: 'Conflicting action',
      relationship: 'Conflicts',
    });
    expect(actionFor(gate, asOf, input, opportunity).type).toBe('Provider Outreach');
    expect(
      actionFor(
        { occurrence: { actionType: 'No Action', owner: 'Intake Ops' } },
        asOf,
        null,
        opportunity
      ).basis
    ).toBe('Not Applicable');
    expect(
      actionFor(
        {
          occurrence: {
            actionType: 'Monitor',
            owner: 'CSM',
            followUpDate: '2026-09-28',
            plannedMilestone: '2026-09-28',
          },
        },
        asOf,
        null,
        opportunity
      )
    ).toMatchObject({ type: 'Monitor', basis: 'Explicit', date: '2026-09-28' });
    expect(
      actionFor(
        { occurrence: { actionType: 'Salesforce Update', owner: 'CSM' } },
        asOf,
        null,
        opportunity
      ).type
    ).toBe('Salesforce Update');
    expect(actionFor({ owner: 'Insurance Ops' }, asOf, null, opportunity).type).toBe(
      'Insurance Follow-Up'
    );
    for (const gateCategory of ['treatmentPlan', 'intakeScheduling', 'rbt', 'other'])
      expect(actionFor({ gateCategory }, asOf, null, opportunity).text).toContain(
        'Synthetic CSM to confirm'
      );
  });
  it('retains unresolved required documentation and same-day payer progress', () => {
    const item = event({
      category: 'required-documentation',
      issueKey: 'required-documentation',
      factType: 'required-document',
      recommendedAction: 'Request BASC',
      requestedInformation: 'BASC',
    });
    const issue: StoryIssueView = {
      issueKey: 'required-documentation',
      state: 'Opened',
      openedDate: '2026-09-22',
      lastUpdatedDate: '2026-09-22',
      resolvedDate: null,
      openedByEventId: 'Task:synthetic-task',
      resolvedByEventId: null,
      latestEventId: 'Task:synthetic-task',
      latestFact: item.text,
      currentGate: false,
    };
    expect(activeRequiredDocumentationEvent({ activeIssues: [issue] }, [item])).toBe(item);
    expect(activeRequiredDocumentationEvent({}, [item])).toBeNull();
    const progress = event({
      sourceRecordId: 'progress',
      issueKey: 'treatment-authorization',
      factType: 'auth-corrections-complete',
      text: 'Corrected SIPA, SRS and treatment plan sent; payer receipt remains unconfirmed.',
      lifecycleState: 'Progressed',
    });
    const story = { currentGateIssueKey: 'treatment-authorization', timeline: [progress] };
    expect(rawComplementaryAuthorizationProgress(story, item)).toBe(progress);
    expect(authorizationProgressAction(progress, story, asOf)).toMatchObject({
      owner: 'Insurance Ops',
      date: '2026-09-25',
    });
    expect(authorizationProgressAction(progress, story, asOf)?.text).toContain(
      'the corrected SIPA, the SRS and the corrected treatment plan'
    );
    expect(
      rawComplementaryAuthorizationProgress(
        { ...story, timeline: [{ ...progress, lifecycleState: 'Conflicting' }] },
        item
      )
    ).toBeNull();
  });
});
