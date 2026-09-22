#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { driveRuntimeFailure } from './failure.js';
import { runDriveCli } from './runtime.js';

export async function main(args: string[]): Promise<string> {
  const { values } = parseArgs({
    args,
    options: {
      profile: { type: 'string' },
      request: { type: 'string' },
      output: { type: 'string' },
    },
    strict: true,
  });
  if (!values.profile || !values.request || !values.output)
    throw new Error('--profile, --request and --output are required');
  return runDriveCli({ profile: values.profile, request: values.request, output: values.output });
}
function invokedDirectly(): boolean {
  if (process.argv[1] === undefined) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (invokedDirectly()) {
  main(process.argv.slice(2))
    .then((path) => {
      process.stdout.write(`${JSON.stringify({ resultFile: path })}\n`);
      return undefined;
    })
    .catch((error: unknown) => {
      process.stderr.write(`${JSON.stringify(driveRuntimeFailure(error))}\n`);
      process.exitCode = 1;
    });
}
