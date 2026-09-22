import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { Workbook } from 'exceljs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { readDocument, documentReadModes } from './read-document.js';

describe('full deterministic document views', () => {
  it('reconstructs every character including the final contradictory fact', async () => {
    const source = `${'history\n'.repeat(10_000)}LAST FACT`;
    let offset: number | null = 0;
    let received = '';
    while (offset !== null) {
      const result = await readDocument(Buffer.from(source), 'text/plain', {
        mode: 'text',
        offset,
      });
      received += result.document.text ?? '';
      offset = result.document.nextOffset ?? null;
    }
    expect(received).toBe(source);
  });
  it('reads and renders actual multipage PDFs, and retains their original bytes', async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (let page = 1; page <= 3; page++)
      pdf
        .addPage([300, 300])
        .drawText(`Fictional history page ${String(page)}`, { font, x: 20, y: 220 });
    const bytes = Buffer.from(await pdf.save());
    const text = await readDocument(bytes, 'application/pdf', { mode: 'text' });
    expect(text.document.totalPages).toBe(3);
    expect(text.document.text).toContain('history page 3');
    const selected = await readDocument(bytes, 'application/pdf', { mode: 'text', page: 2 });
    expect(selected.document.text).toContain('history page 2');
    expect(selected.document.text).not.toContain('history page 3');
    const image = await readDocument(bytes, 'application/pdf', { mode: 'page', page: 3 });
    expect(image.document).toMatchObject({ page: 3, totalPages: 3, digest: text.document.digest });
    expect(image.content[0]).toMatchObject({ type: 'image', mimeType: 'image/png' });
    const defaultPage = await readDocument(bytes, 'application/pdf', { mode: 'page' });
    expect(defaultPage.document.page).toBe(1);
    const original = await readDocument(bytes, 'application/pdf', { mode: 'original' });
    const resource = original.content[0];
    if (resource?.type !== 'resource') throw new Error('Expected resource');
    expect(Buffer.from(resource.resource.blob, 'base64')).toEqual(bytes);
    await expect(readDocument(bytes, 'application/pdf', { mode: 'page', page: 4 })).rejects.toThrow(
      'outside'
    );
  }, 30_000);
  it('includes hidden workbook history, cell addresses and formulas', async () => {
    const book = new Workbook();
    book.addWorksheet('Employment').getCell('A1').value = 'All original employment';
    const hidden = book.addWorksheet('Corrections', { state: 'hidden' });
    hidden.getCell('D42').value = { formula: '1+1', result: 2 };
    hidden.getRow(42).hidden = true;
    const bytes = Buffer.from(await book.xlsx.writeBuffer());
    for (const mime of [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel.sheet.macroEnabled.12',
    ]) {
      const result = await readDocument(bytes, mime, { mode: 'text' });
      expect(result.document.text).toContain('All original employment');
      expect(result.document.text).toContain('Corrections (hidden)');
      expect(result.document.text).toContain('D42: {"formula":"1+1","result":2}');
    }
  });
  it('reads actual DOCX body text, with a warning that visuals require the original', async () => {
    const zip = new JSZip();
    zip.file(
      '[Content_Types].xml',
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
    );
    zip.file(
      'word/document.xml',
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Complete invented CV</w:t></w:r></w:p></w:body></w:document>'
    );
    const bytes = await zip.generateAsync({ type: 'nodebuffer' });
    const result = await readDocument(
      bytes,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      { mode: 'text' }
    );
    expect(result.document.text).toContain('Complete invented CV');
    expect(result.document.warnings.join(' ')).toContain('original');
  });
  it.each(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])(
    'delivers %s itself, not inferred text',
    async (mimeType) => {
      const bytes = Buffer.from('synthetic image bytes');
      const result = await readDocument(bytes, mimeType, { mode: 'text' });
      expect(result.content).toEqual([{ type: 'image', mimeType, data: bytes.toString('base64') }]);
      await expect(readDocument(bytes, mimeType, { mode: 'page', page: 2 })).rejects.toThrow(
        'one page'
      );
    }
  );
  it('reports unsupported views and corrupt input without calling absence of text absence of evidence', async () => {
    const bytes = Buffer.from('text');
    await expect(readDocument(bytes, 'text/plain', { mode: 'page' })).rejects.toThrow(
      'Page rendering'
    );
    await expect(readDocument(bytes, 'text/plain', { mode: 'text', offset: 100 })).rejects.toThrow(
      'past the end'
    );
    await expect(readDocument(bytes, 'image/tiff', { mode: 'text' })).rejects.toThrow(
      'Use original'
    );
    await expect(
      readDocument(Buffer.from([255]), 'text/plain', { mode: 'text' })
    ).rejects.toThrow();
    expect((await readDocument(bytes, 'application/json', { mode: 'text' })).document.text).toBe(
      'text'
    );
    expect(documentReadModes('application/pdf')).toEqual(['text', 'page', 'original']);
    expect(documentReadModes('image/png')).toEqual(['text', 'page', 'original']);
    expect(documentReadModes('text/plain')).toEqual(['text', 'original']);
    expect(documentReadModes('application/vnd.ms-excel.sheet.macroEnabled.12')).toEqual([
      'text',
      'original',
    ]);
    expect(documentReadModes('image/tiff')).toEqual(['original']);
  });
  it.each([
    { mode: 'text', offset: -1 },
    { mode: 'page', page: 0 },
  ] as const)('rejects invalid cursors', async (request) => {
    await expect(readDocument(Buffer.from('text'), 'text/plain', request)).rejects.toThrow(
      'positive page'
    );
  });
});
