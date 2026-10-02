import { describe, expect, it } from 'vitest';

import { sha256Json } from './json-fingerprint.js';
import { slackClientHeading } from './slack-evidence-anchors.js';
import { slackTargetSegment } from './slack-evidence-segments.js';

import {
  adaptSlack,
  buildIdentityProfile,
  dedupeEvidenceEvents,
  materializeSlackSearchCapture,
} from './index.js';
import type { SlackEvidenceRecord } from './index.js';

const profile = buildIdentityProfile({
  opportunityId: ['006', 'SYNTHETIC000001'].join(''),
  opportunityName: 'Synthetic Example',
  providerNames: ['Dr Fiction'],
  providerRoster: [
    { opportunityId: ['006', 'SYNTHETIC000001'].join(''), opportunityName: 'Synthetic Example' },
    { opportunityId: ['006', 'OTHER000000001'].join(''), opportunityName: 'Other Person' },
  ],
});
const base = {
  profile,
  gate: { processPosition: 'Initial assessment' },
  asOf: new Date('2026-09-24T12:00:00.123Z'),
};
const text = 'Synthetic Example completed the initial assessment.';
const record = {
  text,
  time: '2026-09-22T10:00:00Z',
  channelName: '#intake',
  from: 'Synthetic Operator',
};
const rendered = `1. #intake - Synthetic Operator: 2026-09-22 10:00:00 EDT\n${text}`;

