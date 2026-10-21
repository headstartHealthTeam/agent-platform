import type { AgentCapabilityFiles } from '@headstart-health/workflow-contracts';
import { z } from 'zod';

import { capabilityDirectories, validateHostedInputFiles, workspaceFile } from './hosted-setup.js';
import type { Action } from './operations.js';

const bundleSchema = z
  .object({
    directories: capabilityDirectories.min(1),
    files: z
      .array(z.object({ path: workspaceFile, data: z.base64() }).strict())
      .min(1)
      .max(50),
  })
  .strict();

/** Install reviewed source through normal hosted input files; never generate or fetch workflow code.
 * Legacy definitions remain valid. Desktop authoring reads the same canonical checkout files.
 */
export function bindCapabilityFiles(
  action: Extract<Action, { operation: 'sessions.create' }>,
  input: AgentCapabilityFiles | undefined
): void {
  if (input === undefined) return;
  const bundle = bundleSchema.parse(input);
  const environment = action.body.environment;
  if (environment.type !== 'openai_hosted')
    throw new Error('Packaged capability files require hosted input-file installation');
  if (
    environment.environment_template_id &&
    (environment.files === undefined || environment.capability_directories === undefined)
  )
    throw new Error(
      'Template capability installation requires explicit complete files and capability directories'
    );
  const files = [
    ...(environment.files ?? []),
    ...bundle.files.map((file) => ({ type: 'inline' as const, ...file })),
  ];
  validateHostedInputFiles(files);
  if (
    bundle.files.some(
      (file) => file.path === '/workspace/outputs' || file.path.startsWith('/workspace/outputs/')
    )
  )
    throw new Error('Capability source must not be an output artifact');
  for (const directory of bundle.directories) {
    if (
      !bundle.files.some(
        (file) => file.path.startsWith(`${directory}/`) && file.path.endsWith('/SKILL.md')
      )
    )
      throw new Error('Capability directory has no packaged skill');
  }
  environment.capability_directories = capabilityDirectories.parse([
    ...new Set([...(environment.capability_directories ?? []), ...bundle.directories]),
  ]);
  environment.files = files;
}
