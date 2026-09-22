import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import { Open } from 'unzipper-esm';

import type { OfficeTextRequest, OfficeTextResponse } from './office-types.js';

class OfficeCapacityError extends Error {}

/** Count actual inflated bytes, not attacker-controlled ZIP size declarations. */
export async function checkOfficeExpansion(
  bytes: Buffer,
  maxExpandedBytes = 128 * 1024 * 1024
): Promise<void> {
  const archive = await Open.buffer(bytes);
  let expandedBytes = 0;
  for (const file of archive.files) {
    const stream = file.stream();
    for await (const value of stream) {
      const chunk: unknown = value;
      if (!Buffer.isBuffer(chunk)) throw new Error('Invalid archive stream.');
      expandedBytes += chunk.length;
      if (expandedBytes > maxExpandedBytes) {
        stream.destroy();
        throw new OfficeCapacityError();
      }
    }
  }
}

async function workbookText(bytes: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Uint8Array.from(bytes).buffer);
  const sheets: string[] = [];
  workbook.eachSheet((sheet) => {
    const rows: string[] = [`Sheet: ${sheet.name} (${sheet.state})`];
    sheet.eachRow((row) => {
      const cells: string[] = [];
      row.eachCell((cell) => {
        cells.push(`${cell.address}: ${JSON.stringify(cell.value)}`);
      });
      rows.push(cells.join('\t'));
    });
    sheets.push(rows.join('\n'));
  });
  return sheets.join('\n\n');
}

/** Called only inside the bounded worker in production; no partial success is returned. */
export async function parseOfficeText(
  request: OfficeTextRequest,
  maxExpandedBytes?: number
): Promise<OfficeTextResponse> {
  try {
    const bytes = Buffer.from(request.bytes);
    await checkOfficeExpansion(bytes, maxExpandedBytes);
    const warnings: string[] = [];
    let text: string;
    if (request.format === 'docx') {
      const result = await mammoth.extractRawText({ buffer: bytes });
      text = result.value;
      warnings.push(
        'DOCX text omits visual layout and embedded images; original mode retains the full file.'
      );
      if (result.messages.length > 0)
        warnings.push(
          'The DOCX parser reported unsupported content; inspect the original before claiming completeness.'
        );
    } else {
      text = await workbookText(bytes);
      warnings.push(
        'All populated cells and sheets are included, including hidden sheets and formulas. Embedded images and visual formatting require the original workbook.'
      );
    }
    if (request.offset > text.length) return { ok: false, reason: 'offset' };
    const end = Math.min(text.length, request.offset + 24_000);
    return {
      ok: true,
      page: {
        text: text.slice(request.offset, end),
        totalCharacters: text.length,
        offset: request.offset,
        nextOffset: end < text.length ? end : null,
        warnings,
      },
    };
  } catch (error) {
    // Parser errors can contain document content. Only a fixed failure classification crosses back.
    return { ok: false, reason: error instanceof OfficeCapacityError ? 'capacity' : 'parse' };
  }
}
