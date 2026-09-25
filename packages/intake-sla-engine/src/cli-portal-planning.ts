import path from 'node:path';

import { optionalIntakeArgument, parseIntakeArguments } from './cli-arguments.js';
import type { IntakeCommandResult } from './cli-publication.js';
import {
  parsePortalCollectionBaseRows,
  parsePortalCollectionInventory,
  parsePortalCollectionPlan,
  parsePortalCollectionProfiles,
  parsePortalPlanProfiles,
} from './portal-collection-inputs.js';
import { evaluatePortalSentinel } from './portal-collection-inventory.js';
import { buildPortalCollectionPlan } from './portal-collection-plan.js';
import { materializePortalRows } from './portal-collection.js';
import {
  optionalPrivateJson,
  privateDirectory,
  readPrivateJson,
  writePrivateJson,
} from './private-run-storage.js';

function output(value: unknown): IntakeCommandResult {
  return { exitCode: 0, stdout: `${JSON.stringify(value, null, 2)}\n`, stderr: '' };
}
async function optional(directory: string, name: string, fallback: unknown): Promise<unknown> {
  const value = await optionalPrivateJson(path.join(directory, name));
  return value === undefined ? fallback : value;
}
/** Product-specific saved capture composition, without Portal calls or new source-health rules. */
export async function runPortalPlanningCommand(
  command: string,
  argv: readonly string[],
  environment: Readonly<NodeJS.ProcessEnv> = process.env
): Promise<IntakeCommandResult> {
  if (command !== 'review:portal-plan' && command !== 'review:portal-materialize')
    throw new Error('Unknown Portal planning command');
  const directoryInput =
    optionalIntakeArgument(parseIntakeArguments(argv), 'run-dir') ?? environment['SLA_RUN_DIR'];
  if (!directoryInput) throw new Error('SLA_RUN_DIR or --run-dir is required');
  const directory = await privateDirectory(directoryInput);
  if (command === 'review:portal-plan') {
    const profiles = parsePortalPlanProfiles(
      await readPrivateJson(path.join(directory, 'identity_profile_rows.json'))
    );
    const plan = buildPortalCollectionPlan(profiles);
    await writePrivateJson(path.join(directory, 'portal_run_inventory.json'), plan);
    return output({
      opportunities: plan.opportunityCount,
      providerRequests: plan.providerRequestCount,
      clientRequests: plan.clientRequestCount,
      sentinelRequestKey: plan.sentinelRequestKey,
    });
  }
  const profiles = parsePortalCollectionProfiles(
    await optional(directory, 'identity_profile_rows.json', [])
  );
  const plan = parsePortalCollectionPlan(
    await optional(directory, 'portal_run_inventory.json', { requests: [] })
  );
  const inventory = parsePortalCollectionInventory(
    await optional(directory, 'portal_conversation_inventory.json', [])
  );
  const baseRows = parsePortalCollectionBaseRows(
    await optional(directory, 'portal_rows.json', []),
    profiles
  );
  const supplied = environment['PORTAL_SEARCHED_AT'];
  const searchedAt =
    supplied === undefined || supplied === '' ? new Date().toISOString() : supplied;
  const selectedCutoff = environment['SOURCE_CUTOFF'];
  const sourceCutoff =
    selectedCutoff === undefined || selectedCutoff === '' ? searchedAt : selectedCutoff;
  const rows = materializePortalRows({
    profiles,
    plan,
    inventory,
    baseRows,
    searchedAt,
    sourceCutoff,
  });
  const sentinel = evaluatePortalSentinel({ plan, inventory });
  await writePrivateJson(path.join(directory, 'portal_rows.json'), rows);
  await writePrivateJson(path.join(directory, 'portal_inventory_execution.json'), {
    searchedAt,
    sourceCutoff,
    requests: plan.requests.length,
    completed: inventory.filter(
      (row) => row.status === 'Complete' && row.paginationComplete !== false
    ).length,
    blocked: inventory.filter(
      (row) => row.status !== 'Complete' || row.paginationComplete === false
    ).length,
    ...sentinel,
    opportunities: rows.length,
    found: rows.filter((row) => row.chats.length > 0).length,
  });
  return output({
    opportunities: rows.length,
    found: rows.filter((row) => row.chats.length > 0).length,
    blocked: rows.filter((row) => row.blocked).length,
  });
}
