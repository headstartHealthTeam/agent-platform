# Intake SLA engine

Workflow-specific Intake evidence semantics and supervised operational composition. Reusable vendor
mechanics belong in the separate provider packages specified by the
[migration ownership map](../../docs/intake-sla-migration.md), not inside this package.

The [pinned merged Intake reference](../../docs/intake-sla-migration.md#behavioral-reference) governs
behavior. Typed date/freshness, fingerprint and stage/source contracts are the first domain ports.
The migration is not yet an operational replacement: source orchestration, interpretation workers,
workbook, publication and standalone packaging must pass their own source-case parity before cutover.
Do not launch a daily run from this partial package or infer approval from a successful unit test.

Codex retains contextual evidence judgment and additional authorized source reads. This package
does not turn new wording into mandatory keyword rules or impose a new blanket publication gate.
Salesforce remains read-only. No live data, credentials or identifying fixtures belong here.

All package checks use the repository's strict TypeScript, ESLint and coverage standards, with full
`pnpm qa` for acceptance. See the [documentation hub](../../docs/README.md) and
[operator skill](../../skills/headstart-intake-sla-review/SKILL.md).
