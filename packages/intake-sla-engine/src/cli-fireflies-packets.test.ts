import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runFirefliesPacketsCommand } from './cli-fireflies-packets.js';
import { buildIdentityProfile } from './identity-profile.js';
import {
  buildTranscriptInterpretationPacket,
  interpretationGateContext,
} from './interpretation-packet.js';
import { sha256Json } from './json-fingerprint.js';
import { discoverFirefliesMeeting } from './meeting-segmentation.js';
import { readPrivateJson, writePrivateJson } from './private-run-storage.js';
import { resolveSourceAuthorizationGate } from './source-authorization-gate.js';

let root: string;
const profile = buildIdentityProfile({
  opportunityId: 'synthetic-client',
  opportunityName: 'Synthetic Example',
  stage: 'IA Scheduled',
  providers: [{ role: 'Rendering', name: 'Synthetic Provider', email: 'provider@example.test' }],
});
const meeting = {
  id: 'synthetic-meeting',
  title: 'Synthetic Provider meeting',
  date: '2026-01-09',
  meetingRelationship: 'Provider',
  fullTranscript: 'Synthetic Example completed the initial assessment.',
};
const cutoff = '2026-01-10T12:00:00Z';
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'intake-packets-'));
  await Promise.all([
    write('identity_profile_rows.json', [profile]),
    write('opportunity_rows.json', [{ Id: profile.opportunityId, StageName: 'IA Scheduled' }]),
    write('auth_rows.json', []),
    write('authorization_review_rows.json', []),
    write('fireflies_rows.json', [{ opportunityId: profile.opportunityId, meetings: [meeting] }]),
  ]);
});
afterEach(async () => {
  await fs.rm(root, { recursive: true });
});
async function write(name: string, value: unknown): Promise<void> {
  await writePrivateJson(path.join(root, name), value);
}
function call(): ReturnType<typeof runFirefliesPacketsCommand> {
  return runFirefliesPacketsCommand([], { SLA_RUN_DIR: root, RUN_AT: cutoff });
}
describe('saved Fireflies interpretation packet command', () => {
  it('builds the exact domain packet/hash from actual identity producers without interpreting it', async () => {
    const result = await call();
    expect(JSON.parse(result.stdout)).toEqual({ opportunities: 1, packets: 1 });
    const segment = discoverFirefliesMeeting({ profile, meeting }).segments[0];
    if (segment === undefined)
      throw new Error('Synthetic packet fixture needs a supported segment');
    const packet = buildTranscriptInterpretationPacket({
      profile,
      gate: interpretationGateContext({
        stage: 'IA Scheduled',
        authorizationGate: resolveSourceAuthorizationGate({
          opp: { Id: profile.opportunityId, StageName: 'IA Scheduled' },
          auths: [],
          authReviews: [],
          asOf: new Date(cutoff),
        }),
      }),
      source: 'Fireflies',
      sourceRecordId: 'synthetic-meeting:1',
      eventDate: meeting.date,
      segment: segment.text,
      matchQuality: segment.quality,
      matchContext: {
        meetingTitle: meeting.title,
        meetingRelationship: meeting.meetingRelationship,
        assumedIdentityMatch: segment.assumedIdentityMatch,
        assumedIdentityNote: segment.assumedIdentityNote,
        matchedAs: segment.matchedAs,
      },
    });
    expect(
      await readPrivateJson(path.join(root, 'fireflies_interpretation_packets.json'))
    ).toMatchObject({
      opportunityCount: 1,
      packetCount: 1,
      packets: [
        {
          opportunityId: profile.opportunityId,
          stage: profile.stage,
          sourceRecordId: 'synthetic-meeting:1',
          packetHash: sha256Json(packet),
          packet,
        },
      ],
    });
    expect((await runFirefliesPacketsCommand(['--run-dir', root], { RUN_AT: cutoff })).stdout).toBe(
      result.stdout
    );
  }, 30_000);
  it('skips unselected rows/profiles and uses only the selected transcript fallback', async () => {
    await write('identity_profile_rows.json', [
      profile,
      { opportunityId: 'unused', candidates: 'irrelevant' },
    ]);
    await write('fireflies_rows.json', [
      { opportunityId: 'missing', meetings: 'unused' },
      { opportunityId: 'unused', meetings: 'unused' },
      {
        opportunityId: profile.opportunityId,
        meetings: [
          { ...meeting, transcript: 'unused alternative', transcriptText: { ignored: true } },
        ],
      },
    ]);
    await write('auth_rows.json', [
      { Client_Opportunity_Record__c: 'unrelated', Notes__c: { ignored: true } },
    ]);
    expect(JSON.parse((await call()).stdout)).toEqual({ opportunities: 1, packets: 1 });
    await write('fireflies_rows.json', [{ opportunityId: profile.opportunityId, meetings: null }]);
    expect(JSON.parse((await call()).stdout)).toEqual({ opportunities: 0, packets: 0 });
  }, 30_000);
  it('uses the current authorization gate and preserves selected-source failure', async () => {
    await write('opportunity_rows.json', [
      { Id: profile.opportunityId, StageName: 'IA Requested' },
    ]);
    await write('authorization_review_rows.json', [
      {
        Id: 'synthetic-review',
        Client_Opportunity_Record__c: profile.opportunityId,
        Authorization_Type__c: 'Initial Authorization',
        Insurance_Determination__c: 'Denied',
        CreatedDate: '2026-01-08',
        Notes__c: 'Synthetic denial requires appeal.',
      },
    ]);
    await call();
    expect(
      await readPrivateJson(path.join(root, 'fireflies_interpretation_packets.json'))
    ).toMatchObject({ packets: [{ packet: { process: { processPosition: 'IA Requested' } } }] });
    await write('fireflies_rows.json', [
      { opportunityId: profile.opportunityId, meetings: [{ ...meeting, fullTranscript: 12 }] },
    ]);
    await expect(call()).rejects.toThrow();
    await expect(runFirefliesPacketsCommand([], {})).rejects.toThrow('required');
  }, 30_000);
  it.each([
    { authorizationNumbers: null },
    { providerRoster: null },
    {
      providerRoles: [
        {
          role: 'Rendering',
          names: ['Synthetic Provider'],
          emails: ['provider@example.test'],
          primaryEmail: { unused: true },
        },
      ],
    },
  ])(
    'preserves optional matcher inputs without applying Portal shape constraints: %j',
    async (change) => {
      await write('identity_profile_rows.json', [{ ...profile, ...change }]);
      // The direct ID path does not consume authorizationNumbers; null must not fail eagerly.
      await write('fireflies_rows.json', [
        {
          opportunityId: profile.opportunityId,
          meetings: [
            { ...meeting, fullTranscript: `${profile.opportunityId}: ${meeting.fullTranscript}` },
          ],
        },
      ]);
      expect(JSON.parse((await call()).stdout)).toEqual({ opportunities: 1, packets: 1 });
    },
    30_000
  );
  it('retains numeric source dates and raw JSON titles in the packet binding', async () => {
    const date = Date.parse(meeting.date);
    await write('fireflies_rows.json', [
      {
        opportunityId: profile.opportunityId,
        meetings: [{ ...meeting, date, title: 42, organizerEmail: 'provider@example.test' }],
      },
    ]);
    await call();
    expect(
      await readPrivateJson(path.join(root, 'fireflies_interpretation_packets.json'))
    ).toMatchObject({
      packets: [
        {
          meetingDate: date,
          meetingTitle: 42,
          packet: { source: { eventDate: date, matchContext: { meetingTitle: 42 } } },
        },
      ],
    });
  }, 30_000);
});
