import { readFile } from 'node:fs/promises';

import type { AgentHostedCredentialFiles } from '@headstart-health/workflow-contracts';
import { z } from 'zod';

import { credentialSchema, resolveConfig } from './config.js';
import { readCredential } from './credential.js';
import { DockerSessionExecutor, dockerExecutorSettingsSchema } from './docker-executor.js';
import { OperatorRuntimePort } from './operator-runtime.js';
import { OpenAIPlatform, fingerprint } from './platform.js';
import type { SessionExecutor } from './session-executor.js';

/** Private local application composition only; never runs inside the isolated agent executor. */
export async function createLocalOperatorRuntimePort(options: {
  configPath: string;
  billableUntil?: string;
  applicationFunctions?: string[];
  launchSettings?: unknown;
  executorSettings?: unknown;
  credentialFiles?: AgentHostedCredentialFiles;
}): Promise<OperatorRuntimePort> {
  const config = resolveConfig(JSON.parse(await readFile(options.configPath, 'utf8')));
  const key = await readCredential(config.credential);
  const expiry = options.billableUntil ? Date.parse(options.billableUntil) : 0;
  if (!Number.isFinite(expiry)) throw new Error('Invalid bounded authorization expiry');
  let executor: SessionExecutor | undefined;
  if (options.executorSettings !== undefined) {
    const settings = dockerExecutorSettingsSchema
      .extend({ credential: credentialSchema })
      .strict()
      .parse(options.executorSettings);
    if (options.launchSettings !== undefined) {
      z.object({
        environment: z.object({
          type: z.literal('self_hosted'),
          workspace_directory: z.literal('/workspace'),
        }),
        mcpServers: z
          .array(z.object({ type: z.literal('mcp'), connection_origin: z.literal('service') }))
          .default([]),
      }).parse(options.launchSettings);
    }
    executor = new DockerSessionExecutor(
      { imageId: settings.imageId },
      fingerprint(config.target),
      async () => {
        const environmentKey = await readCredential(settings.credential);
        if (environmentKey === key)
          throw new Error('Executor credential must differ from application credential');
        return environmentKey;
      }
    );
  }
  return new OperatorRuntimePort(
    new OpenAIPlatform(config, key),
    config.target,
    expiry,
    options.applicationFunctions,
    options.launchSettings,
    executor,
    options.credentialFiles
  );
}
