import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adaptPortal } from './portal-evidence.js';
import { assembleReportAuthoritativeEvidence } from './report-authoritative-evidence.js';
import { cutoff, id, reportEvaluationFixture } from './report-evaluation.test-support.js';
import { buildReportIdentityProfiles } from './report-identity.js';
import {
  indexReportStructuredSources,
  prepareReportOpportunity,
} from './report-opportunity-context.js';
import { decodeSavedPortalEvidence } from './saved-portal-evidence.js';
import { loadSavedReportSources } from './saved-source-context.js';

const chat = {
  messageId: 'chat',
  opportunityId: id,
  custom: { retained: true },
  messages: [
    {
      id: 'message',
      createdAt: '2026-09-23',
      content: 'The assessment is scheduled for September 30.',
      metadata: { retained: true },
    },
  ],
};
async function fixture(): Promise<{
  collection: Awaited<ReturnType<typeof reportEvaluationFixture>>;
  profiles: ReturnType<typeof buildReportIdentityProfiles>;
  context: ReturnType<typeof prepareReportOpportunity>;
}> {
  const collection = await reportEvaluationFixture();
  const profiles = buildReportIdentityProfiles(collection, cutoff);
  const identity = profiles[0];
  const opportunity = collection.opportunities[0];
  if (!identity || !opportunity) throw new Error('Synthetic fixture missing');
  return {
    collection,
    profiles,
    context: prepareReportOpportunity({
      opportunity,
      identity,
      index: indexReportStructuredSources(collection),
      ledgerRows: [],
      runAt: new Date(cutoff),
    }),
  };
}
describe('saved Portal evidence consumer boundary', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(cutoff));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('composes the actual saved loader and authoritative assembly without losing raw metadata', async () => {
    const { collection, profiles, context } = await fixture();
    const raw = {
      opportunityId: id,
      responses: { chats: [chat] },
      chats: { unused: true },
      custom: { keep: true },
    };
    const sources = await loadSavedReportSources({
      collection,
      profiles,
      runId: 'synthetic',
      runAt: new Date(cutoff),
      artifacts: {
        read: (name) => Promise.resolve(name === 'portal_rows.json' ? [raw] : undefined),
        write: () => Promise.resolve(),
        readText: () => Promise.resolve(undefined),
        boundedProof: () => Promise.resolve(null),
        cacheProof: () => Promise.resolve(null),
      },
    });
    const selected =
      sources.portal.byOpportunity.get(context.opp.Id) ??
      sources.portal.byOpportunity.get(context.opp.Name);
    const decoded = decodeSavedPortalEvidence(selected);
    expect(selected).toBe(raw);
    const gate = { gateCategory: 'intakeScheduling' };
    const events = assembleReportAuthoritativeEvidence({
      context,
      runAt: new Date(cutoff),
      gate,
      reviewedNoteIds: new Set(),
      interpretedNoteEvents: [],
      portalRequests: [],
      billing: undefined,
      portal: decoded,
      firefliesEvents: [],
      slackEvents: [],
    });
    const expected = adaptPortal({
      row: { responses: { chats: [chat] } },
      profile: context.identity,
      gate,
      asOf: new Date(cutoff),
    });
    expect(expected.length).toBeGreaterThan(0);
    expect(events.filter((event) => event.source === 'Portal')).toEqual(expected);
    expect(raw.responses.chats[0]).toBe(chat);
    expect(raw.chats).toEqual({ unused: true });
  });
  it('preserves all supported envelope selections, empty precedence, nested rows and blocked behavior', async () => {
    const { context } = await fixture();
    const base = {
      profile: context.identity,
      gate: { gateCategory: 'intakeScheduling' },
      asOf: new Date(cutoff),
    };
    const shapes = [
      { chats: [chat] },
      { responses: { chats: [chat] } },
      { responses: { data: { chats: [chat] } } },
      { data: { chats: [chat] } },
      { structuredContent: { data: { chats: [chat] } } },
      { responses: { chats: [] }, chats: [chat] },
      { blocked: true, chats: [chat] },
      [{ blocked: true, chats: [chat] }],
      [[{ chats: [chat] }]],
      null,
      undefined,
    ];
    for (const row of shapes) {
      expect(adaptPortal({ ...base, row: decodeSavedPortalEvidence(row) })).toEqual(
        adaptPortal({ ...base, row })
      );
    }
    expect(() =>
      decodeSavedPortalEvidence({ responses: { chats: 'invalid selected payload' } })
    ).toThrow();
    expect(decodeSavedPortalEvidence({ blocked: true, chats: 'unopened' })).toEqual({
      blocked: true,
    });
  });
});
