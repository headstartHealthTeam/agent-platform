import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { firefliesFindingEvent, firefliesPacketInput } from './fireflies-evidence-common.js';
import { adaptFirefliesWithPrecomputedAI } from './fireflies-evidence-precomputed.js';
import { buildTranscriptInterpretationPacket } from './interpretation-packet.js';
import { createNoteAdjudicator } from './note-adjudication.js';
import { portalReportMessages } from './portal-report-messages.js';
import { buildReportBillingRows } from './report-billing.js';
import { reportConversationDisplay } from './report-conversation-display.js';
import { cutoff, id, reportEvaluationFixture } from './report-evaluation.test-support.js';
import { buildReportIdentityProfiles } from './report-identity.js';
import { evaluateReportInterpretation } from './report-interpretation.js';
import {
  indexReportStructuredSources,
  prepareReportOpportunity,
} from './report-opportunity-context.js';
import { prepareReportSavedEvidence } from './report-saved-evidence.js';
import { decodeSavedFirefliesEvidence } from './saved-fireflies-evidence.js';
import { decodeSavedPortalReportInput } from './saved-portal-report.js';
import { decodeSavedPortalRequestInventory } from './saved-portal-requests.js';
import { decodeSavedSlackEvidence, decodeSavedSlackExecution } from './saved-slack-evidence.js';
import { loadSavedReportSources } from './saved-source-context.js';
import { decodeSavedSupplementalEvidence } from './saved-supplemental-evidence.js';
import { adaptSlack } from './slack-evidence.js';