describe('routine Slack evidence admission', () => {
  it('consumes an actual shared-provider capture projection without changing raw evidence or receipt hashes', () => {
    const plan = {
      scope: ['all-accessible'],
      targets: [{ opportunityId: profile.opportunityId, queries: [{ query: 'synthetic-query' }] }],
    };
    const capture = {
      version: 1,
      asOf: '2026-09-24T00:00:00Z',
      collectedAt: '2026-09-24T00:01:00Z',
      accessVerified: true,
      planHash: sha256Json(plan),
      scopeHash: sha256Json(plan.scope),
      pages: [
        {
          opportunityId: profile.opportunityId,
          query: 'synthetic-query',
          complete: true,
          pageNumber: 1,
          requestCursor: '',
          response: {
            ok: true,
            messages: {
              matches: [
                {
                  channel: { id: 'C123', name: '#intake' },
                  ts: '1767225600.001',
                  text,
                  reply_count: 0,
                  user_profile: { real_name: 'Synthetic Operator' },
                },
              ],
            },
            response_metadata: { next_cursor: '' },
          },
        },
      ],
    };
    const originalHash = sha256Json(capture);
    const [row] = materializeSlackSearchCapture({ plan, capture });
    const events = dedupeEvidenceEvents(adaptSlack({ ...base, row }));
    expect(events).toMatchObject([
      {
        source: 'Slack',
        sourceRecordId: 'slack:C123:1767225600.001',
        factType: 'ia-completed',
        matchedIdentities: [{ channel: '#intake', author: 'Synthetic Operator' }],
      },
    ]);
    expect(events[0]?.milestoneDate).toBeNull();
    expect(sha256Json(capture)).toBe(originalHash);
  });
  it.each([
    { messages: [{ text: rendered }] },
    { messages: [{ text: JSON.stringify({ results: rendered }) }] },
    { searches: [{ pages: [{ resultPreview: rendered }] }] },
  ])('retains the older rendered search input and exact source ID', (row) => {
    expect(adaptSlack({ ...base, row })).toMatchObject([
      {
        sourceRecordId: `slack-search:${profile.opportunityId}:1`,
        eventDate: '2026-09-22T10:00:00-04:00',
        factType: 'ia-completed',
      },
    ]);
  });
  it.each<Partial<SlackEvidenceRecord>>([
    { from: 'Salesforce for Slack' },
    { bot_profile: { name: 'Salesforce for Slack' }, from: null },
    { channelName: 'opportunity-stage-updates' },
    { channelName: ' ', channel: { name: '#opportunity-stage-updates' } },
  ])('excludes automated stage posts across supported metadata shapes', (metadata) => {
    expect(adaptSlack({ ...base, row: { records: [{ ...record, ...metadata }] } })).toEqual([]);
  });
  it('retains exact structured versus rendered channel exclusion semantics', () => {
    expect(
      adaptSlack({
        ...base,
        row: { records: [{ ...record, channelName: '#opportunity-stage-updates-extra' }] },
      })
    ).toHaveLength(1);
    expect(
      adaptSlack({
        ...base,
        row: {
          messages: [{ text: rendered.replace('#intake', '#opportunity-stage-updates-extra') }],
        },
      })
    ).toEqual([]);
    const events = adaptSlack({
      ...base,
      row: {
        records: [
          {
            ...record,
            channelName: '',
            channel: { name: ' #intake ' },
            from: 42,
            author: '',
            username: ' Synthetic User ',
          },
        ],
      },
    });
    expect(events[0]?.matchedIdentities[0]).toMatchObject({
      channel: ' #intake ',
      author: ' Synthetic User ',
    });
  });
  it('keeps denial context supporting-only and historical hold chronology distinct from latest thread time', () => {
    const denial = adaptSlack({
      ...base,
      gate: { processPosition: 'Treatment authorization' },
      row: {
        records: [
          {
            ...record,
            text: 'Synthetic Example authorization denied because overlapping authorization needs resolution.',
          },
        ],
      },
    });
    expect(denial).toMatchObject([{ factType: 'auth-denial-reason', supportingOnly: true }]);
    const hold = adaptSlack({
      ...base,
      row: {
        records: [
          {
            ...record,
            text: 'Synthetic Example -',
            threadText:
              '2026-09-20 10:00:00 EDT\nThe provider put services on hold.\n2026-09-23 09:00:00 EDT\nNo further update.',
          },
        ],
      },
    });
    expect(hold).toMatchObject([
      { factType: 'provider-hold', eventDate: '2026-09-20T10:00:00-04:00' },
    ]);
  });
  it('stops at competitor and explicit foreign-record boundaries in threads', () => {
    const value = `${text}\n2026-09-22 10:00:00 EDT\nA follow-up.\nOther Person authorization denied.\nDo not admit this.`;
    expect(slackTargetSegment(value, profile, true).text).toBe(
      `${text}\n2026-09-22 10:00:00 EDT\nA follow-up.`
    );
    expect(
      slackTargetSegment(
        `${text}\n${['006', 'FOREIGN00000001'].join('')}\nAnother update.`,
        profile,
        true
      ).text
    ).toBe(text);
  });
  it('preserves contextual assumed roster matches and weak absence', () => {
    const matched = slackTargetSegment(
      'Dr Fiction: Synthetic assessment scheduled for September 25.',
      profile
    );
    expect(matched).toMatchObject({
      quality: 'Likely',
      assumedIdentityMatch: true,
      matchedAs: 'synthetic',
    });
    expect(slackTargetSegment('Unrelated note.', profile)).toEqual({ text: '', quality: 'Weak' });
    expect(slackTargetSegment('Synthetic assessment scheduled.', profile).quality).toBe('Weak');
  });
  it('retains bounded heading recognition and numbered/reply boundaries', () => {
    for (const heading of [
      'Other Person - note',
      'Other Middle Person: note',
      'Other Middle Last Person — note',
      'Other O’Person – note',
    ])
      expect(slackClientHeading(heading)).toBe(true);
    for (const heading of ['Other - note', 'Other One Two Three Four - note', 'other Person: note'])
      expect(slackClientHeading(heading)).toBe(false);
    for (const boundary of ['Reply 1 of 2', '--- Reply 1 of 2', '1. item']) {
      const segment = slackTargetSegment(
        `Other Person - unrelated\n${text}\n${boundary}\nAnother update.`,
        profile
      );
      expect(segment.text).toBe(text);
    }
  });
  it('preserves rendered-path deduplication and structured-only output order', () => {
    const row = {
      records: [
        { ...record, messageTs: '1', channelId: 'C123' },
        { ...record, messageTs: '1', channelId: 'C123' },
      ],
    };
    expect(adaptSlack({ ...base, row })).toHaveLength(2);
    expect(
      adaptSlack({ ...base, row: { ...row, messages: [{ text: 'Not a supported header.' }] } })
    ).toHaveLength(1);
  });
  it('does not infer missing timestamps and returns no evidence for blocked or absent inputs', () => {
    expect(
      adaptSlack({ ...base, row: { records: [{ text, time: 'invalid' }, { text }, null] } })
    ).toEqual([]);
    expect(adaptSlack({ ...base, row: { blocked: true, records: [record] } })).toEqual([]);
    expect(adaptSlack({ ...base, row: undefined })).toEqual([]);
    expect(
      adaptSlack({
        ...base,
        row: {
          messages: [
            { text: 'null' },
            { text: '42' },
            { text: JSON.stringify({ results: { nontext: true } }) },
          ],
        },
      })
    ).toEqual([]);
  });
});
