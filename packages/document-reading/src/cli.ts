#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { DocumentReadBusyError, DocumentReadError } from './document-read-error.js';
import { materializeDocumentContent } from './materialize.js';
import { readDocument } from './read-document.js';

/** Inspect a local original using the same parser package in desktop or hosted environments. */
export async function main(args: string[]): Promise<string> {
  const { values } = parseArgs({
    args,
    options: {
      file: { type: 'string' },
      mime: { type: 'string' },
      mode: { type: 'string' },
      page: { type: 'string' },
      offset: { type: 'string' },
      output: { type: 'string' },
    },
    strict: true,
  });
  if (
    !values.file ||
    !values.output ||
    !values.mime ||
    !isAbsolute(values.file) ||
    !isAbsolute(values.output)
  )
    throw new Error('--file and --output must be absolute paths; --mime is required');
  const mode = values.mode;
  if (mode !== 'text' && mode !== 'page' && mode !== 'original')
    throw new Error('--mode must be text, page or original');
  const result = await readDocument(await readFile(values.file), values.mime, {
    mode,
    ...(values.page === undefined ? {} : { page: Number(values.page) }),
    ...(values.offset === undefined ? {} : { offset: Number(values.offset) }),
  });
  await mkdir(values.output, { mode: 0o700 });
  const artifacts = await materializeDocumentContent(result.content, values.output);
  const path = join(values.output, 'result.json');
  await writeFile(path, JSON.stringify({ document: result.document, artifacts }), {
    flag: 'wx',
    mode: 0o600,
  });
  return path;
}
export function documentFailure(error: unknown): string {
  if (error instanceof DocumentReadBusyError) return `Parser temporarily busy: ${error.message}`;
  if (error instanceof DocumentReadError) return error.message;
  if (error instanceof Error && 'code' in error) {
    if (error.code === 'EEXIST')
      return 'Output directory already exists. Select a new directory; existing evidence is unchanged.';
    if (error.code === 'ENOENT' || error.code === 'EACCES')
      return 'A required file path is missing or inaccessible. Check --file, --output and file permissions.';
  }
  return 'Document inspection failed. Check --file, --mime, --mode, page/offset and a new --output directory. The original remains available for other runtime tools.';
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
    .then((resultFile) => {
      process.stdout.write(`${JSON.stringify({ resultFile })}\n`);
      return undefined;
    })
    .catch((error: unknown) => {
      process.stderr.write(`${documentFailure(error)}\n`);
      process.exitCode = 1;
    });
}
