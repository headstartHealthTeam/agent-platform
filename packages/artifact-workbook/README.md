# Artifact Workbook

Typed local workbook operations over an injected, operator-provisioned `@oai/artifact-tool`
module. The package creates/opens workbooks, exposes bounded range writes and formatting, and
delegates XLSX save, inspection and PNG rendering. It neither installs nor redistributes the
vendor runtime and has no ambient module lookup, credential access or network calls.

`createArtifactWorkbookProvider(module)` adapts only operations the consumer actually uses;
it does not eagerly impose a second runtime-readiness check. Vendor object identity, method
receivers, matrix types and inspection NDJSON are retained. Unsupported consumed operations
fail instead of fabricating data or silently substituting another library.

Consumers own worksheet names/layout, formula and content decisions, target paths, privacy,
runtime selection/provisioning and acceptance rules. In particular, this package knows nothing
about Intake runs, publication, assessment cutoffs or reviewer ownership. Synthetic tests use
an independent workbook caller with no external library or credentials.

See the [documentation hub](../../docs/README.md),
[reusable capability design](../../docs/reusable-data-capabilities.md) and
[Intake ownership map](../../docs/intake-sla-migration.md).