describe('saved per-Opportunity report evidence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(cutoff));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('composes actual retained collection, identity, loader, interpretation and display producers', async () => {
    const collection = await reportEvaluationFixture();
    const profiles = buildReportIdentityProfiles(collection, cutoff);
    const opp = collection.opportunities[0];
    const profile = profiles[0];
    if (!opp || !profile) throw new Error('Synthetic context missing');
    const runAt = new Date(cutoff);
    const portalChat = {
      id: 'chat',
      content: 'Assessment appointment is scheduled for September 30.',
      createdAt: '2026-09-23',
      custom: { kept: true },
    };
    const meeting = {
      id: 'unused',
      fullTranscript: 'Unrelated general discussion.',
      metadata: { kept: true },
    };
    const gmailEvent = {
      opportunityId: id,
      text: 'Assessment scheduled for September 30.',
      date: '2026-09-23',
      custom: { kept: true },
    };
    const files = new Map<string, unknown>([
      [
        'portal_rows.json',
        [
          {
            opportunityId: id,
            responses: { chats: [portalChat] },
            chats: { unused: true },
            searchedAt: cutoff,
          },
        ],
      ],
      [
        'fireflies_rows.json',
        [
          {
            opportunityName: opp.Name,
            searched: true,
            searchedAt: cutoff,
            meetings: [meeting],
            searchCoverage: { status: 'Complete' },
          },
        ],
      ],
      [
        'slack_rows.json',
        [
          {
            opportunityName: opp.Name,
            searchedAt: cutoff,
            records: [
              { time: null, channel: 47 },
              { text: '', time: '2026-09-23', bot_profile: 47 },
            ],
            messages: [{}, { text: null }],
            paginationComplete: true,
            threadExpansionComplete: true,
          },
        ],
      ],
      [
        'gmail_rows.json',
        [
          {
            opportunityName: opp.Name,
            searchedAt: cutoff,
            events: [gmailEvent],
            messages: { unused: true },
          },
        ],
      ],
      ['portal_auth_request_inventory.json', { collectedAt: cutoff, complete: true, rows: [] }],
      [
        'slack_full_sweep_execution.json',
        {
          cohortComplete: true,
          expectedOpportunities: 2,
          opportunities: 2,
          threadExpansionComplete: true,
        },
      ],
    ]);
    const before = structuredClone([...files]);
    const sources = await loadSavedReportSources({
      collection,
      profiles,
      runId: 'synthetic',
      runAt,
      artifacts: {
        read: (name) => Promise.resolve(files.get(name)),
        write: () => Promise.resolve(),
        readText: () => Promise.resolve(undefined),
        boundedProof: () => Promise.resolve(null),
        cacheProof: () => Promise.resolve(null),
      },
    });
    const context = prepareReportOpportunity({
      opportunity: opp,
      identity: profile,
      index: indexReportStructuredSources(collection),
      ledgerRows: [],
      runAt,
    });
    const billing = buildReportBillingRows(collection, profiles, runAt);
    const saved = prepareReportSavedEvidence(
      context,
      sources,
      new Map(billing.map((row) => [row.opportunityId, row])),
      collection.opportunities.length
    );
    expect(saved.portalSummary.checked).toBe(true);
    expect(saved.portalSummary.messageCount).toBe(1);
    expect(saved.fireflies?.meetings[0]).toBe(meeting);
    expect(saved.gmail.events[0]).toBe(gmailEvent);
    expect(saved.slackCoverage.status).toBe('Complete');
    expect(saved.slack?.records).toHaveLength(2);
    expect(saved.slack?.events).toHaveLength(2);
    const interpretation = await evaluateReportInterpretation({
      context,
      runAt,
      identities: new Map(profiles.map((row) => [row.opportunityId, row])),
      cohortNames: profiles.map((row) => row.opportunityName),
      noteAdjudicator: createNoteAdjudicator({ runId: 'synthetic', asOf: cutoff }),
      requested: true,
      execution: { apiEnabled: false },
      precomputed: { interpretations: [] },
      firefliesRow: saved.fireflies,
      slackRow: saved.slack?.evidence,
      portalInput: saved.portal.input,
      billingEvents: saved.billing?.events ?? [],
      gmailEvents: saved.gmail.events,
      fileEvents: saved.files.events,
    });
    expect(interpretation.ai.failures).toEqual([]);
    expect(interpretation.interpretedSlackEvents).toEqual([]);
    const display = reportConversationDisplay(
      saved.fireflies,
      interpretation.freshness,
      saved.billing
    );
    expect(display.firefliesWasSearched).toBe(true);
    expect(display.firefliesResult).toBe('Searched - Not Found: no stage-relevant client match.');
    expect([...files]).toEqual(before);
  });
  it('selects report Portal envelopes by array presence without inspecting unused fallbacks', () => {
    const chat = { id: 'one', content: 'A scheduled appointment.', messages: { ignored: true } };
    const inputs = [
      { chats: [chat], data: { chats: 42 } },
      { chats: 'ignored', data: { chats: [chat] }, structuredContent: { data: { chats: 42 } } },
      { structuredContent: { data: { chats: [chat] } } },
      [{ chats: [chat] }],
    ];
    for (const input of inputs)
      expect(portalReportMessages(decodeSavedPortalReportInput(input))).toMatchObject([
        { id: 'one', content: 'A scheduled appointment.' },
      ]);
    expect(
      portalReportMessages(decodeSavedPortalReportInput({ chats: [], data: { chats: [chat] } }))
    ).toEqual([]);
    expect(decodeSavedPortalReportInput(false)).toEqual({ chats: [] });
    expect(decodeSavedPortalRequestInventory([])).toEqual({});
    expect(decodeSavedPortalRequestInventory(null)).toBeNull();
  });
  it('keeps empty preferred supplemental arrays, counts blocked Slack without opening its content, and retains metadata', () => {
    expect(
      decodeSavedSupplementalEvidence({ events: [], messages: { unused: true } }, 'messages').events
    ).toEqual([]);
    const item = { text: 'Synthetic', arbitrary: { retained: true } };
    expect(
      decodeSavedSupplementalEvidence({ events: false, files: [item] }, 'files').events[0]
    ).toBe(item);
    const blocked = decodeSavedSlackEvidence({
      blocked: true,
      records: [{ text: 42 }],
      messages: [null],
      events: [],
      searches: 'unused',
    });
    expect(blocked?.records).toHaveLength(1);
    expect(blocked?.events).toHaveLength(1);
    expect(
      adaptSlack({
        row: blocked?.evidence,
        profile: { opportunityId: id, opportunityName: 'Synthetic' },
        asOf: cutoff,
      })
    ).toEqual([]);
    expect(decodeSavedSlackExecution(null)).toBeNull();
    expect(decodeSavedSlackEvidence(undefined)).toBeUndefined();
    expect(decodeSavedFirefliesEvidence(undefined)).toBeUndefined();
  });
  it('does not require a meeting date before admission or invent one in a packet', () => {
    const row = decodeSavedFirefliesEvidence({
      meetings: [{ id: 'undated', fullTranscript: 'Unrelated discussion.' }],
    });
    const profile = { opportunityId: id, opportunityName: 'Synthetic Alpha' };
    expect(adaptFirefliesWithPrecomputedAI({ row, profile, asOf: cutoff }).events).toEqual([]);
    const meeting = row?.meetings[0];
    if (!meeting) throw new Error('Synthetic meeting missing');
    const segment = {
      start: 0,
      end: 1,
      quality: 'Direct',
      assumedIdentityMatch: false,
      collectiveRosterMatch: false,
      assumedIdentityNote: '',
      matchedAs: 'Synthetic Alpha',
      matchScore: 100,
      text: 'Synthetic Alpha completed assessment.',
      rawText: 'Synthetic Alpha completed assessment.',
    } as const;
    const context = {
      input: { row, profile, asOf: cutoff },
      meeting,
      segment,
      sourceRecordId: 'undated:1',
    };
    expect(
      buildTranscriptInterpretationPacket(firefliesPacketInput(context)).source.eventDate
    ).toBeUndefined();
    expect(() =>
      firefliesFindingEvent(context, {
        synthesizedFact: segment.text,
        eventDate: undefined,
        matchQuality: 'Direct',
        supportSpan: segment.text,
        substantive: true,
        relationship: 'Supports',
        gateImpact: '',
        actionOwner: '',
        actionType: '',
        recommendedAction: '',
        milestoneDate: null,
        followUpDate: null,
        semanticsSupplied: false,
        category: null,
        issueKey: null,
        factType: null,
        milestoneKind: null,
        matchedOpportunityId: id,
      })
    ).toThrow('EvidenceEvent missing eventDate');
  });
});
