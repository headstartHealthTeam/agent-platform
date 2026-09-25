import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

describe('connected preparation tool definition', () => {
  afterEach(() => {
    vi.doUnmock('node:fs/promises');
    vi.resetModules();
  });

  it('requires the discovered source object in newly generated capture calls', async () => {
    const writeFile = vi.fn();
    vi.doMock('node:fs/promises', () => ({
      readFile: vi.fn().mockResolvedValue('{}'),
      writeFile,
    }));
    await import('./preparation-definition.build.js');
    expect(writeFile).toHaveBeenCalledOnce();
    const content: unknown = writeFile.mock.calls[0]?.[1];
    if (typeof content !== 'string') throw new Error('Missing generated definition');
    const generated = z
      .object({
        definition: z.object({
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
  });
});
