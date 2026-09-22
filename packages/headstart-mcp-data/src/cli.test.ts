import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { main, mcpDocumentFailure, profileSchema } from './cli.js';
import { McpDocumentReadError, selectionSchema } from './original.js';
import { compatibleHttpTransport } from './transport.js';

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true })));
});
async function paths(serverUrl: string): Promise<{ output: string; args: string[] }> {
  const root = await mkdtemp(join(tmpdir(), 'mcp-document-cli-'));
  roots.push(root);
  const profile = join(root, 'profile.json');
  const request = join(root, 'request.json');
  const output = join(root, 'output');
  await writeFile(profile, JSON.stringify({ serverUrl, authorizationEnv: 'SYNTHETIC_MCP_AUTH' }));
  await writeFile(
    request,
    JSON.stringify({
      recordIdOrUrl: 'a00000000000001',
      object: 'Headstart_Provider_Profile__c',
      contentDocumentId: '069000000000001',
      contentVersionId: '068000000000001',
    })
  );
  return { output, args: ['--profile', profile, '--request', request, '--output', output] };
}

describe('MCP runtime connection', () => {
  it('returns actionable diagnostics without raw source responses or credential values', () => {
    expect(
      mcpDocumentFailure(new McpDocumentReadError('Original-file content identity mismatch'))
    ).toContain('identity mismatch');
    expect(mcpDocumentFailure(new z.ZodError([]))).toContain('Rediscover');
    expect(mcpDocumentFailure(Object.assign(new Error('private'), { code: 'EEXIST' }))).toContain(
      'already exists'
    );
    expect(mcpDocumentFailure(Object.assign(new Error('private'), { code: 'EACCES' }))).toContain(
      'inaccessible'
    );
    expect(mcpDocumentFailure(new Error('private upstream content'))).not.toContain('private');
  });
  it('downloads through the real MCP SDK over authenticated HTTP into the agent filesystem', async () => {
    const bytes = Buffer.from(`${'complete source\n'.repeat(5000)}FINAL FACT`);
    const server = new McpServer({ name: 'synthetic-headstart', version: '1' });
    server.registerTool(
      'get_salesforce_record_files',
      {
        inputSchema: selectionSchema.extend({ contentMode: z.literal('original') }).shape,
      },
      async (input) => ({
        structuredContent: {
          data: {
            contentMode: 'original',
            truncated: false,
            linkedRecord: { recordId: input.recordIdOrUrl },
            files: [input],
            document: {
              digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
              byteLength: bytes.length,
              mimeType: 'text/plain',
            },
          },
        },
        content: [
          {
            type: 'resource',
            resource: {
              uri: `urn:headstart:document:sha256:${createHash('sha256').update(bytes).digest('hex')}`,
              mimeType: 'text/plain',
              blob: bytes.toString('base64'),
            },
          },
        ],
      })
    );
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: randomUUID,
      enableJsonResponse: true,
    });
    await server.connect(compatibleHttpTransport(transport));
    const authorizations: (string | undefined)[] = [];
    const protocolVersions: (string | string[] | undefined)[] = [];
    const requestErrors: unknown[] = [];
    const http = createServer((request, response) => {
      authorizations.push(request.headers.authorization);
      protocolVersions.push(request.headers['mcp-protocol-version']);
      transport.handleRequest(request, response).catch((error: unknown) => {
        requestErrors.push(error);
        response.destroy();
      });
    });
    await new Promise<void>((resolve) => http.listen(0, 'localhost', resolve));
    try {
      const address = http.address();
      if (address === null || typeof address === 'string') throw new Error('Missing test port');
      vi.stubEnv('SYNTHETIC_MCP_AUTH', 'Bearer synthetic-test-only');
      const input = await paths(`http://localhost:${String(address.port)}/mcp`);
      const resultFile = await main(input.args);
      expect(await readFile(join(input.output, 'evidence-0.txt'))).toEqual(bytes);
      expect(await readFile(resultFile, 'utf8')).not.toContain('synthetic-test-only');
      expect(authorizations.length).toBeGreaterThan(1);
      expect(authorizations.every((value) => value === 'Bearer synthetic-test-only')).toBe(true);
      expect(requestErrors).toEqual([]);
      expect(protocolVersions[0]).toBeUndefined();
      expect(
        protocolVersions
          .slice(1)
          .every((version) => typeof version === 'string' && version.length > 0)
      ).toBe(true);
    } finally {
      await server.close();
      http.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        http.close((error) => {
          if (error) reject(error);
          else resolve();
        })
      );
    }
  }, 30_000);
  it('requires provisioned credentials, exact requests and a secure endpoint', async () => {
    await expect(main([])).rejects.toThrow('Absolute');
    const input = await paths('https://mcp.example.com/mcp');
    vi.stubEnv('SYNTHETIC_MCP_AUTH', '');
    await expect(main(input.args)).rejects.toThrow('unavailable');
    vi.stubEnv('SYNTHETIC_MCP_AUTH', 'invalid\nheader');
    await expect(main(input.args)).rejects.toThrow('unavailable');
    expect(
      profileSchema.safeParse({
        serverUrl: 'http://remote.example.com/mcp',
        authorizationEnv: 'KEY',
      }).success
    ).toBe(false);
    const userinfoUrl = new URL('https://example.com/mcp');
    userinfoUrl.username = 'synthetic-user';
    expect(
      profileSchema.safeParse({ serverUrl: userinfoUrl.toString(), authorizationEnv: 'KEY' })
        .success
    ).toBe(false);
  });
});
