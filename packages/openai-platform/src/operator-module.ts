/** Trusted application artifact, not executable agent scratch or a credential sandbox. */
import { resolveConfig } from './config.js';
import { OperatorRuntimePort } from './operator-runtime.js';
import { OpenAIPlatform } from './platform.js';

export const protocol = 'headstart-openai-operator/v1';
export const adapterVersion = '0.2.0';
export { createLocalOperatorRuntimePort, OperatorRuntimePort } from './operator-runtime.js';
export { OpenAIPlatform } from './platform.js';
export { resolveConfig } from './config.js';

/** An owning service may provision its credential independently of the workstation resolver.
 * Transport injection supports deterministic SDK-boundary tests; never expose it to operators.
 */
export function createOperatorRuntimePort(options: {
  config: unknown;
  apiKey: string;
  billableUntil?: string;
  fetchImplementation?: typeof fetch;
}): OperatorRuntimePort {
  const config = resolveConfig(options.config);
  const expiry = options.billableUntil === undefined ? 0 : Date.parse(options.billableUntil);
  if (!Number.isFinite(expiry)) throw new Error('Invalid inference authorization expiry');
  return new OperatorRuntimePort(
    new OpenAIPlatform(config, options.apiKey, options.fetchImplementation),
    config.target,
    expiry
  );
}
