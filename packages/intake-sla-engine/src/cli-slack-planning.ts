import path from 'node:path';

import { z } from 'zod';

import { optionalIntakeArgument, parseIntakeArguments } from './cli-arguments.js';
import type { IntakeCommandResult } from './cli-publication.js';
import { preserveCollectionRecord } from './collection-decoding.js';
import { captureProperty } from './google-capture-property.js';
import {
  optionalPrivateJson,
  privateDirectory,
  readPrivateJson,
  requireMutableRun,
  writeIdenticalOrNew,
  writePrivateJson,
} from './private-run-storage.js';
import { mergeSlackSweep } from './slack-sweep-merge.js';
import { buildSlackSweepPlan } from './slack-sweep-plan.js';

const PLAN_COMMAND = 'review:slack-plan';

function output(value: unknown): IntakeCommandResult {
  return { exitCode: 0, stdout: `${JSON.stringify(value, null, 2)}\n`, stderr: '' };
}
export async function runSlackPlanningCommand(
  command: string,
  argv: readonly string[],
  environment: Readonly<NodeJS.ProcessEnv> = process.env
): Promise<IntakeCommandResult> {
  if (command !== PLAN_COMMAND && command !== 'review:slack-merge')
    throw new Error('Unknown Slack planning command');
  const input =
    optionalIntakeArgument(parseIntakeArguments(argv), 'run-dir') ?? environment['SLA_RUN_DIR'];
  if (!input) throw new Error('SLA_RUN_DIR or --run-dir is required');
  if (command === PLAN_COMMAND) await requireMutableRun(input);
  const directory = await privateDirectory(input);
  const read = (name: string): Promise<unknown> => readPrivateJson(path.join(directory, name));
  if (command === PLAN_COMMAND) {
    const [opportunities, profiles, auths, authReviews, manifest] = await Promise.all(
      [
        'opportunity_rows.json',
        'identity_profile_rows.json',
        'auth_rows.json',
        'authorization_review_rows.json',
        'run_manifest.json',
      ].map(read)
    );
    const inputs = {
      opportunities: z
        .array(preserveCollectionRecord(z.object({ Id: z.string().optional() })))
        .parse(opportunities),
      profiles: z
        .array(preserveCollectionRecord(z.object({ opportunityId: z.string() })))
        .parse(profiles),
      auths: z.array(preserveCollectionRecord(z.object({}))).parse(auths),
      authReviews: z.array(preserveCollectionRecord(z.object({}))).parse(authReviews),
      asOf: z.string().parse(captureProperty(manifest, 'startedAt')),
    };
    // The workflow resolver selects denied cohorts and linked authorization evidence. Do not
    // eagerly validate fields on unrelated/non-denied records before that selection happens.
    const destination = path.join(directory, 'slack_full_sweep_plan.json');
    const previous = await optionalPrivateJson(destination);
    const plan = buildSlackSweepPlan(
      inputs,
      captureProperty(manifest, 'runId'),
      captureProperty(previous, 'generatedAt') ?? new Date().toISOString()
    );
    await writeIdenticalOrNew(destination, plan);
    return output({
      opportunityCount: plan.opportunityCount,
      queryCount: plan.queryCount,
      denialContextOpportunities: plan.targets.filter((target) => target.denialContext.required)
        .length,
      output: destination,
    });
  }
  const readRows = async (name: string): Promise<unknown[]> => {
    const raw = await optionalPrivateJson(path.join(directory, name));
    return z.array(z.unknown()).parse(raw === undefined ? [] : raw);
  };
  const [exactRows = [], pageTwoRecords = [], threadRows = [], identityRows = [], priorRows = []] =
    await Promise.all(
      [
        'slack_full_sweep_exact_name.json',
        'slack_full_sweep_page2.json',
        'slack_full_sweep_threads.json',
        'identity_profile_rows.json',
        'slack_rows.json',
      ].map(readRows)
    );
  const manifest = await optionalPrivateJson(path.join(directory, 'run_manifest.json'));
  const sourceCutoff = captureProperty(manifest, 'startedAt');
  const { merged, execution } = mergeSlackSweep({
    exactRows,
    pageTwoRecords,
    threadRows,
    identityRows,
    priorRows,
    sourceCutoff,
  });
  await Promise.all([
    writePrivateJson(path.join(directory, 'slack_rows.json'), merged),
    writePrivateJson(path.join(directory, 'slack_full_sweep_execution.json'), execution),
  ]);
  return output(execution);
}
