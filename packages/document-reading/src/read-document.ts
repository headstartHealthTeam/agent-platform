import { createHash } from 'node:crypto';

import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

export class DocumentReadError extends Error {}
export type DocumentContent =
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'resource'; resource: { uri: string; mimeType: string; blob: string } };
export interface DocumentReadRequest {
  mode: 'text' | 'page' | 'original';
  /** One-based PDF page; omit for all text. */
  page?: number;
  /** Character cursor, never a total-text ceiling. */
  offset?: number;
}
export interface DocumentReadResult {
  document: {
    mode: DocumentReadRequest['mode'];
    digest: string;
    mimeType: string;
    byteLength: number;
    page?: number;
    totalPages?: number;
    text?: string;
    totalCharacters?: number;
    offset?: number;
    nextOffset?: number | null;
    warnings: string[];
  };
  content: DocumentContent[];
}
const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLSM = 'application/vnd.ms-excel.sheet.macroEnabled.12';
const IMAGES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
export function documentReadModes(mimeType: string): DocumentReadRequest['mode'][] {
  if (mimeType === PDF || IMAGES.has(mimeType)) return ['text', 'page', 'original'];
  if (mimeType.startsWith('text/') || ['application/json', DOCX, XLSX, XLSM].includes(mimeType))
    return ['text', 'original'];
  return ['original'];
}
function textResult(
  text: string,
  document: DocumentReadResult['document'],
  request: DocumentReadRequest
): DocumentReadResult {
  const offset = request.offset ?? 0;
  if (offset > text.length)
    throw new DocumentReadError('Text offset is past the end of the document.');
  const end = Math.min(text.length, offset + 24_000);
  return {
    document: {
      ...document,
      text: text.slice(offset, end),
      totalCharacters: text.length,
      offset,
      nextOffset: end < text.length ? end : null,
    },
    content: [],
  };
}
async function readPdf(
  bytes: Buffer,
  document: DocumentReadResult['document'],
  request: DocumentReadRequest
): Promise<DocumentReadResult> {
  const parser = new PDFParse({
    data: Uint8Array.from(bytes),
    isEvalSupported: false,
    stopAtErrors: true,
  });
  try {
    const info = await parser.getInfo();
    document.totalPages = info.total;
    if (request.page !== undefined && request.page > info.total)
      throw new DocumentReadError(`Page is outside the document (1–${String(info.total)}).`);
    if (request.mode === 'page') {
      const page = request.page ?? 1;
      const rendered = await parser.getScreenshot({
        partial: [page],
        scale: 2,
        imageDataUrl: false,
      });
      const image = rendered.pages[0];
      if (rendered.pages.length !== 1 || image === undefined)
        throw new DocumentReadError('PDF page could not be rendered.');
      return {
        document: { ...document, page },
        content: [
          {
            type: 'image',
            mimeType: 'image/png',
            data: Buffer.from(image.data).toString('base64'),
          },
        ],
      };
    }
    const result = await parser.getText(
      request.page === undefined ? {} : { partial: [request.page] }
    );
    if (request.page !== undefined) document.page = request.page;
    document.warnings.push(
      'Text extraction does not establish visual completeness. Use page mode to inspect scans, handwriting, layout, signatures and ambiguous or missing text.'
    );
    return textResult(result.text, document, request);
  } finally {
    await parser.destroy();
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
async function extractText(bytes: Buffer, mimeType: string, warnings: string[]): Promise<string> {
  if (mimeType === DOCX) {
    const result = await mammoth.extractRawText({ buffer: bytes });
    warnings.push(
      'DOCX text omits visual layout and embedded images; original mode retains the full file.'
    );
    if (result.messages.length > 0)
      warnings.push(
        'The DOCX parser reported unsupported content; inspect the original before claiming completeness.'
      );
    return result.value;
  }
  if (mimeType === XLSX || mimeType === XLSM) {
    warnings.push(
      'All populated cells and sheets are included, including hidden sheets and formulas. Embedded images and visual formatting require the original workbook.'
    );
    return workbookText(bytes);
  }
  if (mimeType.startsWith('text/') || mimeType === 'application/json')
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  throw new DocumentReadError(
    'No deterministic text reader for this format. Use original mode; do not treat an unsupported parser as missing evidence.'
  );
}
/** Deterministic complete views only: no model, credentials, source lookup or domain policy. */
export async function readDocument(
  bytes: Buffer,
  mimeType: string,
  request: DocumentReadRequest
): Promise<DocumentReadResult> {
  if (
    !['text', 'page', 'original'].includes(request.mode) ||
    (request.page !== undefined && (!Number.isSafeInteger(request.page) || request.page < 1)) ||
    (request.offset !== undefined && (!Number.isSafeInteger(request.offset) || request.offset < 0))
  ) {
    throw new DocumentReadError('Use a positive page number and a non-negative text offset.');
  }
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const document: DocumentReadResult['document'] = {
    mode: request.mode,
    digest,
    mimeType,
    byteLength: bytes.length,
    warnings: [],
  };
  if (request.mode === 'original')
    return {
      document,
      content: [
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
  if (IMAGES.has(mimeType)) {
    if (request.page !== undefined && request.page !== 1)
      throw new DocumentReadError('An image has one page.');
    return {
      document: {
        ...document,
        page: 1,
        totalPages: 1,
        warnings: [
          'Read the supplied original image directly; no OCR or summary has been substituted.',
        ],
      },
      content: [{ type: 'image', mimeType, data: bytes.toString('base64') }],
    };
  }
  if (mimeType === PDF) return readPdf(bytes, document, request);
  if (request.mode === 'page')
    throw new DocumentReadError(
      'Page rendering supports PDF and images. Use text or original for this format.'
    );
  return textResult(await extractText(bytes, mimeType, document.warnings), document, request);
}
