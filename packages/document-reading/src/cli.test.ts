import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { main, documentFailure } from './cli.js';
import { DocumentReadError, DocumentReadBusyError } from './document-read-error.js';
import { materializeDocumentContent } from './materialize.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true })));
});
async function root(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'document-cli-'));
  roots.push(path);
  return path;
}

describe('agent-side document inspection', () => {
  it('provides actionable local diagnostics without exposing arbitrary upstream errors', () => {
    expect(documentFailure(new DocumentReadError('Use a positive page number.'))).toContain(
      'positive page'
    );
    expect(documentFailure(new DocumentReadBusyError('Retry later.'))).toContain(
      'temporarily busy'
    );
    expect(documentFailure(Object.assign(new Error('private'), { code: 'EEXIST' }))).toContain(
      'already exists'
    );
    expect(documentFailure(Object.assign(new Error('private'), { code: 'ENOENT' }))).toContain(
      'missing'
    );
    expect(documentFailure(new Error('private upstream content'))).not.toContain('private');
  });
  it('reads a real local original across cursors without a summary or new source connection', async () => {
    const directory = await root();
    const file = join(directory, 'original.txt');
    const source = `${'long repeated history\n'.repeat(4000)}LATE CONTRADICTION`;
    await writeFile(file, source);
    for (let offset = 0; offset < source.length; offset += 24_000) {
      const path = await main([
        '--file',
        file,
        '--mime',
        'text/plain',
        '--mode',
        'text',
        '--offset',
        String(offset),
        '--output',
        join(directory, `page-${String(offset)}`),
      ]);
      const result = await readFile(path, 'utf8');
      expect(result).toContain(JSON.stringify(source.slice(offset, offset + 24_000)));
      expect(result).toContain(
        `"nextOffset":${offset + 24_000 < source.length ? String(offset + 24_000) : 'null'}`
      );
    }
  });
  it.each(['page', 'original'])(
    'writes %s image evidence as usable files, without overwriting',
    async (mode) => {
      const directory = await root();
      const file = join(directory, 'original.png');
      const bytes = Buffer.from([137, 80, 78, 71]);
      await writeFile(file, bytes);
      const output = join(directory, 'view');
      const args = [
        '--file',
        file,
        '--mime',
        'image/png',
        '--mode',
        mode,
        '--page',
        '1',
        '--output',
        output,
      ];
      const path = await main(args);
      expect(await readFile(join(output, 'evidence-0.png'))).toEqual(bytes);
      expect(await readFile(path, 'utf8')).not.toContain(bytes.toString('base64'));
      await expect(main(args)).rejects.toMatchObject({ code: 'EEXIST' });
    }
  );
  it('keeps unknown originals and refuses malformed encodings', async () => {
    const directory = await root();
    const resource = {
      type: 'resource' as const,
      resource: { uri: 'synthetic', mimeType: 'application/octet-stream', blob: 'AAE=' },
    };
    const saved = await materializeDocumentContent([resource], directory);
    expect(saved[0]?.path).toBe(join(directory, 'evidence-0.bin'));
    expect(await readFile(join(directory, 'evidence-0.bin'))).toEqual(Buffer.from([0, 1]));
    await expect(
      materializeDocumentContent(
        [{ ...resource, resource: { ...resource.resource, blob: 'NOT BASE64' } }],
        directory
      )
    ).rejects.toThrow('encoding');
  });
  it('validates commands before claiming an inspection', async () => {
    await expect(main([])).rejects.toThrow('absolute');
    const directory = await root();
    await expect(
      main([
        '--file',
        join(directory, 'file'),
        '--mime',
        'text/plain',
        '--mode',
        'summary',
        '--output',
        join(directory, 'output'),
      ])
    ).rejects.toThrow('--mode');
  });
});
