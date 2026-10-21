import path from 'node:path';

import { z } from 'zod';

import {
  intakeStringArgument,
  optionalIntakeArgument,
  parseIntakeArguments,
} from './cli-arguments.js';
import type { IntakeCommandResult } from './cli-publication.js';
import { preserveCollectionRecord } from './collection-decoding.js';
import {
  cacheTimestamp,
  FirefliesCacheError,
  requireCacheValue,
} from './fireflies-cache-contract.js';
import { materializeFirefliesCache } from './fireflies-cache-materialize.js';
import { planFirefliesCache, type FirefliesCachePlan } from './fireflies-cache-plan.js';
import { loadCache, readFirefliesDiscovery, saveCache } from './fireflies-cache-storage.js';
import { selectFirefliesCollectionMode } from './fireflies-collection-mode.js';
import {
  buildFirefliesCollectionPlan,
  buildRunLevelFirefliesCollectionPlan,
} from './fireflies-collection.js';
import { parseFirefliesProfiles } from './fireflies-profile.js';
import { captureProperty } from './google-capture-property.js';
import { sha256Json } from './json-fingerprint.js';
import {
  atomicPrivateWrite,
  filesystemCode,
  privateDirectory,
  readPrivateJson,
  requireMutableRun,
  withCacheLock,
  writePrivateJson,
} from './private-run-storage.js';

function result(value: unknown): IntakeCommandResult {
  return { exitCode: 0, stdout: `${JSON.stringify(value, null, 2)}\n`, stderr: '' };
}
/** Saved identity planning only; the agent still selects and executes authorized source tools. */
export async function runFirefliesPlanCommand(
  argv: readonly string[],
  environment: Readonly<NodeJS.ProcessEnv> = process.env
): Promise<IntakeCommandResult> {
  const args = parseIntakeArguments(argv);
  const directoryInput = optionalIntakeArgument(args, 'run-dir') ?? environment['SLA_RUN_DIR'];
  if (!directoryInput) throw new Error('SLA_RUN_DIR or --run-dir is required');
  const directory = await privateDirectory(directoryInput);
  const profiles = z
    .array(z.record(z.string(), z.unknown()))
    .parse(await readPrivateJson(path.join(directory, 'identity_profile_rows.json')));
  const cutoff = environment['RUN_AT'];
  const withCutoff = (): ReturnType<typeof parseFirefliesProfiles> =>
    parseFirefliesProfiles(
      profiles.map((profile) => ({
        ...profile,
        asOf: cutoff === undefined || cutoff === '' ? new Date().toISOString() : cutoff,
      }))
    );
  const plans = withCutoff().map(buildFirefliesCollectionPlan);
  const inventory = buildRunLevelFirefliesCollectionPlan(withCutoff());
  await atomicPrivateWrite(
    path.join(directory, 'fireflies_search_requests.json'),
    JSON.stringify(plans, null, 2)
  );
  await atomicPrivateWrite(
    path.join(directory, 'fireflies_run_inventory.json'),
    JSON.stringify(inventory, null, 2)
  );
  return result({
    opportunities: plans.length,
    providerPlans: plans.reduce((total, plan) => total + plan.providerPlans.length, 0),
    meetingRequests: plans.reduce((total, plan) => total + plan.meetingRequests.length, 0),
    inventoryMeetingRequests: inventory.inventoryRequestCount,
    primaryInventoryRequests: inventory.primaryRequestCount,
    conditionalFallbackRequests: inventory.fallbackRequestCount,
    deduplicatedMeetingRequests:
      inventory.opportunityRequestCount - inventory.inventoryRequestCount,
    partialIdentityCoverage: plans
      .filter((plan) => plan.identityCoverage.status !== 'Complete')
      .map((plan) => plan.opportunityName),
  });
}

