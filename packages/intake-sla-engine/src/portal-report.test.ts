import { describe, expect, it } from 'vitest';

import { buildIdentityProfile } from './identity-profile.js';
import { buildPortalCollectionPlan } from './portal-collection-plan.js';
import { materializePortalRows } from './portal-collection.js';
import { portalReportMessages } from './portal-report-messages.js';
import type { PortalReportResponses } from './portal-report-types.js';
import { noPortalData, parsePortalChats } from './portal-report.js';

const chat = {
  messageId: 'chat',
  providerName: 'Synthetic Provider',
  channel: 'one',
  messages: [
    {
      id: 'message',
      content: 'Initial assessment appointment scheduled.',
      createdAt: '2026-09-22',
    },
  ],
};
describe('Portal report summary', () => {
  it.each<PortalReportResponses>([
    { chats: [chat] },
    { data: { chats: [chat] } },
    { structuredContent: { data: { chats: [chat] } } },
    [null, [{ chats: [chat] }]],
  ])('accepts the approved capture shapes without changing raw messages', (responses) => {
    const before = structuredClone(responses);
    const result = parsePortalChats({ opportunity: { StageName: 'IA Scheduled' }, responses });
    expect(result).toEqual({
      result:
        'Stage-relevant evidence found; freshness is evaluated from the message date. 2026-09-22: Initial assessment appointment scheduled.',
      quality: 'Likely',
      promotableText: 'Initial assessment appointment scheduled.',
      checked: true,
      messageCount: 1,
      substantiveCount: 1,
      actionableCount: 1,
      latestSubstantiveAt: '2026-09-22',
      latestSubstantiveText: 'Initial assessment appointment scheduled.',
      latestRelevantAt: '2026-09-22',
      latestRelevantText: 'Initial assessment appointment scheduled.',
      channelAttributionReliable: true,
      gap: '',
    });
    expect(responses).toEqual(before);
  });
  it('distinguishes confirmed empty, unchecked and system-only source results', () => {
    expect(parsePortalChats({})).toMatchObject({
      result: 'Searched: no client-linked portal chat found.',
      quality: 'Not found',
      checked: true,
      messageCount: 0,
    });
    expect(noPortalData()).toEqual({
      result: 'Not checked: no portal enrichment input supplied to the sheet builder.',
      quality: 'Not checked',
      promotableText: '',
      checked: false,
      messageCount: 0,
      substantiveCount: 0,
      actionableCount: 0,
      channelAttributionReliable: false,
      gap: 'Portal chats not supplied to the local sheet builder',
    });
    for (const content of [
      'thanks',
      'okay!',
      "Welcome! you've been matched with a provider",
      'Headstart is here to help',
    ]) {
      expect(parsePortalChats({ responses: { chats: [{ content }] } })).toMatchObject({
        result: 'Found 1 deduped client-linked message; system or non-diagnostic only.',
        quality: 'Weak',
        checked: true,
        messageCount: 1,
        substantiveCount: 0,
      });
    }
  });
  it('retains the latest duplicate, ignores conflicting channel attribution and sorts invalid dates last', () => {
    const responses = {
      chats: [
        chat,
        {
          ...chat,
          channel: 'two',
          messages: [
            {
              ...chat.messages[0],
              id: 'message',
              content: 'Appointment rescheduled.',
              createdAt: '2026-09-23',
            },
          ],
        },
        { id: 'older', latestMessagePreview: 'Historical provider context.', createdAt: 'invalid' },
      ],
    };
    const result = parsePortalChats({ responses });
    expect(result).toMatchObject({
      messageCount: 2,
      latestRelevantAt: '2026-09-23',
      latestRelevantText: 'Appointment rescheduled.',
      channelAttributionReliable: false,
      gap: 'Portal messages were deduplicated across conflicting channel labels; channel attribution was ignored.',
    });
    expect(result.result).toContain(
      '2026-09-23: Appointment rescheduled. | invalid: Historical provider context.'
    );
  });
  it('uses original fallback content, identity and patient-sender precedence and decoding order', () => {
    const provider = { name: 'Synthetic Provider' };
    const rows = portalReportMessages({
      chats: [
        {
          id: 'fallback-id',
          content: '<p>Family &amp;apos; &apos; &quot; &nbsp; &amp; update</p>',
          createdAt: '2026-09-21',
          provider,
          patientSender: true,
          messages: [{ isPatientSender: false, content: '' }],
        },
      ],
    });
    expect(rows).toEqual([
      {
        id: 'fallback-id',
        content: 'Family &apos; \' " & update',
        date: '2026-09-21',
        channel: '',
        provider,
        patientSender: false,
        channelConflict: false,
      },
    ]);
    expect(rows[0]?.provider).toBe(provider);
    expect(
      portalReportMessages({ chats: [{ latestMessagePreview: 'Preview', messages: [] }] })[0]
        ?.content
    ).toBe('Preview');
  });
  it.each([
    ['Insurance Verification', 'Insurance approval pending'],
    ['IA Requested', 'Authorization pending'],
    ['TA Requested', 'Payer review'],
    ['Treatment Plan In-review', 'Treatment plan signature'],
    ['97151 Completed', 'Assessment report'],
    ['RBT Requested', 'Candidate interview'],
    ['TA Approved - Pending Scheduling', 'First day confirmed'],
  ])('preserves existing stage-family relevance for %s', (stage, content) => {
    expect(
      parsePortalChats({ opportunity: { StageName: stage }, responses: { chats: [{ content }] } })
        .actionableCount
    ).toBe(1);
    expect(
      parsePortalChats({
        opportunity: { StageName: '' },
        sla: { Stage__c: stage },
        responses: { chats: [{ content }] },
      }).actionableCount
    ).toBe(1);
  });
  it('keeps substantive but irrelevant context out of promotable text', () => {
    const result = parsePortalChats({
      opportunity: { StageName: 'Insurance Verification' },
      responses: { chats: [{ content: 'Provider calendar discussion.' }] },
    });
    expect(result).toMatchObject({
      quality: 'Weak',
      substantiveCount: 1,
      actionableCount: 0,
      promotableText: '',
    });
    expect(result.result).toBe(
      'Historical/supporting context only; not promoted into blocker. undated: Provider calendar discussion.'
    );
  });
  it('composes materialized collection rows as the approved builder supplies them', () => {
    const identity = buildIdentityProfile({
      opportunityId: 'synthetic',
      opportunityName: 'Synthetic Example',
    });
    const plan = buildPortalCollectionPlan([identity]);
    const key = plan.requests[0]?.requestKey;
    if (!key) throw new Error('Synthetic plan must contain a client request');
    const rows = materializePortalRows({
      profiles: [identity],
      plan,
      inventory: [
        {
          requestKey: key,
          status: 'Complete',
          chats: [{ ...chat, opportunityId: identity.opportunityId }],
        },
      ],
    });
    const result = parsePortalChats({ responses: rows });
    expect(result).toMatchObject({
      checked: true,
      actionableCount: 1,
      latestRelevantAt: '2026-09-22',
    });
  });
});
