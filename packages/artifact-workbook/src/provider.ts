import type { ArtifactWorkbook, ArtifactWorkbookProvider } from './contracts.js';
import { invoke, member } from './vendor-object.js';
import { worksheet } from './worksheet.js';

function workbook(raw: unknown, module: unknown): ArtifactWorkbook {
  return {
    addWorksheet: (name) => worksheet(invoke(member(raw, 'worksheets'), 'add', [name])),
    worksheet: (name) => worksheet(invoke(member(raw, 'worksheets'), 'getItem', [name])),
    inspect: async (request): Promise<unknown> => {
      const result = await invoke(raw, 'inspect', [request]);
      return member(result, 'ndjson');
    },
    render: async (request): Promise<Uint8Array> => {
      const preview = await invoke(raw, 'render', [request]);
      const buffer = await invoke(preview, 'arrayBuffer');
      if (!(buffer instanceof ArrayBuffer))
        throw new TypeError('Artifact workbook render returned invalid image bytes');
      return new Uint8Array(buffer);
    },
    saveXlsx: async (file): Promise<void> => {
      const output = await invoke(member(module, 'SpreadsheetFile'), 'exportXlsx', [raw]);
      await invoke(output, 'save', [file]);
    },
  };
}
/** The caller provisions and injects the library; this package never resolves or installs it. */
export function createArtifactWorkbookProvider(module: unknown): ArtifactWorkbookProvider {
  return {
    create: () => workbook(invoke(member(module, 'Workbook'), 'create'), module),
    openXlsx: async (file): Promise<ArtifactWorkbook> => {
      const blob = await invoke(member(module, 'FileBlob'), 'load', [file]);
      const raw = await invoke(member(module, 'SpreadsheetFile'), 'importXlsx', [blob]);
      return workbook(raw, module);
    },
  };
}
