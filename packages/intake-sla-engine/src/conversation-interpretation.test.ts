import { afterEach, describe, expect, it, vi } from 'vitest';

import { interpretConversation, isAutomatedCommunication } from './conversation-interpretation.js';
import type { ConversationInterpretationInput } from './conversation-interpretation.js';

const input: ConversationInterpretationInput = {
  opportunityId: 'synthetic-opportunity',
  source: 'Synthetic note',
  sourceRecordId: 'synthetic-note',
  eventDate: '2026-09-24',
  asOf: '2026-09-24',
  text: 'Authorization pending.',
  matchQuality: 'Direct',
  gate: { gateCategory: 'insurance' },
};
afterEach(() => vi.useRealTimers());
describe('approved conversation evidence projection', () => {
  it('preserves the complete event contract and single-source identity', () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-09-24T15:00:00.000Z');
    expect(interpretConversation(input)).toEqual([
      {
        collectionDate: '2026-09-24T15:00:00.000Z',
        matchedIdentities: [],
        processRelevance: 9,
        matchQuality: 'Direct',
        substantive: true,
        relationship: 'Supports',
        rawText: 'Authorization pending.',
        issueKey: undefined,
        lifecycleState: null,
        resolvedByEventId: null,
        resolutionDate: null,
        narrativeContribution: 'Audit Only',
        opportunityId: 'synthetic-opportunity',
        source: 'Synthetic note',
        sourceRecordId: 'synthetic-note',
        eventDate: '2026-09-24',
        category: 'insurance',
        text: 'The authorization remains pending with the payer; no final determination is recorded.',
        assumedIdentityMatch: false,
        assumedIdentityNote: '',
        matchedAs: '',
        factType: 'auth-pending',
        gateImpact: 'Current authorization determination remains pending',
        actionOwner: 'Insurance Ops',
        actionType: 'Insurance Follow-Up',
        recommendedAction:
          'Insurance Ops to confirm the pending payer determination and document the response and next follow-up date.',
        milestoneDate: null,
        followUpDate: '2026-09-25',
        kind: undefined,
        plannedDate: undefined,
        denialReason: undefined,
        appealKind: undefined,
        requestedInformation: undefined,
        specificityMissing: undefined,
        candidateStep: undefined,
      },
    ]);
  });
  it('retains ranked suffixes, explicit raw data and identity metadata without mutation', () => {
    const identities = Object.freeze([
      { opportunityId: 'synthetic-opportunity', opportunityName: 'Synthetic Example' },
    ]);
    const source = Object.freeze({
      ...input,
      text: 'Authorization denied but effective date needs correction.',
      rawText: null,
      matchedIdentities: identities,
      assumedIdentityMatch: true,
      assumedIdentityNote: 'Context-bound synthetic match',
      matchedAs: 'Synthetic',
    });
    const events = interpretConversation(source);
    expect(events.map((event) => [event.sourceRecordId, event.factType])).toEqual([
      ['synthetic-note:1', 'auth-date-correction'],
      ['synthetic-note:2', 'auth-denied'],
    ]);
    for (const event of events) {
      expect(event.matchedIdentities).toBe(identities);
      expect(event).toMatchObject({
        rawText: null,
        assumedIdentityMatch: true,
        assumedIdentityNote: 'Context-bound synthetic match',
        matchedAs: 'Synthetic',
      });
    }
  });
  it('uses identity and gate context only as fallbacks for the existing fact rules', () => {
    const denied = {
      ...input,
      text: 'Authorization denied because Synthetic Example.',
      matchedIdentities: [
        { opportunityId: 'another', opportunityName: 'Wrong Example' },
        { opportunityId: 'synthetic-opportunity', opportunityName: 'Synthetic Example' },
      ],
    };
    expect(interpretConversation(denied)).toMatchObject([
      { factType: 'auth-denied', denialReason: null },
    ]);
    expect(
      interpretConversation({ ...denied, context: { opportunityName: 'Explicit Example' } })
    ).toMatchObject([{ factType: 'auth-denial-reason', denialReason: 'Synthetic Example' }]);
    const terminated = {
      ...input,
      text: 'Family plans to terminate existing ABA services because insurance overlap.',
      gate: { processPosition: 'Treatment authorization' },
    };
    expect(interpretConversation(terminated)).toMatchObject([
      {
        gateImpact:
          'The other ABA authorization must end before the current treatment authorization can proceed',
      },
    ]);
    expect(
      interpretConversation({
        ...terminated,
        context: { processPosition: 'Initial authorization' },
      })
    ).toMatchObject([
      {
        gateImpact:
          'The other ABA authorization must end before the current initial authorization can proceed',
      },
    ]);
  });
  it('retains fact-category overrides and empty unsupported evidence', () => {
    expect(
      interpretConversation({
        ...input,
        text: 'Pending insurance approval.',
        gate: { gateCategory: 'other' },
        context: { noteType: 'sla' },
      })
    ).toMatchObject([{ category: 'insurance', specificityMissing: true }]);
    expect(interpretConversation({ ...input, text: 'Ordinary message.' })).toEqual([]);
    expect(interpretConversation({ ...input, text: 'Ordinary message.', gate: undefined })).toEqual(
      []
    );
    expect(() => interpretConversation({ ...input, sourceRecordId: '' })).toThrow(
      'EvidenceEvent missing sourceRecordId'
    );
  });
  it.each([
    'See where you are in the process',
    'Intake timeline',
    'Reply STOP to opt out',
    'Welcome to Headstart Health',
    'You can reach me at',
    'As a reminder we sent out',
    'Reminder to complete the new client onboarding packet',
  ])('preserves automated-message detection for %s', (text) => {
    expect(isAutomatedCommunication(text)).toBe(true);
    expect(isAutomatedCommunication(text.replaceAll(' ', '\n'))).toBe(true);
  });
  it('does not broaden automated-message detection', () => {
    expect(isAutomatedCommunication()).toBe(false);
    expect(isAutomatedCommunication('Provider submitted the treatment plan.')).toBe(false);
  });
});
