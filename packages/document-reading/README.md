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

The package depends only on format libraries. Source adapters, such as
[Google Drive](../google-drive-data/README.md), own source identity, discovery and consistency.
An application retaining an artifact still owns its authorization and durable receipt.

Run the package's standard `build`, `check-types`, `lint`, `test:coverage` and `format:check`
commands through the repository's pinned pnpm. Tests include actual PDFs, DOCX and workbooks,
not just mocked parser summaries.
