# Google Analytics Data

Provider-neutral, read-only GA4 report contracts and normalization for the Google Analytics Data
API `runReport` shape. An MCP, Google SDK, REST client, or managed identity adapter can implement
the same interface; engines consume normalized rows and exact-property preflight evidence.

`GoogleAnalyticsRestProvider` supplies the concrete Analytics Admin property-read and Data API
report binding. `collectGa4Report` paginates to the provider's `rowCount`, rejects changed headers or
metadata, rejects repeated full dimension keys within or across pages, and enforces a row ceiling.
Duplicate checks include the returned `dateRange` dimension, so a group in different reporting
periods remains distinct. Repeated rows fail collection rather than being silently deduplicated;
row-count equality alone cannot prove that every group was retrieved. Its default
`require-unflagged` quality policy rejects
sampling, threshold flags, or other-row data loss. A caller may explicitly select
`allow-with-caveats`; metadata and `ga4QualityFlags` remain available for the consuming report's
quality disclosure. Neither mode permits pagination gaps or scales partial responses into totals.
Authentication comes from `google-read-transport`.

The package contains no credential storage and no Analytics Admin writes. See the
[documentation hub](../../docs/README.md) and
[tool capability standard](../../standards/tool-capabilities.md).
