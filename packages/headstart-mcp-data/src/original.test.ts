import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { downloadMcpOriginal, type DocumentSelection } from './original.js';

export const selection = {
  recordIdOrUrl: 'a00000000000001',
  object: 'Headstart_Provider_Profile__c',
  contentDocumentId: '069000000000001',
  contentVersionId: '068000000000001',
};
function response(bytes: Buffer, mimeType = 'text/plain', source = selection): CallToolResult {
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  return {
    structuredContent: {
      data: {
        contentMode: 'original',
        truncated: false,
        linkedRecord: { recordId: source.recordIdOrUrl },
        files: [source],
        document: { digest, byteLength: bytes.length, mimeType },
      },
    },
    content: [
      { type: 'text', text: 'Metadata is not the evidence' },
      {
        type: 'resource',
        resource: {
          uri: `urn:headstart:document:${digest}`,
          mimeType,
          blob: bytes.toString('base64'),
        },
      },
    ],
  };
}
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true })));
});
async function output(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'mcp-evidence-'));
  roots.push(path);
  return join(path, 'evidence');
}

describe('MCP original-file materialization', () => {
  const reference = {
    source: 'headstart-knowledge',
    id: '00000000-0000-4000-8000-000000000001',
    revision: '2026-01-01T00:00:00.000Z',
  } satisfies DocumentSelection;
  function referenceResponse(
    bytes: Buffer,
    overrides: Record<string, unknown> = {}
  ): CallToolResult {
    return {
      ...response(bytes),
      structuredContent: {
        data: {
          id: reference.id,
          revision: reference.revision,
          contentMode: 'original',
          truncated: false,
          document: {
            digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
            byteLength: bytes.length,
            mimeType: 'text/plain',
          },
          ...overrides,
        },
      },
    };
  }
  it('retrieves a complete internal reference at its exact discovered revision', async () => {
    const bytes = Buffer.from(`${'complete reference\n'.repeat(8000)}FINAL REQUIREMENT`);
    const client = { callTool: vi.fn(async () => referenceResponse(bytes)) };
    const directory = await output();
    const receipt = await downloadMcpOriginal(client, reference, directory);
    expect(client.callTool).toHaveBeenCalledWith({
      name: 'fetch',
      arguments: { id: reference.id, revision: reference.revision },
    });
    expect(await readFile(join(directory, 'evidence-0.txt'))).toEqual(bytes);
    expect(await readFile(receipt, 'utf8')).toContain(reference.revision);
  });
  it.each([
    { id: '00000000-0000-4000-8000-000000000002' },
    { revision: '2026-01-02T00:00:00.000Z' },
    { truncated: true },
    { contentMode: 'summary' },
    { document: { digest: 'wrong', byteLength: 1, mimeType: 'text/plain' } },
  ])('rejects mismatched or incomplete internal references', async (overrides) => {
    await expect(
      downloadMcpOriginal(
        { callTool: async () => referenceResponse(Buffer.from('original'), overrides) },
        reference,
        await output()
      )
    ).rejects.toThrow();
  });
  it('accepts expanded Salesforce IDs but rejects different records, versions and case-sensitive identities', async () => {
    const expanded = {
      ...selection,
      recordIdOrUrl: `${selection.recordIdOrUrl}AAA`,
      contentDocumentId: `${selection.contentDocumentId}AAA`,
      contentVersionId: `${selection.contentVersionId}AAA`,
    };
    await expect(
      downloadMcpOriginal(
        { callTool: async () => response(Buffer.from('original'), 'text/plain', expanded) },
        selection,
        await output()
      )
    ).resolves.toContain('result.json');
    for (const wrong of [
      { ...expanded, recordIdOrUrl: 'a00000000000002AAA' },
      { ...expanded, recordIdOrUrl: 'A00000000000001AAA' },
      { ...expanded, contentDocumentId: '069000000000002AAA' },
      { ...expanded, contentVersionId: '068000000000002AAA' },
    ]) {
      await expect(
        downloadMcpOriginal(
          { callTool: async () => response(Buffer.from('original'), 'text/plain', wrong) },
          selection,
          await output()
        )
      ).rejects.toThrow();
    }
  });
  it('preserves full original bytes and exact selection using the existing source tool', async () => {
    const bytes = Buffer.from(`${'all history\n'.repeat(8000)}LAST CONFLICT`);
    const client = { callTool: vi.fn(async () => response(bytes)) };
    const directory = await output();
    const path = await downloadMcpOriginal(client, selection, directory);
    expect(client.callTool).toHaveBeenCalledWith({
      name: 'get_salesforce_record_files',
      arguments: { ...selection, contentMode: 'original' },
    });
    expect(await readFile(join(directory, 'evidence-0.txt'))).toEqual(bytes);
    const receipt = await readFile(path, 'utf8');
    expect(receipt).toContain(selection.contentVersionId);
    expect(receipt).not.toContain(bytes.toString('base64'));
    await expect(downloadMcpOriginal(client, selection, directory)).rejects.toMatchObject({
      code: 'EEXIST',
    });
  });
  it.each([
    { content: [], isError: true },
    { content: [{ type: 'text', text: 'A summary' }] },
    { content: [...response(Buffer.from('one')).content, ...response(Buffer.from('two')).content] },
    {
      content: [
        {
          type: 'resource',
          resource: { uri: 'wrong-digest', mimeType: 'image/tiff', blob: 'AAE=' },
        },
      ],
    },
  ])(
    'does not produce a successful receipt from an incomplete or invalid response',
    async (result) => {
      await expect(
        downloadMcpOriginal({ callTool: async () => result }, selection, await output())
      ).rejects.toThrow();
    }
  );
  it('requires an explicit path and exact original selection', async () => {
    const client = { callTool: vi.fn() };
    await expect(downloadMcpOriginal(client, selection, 'relative')).rejects.toThrow('absolute');
    await expect(
      downloadMcpOriginal(client, { ...selection, contentVersionId: '' }, await output())
    ).rejects.toThrow();
    expect(client.callTool).not.toHaveBeenCalled();
  });
});
