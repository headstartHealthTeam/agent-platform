import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runPortalPlanningCommand } from './cli-portal-planning.js';
import { buildIdentityProfile } from './identity-profile.js';
import {
  parsePortalCollectionBaseRows,
  parsePortalCollectionProfiles,
} from './portal-collection-inputs.js';
import { buildPortalCollectionPlan } from './portal-collection-plan.js';
import { readPrivateJson, writePrivateJson } from './private-run-storage.js';

let root: string;
const profile = {
  ...buildIdentityProfile({
    opportunityId: 'synthetic-client',
    opportunityName: 'Synthetic Example',
    stage: 'IA Scheduled',
    providerRoles: [
      { role: 'Rendering', name: 'Synthetic Provider', portalProviderId: 'synthetic-provider' },
    ],
  }),
  searchWindow: { fromDate: '2026-01-01', toDate: '2026-01-10' },
};
const plan = buildPortalCollectionPlan([profile]);
const env = { PORTAL_SEARCHED_AT: '2026-01-12', SOURCE_CUTOFF: '2026-01-10' };
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'intake-portal-plan-'));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true });
});
async function write(name: string, value: unknown): Promise<void> {
  await writePrivateJson(path.join(root, name), value);
}
function call(command: string): ReturnType<typeof runPortalPlanningCommand> {
  return runPortalPlanningCommand(command, ['--run-dir', root], env);
}
describe('saved Portal planning command composition', () => {
  it('ignores plan-only unused metadata and retains null/fallback/unselected materialization behavior', async () => {
    const metadata = {
      ...profile,
      familyPhones: null,
      stage: { saved: 'metadata' },
      providerRoles: [
        {
          primaryName: 'Synthetic Provider',
          portalProviderIds: ['synthetic-provider'],
          names: ['Synthetic Provider'],
          email: { unused: true },
        },
      ],
    };
    await write('identity_profile_rows.json', [{ ...metadata, candidates: { unused: true } }]);
    expect((await call('review:portal-plan')).exitCode).toBe(0);
    await write('identity_profile_rows.json', [metadata]);
    await write('portal_run_inventory.json', {
      ...plan,
      requests: plan.requests.map((request) => ({ ...request, roster: null })),
    });
    await write(
      'portal_conversation_inventory.json',
      plan.requests.map((request) => ({
        requestKey: request.requestKey,
        status: null,
        chats: null,
      }))
    );
    await write('portal_rows.json', [
      { opportunityId: 'unrelated-id', chats: 'unrelated envelope' },
    ]);
    expect(JSON.parse((await call('review:portal-materialize')).stdout)).toEqual({
      opportunities: 1,
      found: 0,
      blocked: 1,
    });
    expect(await readPrivateJson(path.join(root, 'portal_inventory_execution.json'))).toMatchObject(
      { blocked: 2, opportunities: 1 }
    );
    await write('identity_profile_rows.json', [{ ...profile, stage: { saved: 'metadata' } }]);
    await write(
      'portal_conversation_inventory.json',
      plan.requests.map((request) => ({
        requestKey: request.requestKey,
        status: 'Complete',
        chats: [
          {
            id: request.requestKey,
            opportunityId: profile.opportunityId,
            createdAt: '2026-01-09',
            messages: [{ content: 'Synthetic Example assessment planned.' }],
          },
        ],
      }))
    );
    expect(JSON.parse((await call('review:portal-materialize')).stdout)).toEqual({
      opportunities: 1,
      found: 1,
      blocked: 0,
    });
  });
  it('plans actual identity-producer profiles and preserves raw nested metadata', async () => {
    await write('identity_profile_rows.json', [profile]);
    const result = await call('review:portal-plan');
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      opportunities: 1,
      providerRequests: 1,
      clientRequests: 1,
    });
    expect(await readPrivateJson(path.join(root, 'portal_run_inventory.json'))).toEqual(plan);
    expect(parsePortalCollectionProfiles([profile])[0]).toBe(profile);
    expect(
      (await runPortalPlanningCommand('review:portal-plan', [], { SLA_RUN_DIR: root })).stdout
    ).toBe(result.stdout);
  });
  it('preserves frozen cutoff, fallback sentinel and complete empty requests without inventing source exceptions', async () => {
    await write('identity_profile_rows.json', [profile]);
    await call('review:portal-plan');
    await write(
      'portal_conversation_inventory.json',
      plan.requests.map((request) => ({
        requestKey: request.requestKey,
        status: 'Complete',
        paginationComplete: true,
        pages: 1,
        chats:
          request.requestType === 'Provider'
            ? []
            : [
                {
                  id: 'current',
                  opportunityId: profile.opportunityId,
                  createdAt: '2026-01-09',
                  messages: [{ content: 'Synthetic Example is scheduled for assessment.' }],
                },
                {
                  id: 'future',
                  opportunityId: profile.opportunityId,
                  createdAt: '2026-01-11',
                  messages: [{ content: 'Synthetic Example assessment later completed.' }],
                },
              ],
      }))
    );
    const result = await call('review:portal-materialize');
    expect(JSON.parse(result.stdout)).toEqual({ opportunities: 1, found: 1, blocked: 0 });
    expect(await readPrivateJson(path.join(root, 'portal_rows.json'))).toMatchObject([
      { chats: [{ id: 'current' }], blocked: false },
    ]);
    expect(await readPrivateJson(path.join(root, 'portal_inventory_execution.json'))).toMatchObject(
      {
        searchedAt: env.PORTAL_SEARCHED_AT,
        sourceCutoff: env.SOURCE_CUTOFF,
        completed: 2,
        blocked: 0,
        fallbackUsed: true,
      }
    );
    expect((await call('review:portal-materialize')).stdout).toBe(result.stdout);
  });
  it('keeps missing requests row-blocked while retaining valid base evidence and unused fallback envelopes', async () => {
    await write('identity_profile_rows.json', [profile]);
    await call('review:portal-plan');
    const chat = {
      id: 'base',
      opportunityId: profile.opportunityId,
      messages: [{ content: 'Synthetic Example assessment planned.' }],
    };
    const base = {
      opportunityId: profile.opportunityId,
      responses: { chats: [chat] },
      chats: 'unused',
    };
    expect(parsePortalCollectionBaseRows([base])[0]?.chats?.[0]).toBe(chat);
    await write('portal_rows.json', [base]);
    expect(JSON.parse((await call('review:portal-materialize')).stdout)).toEqual({
      opportunities: 1,
      found: 1,
      blocked: 1,
    });
    expect(await readPrivateJson(path.join(root, 'portal_rows.json'))).toMatchObject([
      { blocked: true, chats: [{ id: 'base' }] },
    ]);
  });
  it('retains missing optional-file defaults and rejects malformed current evidence or unsupported commands', async () => {
    expect(JSON.parse((await call('review:portal-materialize')).stdout)).toEqual({
      opportunities: 0,
      found: 0,
      blocked: 0,
    });
    await write('portal_conversation_inventory.json', [
      { requestKey: 'unplanned', status: 'Complete', chats: [] },
    ]);
    await expect(call('review:portal-materialize')).rejects.toThrow('unknown or duplicate');
    await expect(runPortalPlanningCommand('review:portal-plan', [], {})).rejects.toThrow(
      'required'
    );
    await expect(call('unknown')).rejects.toThrow('Unknown');
  });
});
