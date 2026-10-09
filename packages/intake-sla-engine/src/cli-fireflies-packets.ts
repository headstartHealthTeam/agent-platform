import path from 'node:path';

import { z } from 'zod';

import { optionalIntakeArgument, parseIntakeArguments } from './cli-arguments.js';
import type { IntakeCommandResult } from './cli-publication.js';
import { preserveCollectionRecord } from './collection-decoding.js';
import {
  decodeFirefliesMeetingProfile,
  decodeFirefliesPacketProfile,
  decodeSegmentableMeeting,
} from './fireflies-saved-profiles.js';
import { captureProperty as field } from './google-capture-property.js';
import {
  buildTranscriptInterpretationPacket,
  interpretationGateContext,
} from './interpretation-packet.js';
import type { TranscriptInterpretationPacket } from './interpretation-packet.js';
import { sha256Json } from './json-fingerprint.js';
import { discoverFirefliesMeeting } from './meeting-segmentation.js';
import { privateDirectory, readPrivateJson, writePrivateJson } from './private-run-storage.js';
import { resolveSourceAuthorizationGate } from './source-authorization-gate.js';
import type { SourceAuthorizationRecord } from './source-authorization-types.js';

export interface FirefliesPacketEnvelope {
  readonly opportunityId: string;
  readonly opportunityName: unknown;
  readonly stage: unknown;
  readonly meetingId: unknown;
  readonly meetingTitle: unknown;
  readonly meetingDate: unknown;
  readonly meetingRelationship: unknown;
  readonly sourceRecordId: string;
  readonly packetHash: string;
  readonly packet: TranscriptInterpretationPacket;
}
function rows(value: unknown): unknown[] {
  return z.array(z.unknown()).parse(value);
}
function byId(values: readonly unknown[], key: string): Map<unknown, unknown> {
  return new Map(values.map((row) => [field(row, key), row]));
}
/** Prepare exact current-source interpretation packets; no API/model call or prior-run relabeling. */
export async function runFirefliesPacketsCommand(
  argv: readonly string[],
  environment: Readonly<NodeJS.ProcessEnv> = process.env
): Promise<IntakeCommandResult> {
  const input =
    optionalIntakeArgument(parseIntakeArguments(argv), 'run-dir') ?? environment['SLA_RUN_DIR'];
  if (!input) throw new Error('SLA_RUN_DIR or --run-dir is required');
  const directory = await privateDirectory(input);
  const read = async (name: string): Promise<unknown[]> =>
    rows(await readPrivateJson(path.join(directory, name)));
  const [profiles = [], fireflies = [], opportunities = [], auths = [], reviews = []] =
    await Promise.all(
      [
        'identity_profile_rows.json',
        'fireflies_rows.json',
        'opportunity_rows.json',
        'auth_rows.json',
        'authorization_review_rows.json',
      ].map(read)
    );
  const profilesById = byId(profiles, 'opportunityId');
  const opportunitiesById = byId(opportunities, 'Id');
  const packets: FirefliesPacketEnvelope[] = [];
  const cutoff = environment['RUN_AT'];
  for (const row of fireflies) {
    const rawProfile = profilesById.get(field(row, 'opportunityId'));
    if (rawProfile === undefined) continue;
    const id = z.string().parse(field(rawProfile, 'opportunityId'));
    const rawOpportunity = opportunitiesById.get(id);
    if (rawOpportunity === undefined) continue;
    const opp = preserveCollectionRecord(z.object({ Id: z.string().optional() })).parse(
      rawOpportunity
    );
    const selectedAuths = (records: readonly unknown[]): SourceAuthorizationRecord[] =>
      records
        .filter((auth) => field(auth, 'Client_Opportunity_Record__c') === id)
        .map((auth) => preserveCollectionRecord(z.object({})).parse(auth));
    const authorizationGate = resolveSourceAuthorizationGate({
      opp,
      auths: selectedAuths(auths),
      authReviews: selectedAuths(reviews),
      asOf: new Date(cutoff === undefined || cutoff === '' ? Date.now() : cutoff),
    });
    const gate = interpretationGateContext({
      stage: z
        .string()
        .nullish()
        .parse(field(rawOpportunity, 'StageName') ?? field(rawProfile, 'stage')),
      authorizationGate,
    });
    const rawPeers = rows(field(rawProfile, 'providerRoster') ?? []).flatMap((peer) => {
      const matched = profilesById.get(field(peer, 'opportunityId'));
      return matched === undefined ? [] : [matched];
    });
    for (const rawMeeting of rows(field(row, 'meetings') ?? [])) {
      const meeting = decodeSegmentableMeeting(rawMeeting);
      const discovery = discoverFirefliesMeeting({
        meeting,
        profile: decodeFirefliesMeetingProfile(rawProfile),
        competingProfiles: rawPeers.map(decodeFirefliesMeetingProfile),
      });
      for (const [index, segment] of discovery.segments.entries()) {
        const sourceRecordId = `${String(field(rawMeeting, 'id'))}:${String(index + 1)}`;
        const packet = buildTranscriptInterpretationPacket({
          profile: decodeFirefliesPacketProfile(rawProfile),
          gate,
          source: 'Fireflies',
          sourceRecordId,
          eventDate: z.union([z.string(), z.number()]).nullish().parse(field(rawMeeting, 'date')),
          segment: segment.text,
          matchQuality: segment.quality,
          matchContext: {
            meetingTitle: z.json().optional().parse(field(rawMeeting, 'title')),
            meetingRelationship: z
              .string()
              .nullish()
              .parse(field(rawMeeting, 'meetingRelationship')),
            assumedIdentityMatch: segment.assumedIdentityMatch,
            assumedIdentityNote: segment.assumedIdentityNote,
            matchedAs: segment.matchedAs,
          },
        });
        packets.push({
          opportunityId: id,
          opportunityName: field(rawProfile, 'opportunityName'),
          stage: field(rawProfile, 'stage'),
          meetingId: field(rawMeeting, 'id'),
          meetingTitle: field(rawMeeting, 'title'),
          meetingDate: field(rawMeeting, 'date'),
          meetingRelationship: field(rawMeeting, 'meetingRelationship'),
          sourceRecordId,
          packetHash: sha256Json(packet),
          packet,
        });
      }
    }
  }
  const opportunityCount = new Set(packets.map((packet) => packet.opportunityId)).size;
  await writePrivateJson(path.join(directory, 'fireflies_interpretation_packets.json'), {
    generatedAt: new Date().toISOString(),
    opportunityCount,
    packetCount: packets.length,
    packets,
  });
  return {
    exitCode: 0,
    stdout: `${JSON.stringify({ opportunities: opportunityCount, packets: packets.length }, null, 2)}\n`,
    stderr: '',
  };
}
