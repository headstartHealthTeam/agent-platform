# Document Reading

Reusable deterministic document views for agent tools. No source lookup, credentials, LLM,
credentialing policy, application state or network client lives here. See the
[documentation map](../../docs/README.md) and [data capability boundaries](../../docs/reusable-data-capabilities.md).

`readDocument(bytes, mimeType, request)` returns full-evidence text cursors, original-file
resources or image blocks. `documentReadModes(mimeType)` advertises supported views.

- PDF: all-page text, selected-page text, rendered page images, original bytes.
- PNG/JPEG/GIF/WebP: the actual image, not a secondary-model description.
- DOCX: deterministic body text plus the original file; text is not proof of visual completeness.
- XLSX/XLSM: every populated sheet/cell, including hidden sheets/rows and formulas; originals
  preserve embedded visuals and formatting.
- UTF-8 text/JSON: complete content through explicit `nextOffset` cursors.
- Other formats, including legacy Office and multipage TIFF: original bytes remain available;
  unsupported text/page parsing is an explicit error, not missing business evidence.

The 24,000-character response chunk is pagination, not a total-content limit. Continue until
`nextOffset` is null. Original resources preserve exact bytes. Hashes identify the bytes actually
read; they do not establish source authority or approval. Parsers never execute workbook macros
or use a model to replace source content. Image/Office visual interpretation belongs to the agent
and the runtime's supported file viewers.

Office text parsing runs in an isolated worker with no inherited environment or Node options,
a 30-second deadline, a 256 MiB old-generation heap budget, and a 128 MiB actual ZIP-expansion
budget checked before parsing. Complete parsing and traversal happen before a bounded text page
is returned. A resource or parser failure is explicit, never a truncated successful result;
original mode still returns exact bytes. These computational budgets do not filter source access.
One Office worker may run per process; concurrent extraction requests receive
`DocumentReadBusyError` and should retry after the active extraction finishes. No waiting queue
retains source bytes. The Drive CLI reports this as `document-parser-busy`. Original-file access
does not acquire the parser slot.

The standard build includes `dist/office-worker.js` beside `dist/index.js`; deploy the complete
package `dist`, not a copied entrypoint alone. Source-checkout execution uses the declared `tsx`
development loader; the deployed worker is native JavaScript and needs no TypeScript loader.

The package depends only on format libraries. Source adapters, such as
[Google Drive](../google-drive-data/README.md), own source identity, discovery and consistency.
An application retaining an artifact still owns its authorization and durable receipt.

## Local-file inspection

`headstart-document` exposes the same readers to an agent's shell without source credentials:

```text
node <runtime>/packages/document-reading/dist/cli.js --file <absolute-original-path> --mime application/pdf --mode text --output <fresh-absolute-directory>
```

The result JSON contains full text or a continuation cursor plus paths to actual images/originals.
Use `--offset` until `nextOffset` is null; use `--mode page --page 3` for a PDF page. Open the
materialized image rather than treating extracted text as proof of signatures, scans or layout.
The CLI never overwrites prior output. `materializeDocumentContent` is shared with Drive and the
[Headstart MCP client](../headstart-mcp-data/README.md), keeping binary output out of console text.
Backend MCP supplies originals; it must not install or invoke this parser package.

Run the package's standard `build`, `check-types`, `lint`, `test:coverage` and `format:check`
commands through the repository's pinned pnpm. Tests include actual PDFs, DOCX and workbooks,
not just mocked parser summaries.
