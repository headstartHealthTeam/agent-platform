#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';

import { downloadMcpOriginal, McpDocumentReadError, selectionSchema } from './original.js';
import { compatibleHttpTransport } from './transport.js';

export const profileSchema = z
  .object({
    serverUrl: z.url().refine((value) => {
      const url = new URL(value);
      return (
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        (url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost'))
      );
    }),
    authorizationEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  })
  .strict();

export async function main(args: string[]): Promise<string> {
  const { values } = parseArgs({
    args,
    strict: true,
    options: {
      profile: { type: 'string' },
      request: { type: 'string' },
      output: { type: 'string' },
    },
  });
  if (
    !values.profile ||
    !values.request ||
    !values.output ||
    ![values.profile, values.request, values.output].every(isAbsolute)
  )
    throw new McpDocumentReadError('Absolute --profile, --request and --output paths are required');
  const profile = profileSchema.parse(JSON.parse(await readFile(values.profile, 'utf8')));
  const selection = selectionSchema.parse(JSON.parse(await readFile(values.request, 'utf8')));
  const authorization = process.env[profile.authorizationEnv];
  if (!authorization || /[\r\n]/.test(authorization))
    throw new McpDocumentReadError('The provisioned MCP authorization is unavailable');
  const client = new Client({ name: 'headstart-mcp-document', version: '0.1.0' });
  const transport = new StreamableHTTPClientTransport(new URL(profile.serverUrl), {
    requestInit: { headers: { Authorization: authorization }, redirect: 'error' },
  });
  try {
    try {
      await client.connect(compatibleHttpTransport(transport));
    } catch {
      throw new McpDocumentReadError(
        'MCP connection failed. Check the endpoint, provisioned authorization and service availability.'
      );
    }
    return await downloadMcpOriginal(client, selection, values.output);
  } finally {
    await client.close();
  }
}
export function mcpDocumentFailure(error: unknown): string {
  if (error instanceof McpDocumentReadError) return error.message;
  if (error instanceof z.ZodError)
    return 'Invalid request or original-source identity/shape. Rediscover the exact file/version and check the profile; no complete receipt produced.';
  if (error instanceof Error && 'code' in error) {
    if (error.code === 'EEXIST')
      return 'Output directory already exists. Select a new directory; existing evidence is unchanged.';
    if (error.code === 'ENOENT' || error.code === 'EACCES')
      return 'A required input or output path is missing or inaccessible. Check file paths and permissions.';
  }
  return 'MCP document read failed. Check CLI arguments, source availability and the runtime connection; no complete receipt produced.';
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
    .then((resultFile) => {
      process.stdout.write(`${JSON.stringify({ resultFile })}\n`);
      return undefined;
    })
    .catch((error: unknown) => {
      process.stderr.write(`${mcpDocumentFailure(error)}\n`);
      process.exitCode = 1;
    });
}
