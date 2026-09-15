#!/usr/bin/env node
import { runCommand } from './command.js';

try {
  console.log(JSON.stringify(await runCommand(process.argv.slice(2)), null, 2));
} catch {
  // A parser, filesystem, provider or subprocess exception can contain private input.
  console.error(
    'OpenAI command failed. Check configuration, request, approval, and provider access. Reconcile any attempted mutation before retrying.'
  );
  process.exitCode = 1;
}
