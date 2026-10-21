import { describe, expect, it } from 'vitest';

import { buildIdentityProfile } from './identity-profile.js';
import { bindPortalRequestKeys, evaluatePortalSentinel } from './portal-collection-inventory.js';
import { buildPortalCollectionPlan } from './portal-collection-plan.js';
import type {
  PortalCollectionProfile,
  PortalInventoryExecution,
} from './portal-collection-types.js';
import { materializePortalRows } from './portal-collection.js';
import { adaptPortal } from './portal-evidence.js';

const profile = {
  ...buildIdentityProfile({
    opportunityId: 'synthetic-opportunity',
    opportunityName: 'Synthetic Example',
    stage: 'IA Scheduled',
  }),
  searchWindow: { fromDate: '2026-09-01', toDate: '2026-09-24' },
} satisfies PortalCollectionProfile;
const plan = {
  sentinelRequestKey: 'provider:synthetic',
  requests: [
    {
      requestKey: 'provider:synthetic',
      requestType: 'Provider',
      opportunityIds: [profile.opportunityId],
    },
    {
      requestKey: 'client:synthetic',
      requestType: 'Client',
      opportunityIds: [profile.opportunityId],
    },
  ],
};
function inventory(): PortalInventoryExecution[] {
  return [
    {
      requestKey: 'provider:synthetic',
      status: 'Complete',
      paginationComplete: true,
      pages: '2',
      chats: [
        {
          id: 'chat-1',
          opportunityId: profile.opportunityId,
          createdAt: '2026-09-20',
          messages: [
            {
              content: 'Synthetic Example completed the initial assessment.',
              createdAt: '2026-09-20',
            },
          ],
        },
        {
          id: 'chat-2',
          opportunityId: profile.opportunityId,
          createdAt: '2026-09-22',
          messages: [{ content: 'Synthetic Example follow-up.', createdAt: '2026-09-22' }],
        },
      ],
    },
    { requestKey: 'client:synthetic', status: 'Complete', paginationComplete: true, chats: [] },
  ];
}
describe('Portal collection and frozen materialization', () => {
  it('plans real identity profiles with shared provider requests and client windows', () => {
    const identity = buildIdentityProfile({
      opportunityId: profile.opportunityId,
      opportunityName: profile.opportunityName,
      providerRoles: [{ role: 'Rendering', name: 'Dr Fiction', portalProviderId: 'provider-id' }],
    });
    const profiles = [
      {
        ...identity,
        searchWindow: profile.searchWindow,
        providerRoster: [{ opportunityId: 'peer', opportunityName: 'Original Peer' }],
      },
      {
        ...identity,
        opportunityId: 'other',
        opportunityName: 'Other Example',
        knownNameVariants: [' Other ', 'Other'],
        searchWindow: { fromDate: '2026-08-01', toDate: '2026-09-25' },
        providerRoster: [{ opportunityId: 'peer', opportunityName: 'Updated Peer' }],
      },
    ];
    const result = buildPortalCollectionPlan(profiles);
    expect(result).toMatchObject({
      opportunityCount: 2,
      providerRequestCount: 1,
      clientRequestCount: 2,
      sentinelRequestKey: 'provider-id:provider-id',
    });
    expect(result.requests[0]).toMatchObject({
      opportunityIds: [profile.opportunityId, 'other'],
      roster: [{ opportunityId: 'peer', opportunityName: 'Updated Peer' }],
      createdFrom: '2026-08-01',
      createdTo: '2026-09-25',
      limit: 50,
      paginate: true,
    });
    expect(result.requests[2]?.clientNames).toEqual(['Other Example', 'Other']);
    expect(profiles[0]?.providerRoster[0]?.opportunityName).toBe('Original Peer');
  });
  it('uses normalized provider-name fallback, skips unidentified roles and prefers an ID sentinel', () => {
    const result = buildPortalCollectionPlan([
      {
        ...profile,
        providerRoles: [
          { primaryName: 'Dóctor Fiction' },
          { names: ['Doctor Fiction'] },
          {},
          { primaryName: '', names: ['Backup'], portalProviderIds: [' id ', 'id'] },
        ],
      },
    ]);
    expect(result.providerRequestCount).toBe(2);
    expect(result.sentinelRequestKey).toBe('provider-id:id');
    expect(result.requests.map((row) => row.requestKey)).toEqual([
      'provider-name:doctor fiction',
      'provider-id:id',
      `client:${profile.opportunityId}`,
    ]);
    expect(buildPortalCollectionPlan().sentinelRequestKey).toBeNull();
    const noWindow = buildPortalCollectionPlan([
      { ...profile, searchWindow: null, providerRoles: [{ names: ['Only'] }] },
    ]);
    expect(noWindow.requests[0]?.createdFrom).toBeUndefined();
    expect(noWindow.sentinelRequestKey).toBe('provider-name:only');
  });
  it('binds each child key idempotently without mutating captures or dropping metadata', () => {
    const raw = inventory();
    const before = structuredClone(raw);
    const derived = bindPortalRequestKeys({ plan, inventory: raw });
    expect(raw).toEqual(before);
    expect(derived[0]?.chats.every((chat) => chat.requestKey === 'provider:synthetic')).toBe(true);
    expect(derived[1]?.chats).toEqual([]);
    expect(bindPortalRequestKeys({ plan, inventory: derived })).toEqual(derived);
    expect(derived[0]?.pages).toBe('2');
    expect(bindPortalRequestKeys()).toEqual([]);
  });
  it('rejects malformed provenance with the approved error rather than weakening completeness', () => {
    for (const input of [
      { plan, inventory: [{ requestKey: 'unknown' }] },
      { plan, inventory: [{}, null] },
      { plan, inventory: [null] },
      {
        plan,
        inventory: [{ requestKey: 'provider:synthetic' }, { requestKey: 'provider:synthetic' }],
      },
      { plan, inventory: [{ requestKey: 'provider:synthetic', status: 'Complete' }] },
      { plan, inventory: [{ requestKey: 'provider:synthetic', chats: {} }] },
      ...[null, false, [], { requestKey: 'client:synthetic' }].map((chat) => ({
        plan,
        inventory: [{ requestKey: 'provider:synthetic', chats: [chat] }],
      })),
      { plan: { requests: [{ requestKey: '' }] } },
      { plan: { requests: [{ requestKey: 4 }] } },
      { plan: { requests: [plan.requests[0], plan.requests[0]] } },
    ]) {
      // Exercise the public JavaScript boundary with deliberately malformed values.
      expect(() => {
        Reflect.apply(bindPortalRequestKeys, undefined, [input]);
      }).toThrow(/Portal/);
      expect(() => {
        Reflect.apply(evaluatePortalSentinel, undefined, [input]);
      }).toThrow(/Portal/);
    }
  });
  it('accepts a fresh nonempty fallback control when the planned provider is legitimately empty', () => {
    const raw = inventory();
    const fallback = [
      { requestKey: 'provider:synthetic', status: 'Complete', chats: [] },
      { requestKey: 'client:synthetic', status: 'Complete', chats: raw[0]?.chats ?? [] },
    ];
    expect(evaluatePortalSentinel({ plan, inventory: fallback })).toEqual({
      plannedSentinelRequestKey: 'provider:synthetic',
      sentinelRequestKey: 'client:synthetic',
      plannedSentinelFound: false,
      sentinelFound: true,
      fallbackUsed: true,
      recoveredRecords: 2,
    });
    expect(evaluatePortalSentinel({ plan, inventory: raw }).fallbackUsed).toBe(false);
    expect(
      evaluatePortalSentinel({
        plan,
        inventory: fallback.map((row) => ({ ...row, paginationComplete: false })),
      }).sentinelFound
    ).toBe(false);
    expect(evaluatePortalSentinel()).toMatchObject({
      sentinelFound: false,
      sentinelRequestKey: null,
      recoveredRecords: 0,
    });
  });
  it('materializes direct chats, exact counts and the report adapter without inventing reasons', () => {
    const rows = materializePortalRows({
      profiles: [profile],
      plan,
      inventory: inventory(),
      searchedAt: '2026-09-24',
    });
    expect(rows[0]).toMatchObject({
      blocked: false,
      searched: true,
      recordsScanned: 2,
      recordsRetrieved: 2,
      searchCoverage: { pages: 2, completedRequests: 2, plannedRequests: 2 },
    });
    expect(rows[0]?.chats.every((chat) => chat.requestKey === 'provider:synthetic')).toBe(true);
    expect(Object.hasOwn(rows[0]?.chats[0] ?? {}, 'matchReasons')).toBe(true);
    expect(rows[0]?.chats[0]?.matchReasons).toBeUndefined();
    expect(
      adaptPortal({
        row: rows,
        profile,
        gate: { processPosition: 'Initial assessment' },
        asOf: '2026-09-24',
      }).length
    ).toBeGreaterThan(0);
    expect(materializePortalRows()).toEqual([]);
  });
  it('retains only chat dates within the frozen cutoff, preserving existing invalid/missing-date behavior', () => {
    const chats = ['2026-09-20', '2026-09-22', 'invalid', ''].map((createdAt, index) => ({
      createdAt,
      opportunityId: profile.opportunityId,
      messages: [{ content: `Synthetic Example update ${String(index)}` }],
    }));
    const input = {
      profiles: [profile],
      plan,
      inventory: [
        { requestKey: 'provider:synthetic', status: 'Complete', chats },
        { requestKey: 'client:synthetic', status: 'Complete', chats: [] },
      ],
      searchedAt: '2026-09-24',
      sourceCutoff: '2026-09-20',
    };
    expect(materializePortalRows(input)[0]?.recordsScanned).toBe(3);
    expect(materializePortalRows({ ...input, sourceCutoff: null })[0]?.recordsScanned).toBe(4);
    expect(materializePortalRows({ ...input, sourceCutoff: 'invalid' })[0]?.recordsScanned).toBe(4);
  });
  it('deduplicates by normalized provider/date/content, keeping the last row and first position', () => {
    const first = inventory()[0];
    const chat = first?.chats?.[0];
    const input = {
      profiles: [profile],
      plan,
      inventory: inventory(),
      baseRows: [
        {
          opportunityName: profile.opportunityName,
          responses: {
            chats: [
              {
                ...chat,
                channel: 'old',
                messages: [
                  { content: '<p>Synthetic Example completed the initial assessment.</p>' },
                ],
              },
            ],
          },
        },
      ],
    };
    const rows = materializePortalRows(input);
    expect(rows[0]?.recordsScanned).toBe(2);
    expect(rows[0]?.chats[0]?.channel).toBeUndefined();
    expect(rows[0]?.chats[0]?.id).toBe('chat-1');
  });
  it('keeps missing and incomplete requests row-local and does not convert them to valid empties', () => {
    const raw = inventory().slice(0, 1);
    const partial = materializePortalRows({ profiles: [profile], plan, inventory: raw })[0];
    expect(partial).toMatchObject({
      blocked: true,
      searched: false,
      recordsRetrieved: 2,
      error: '1 Portal requests were missing and 0 were incomplete.',
    });
    const failed = materializePortalRows({
      profiles: [profile],
      plan,
      inventory: [
        ...raw,
        { requestKey: 'client:synthetic', status: 'Blocked', paginationComplete: false },
      ],
    })[0];
    expect(failed?.error).toBe('0 Portal requests were missing and 1 were incomplete.');
    expect(failed?.searchCoverage.completedRequests).toBe(1);
  });
});