function assertExactPlan(
  value: unknown,
  expected: FirefliesCachePlan
): asserts value is FirefliesCachePlan {
  requireCacheValue(
    sha256Json(value) === sha256Json(expected),
    'Cache plan changed; replan from current inputs',
    'STALE_CACHE_PLAN'
  );
}
async function cacheOperation(args: Readonly<Record<string, string | boolean>>): Promise<unknown> {
  const mode = args['mode'] ?? 'shadow';
  if (mode !== 'shadow' && mode !== 'reuse')
    throw new Error('Explicit cache mode selection is required');
  const collectionMode = mode === 'shadow' ? 'cache-shadow-experiment' : 'cache-reuse';
  if (args['collection-mode'] !== collectionMode)
    throw new Error('Explicit cache mode selection is required');
  const action = args['action'];
  if (action !== 'plan' && action !== 'materialize') throw new Error('Cache action is required');
  const runInput = intakeStringArgument(args, 'run-dir', 'Cache run directory required');
  const cacheInput = intakeStringArgument(args, 'cache-dir', 'Cache directory required');
  const policyInput = intakeStringArgument(args, 'policy', 'Cache policy required');
  await requireMutableRun(runInput);
  await requireMutableRun(cacheInput);
  const directory = await privateDirectory(runInput);
  const cache = await privateDirectory(cacheInput);
  if (
    directory === cache ||
    directory.startsWith(`${cache}${path.sep}`) ||
    cache.startsWith(`${directory}${path.sep}`)
  )
    throw new Error('Cache and run directories must be separate');
  const policy = await readPrivateJson(policyInput);
  const collectionPlan = preserveCollectionRecord(
    z.looseObject({ fromDate: z.unknown(), toDate: z.unknown() })
  ).parse(await readPrivateJson(path.join(directory, 'fireflies_run_inventory.json')));
  const discovery = await readFirefliesDiscovery(directory, collectionPlan);
  if (cacheTimestamp(captureProperty(discovery, 'completedAt')) > Date.now())
    throw new Error('Discovery completion is in the future');
  const planFile = path.join(directory, 'fireflies_cache_plan.json');
  return withCacheLock(directory, () =>
    withCacheLock(cache, async () => {
      await requireMutableRun(directory);
      await requireMutableRun(cache);
      const { index, objects } = await loadCache(cache);
      const common = { discovery, collectionPlan, policy, index, objects };
      const select = (): Promise<void> =>
        selectFirefliesCollectionMode(directory, {
          mode: collectionMode,
          runId: captureProperty(discovery, 'runId'),
          asOf: captureProperty(discovery, 'asOf'),
        });
      if (action === 'plan') {
        const plan = planFirefliesCache({ ...common, mode });
        await select();
        await writePrivateJson(planFile, plan);
        return {
          status: 'Planned',
          mode: plan.mode,
          total: plan.items.length,
          fetch: plan.items.filter((item) => item.action === 'fetch').length,
          reuse: plan.items.filter((item) => item.action === 'reuse').length,
          shadowCandidates: plan.items.filter((item) => item.candidateReuse).length,
        };
      }
      const plan = await readPrivateJson(planFile);
      if (captureProperty(plan, 'mode') !== mode)
        throw new Error('Cache mode differs from its prepared plan');
      await select();
      requireCacheValue(
        sha256Json(index) === captureProperty(plan, 'cacheSnapshotHash'),
        'Cache changed after planning; replan',
        'STALE_CACHE_PLAN'
      );
      const fetched = z
        .array(z.unknown())
        .parse(await readPrivateJson(path.join(directory, 'fireflies_fetched_transcripts.json')));
      assertExactPlan(plan, planFirefliesCache({ ...common, mode }));
      const materialized = materializeFirefliesCache({ ...common, plan, fetched });
      const proofFile = path.join(directory, 'fireflies_cache_proof.json');
      const proof = {
        discovery,
        collectionPlan,
        policy,
        plan,
        priorIndex: index,
        report: materialized.report,
      };
      await writePrivateJson(proofFile, { report: { status: 'Pending' } });
      await atomicPrivateWrite(
        path.join(directory, 'fireflies_transcript_inventory.jsonl'),
        `${materialized.records.map((record) => JSON.stringify(record)).join('\n')}\n`
      );
      await writePrivateJson(path.join(directory, 'fireflies_inventory_execution.json'), {
        searchBlocked: 0,
        transcripts: {
          requested: materialized.records.length,
          complete: materialized.records.length,
          blocked: 0,
        },
        cachePlanHash: plan.planHash,
      });
      await writePrivateJson(proofFile, proof);
      await saveCache(cache, materialized);
      return {
        status: materialized.report.status,
        mode: materialized.report.mode,
        ...materialized.report.counts,
      };
    })
  );
}
/** Explicit shadow/reuse experiment, preserving original two-directory locks and index-last recovery. */
export async function runFirefliesCacheCommand(
  argv: readonly string[]
): Promise<IntakeCommandResult> {
  try {
    return result(await cacheOperation(parseIntakeArguments(argv)));
  } catch (error) {
    const code =
      error instanceof FirefliesCacheError
        ? error.code
        : error instanceof SyntaxError
          ? 'INVALID_ARTIFACT_JSON'
          : ['ENOENT', 'EACCES', 'EPERM', 'ENOSPC', 'EIO'].some((value) =>
                filesystemCode(error, value)
              )
            ? 'STORAGE_FAILURE'
            : 'INVALID_CACHE_INPUT';
    return {
      exitCode: 1,
      stdout: '',
      stderr: `${JSON.stringify({
        status: 'Blocked',
        code,
        message:
          'No source completion may be inferred. Follow docs/fireflies-cache.md recovery guidance; inspect private inputs only in the approved workspace.',
      })}\n`,
    };
  }
}
