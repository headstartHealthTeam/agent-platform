import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import { materializeDocumentContent } from '@headstart-health/document-reading';
import { z } from 'zod';

const id = z
  .string()
  .min(15)
  .max(18)
  .regex(/^[a-zA-Z0-9]+$/)
  .refine((value) => value.length === 15 || value.length === 18);
// Salesforce's 18-character form extends the case-sensitive 15-character identity.
const matchingId = (expected: string): typeof id =>
  id.refine((actual) => actual.slice(0, 15) === expected.slice(0, 15));
/** Only fixed local diagnostics, never arbitrary MCP response bodies. */
export class McpDocumentReadError extends Error {}
export const selectionSchema = z
  .object({
    recordIdOrUrl: id,
    object: z.string().min(1).optional(),
    contentDocumentId: id,
    contentVersionId: id,
  })
  .strict();
export type DocumentSelection = z.infer<typeof selectionSchema>;
export interface McpToolReader {
  callTool(request: { name: string; arguments: Record<string, unknown> }): Promise<unknown>;
}
const originalSchema = z.object({
  type: z.literal('resource'),
  resource: z.object({ uri: z.string(), mimeType: z.string().min(1), blob: z.string() }),
});
const resultSchema = z.object({
  isError: z.boolean().optional(),
  content: z.array(z.unknown()),
  structuredContent: z.unknown().optional(),
});

/** Reuse MCP authorization/source lookup; do not create a Salesforce connector or parser here. */
export async function downloadMcpOriginal(
  client: McpToolReader,
  selection: DocumentSelection,
  directory: string
): Promise<string> {
  if (!isAbsolute(directory)) throw new McpDocumentReadError('Use an absolute evidence directory');
  const input = selectionSchema.parse(selection);
  const result = resultSchema.parse(
    await client.callTool({
      name: 'get_salesforce_record_files',
      arguments: { ...input, contentMode: 'original' },
    })
  );
  if (result.isError)
    throw new McpDocumentReadError(
      'MCP original-file read was rejected. Check the selected record/version and current source permission; no evidence delivered.'
    );
  const resources = result.content.flatMap((block) => {
    const parsed = originalSchema.safeParse(block);
    return parsed.success ? [parsed.data] : [];
  });
  const block = resources[0];
  if (resources.length !== 1 || !block)
    throw new McpDocumentReadError(
      'Expected exactly one original file; metadata or a summary is not evidence'
    );
  const bytes = Buffer.from(block.resource.blob, 'base64');
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (block.resource.uri !== `urn:headstart:document:${digest}`)
    throw new McpDocumentReadError('Original-file content identity mismatch');
  z.object({
    data: z.object({
      contentMode: z.literal('original'),
      truncated: z.literal(false),
      linkedRecord: z.object({ recordId: matchingId(input.recordIdOrUrl) }),
      files: z
        .array(
          z.object({
            contentDocumentId: matchingId(input.contentDocumentId),
            contentVersionId: matchingId(input.contentVersionId),
          })
        )
        .length(1),
      document: z.object({
        digest: z.literal(digest),
        byteLength: z.literal(bytes.length),
        mimeType: z.literal(block.resource.mimeType),
      }),
    }),
  }).parse(result.structuredContent);
  await mkdir(directory, { mode: 0o700 });
  const artifacts = await materializeDocumentContent([block], directory);
  const path = join(directory, 'result.json');
  await writeFile(
    path,
    JSON.stringify({
      source: input,
      digest,
      byteLength: bytes.length,
      artifacts,
    }),
    { flag: 'wx', mode: 0o600 }
  );
  return path;
}
