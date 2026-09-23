# Google Sheets Data

Reusable, read-only contracts for exact spreadsheet ranges and deterministic conversion from a
header row to records. It replaces hidden workbook `VLOOKUP` assumptions with explicit source
revision, column, range, and target assertions.

The package has no write capability. Organic reporting uses it to acquire the approved content
pillar/TAM universe before the organic engine performs its typed keyword join.

Pass required header names to `rowsFromHeaderRange(input, requiredHeaders)` so missing columns are
detected even for a valid header-only table. `requireColumns(rows, columns, headers?)` additionally
checks non-empty required row values; for an empty row list it requires explicit header evidence
because column existence cannot be inferred from missing data rows.

`GoogleSheetsRestProvider` implements the Sheets API binding. It requires a quoted, bounded A1
range, checks the returned range, and requires two successive reads to agree. Its
`content-sha256` revision fingerprints the exact range contents; it is not a Google Drive revision
ID and does not prove that a stakeholder approved those exact contents. The reporting plan records
approval scope separately. Authentication comes from `google-read-transport`.

See the [documentation hub](../../docs/README.md) and
[tool capability standard](../../standards/tool-capabilities.md).

## Exact user-entered grid reads

`GoogleSheetsGridReader` adds single-sample, bounded grid and metadata reads using the same shared
read-only transport. It preserves typed user-entered strings, numbers, booleans and formulas,
whitespace, sparse rows, formats, validation, filters and dimension metadata without running them
through the header-table stringification helper. Its field masks match the approved Intake adapter.
The reader checks the returned spreadsheet and requested sheet identity and sanitizes malformed
response failures; it neither writes nor imposes a workflow retry, wait or second-read policy.

Intake owns coordinate-level assertion capture, coalescing, reviewer preservation, concurrency,
publication authorization and readback acceptance. This low-level snapshot is not itself an
accepted publication readback or proof that a whole sheet was read. Existing Organic range reads
retain their unchanged two-sample content-fingerprint contract.
