#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { analyzeBundle, canonicalJsonPretty } from './analysis.js';

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${canonicalJsonPretty(value)}\n`, 'utf8');
  await rename(temporary, absolute);
}

async function execute(): Promise<void> {
  const parsed = parseArgs({
    args: process.argv.slice(2),
    options: {
      input: { type: 'string' },
      output: { type: 'string' },
    },
  });
  const input = parsed.values.input;
  const output = parsed.values.output;
  if (input === undefined || output === undefined) {
    throw new Error('--input and --output are required');
  }
  const raw: unknown = JSON.parse(await readFile(resolve(input), 'utf8'));
  await writeJsonAtomic(output, analyzeBundle(raw));
  process.stdout.write(`${resolve(output)}\n`);
}

execute().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown error';
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
