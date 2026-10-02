import { describe, expect, it } from 'vitest';

import { matchRosterOpportunity, normalizeRosterValue } from './roster-matching.js';

const target = { opportunityId: 'target', opportunityName: 'Maren Silva' };
const other = { opportunityId: 'other', opportunityName: 'Nathan Quinn' };
const input = {
  targetOpportunityId: target.opportunityId,
  targetOpportunityName: target.opportunityName,
  roster: [target, other],
};
describe('provider-roster constrained identity matching', () => {
  it('retains scored unique full-name, alias and phonetic matches as explicit assumptions', () => {
    expect(
      matchRosterOpportunity({ ...input, text: 'Maren Silva assessment is next week' })
    ).toMatchObject({
      matched: true,
      assumed: true,
      quality: 'Likely',
      score: 100,
      candidateName: target.opportunityName,
    });
    const alias = { ...target, clientAliases: ['Morgan Sylva'] };
    expect(
      matchRosterOpportunity({ ...input, roster: [alias, other], text: 'Morgan Sylva assessment' })
    ).toMatchObject({ matched: true, matchedName: 'Morgan Sylva' });
    expect(matchRosterOpportunity({ ...input, text: 'Marin Silva assessment' })).toMatchObject({
      matched: true,
      assumed: true,
    });
    expect(normalizeRosterValue('Sýnthetic.Name')).toBe('synthetic name');
    expect(normalizeRosterValue()).toBe('');
  });
  it('rejects competing winners and insufficient margins instead of selecting the target by default', () => {
    expect(matchRosterOpportunity({ ...input, text: 'Nathan Quinn assessment' })).toMatchObject({
      matched: false,
      reason: 'Another provider-roster client was a better name match',
    });
    expect(
      matchRosterOpportunity({ ...input, text: 'Maren Silva and Nathan Quinn assessments' })
    ).toMatchObject({ matched: false, margin: 0 });
    expect(matchRosterOpportunity({ ...input, text: 'Unrelated discussion' }).matched).toBe(false);
  });
  it('uses the source first-name thresholds only when the caller enables that path', () => {
    expect(matchRosterOpportunity({ ...input, text: 'Maren assessment' }).matched).toBe(false);
    expect(
      matchRosterOpportunity({ ...input, text: 'Maren assessment', allowFirstNameOnly: true })
    ).toMatchObject({
      matched: true,
      assumed: true,
      matchedName: target.opportunityName,
      reason: 'Unique fuzzy first-name match within provider roster and stage context',
    });
    expect(
      matchRosterOpportunity({ ...input, text: 'Nathan assessment', allowFirstNameOnly: true })
    ).toMatchObject({
      matched: false,
      reason: 'Another provider-roster client was a better first-name match',
    });
    expect(
      matchRosterOpportunity({
        targetOpportunityId: 'speech',
        targetOpportunityName: 'There Young',
        text: 'their provider could help',
        allowFirstNameOnly: true,
      }).matched
    ).toBe(false);
    expect(
      matchRosterOpportunity({
        ...input,
        text: 'Maren',
        allowFirstNameOnly: true,
        roster: [target, { opportunityId: 'second', opportunityName: 'Maren Lake' }],
      })
    ).toMatchObject({ matched: false, margin: 0 });
  });
  it('retains roster deduplication and appends a missing target without mutating input', () => {
    const roster = [other, { ...other }, { opportunityId: 'blank', opportunityName: '' }];
    const snapshot = structuredClone(roster);
    expect(matchRosterOpportunity({ ...input, roster, text: 'Maren Silva' }).matched).toBe(true);
    expect(roster).toEqual(snapshot);
    expect(matchRosterOpportunity({ ...input, text: '' })).toEqual({
      matched: false,
      assumed: false,
      reason: 'No roster candidates',
    });
    expect(matchRosterOpportunity({ text: 'text', targetOpportunityName: null })).toEqual({
      matched: false,
      assumed: false,
      reason: 'No roster candidates',
    });
    expect(
      matchRosterOpportunity({ text: 'Alex Jo Smith', targetOpportunityName: 'Alex Joe Smith' })
        .matched
    ).toBe(true);
    expect(
      matchRosterOpportunity({ text: 'Jo', targetOpportunityName: 'Jo', allowFirstNameOnly: true })
        .matched
    ).toBe(false);
  });
});
