import { describe, expect, it } from 'vitest';

import { targetPortalSegments } from './portal-roster-segments.js';
import { mergePortalSearchRows } from './portal-search-rows.js';

import { adaptPortal, buildIdentityProfile, dedupeEvidenceEvents } from './index.js';
import type { PortalChat, PortalSearchRow } from './index.js';

const asOf = new Date('2026-09-24T12:00:00.123Z');
const profile = buildIdentityProfile({
  opportunityId: 'synthetic',
  opportunityName: 'Synthetic Example',
  stage: 'IA Scheduled',
  providerNames: ['Dr Fiction'],
  providerRoster: [
    { opportunityId: 'synthetic', opportunityName: 'Synthetic Example' },
    { opportunityId: 'other', opportunityName: 'Other Person' },
  ],
});
const base = { profile, gate: { processPosition: 'Initial assessment' }, asOf };
const content = 'Synthetic Example completed the initial assessment.';
const chat: PortalChat = {
  messageId: 'chat',
  providerName: 'Dr Fiction',
  messages: [{ id: 'm', createdAt: '2026-09-22', content }],
};

describe('routine Portal evidence', () => {
  it.each<PortalSearchRow>([
    { responses: { chats: [chat] } },
    { responses: { data: { chats: [chat] } } },
    { data: { chats: [chat] } },
    { structuredContent: { data: { chats: [chat] } } },
    { chats: [chat] },
  ])(
    'consumes each approved capture envelope using real identity and evidence consumers',
    (row) => {
      const events = dedupeEvidenceEvents(adaptPortal({ ...base, row }));
      expect(events).toMatchObject([
        {
          source: 'Portal',
          sourceRecordId: 'm',
          factType: 'ia-completed',
          eventDate: '2026-09-22',
          matchQuality: 'Direct',
          text: 'The provider reported that the initial assessment occurred, but Salesforce or linked billing still needs to confirm the completion date.',
        },
      ]);
    }
  );
  it('deduplicates re-labelled conversations before interpretation and preserves the first metadata', () => {
    const first = { ...chat, channel: 'provider', extra: { retain: true } };
    const row = [
      {
        searchedAt: '2026-09-23',
        requestedChannel: 'one',
        query: { channel: 'two' },
        responses: { query: { channel: 'three' }, chats: [first] },
      },
      {
        searchedAt: '2026-09-24',
        requestedChannel: 'other',
        chats: [{ ...chat, messageId: 'duplicate', channel: 'different' }],
      },
    ];
    const before = structuredClone(row);
    expect(mergePortalSearchRows(row)).toEqual({
      searchedAt: '2026-09-24',
      responses: {
        chats: [
          { ...first, channel: null, returnedChannelLabels: ['one', 'two', 'three', 'provider'] },
        ],
      },
      portalChannelAttributionIgnored: true,
    });
    expect(adaptPortal({ ...base, row })).toHaveLength(1);
    expect(row).toEqual(before);
  });
  it('retains minute-level content/sender deduplication and distinguishes different senders', () => {
    const first = {
      messageId: 'one',
      messages: [
        { createdAt: '2026-09-22T10:00:01Z', senderId: 'a', content: '<p>Same &amp; content</p>' },
      ],
    };
    const second = {
      messageId: 'two',
      messages: [{ createdAt: '2026-09-22T10:00:59Z', userId: 'a', content: 'same & content' }],
    };
    const third = {
      messageId: 'three',
      messages: [{ createdAt: '2026-09-22T10:00:59Z', authorId: 'b', content: 'same & content' }],
    };
    expect(
      mergePortalSearchRows({ chats: [first, second, third] }).responses.chats.map(
        (item) => item.messageId
      )
    ).toEqual(['one', 'three']);
  });
  it('keeps explicit relationships and supported proposed identity distinct from provider selection', () => {
    const anonymous = {
      messageId: 'linked',
      providerName: 'Dr Fiction',
      messages: [{ content: 'The initial assessment was completed.', createdAt: '2026-09-22' }],
    };
    expect(adaptPortal({ ...base, row: { chats: [anonymous] } })).toEqual([]);
    for (const identity of [
      { opportunityId: profile.opportunityId },
      { clientName: profile.opportunityName },
      { proposedOpportunityId: profile.opportunityId, matchQuality: 'Likely' },
    ]) {
      const events = adaptPortal({ ...base, row: { chats: [{ ...anonymous, ...identity }] } });
      expect(events).toHaveLength(1);
      expect(events[0]?.matchQuality).toBe('matchQuality' in identity ? 'Likely' : 'Direct');
    }
    expect(
      adaptPortal({ ...base, row: { query: { mode: 'client_lookup' }, chats: [anonymous] } })
    ).toHaveLength(1);
  });
  it('does not leak another roster client’s denial into the target’s scheduled assessment', () => {
    const row = {
      mode: 'provider_lookup',
      chats: [
        {
          ...chat,
          messages: [
            {
              id: 'mixed',
              createdAt: '2026-09-22',
              content:
                'For Other Person authorization was denied. Regarding Synthetic Example, the initial assessment is scheduled for September 25.',
            },
          ],
        },
      ],
    };
    const events = adaptPortal({ ...base, row });
    expect(events).toMatchObject([
      { sourceRecordId: 'mixed', factType: 'ia-planned', plannedDate: '2026-09-25' },
    ]);
    expect(events.some((event) => event.factType?.includes('denial'))).toBe(false);
    expect(events[0]?.rawText).toContain('Other Person authorization was denied');
  });
  it('preserves sentence/prefix boundaries and avoids ambiguous first-name-only segmentation', () => {
    expect(
      targetPortalSegments(
        'Other Person is waiting; as for Synthetic Example, the assessment is done. Other Person needs staffing.',
        profile
      )
    ).toEqual(['as for Synthetic Example, the assessment is done.']);
    expect(
      targetPortalSegments('Synthetic completed the assessment.', {
        ...profile,
        providerRoster: [
          ...profile.providerRoster,
          { opportunityId: 'third', opportunityName: 'Synthetic Alternative' },
        ],
      })
    ).toEqual([]);
    expect(targetPortalSegments('Synthetic completed the assessment.', profile)).toEqual([
      'Synthetic completed the assessment.',
    ]);
  });
  it('anchors a directly linked conversation on the newest nonempty message', () => {
    const row = {
      chats: [
        {
          ...chat,
          opportunityId: profile.opportunityId,
          messages: [
            { id: 'newest', createdAt: '2026-09-23', content },
            { id: 'older', createdAt: '2026-09-20', content: 'A prior update.' },
            { id: 'empty', createdAt: '2026-09-24', content: '<p></p>' },
          ],
        },
      ],
    };
    expect(adaptPortal({ ...base, row })).toMatchObject([
      { sourceRecordId: 'newest', eventDate: '2026-09-23' },
    ]);
  });
  it('preserves Date fallback and identity keys without asserting verified completion', () => {
    const events = adaptPortal({ ...base, row: { chats: [{ messages: [{ content }] }] } });
    expect(events[0]?.eventDate).toBe(asOf);
    expect(events[0]?.sourceRecordId).toBe('portal-chat');
    expect(events[0]?.matchedIdentities).toEqual([
      {
        opportunityId: profile.opportunityId,
        opportunityName: profile.opportunityName,
        provider: undefined,
        practice: undefined,
        matchQuality: 'Direct',
        portalConversationId: 'portal-chat',
      },
    ]);
    expect(events[0]?.milestoneDate).toBeNull();
  });
  it('respects empty-envelope precedence and blocked/missing rows', () => {
    expect(adaptPortal({ ...base, row: { blocked: true, chats: [chat] } })).toEqual([]);
    expect(adaptPortal({ ...base, row: null })).toEqual([]);
    expect(adaptPortal({ ...base, row: { responses: { chats: [] }, chats: [chat] } })).toEqual([]);
    expect(mergePortalSearchRows([[{ chats: [chat] }], null]).responses.chats).toHaveLength(1);
  });
});
