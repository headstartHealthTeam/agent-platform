import fs from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { optionalIntakeArgument, parseIntakeArguments } from './cli-arguments.js';
import type { IntakeCommandResult } from './cli-publication.js';
import { readBoundedRunProof } from './fireflies-bounded-proof.js';
import { readCacheRunProof } from './fireflies-cache-replay-proof.js';
import {
  parseReplayIdentities,
  prepareReplayInventory,
  replayFirefliesRows,
} from './fireflies-replay.js';
import { captureProperty as field } from './google-capture-property.js';
import { sha256Json } from './json-fingerprint.js';
import {
  optionalPrivateJson,
  privateDirectory,
  readPrivateJson,
  requireMutableRun,
  withRunCheckpointLock,
  writePrivateJson,
} from './private-run-storage.js';
import { createReplayProgress } from './replay-progress.js';
import type { ReplayProgressEvent } from './replay-progress.js';
import { assessTranscriptInventoryArtifact } from './run-artifact-health.js';

function selected(value: string | undefined, fallback: string): string {
  return value === undefined || value === '' ? fallback : value;
}
/** Resume source-proven replay under the existing run lock; never recollect or call a model. */
export async function runFirefliesReplayCommand(
  argv: readonly string[],
  environment: Readonly<NodeJS.ProcessEnv> = process.env,
  emit?: (event: ReplayProgressEvent) => void
): Promise<IntakeCommandResult> {
  const input =
    optionalIntakeArgument(parseIntakeArguments(argv), 'run-dir') ?? environment['SLA_RUN_DIR'];
  if (!input) throw new Error('SLA_RUN_DIR or --run-dir is required');
  await requireMutableRun(input);
  const directory = await privateDirectory(input);
  const telemetry = createReplayProgress(emit === undefined ? {} : { emit });
  return withRunCheckpointLock(directory, async () => {
    telemetry.progress({ nextPhase: 'validating-sources' });
    await requireMutableRun(directory);
    const [rawProfiles, text] = await Promise.all([
      readPrivateJson(path.join(directory, 'identity_profile_rows.json')),
      fs.readFile(path.join(directory, 'fireflies_transcript_inventory.jsonl'), 'utf8'),
    ]);
    const profiles = parseReplayIdentities(rawProfiles);
    const records: unknown[] = text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line): unknown => JSON.parse(line));
    let searchedAt = selected(environment['FIREFLIES_SEARCHED_AT'], new Date().toISOString());
    const runAt = selected(environment['RUN_AT'], searchedAt);
    const cacheProof = await readCacheRunProof(directory, records, runAt, { profiles });
    const boundedProof = await readBoundedRunProof(directory, records, runAt, { profiles });
    const sourceCutoff = selected(
      environment['SOURCE_CUTOFF'],
      cacheProof !== null || boundedProof !== null ? runAt : searchedAt
    );
    if (cacheProof !== null)
      searchedAt = z.string().parse(field(cacheProof.discovery, 'completedAt'));
    if (boundedProof !== null) searchedAt = boundedProof.manifest.retrievalNotBefore;
    if (cacheProof !== null && sourceCutoff !== runAt)
      throw new Error('Cache replay requires its bound current-run cutoff');
    if (boundedProof !== null && sourceCutoff !== runAt)
      throw new Error('Bounded replay requires its bound current-run cutoff');
    const execution = await optionalPrivateJson(
      path.join(directory, 'fireflies_inventory_execution.json')
    );
    const expectedCount = Number(
      field(field(execution, 'transcripts'), 'requested') ?? records.length
    );
    const health = assessTranscriptInventoryArtifact({ records, expectedCount, runAt, cacheProof });
    if (!health.complete)
      throw new Error('Fireflies inventory is incomplete; replay cannot claim source coverage');
    const counts = { totalRows: profiles.length, transcripts: records.length };
    telemetry.progress({ ...counts, nextPhase: 'preparing-matching' });
    const inventory = prepareReplayInventory(records);
    telemetry.progress({ ...counts, nextPhase: 'matching' });
    const cpuStarted = process.cpuUsage();
    const rows = replayFirefliesRows({
      profiles,
      inventory,
      searchedAt,
      sourceCutoff,
      boundedCoverage: boundedProof?.coverage,
      ...(cacheProof === null
        ? {}
        : { cacheProvenance: z.array(z.unknown()).parse(field(cacheProof.report, 'provenance')) }),
      onProgress: (completedRows) => {
        telemetry.progress({ ...counts, completedRows });
      },
    });
    const cpu = process.cpuUsage(cpuStarted);
    telemetry.progress({ ...counts, completedRows: rows.length, nextPhase: 'persisting' });
    await writePrivateJson(path.join(directory, 'fireflies_rows.json'), rows);
    const hashes = {
      runAt,
      inventoryHash: sha256Json(records),
      profilesHash: sha256Json(profiles),
      rowsHash: sha256Json(rows),
    };
    if (cacheProof !== null)
      await writePrivateJson(path.join(directory, 'fireflies_cache_replay.json'), {
        ...hashes,
        cachePlanHash: cacheProof.plan.planHash,
      });
    if (boundedProof !== null) {
      await writePrivateJson(
        path.join(directory, 'fireflies_bounded_coverage.json'),
        boundedProof.coverage
      );
      await writePrivateJson(path.join(directory, 'fireflies_bounded_replay.json'), {
        ...hashes,
        manifestHash: boundedProof.manifest.manifestHash,
        coverageHash: sha256Json(boundedProof.coverage),
      });
    }
    const timing = telemetry.finish({ ...counts, completedRows: rows.length });
    const found = rows.filter((row) => row.meetings.length > 0).length;
    const relevantMeetings = rows.reduce((count, row) => count + row.meetings.length, 0);
    await writePrivateJson(path.join(directory, 'fireflies_replay_execution.json'), {
      ...timing,
      matchingCpuMs: { user: cpu.user / 1000, system: cpu.system / 1000 },
      searchedAt,
      sourceCutoff,
      transcriptInventoryCount: inventory.length,
      opportunities: rows.length,
      found,
      notFound: rows.length - found,
      relevantMeetings,
      direct: rows.reduce(
        (count, row) =>
          count + row.meetings.filter((meeting) => meeting.quality === 'Direct').length,
        0
      ),
      likely: rows.reduce(
        (count, row) =>
          count + row.meetings.filter((meeting) => meeting.quality === 'Likely').length,
        0
      ),
    });
    return {
      exitCode: 0,
      stdout: `${JSON.stringify({ ...timing, opportunities: rows.length, transcriptInventory: inventory.length, found, relevantMeetings }, null, 2)}\n`,
      stderr: '',
    };
  });
}
