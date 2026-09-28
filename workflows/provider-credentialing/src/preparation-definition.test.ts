import { createHash } from 'node:crypto';
import type * as FileSystem from 'node:fs/promises';
import { readFile } from 'node:fs/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

describe('connected preparation tool definition', () => {
  afterEach(() => {
    vi.doUnmock('node:fs/promises');
    vi.resetModules();
  });

  it('requires the discovered source object in newly generated capture calls', async () => {
    const writeFile = vi.fn();
    vi.doMock('node:fs/promises', async () => ({
      ...(await vi.importActual<typeof FileSystem>('node:fs/promises')),
      writeFile,
    }));
    await import('./preparation-definition.build.js');
    expect(writeFile).toHaveBeenCalledOnce();
    const content: unknown = writeFile.mock.calls[0]?.[1];
    if (typeof content !== 'string') throw new Error('Missing generated definition');
    const generated = z
      .object({
        workflowRevision: z.string(),
        definition: z.object({
          instructions: z.string(),
          capabilities: z.object({
            directories: z.array(z.string()),
            files: z.array(z.object({ path: z.string(), data: z.string() })),
          }),
          tools: z.array(
            z.object({
              name: z.string(),
              parameters: z.object({ required: z.array(z.string()).optional() }),
            })
          ),
        }),
      })
      .parse(JSON.parse(content));
    const capture = generated.definition.tools.find(
      (tool) => tool.name === 'capture_credentialing_source_document'
    );
    expect(capture?.parameters.required).toEqual([
      'subject',
      'sourceObject',
      'linkedRecordId',
      'contentDocumentId',
      'contentVersionId',
    ]);
    const raw: unknown = JSON.parse(content);
    const parsed = z.object({ definition: z.record(z.string(), z.unknown()) }).parse(raw);
    expect(generated.workflowRevision).toBe(
      createHash('sha256').update(JSON.stringify(parsed.definition)).digest('hex')
    );
    expect(generated.definition.instructions.length).toBeLessThan(1000);
    expect(generated.definition.capabilities.directories).toEqual([
      '/workspace/headstart-workflow/skills',
    ]);
    expect(generated.definition.capabilities.files).toHaveLength(5);
    for (const file of generated.definition.capabilities.files) {
      const source = file.path.replace('/workspace/headstart-workflow/', '../../../');
      expect(Buffer.from(file.data, 'base64')).toEqual(
        await readFile(new URL(source, import.meta.url))
      );
      expect(file.path).not.toMatch(/evals|fixtures|oracle/);
    }
    expect(Buffer.byteLength(content)).toBeLessThan(150_000);
  });
});
