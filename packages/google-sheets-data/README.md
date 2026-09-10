# Google Sheets Data

Reusable, read-only contracts for exact spreadsheet ranges and deterministic conversion from a
header row to records. It replaces hidden workbook `VLOOKUP` assumptions with explicit source
revision, column, range, and target assertions.

The package has no write capability. Organic reporting uses it to acquire the approved content
pillar/TAM universe before the organic engine performs its typed keyword join.

`GoogleSheetsRestProvider` implements the Sheets API binding. It requires a quoted, bounded A1
range, checks the returned range, and requires two successive reads to agree. Its
`content-sha256` revision fingerprints the exact range contents; it is not a Google Drive revision
ID and does not prove that a stakeholder approved those exact contents. The reporting plan records
approval scope separately. Authentication comes from `google-read-transport`.

See the [documentation hub](../../docs/README.md) and
[tool capability standard](../../standards/tool-capabilities.md).
