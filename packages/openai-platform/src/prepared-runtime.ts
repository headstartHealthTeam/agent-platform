import { z } from 'zod';

import type { Action } from './operations.js';
import type { OpenAIPlatform } from './platform.js';

export const preparedRuntimeBinding = z
  .object({
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    templateFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

/** A saved template is mutable configuration, not an immutable image. Verify the recorded
 * provider snapshot on every new launch, including immediately before credential provisioning.
 * Existing-session controls deliberately do not depend on this launch-only check.
 */
export async function verifyPreparedRuntime(
  platform: Pick<OpenAIPlatform, 'read'>,
  action: Extract<Action, { operation: 'sessions.create' }>,
  revision: string | undefined,
  binding: z.infer<typeof preparedRuntimeBinding> | undefined,
  hasInlineCapabilities: boolean
): Promise<void> {
  if (revision === undefined && binding === undefined) return;
  if (!revision || revision !== binding?.revision || hasInlineCapabilities)
    throw new Error('Prepared runtime revision mismatch');
  const environment = action.body.environment;
  if (
    environment.type !== 'openai_hosted' ||
    !environment.environment_template_id ||
    environment.files !== undefined ||
    environment.packages !== undefined ||
    environment.setup_commands !== undefined ||
    environment.capability_directories !== undefined
  )
    throw new Error('Prepared runtime requires its unmodified hosted template');
  const result = await platform.read({
    operation: 'templates.get',
    id: environment.environment_template_id,
  });
  if (result.fingerprint !== binding.templateFingerprint)
    throw new Error('Prepared runtime template changed; verify and publish a new binding');
}
