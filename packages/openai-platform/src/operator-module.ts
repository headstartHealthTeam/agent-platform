/** Trusted application artifact, not executable agent scratch or a credential sandbox. */
import type { AgentHostedCredentialFiles } from '@headstart-health/workflow-contracts';

import { resolveRuntimeConfig } from './config.js';
import { OperatorRuntimePort } from './operator-runtime.js';
import { OpenAIPlatform } from './platform.js';
import type { SessionExecutor } from './session-executor.js';

export const protocol = 'headstart-openai-operator/v1';
export const adapterVersion = '0.10.0';
export { OperatorRuntimePort } from './operator-runtime.js';
export { createLocalOperatorRuntimePort } from './local-operator-runtime.js';
export { OpenAIPlatform } from './platform.js';
export { resolveConfig, resolveRuntimeConfig } from './config.js';
export { DockerSessionExecutor } from './docker-executor.js';

/** An owning service may provision its credential independently of the workstation resolver.
 * Transport injection supports deterministic SDK-boundary tests; never expose it to operators.
 */
export function createOperatorRuntimePort(options: {
  config: unknown;
  apiKey: string;
  billableUntil?: string;
  applicationFunctions?: string[];
  launchSettings?: unknown;
  executor?: SessionExecutor;
  fetchImplementation?: typeof fetch;
  credentialFiles?: AgentHostedCredentialFiles;
}): OperatorRuntimePort {
  const config = resolveRuntimeConfig(options.config);
  const expiry = options.billableUntil === undefined ? 0 : Date.parse(options.billableUntil);
  if (!Number.isFinite(expiry)) throw new Error('Invalid inference authorization expiry');
  return new OperatorRuntimePort(
    new OpenAIPlatform(config, options.apiKey, options.fetchImplementation),
    config.target,
    expiry,
    options.applicationFunctions,
    options.launchSettings,
    options.executor,
    options.credentialFiles
  );
}
