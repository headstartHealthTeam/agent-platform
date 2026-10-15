import { describe, expect, it } from 'vitest';

import {
  actionExplicitFollowUpDate,
  actionIsoDate,
  actionMilestoneDate,
  actionNextBusinessDay,
} from './action-model-dates.js';
import type { ActionModelInput } from './action-model-types.js';
import { deriveActionModel } from './action-model.js';

function model(overrides: Partial<ActionModelInput> = {}): ReturnType<typeof deriveActionModel> {
  return deriveActionModel({
    opp: {},
    blocker: '',
    action: 'Confirm the next step.',
    asOf: new Date('2026-09-25T16:00:00Z'),
    ...overrides,
  });
}

describe('approved report action model', () => {
  it.each([
    ['family', 'Close the Opportunity.', 'Close / Discharge', 'Intake'],
    ['provider assignment', 'Reassign the provider.', 'Salesforce Update', 'Intake'],
    ['stage not advanced', 'Correct the stage.', 'Salesforce Update', 'Intake'],
    ['payer authorization', 'Confirm status.', 'Insurance Follow-Up', 'Insurance Ops'],
    ['clinical review', 'Confirm status.', 'Clinical Review', 'Clinical Quality'],
    ['', 'Confirm the first 97153 appointment.', 'Provider Outreach', 'CSM'],
    ['paired-client dependency', 'Confirm status.', 'Provider Outreach', 'CSM'],
    ['family responsiveness', 'Confirm status.', 'Family Outreach', 'Intake'],
    [
      'family availability',
      'Confirm with provider whether the family replied.',
      'Provider Outreach',
      'CSM',
    ],
    ['staffing', 'Confirm candidate status.', 'RBT Follow-Up', 'RBT Team'],
    ['', 'Obtain discharge report.', 'Family Outreach', 'Intake'],
    ['', 'Confirm provider status.', 'Provider Outreach', 'CSM'],
    ['', 'Confirm status.', 'Salesforce Update', 'Intake'],
  ])('preserves action/owner priority for %s / %s', (blocker, action, actionType, actionOwner) => {
    expect(model({ blocker, action })).toEqual({
      actionType,
      actionOwner,
      followUpDate: '2026-09-28',
      followUpDateBasis: 'Recommended',
    });
  });

  it('preserves future appointments instead of manufacturing immediate outreach', () => {
    expect(
      model({
        blocker: 'initial assessment',
        action: 'No action needed before the appointment.',
        evidenceText: 'Assessment scheduled for 9/30.',
        opp: { CSM__c: 'Synthetic Owner' },
      })
    ).toEqual({
      actionType: 'Monitor',
      actionOwner: 'Synthetic Owner',
      followUpDate: '2026-09-30',
      followUpDateBasis: 'Explicit',
    });
    expect(
      model({ blocker: 'initial assessment', evidenceText: 'Not scheduled for 9/30.' }).actionType
    ).toBe('Provider Outreach');
  });

  it('keeps explicit follow-up ahead of a planned milestone and submission follow-up after it', () => {
    expect(model({ evidenceText: 'Submit 9/25. Follow up by 9/30.' }).followUpDate).toBe(
      '2026-09-30'
    );
    expect(model({ evidenceText: 'Submit 9/25.' })).toEqual({
      actionType: 'Monitor',
      actionOwner: 'CSM',
      followUpDate: '2026-09-28',
      followUpDateBasis: 'Recommended',
    });
    expect(model({ evidenceText: 'Follow up by 9/20.' }).followUpDateBasis).toBe('Recommended');
  });

  it('preserves explicit overrides and empty-basis fallback', () => {
    const input = {
      action: 'No action needed before the appointment.',
      milestoneDateOverride: '2026-09-30',
      milestoneOwner: 'Clinical Owner',
    };
    expect(model(input)).toEqual({
      actionType: 'Monitor',
      actionOwner: 'Clinical Owner',
      followUpDate: '2026-09-30',
      followUpDateBasis: 'Recommended',
    });
    expect(model({ ...input, milestoneDateBasis: '' }).followUpDateBasis).toBe('Explicit');
    expect(model({ action: input.action })).toEqual({
      actionType: 'No Action',
      actionOwner: 'Intake',
      followUpDate: '',
      followUpDateBasis: 'Not Applicable',
    });
  });

  it('retains named owners, rejects a multi-owner phrase and uses stage fallback', () => {
    expect(
      model({ blocker: 'initial assessment', action: 'Synthetic Owner to confirm.' }).actionOwner
    ).toBe('Synthetic Owner');
    expect(
      model({
        blocker: 'initial assessment',
        action: 'Intake and Provider to confirm.',
        opp: { CSM__c: 'Synthetic CSM' },
      }).actionOwner
    ).toBe('Synthetic CSM');
    expect(
      model({ opp: { StageName: '', Current_SLA__r: { Stage__c: 'IA Requested authorization' } } })
        .actionType
    ).toBe('Insurance Follow-Up');
  });

  it('uses the source Eastern date and weekend rules, including year boundaries', () => {
    expect(actionIsoDate('2026-01-01T02:00:00Z')).toBe('2025-12-31');
    expect(actionExplicitFollowUpDate('Check back on 1/2', new Date('2026-01-01T02:00:00Z'))).toBe(
      '2025-01-02'
    );
    expect(actionExplicitFollowUpDate('f/u by 9/30/26', '2026-09-25')).toBe('2026-09-30');
    expect(actionMilestoneDate('starting 9/30', '2026-09-25')).toEqual({
      kind: 'event',
      date: '2026-09-30',
    });
    expect(actionMilestoneDate('No date given', '2026-09-25')).toBeNull();
    expect(actionNextBusinessDay('2026-09-25')).toBe('2026-09-28');
    expect(() => actionNextBusinessDay('2026-09-25T16:00:00Z')).toThrow(RangeError);
    expect(() => actionIsoDate('invalid')).toThrow(RangeError);
  });
});
