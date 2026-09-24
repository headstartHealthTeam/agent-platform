#!/usr/bin/env node
import { runSavedPublicationCommand } from './cli-publication.js';

const [command = '', ...args] = process.argv.slice(2);
try {
  const result = await runSavedPublicationCommand(command, args);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
} catch (error) {
  const message = error instanceof Error ? error.message : 'unknown error';
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
}
