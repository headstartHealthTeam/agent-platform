import {
  GoogleDriveReader,
  type GoogleDriveReadPort,
  type DriveFile,
} from '@headstart-health/google-drive-data';
import { Workbook } from 'exceljs';
import { describe, expect, it, vi } from 'vitest';

const json = (value: unknown): Response => new Response(JSON.stringify(value));
const metadata = (id: string, mimeType = 'text/plain', version = '1'): DriveFile => ({
  id,
  name: `Synthetic ${id}`,
  mimeType,
  version,
  trashed: false,
  capabilities: { canDownload: true },
});

/** Tests the installed source-reading path, not model judgment or a passing hosted trial.
 * All identities, links and documents below are invented. No network/source credentials exist.
 */
describe('linked evidence investigation regression', () => {
  it('retains distinct workbook revisions for a current address read without replacing the prior original', async () => {
    const originals = await Promise.all(
      ['100 Example Mail Way', '200 Example Mail Way'].map(async (mailingAddress) => {
        const workbook = new Workbook();
        workbook.addWorksheet('headstart_info').addRows([
          ['Role', 'Synthetic value'],
          ['Enrolling entity', 'Example Enrolling Entity'],
          ['Default practice', '300 Example Practice Way'],
          ['Mailing', mailingAddress],
          ['Service modalities', 'Home; clinic; telehealth'],
        ]);
        return Buffer.from(await workbook.xlsx.writeBuffer());
      })
    );
    let revision = 1;
    const get = vi.fn<GoogleDriveReadPort['get']>(async (path, query) => {
      if (path !== 'files/maintained_reference') throw new Error('Unexpected synthetic resource');
      const bytes = originals[revision - 1];
      if (!bytes) throw new Error('Missing invented workbook');
      return query['alt'] === 'media'
        ? new Response(Uint8Array.from(bytes))
        : json(
            metadata(
              'maintained_reference',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              String(revision)
            )
          );
    });
    const reader = new GoogleDriveReader({ get });
    const before = await reader.read({
      fileId: 'maintained_reference',
      version: '1',
      mode: 'original',
    });
    const beforeJson = JSON.stringify(before);
    revision = 2;
    await expect(
      reader.read({ fileId: 'maintained_reference', version: '1', mode: 'text' })
    ).rejects.toThrow();
    const after = await reader.read({
      fileId: 'maintained_reference',
      version: '2',
      mode: 'original',
    });
    const current = await reader.read({
      fileId: 'maintained_reference',
      version: '2',
      mode: 'text',
    });
    expect(current.document.text).toContain('headstart_info');
    expect(current.document.text).toContain('200 Example Mail Way');
    expect(current.document.text).not.toContain('100 Example Mail Way');
    expect(current.document.text).toContain('300 Example Practice Way');
    expect(before.source.version).toBe('1');
    expect(after.source.version).toBe('2');
    expect(JSON.stringify(before)).toBe(beforeJson);
    for (const [index, result] of [before, after].entries()) {
      const resource = result.content[0];
      if (resource?.type !== 'resource' || !('blob' in resource.resource))
        throw new Error('Missing retained workbook original');
      expect(resource.resource.blob).toBe(originals.at(index)?.toString('base64'));
    }
    // This proves exact-version retrieval/bytes, not model mapping or application publication.
  });

  it('can follow a read SOP to every workbook sheet and paginated policy lead without a summary substitute', async () => {
    const workbook = new Workbook();
    workbook.addWorksheet('Group contacts').addRows([
      ['Practice key', 'Billing contact', 'Mailing address', 'Policy folder'],
      ['practice-alpha', 'Ops Alpha', '1 Example Way', 'folder_policies'],
    ]);
    workbook.addWorksheet('Archived providers', { state: 'hidden' }).addRows([
      ['Provider key', 'Name', 'Primary language', 'Email', 'Prior certification'],
      ['provider-beta', 'Same Name', 'French', 'beta@example.invalid', 'BETA-OLD'],
      ['provider-alpha', 'Same Name', 'Spanish', 'alpha@example.invalid', 'ALPHA-OLD'],
    ]);
    const workbookBytes = Buffer.from(await workbook.xlsx.writeBuffer());
    const policy = `${'Synthetic policy terms\n'.repeat(1800)}Group policy effective 2026-01-01 through 2026-12-31. Named roster: provider-beta. No evidence of provider-alpha membership.`;
    const get = vi.fn<GoogleDriveReadPort['get']>(async (path, query) => {
      if (path === 'files' && query['q']?.includes('folder_policies'))
        return json(
          query['pageToken'] === 'next'
            ? { files: [metadata('policy_current')] }
            : { files: [metadata('policy_old')], nextPageToken: 'next' }
        );
      if (path === 'documents/sop')
        return json({
          documentId: 'sop',
          tabs: [
            {
              documentTab: {
                body: { content: [{ text: 'Read the master tracker: workbook_master' }] },
              },
              childTabs: [
                {
                  documentTab: {
                    body: {
                      content: [
                        { text: 'Archived rows are historical leads, not current attestations.' },
                      ],
                    },
                  },
                },
              ],
            },
          ],
        });
      if (path === 'files/sop')
        return json(metadata('sop', 'application/vnd.google-apps.document'));
      if (path === 'files/workbook_master')
        return query['alt'] === 'media'
          ? new Response(Uint8Array.from(workbookBytes))
          : json(
              metadata(
                'workbook_master',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
              )
            );
      if (path === 'files/policy_current')
        return query['alt'] === 'media' ? new Response(policy) : json(metadata('policy_current'));
      throw new Error(`Unexpected synthetic read: ${path}`);
    });
    const reader = new GoogleDriveReader({ get });
    const sop = await reader.read({ fileId: 'sop', version: '1', mode: 'text' });
    expect(sop.document.text).toContain('workbook_master');
    expect(sop.document.text).toContain('historical leads, not current attestations');
    const master = await reader.read({ fileId: 'workbook_master', version: '1', mode: 'text' });
    expect(master.document.text).toContain('Archived providers (hidden)');
    for (const value of [
      'provider-alpha',
      'provider-beta',
      'Spanish',
      'ALPHA-OLD',
      'Ops Alpha',
      'folder_policies',
    ])
      expect(master.document.text).toContain(value);
    const first = await reader.list({ query: "'folder_policies' in parents" });
    expect(first.nextPageToken).toBe('next');
    const last = await reader.list({
      query: "'folder_policies' in parents",
      pageToken: first.nextPageToken ?? '',
    });
    expect(last.nextPageToken).toBeNull();
    expect(last.incompleteSearch).toBe(false);
    expect(last.files[0]?.id).toBe('policy_current');
    let text = '';
    let offset: number | null = 0;
    do {
      const page = await reader.read({
        fileId: 'policy_current',
        version: '1',
        mode: 'text',
        offset,
      });
      text += page.document.text ?? '';
      offset = page.document.nextOffset ?? null;
    } while (offset !== null);
    expect(text).toBe(policy);
    // The evidence exposes partial group coverage and the individual gap simultaneously. The
    // reader must not summarize either away; adjudicating the gap still belongs to the agent.
    expect(text).toContain('Group policy effective');
    expect(text).toContain('No evidence of provider-alpha membership');
    const original = await reader.read({
      fileId: 'workbook_master',
      version: '1',
      mode: 'original',
    });
    expect(original.content).toHaveLength(1);
    const retained = original.content[0];
    if (retained?.type !== 'resource' || !('blob' in retained.resource))
      throw new Error('Missing original workbook resource');
    expect(retained.resource.blob).toBe(workbookBytes.toString('base64'));
    expect(
      get.mock.calls.every(([path]) => path.startsWith('files') || path.startsWith('documents/'))
    ).toBe(true);
  }, 35_000);

  it('distinguishes denied and incomplete searches from a completed missing-evidence search', async () => {
    const get = vi
      .fn<GoogleDriveReadPort['get']>()
      .mockRejectedValueOnce(new Error('google-http-403'))
      .mockResolvedValueOnce(json({ files: [], incompleteSearch: true }))
      .mockResolvedValueOnce(json({ files: [] }));
    const reader = new GoogleDriveReader({ get });
    await expect(reader.list({ query: "'authorized_folder' in parents" })).rejects.toThrow('403');
    expect(await reader.list({ query: "'authorized_folder' in parents" })).toMatchObject({
      files: [],
      incompleteSearch: true,
    });
    expect(await reader.list({ query: "'authorized_folder' in parents" })).toMatchObject({
      files: [],
      nextPageToken: null,
      incompleteSearch: false,
    });
    // This last observation concerns only the searched scope; it is not proof of global absence.
  });

  it('reads a human-returned original at its new revision rather than treating a promise as evidence', async () => {
    let available = false;
    const original =
      'Synthetic current certificate for provider-alpha. Prior identifier conflict corrected to ALPHA-NEW.';
    const get = vi.fn<GoogleDriveReadPort['get']>(async (_path, query) => {
      if (!available) throw new Error('google-http-404');
      return query['alt'] === 'media'
        ? new Response(original)
        : json(metadata('returned_certificate', 'text/plain', '2'));
    });
    const reader = new GoogleDriveReader({ get });
    await expect(
      reader.read({ fileId: 'returned_certificate', version: '1', mode: 'text' })
    ).rejects.toThrow('404');
    available = true;
    await expect(
      reader.read({ fileId: 'returned_certificate', version: '1', mode: 'text' })
    ).rejects.toThrow();
    const result = await reader.read({
      fileId: 'returned_certificate',
      version: '2',
      mode: 'text',
    });
    expect(result.document.text).toBe(original);
    expect(result.source.version).toBe('2');
  });
});
