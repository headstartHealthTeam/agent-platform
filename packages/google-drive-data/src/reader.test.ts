import { createHash } from 'node:crypto';

import { Workbook } from 'exceljs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GoogleDriveReadPort } from './provider.js';
import { GoogleDriveReader } from './reader.js';

describe('complete read-only Google Drive evidence', () => {
  const get = vi.fn<GoogleDriveReadPort['get']>();
  const reader = new GoogleDriveReader({ get });
  const file = {
    id: 'invented_file',
    name: 'Invented evidence',
    version: '10',
    mimeType: 'text/plain',
    capabilities: { canDownload: true },
  };
  const json = (value: unknown): Response => new Response(JSON.stringify(value));
  const arrange = (
    bytes: Buffer,
    metadata: typeof file & { md5Checksum?: string } = file
  ): void => {
    get.mockImplementation(async (_path, query) =>
      query['alt'] === 'media' ? new Response(Uint8Array.from(bytes)) : json(metadata)
    );
  };
  beforeEach(() => {
    get.mockReset();
  });

  it('verifies the actual Google account, not a local alias', async () => {
    get.mockResolvedValueOnce(json({ user: { emailAddress: 'agent@example.com' } }));
    await reader.verifyIdentity('Agent@example.com');
    expect(get).toHaveBeenCalledWith('about', { fields: 'user(emailAddress)' });
    get.mockResolvedValueOnce(json({ user: { emailAddress: 'other@example.com' } }));
    await expect(reader.verifyIdentity('agent@example.com')).rejects.toThrow('wrong-identity');
  });
  it('returns a continuation and explicitly marks incomplete shared-drive search', async () => {
    get.mockResolvedValueOnce(
      json({ files: [file], nextPageToken: 'next', incompleteSearch: true })
    );
    const first = await reader.list({ query: "'folder' in parents" });
    expect(first.nextPageToken).toBe('next');
    expect(first.incompleteSearch).toBe(true);
    get.mockResolvedValueOnce(json({ files: [{ ...file, id: 'later_file' }] }));
    expect(
      (await reader.list({ driveId: 'shared_drive', pageToken: first.nextPageToken ?? '' }))
        .nextPageToken
    ).toBeNull();
    expect(get.mock.calls[1]?.[1]).toMatchObject({
      pageToken: 'next',
      corpora: 'drive',
      driveId: 'shared_drive',
      includeItemsFromAllDrives: 'true',
    });
  });
  it('reconstructs every character beyond the first text response', async () => {
    const full = `First employer\n${'Further history\n'.repeat(5000)}Contradiction on the final page`;
    arrange(Buffer.from(full));
    let offset: number | null = 0;
    let received = '';
    do {
      const result = await reader.read({
        fileId: file.id,
        version: file.version,
        mode: 'text',
        offset,
      });
      received += result.document.text ?? '';
      offset = result.document.nextOffset ?? null;
    } while (offset !== null);
    expect(received).toBe(full);
  });
  it('returns exact original bytes with checked source checksum and version', async () => {
    const bytes = Buffer.from('All evidence, not a summary');
    arrange(bytes, { ...file, md5Checksum: createHash('md5').update(bytes).digest('hex') });
    const result = await reader.read({ fileId: file.id, version: '10', mode: 'original' });
    expect(result.content).toEqual([
      {
        type: 'resource',
        resource: {
          uri: `urn:headstart:document:${result.document.digest}`,
          mimeType: 'text/plain',
          blob: bytes.toString('base64'),
        },
      },
    ]);
    expect(result.source.representation).toBe('original');
    expect(get).toHaveBeenCalledTimes(3);
  });
  it('reads every Google Doc tab and nested source structure without a summary model', async () => {
    const document = {
      documentId: file.id,
      tabs: [
        {
          documentTab: { body: { content: [{ text: 'First tab' }] } },
          childTabs: [
            {
              documentTab: {
                body: { content: [{ table: { text: 'Nested contradiction' } }] },
                footnotes: { note: { text: 'Complete note' } },
              },
            },
          ],
        },
        { documentTab: { body: { content: [{ text: 'Last tab evidence' }] } } },
      ],
    };
    get.mockImplementation(async (path) =>
      path.startsWith('documents/')
        ? json(document)
        : json({ ...file, mimeType: 'application/vnd.google-apps.document' })
    );
    const result = await reader.read({ fileId: file.id, version: '10', mode: 'text' });
    expect(JSON.parse(result.document.text ?? '')).toEqual(document);
    expect(get.mock.calls[1]).toEqual([
      `documents/${file.id}`,
      { includeTabsContent: 'true', suggestionsViewMode: 'SUGGESTIONS_INLINE' },
      undefined,
    ]);
    expect(result.source.representation).toBe('google-docs-structure');
  });
  it('uses the original workbook, including its hidden sheets and repeated rows', async () => {
    const workbook = new Workbook();
    workbook.addWorksheet('Reference').addRow(['Payer', 'Requirement']);
    workbook.addWorksheet('Prior history', { state: 'hidden' }).addRows([['Prior'], ['Corrected']]);
    arrange(Buffer.from(await workbook.xlsx.writeBuffer()), {
      ...file,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const result = await reader.read({ fileId: file.id, version: '10', mode: 'text' });
    expect(result.document.text).toContain('Prior history (hidden)');
    expect(result.document.text).toContain('Corrected');
  }, 35_000); // Real Office worker: allow its 30-second deadline and termination.
  it('labels native exports instead of pretending they are binary originals', async () => {
    get.mockImplementation(async (path) =>
      path.endsWith('/export')
        ? new Response('Native export')
        : json({ ...file, mimeType: 'application/vnd.google-apps.document' })
    );
    const result = await reader.read({
      fileId: file.id,
      version: '10',
      mode: 'original',
      exportMimeType: 'text/plain',
    });
    expect(result.source.representation).toBe('google-export');
    expect(result.document.warnings.join(' ')).toContain('not original');
    expect(get.mock.calls[1]).toEqual([
      `files/${file.id}/export`,
      { mimeType: 'text/plain' },
      undefined,
    ]);
  });
  it.each(['version-before', 'version-after', 'permission-after', 'checksum'])(
    'withholds evidence when %s is invalid',
    async (condition) => {
      arrange(Buffer.from('Invented bytes'));
      if (condition === 'version-before')
        get.mockResolvedValueOnce(json({ ...file, version: '11' }));
      if (condition === 'version-after' || condition === 'permission-after')
        get
          .mockResolvedValueOnce(json(file))
          .mockResolvedValueOnce(new Response('Invented bytes'))
          .mockResolvedValueOnce(
            json({
              ...file,
              version: condition === 'version-after' ? '11' : '10',
              capabilities: { canDownload: condition !== 'permission-after' },
            })
          );
      if (condition === 'checksum')
        arrange(Buffer.from('Invented bytes'), { ...file, md5Checksum: 'wrong' });
      await expect(
        reader.read({ fileId: file.id, version: '10', mode: 'original' })
      ).rejects.toThrow('google-drive-');
    }
  );
  it('preserves resource-key support without following arbitrary download URLs', async () => {
    arrange(Buffer.from('Evidence'));
    await reader.read({
      fileId: file.id,
      version: '10',
      mode: 'text',
      resourceKey: 'resource_key',
    });
    expect(get.mock.calls.every((call) => call[2] === `${file.id}/resource_key`)).toBe(true);
    get.mockClear();
    await expect(reader.metadata('https://example.com/private')).rejects.toThrow();
    expect(get).not.toHaveBeenCalled();
  });
  it.each([
    'denied',
    'trashed',
    'shortcut',
    'folder',
    'wrong-file',
    'native-without-export',
    'binary-with-export',
  ])('does not download an invalid %s request', async (condition) => {
    const metadata = {
      ...file,
      ...(condition === 'denied' ? { capabilities: { canDownload: false } } : {}),
      ...(condition === 'trashed' ? { trashed: true } : {}),
      ...(condition === 'shortcut'
        ? { shortcutDetails: { targetId: 'target', targetMimeType: 'text/plain' } }
        : {}),
      ...(condition === 'folder' ? { mimeType: 'application/vnd.google-apps.folder' } : {}),
      ...(condition === 'wrong-file' ? { id: 'different' } : {}),
      ...(condition === 'native-without-export'
        ? { mimeType: 'application/vnd.google-apps.spreadsheet' }
        : {}),
    };
    get.mockResolvedValueOnce(json(metadata));
    await expect(
      reader.read({
        fileId: file.id,
        version: '10',
        mode: 'original',
        ...(condition === 'binary-with-export' ? { exportMimeType: 'text/plain' } : {}),
      })
    ).rejects.toThrow();
    expect(get).toHaveBeenCalledTimes(1);
  });
});
