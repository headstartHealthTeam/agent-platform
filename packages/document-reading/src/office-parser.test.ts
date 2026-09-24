import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { checkOfficeExpansion, parseOfficeText } from './office-parser.js';

async function docx(text: string, extra = ''): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  );
  zip.file(
    'word/document.xml',
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p>${extra}</w:body></w:document>`
  );
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

describe('isolated Office parsing semantics', () => {
  it('paginates complete DOCX text and retains unsupported-content warnings', async () => {
    const source = `${'Original history. '.repeat(3_000)}FINAL CORRECTION`;
    const bytes = await docx(source, '<w:unknown/>');
    let received = '';
    let offset: number | null = 0;
    while (offset !== null) {
      const result = await parseOfficeText({ bytes, format: 'docx', offset });
      if (!result.ok) throw new Error('Expected complete parse');
      expect(result.page.text.length).toBeLessThanOrEqual(24_000);
      expect(result.page.totalCharacters).toBe(source.length + 2);
      expect(result.page.warnings.join(' ')).toContain('unsupported content');
      received += result.page.text;
      offset = result.page.nextOffset;
    }
    expect(received).toBe(`${source}\n\n`);
    expect(await parseOfficeText({ bytes, format: 'docx', offset: source.length + 3 })).toEqual({
      ok: false,
      reason: 'offset',
    });
    const clean = await parseOfficeText({
      bytes: await docx('Complete text'),
      format: 'docx',
      offset: 0,
    });
    expect(clean.ok && clean.page.warnings).toHaveLength(1);
  });

  it('includes the final hidden sheet and formulas after multiple workbook pages', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Employment');
    for (let row = 1; row <= 500; row++)
      sheet.getCell(`A${String(row)}`).value =
        `Complete history ${String(row)} ${'evidence '.repeat(10)}`;
    const hidden = workbook.addWorksheet('Final correction', { state: 'veryHidden' });
    hidden.getCell('D42').value = { formula: '1+1', result: 2 };
    hidden.getRow(42).hidden = true;
    const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
    let offset: number | null = 0;
    let received = '';
    let total = 0;
    while (offset !== null) {
      const result = await parseOfficeText({ bytes, format: 'xlsx', offset });
      if (!result.ok) throw new Error('Expected complete parse');
      expect(result.page.text.length).toBeLessThanOrEqual(24_000);
      received += result.page.text;
      total = result.page.totalCharacters;
      offset = result.page.nextOffset;
    }
    expect(received.length).toBe(total);
    expect(received).toContain('A500: "Complete history 500');
    expect(received).toContain('Final correction (veryHidden)');
    expect(received).toContain('D42: {"formula":"1+1","result":2}');
  });

  it('counts aggregate inflated bytes even when central-directory sizes lie', async () => {
    const zip = new JSZip();
    zip.file('first.xml', 'a'.repeat(8_000));
    zip.file('last.xml', 'b'.repeat(8_000));
    const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const signature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
    let position = bytes.indexOf(signature);
    while (position !== -1) {
      bytes.writeUInt32LE(1, position + 24);
      position = bytes.indexOf(signature, position + 4);
    }
    expect(bytes.length).toBeLessThan(1_000);
    await expect(checkOfficeExpansion(bytes, 20_000)).resolves.toBeUndefined();
    await expect(checkOfficeExpansion(bytes, 12_000)).rejects.toThrow();
    expect(await parseOfficeText({ bytes, format: 'xlsx', offset: 0 }, 12_000)).toEqual({
      ok: false,
      reason: 'capacity',
    });
  });

  it('returns an explicit sanitized failure, never partial success or source content', async () => {
    const result = await parseOfficeText({
      bytes: Buffer.from('PRIVATE DOCUMENT CONTENT'),
      format: 'docx',
      offset: 0,
    });
    expect(result).toEqual({ ok: false, reason: 'parse' });
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  });
});
