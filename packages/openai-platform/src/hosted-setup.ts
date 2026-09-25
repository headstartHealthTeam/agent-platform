import { posix } from 'node:path';

import { z } from 'zod';

// Deployment-owned setup, shared by inline hosted sessions and reusable templates.
// Values are not secrets: hosted vault credentials remain a separate binding.
const workspaceFile = z
  .string()
  .refine(
    (value) =>
      value.startsWith('/workspace/') &&
      !value.includes('\\') &&
      !/\p{Cc}/u.test(value) &&
      posix.normalize(value) === value &&
      !value.endsWith('/')
  );
const packages = z
  .object({
    npm: z.array(z.string().min(1)).nullable().optional(),
    python: z.array(z.string().min(1)).nullable().optional(),
    system: z.array(z.string().min(1)).nullable().optional(),
  })
  .strict()
  .transform((value) => ({
    ...(value.npm === undefined ? {} : { npm: value.npm }),
    ...(value.python === undefined ? {} : { python: value.python }),
    ...(value.system === undefined ? {} : { system: value.system }),
  }));
const files = z.array(
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('inline'), path: workspaceFile, data: z.base64() }).strict(),
    z
      .object({ type: z.literal('file_id'), path: workspaceFile, file_id: z.string().min(1) })
      .strict(),
  ])
);
const commands = z.array(
  z
    .object({ command: z.string().min(1), cwd: z.string().startsWith('/').nullable().optional() })
    .strict()
    .transform(({ command, cwd }) => ({ command, ...(cwd === undefined ? {} : { cwd }) }))
);

export const hostedSetupFields = {
  packages: packages.nullable().optional(),
  files: files.nullable().optional(),
  env: z.record(z.string(), z.string()).nullable().optional(),
  setup_commands: commands.nullable().optional(),
};
type Setup = { [Key in keyof typeof hostedSetupFields]?: z.infer<(typeof hostedSetupFields)[Key]> };

/** Preserve omitted fields (template inheritance) and explicit null/empty overrides. */
export function hostedSetup(value: Setup): {
  packages?: z.infer<typeof packages> | null;
  files?: z.infer<typeof files> | null;
  env?: Record<string, string> | null;
  setup_commands?: z.infer<typeof commands> | null;
} {
  return {
    ...(value.packages === undefined ? {} : { packages: value.packages }),
    ...(value.files === undefined ? {} : { files: value.files }),
    ...(value.env === undefined ? {} : { env: value.env }),
    ...(value.setup_commands === undefined ? {} : { setup_commands: value.setup_commands }),
  };
}
