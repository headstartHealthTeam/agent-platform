# Intake SLA engine

Workflow-specific Intake evidence semantics and supervised operational composition. Reusable vendor
mechanics belong in the separate provider packages specified by the
[migration ownership map](../../docs/intake-sla-migration.md), not inside this package.

The [pinned merged Intake reference](../../docs/intake-sla-migration.md#behavioral-reference) governs
behavior. Typed contracts cover date/freshness and fingerprints, billing reconciliation, evidence
ranking, source results, authorization prerequisites, assessment occurrence and stage-gate context.
Source requirement/coverage rules, exact interpretation bindings, the approved prompt/schema,
packet construction and supported findings are typed. Interpretation uses the shared isolated
Responses entry point with explicit low effort; bounded workers and exact-bound delta planning keep
Intake's retry, checkpoint and reuse rules. Fresh current-run Codex interpretations are not eligible
for prior-run API reuse. These pure contracts still require their full collector/recovery consumers.

Fireflies discovery composes the shared provider parser with Intake's exact run/scope/window hashes.
Cache planning, materialization and replay verification preserve shadow-mode fresh fetches, explicit
reuse approval, baseline invalidation and original retrieval times. Local receipts bind evidence;
they do not authenticate a source or make old data fresh. Storage and collector integration remain
separate migration work.

The migration is not yet an operational replacement: source orchestration, checkpoint persistence,
workbook, publication and standalone packaging must pass their own source-case parity before cutover.
Do not launch a daily run from this partial package or infer approval from a successful unit test.

Codex retains contextual evidence judgment and additional authorized source reads. This package
does not turn new wording into mandatory keyword rules or impose a new blanket publication gate.
Salesforce remains read-only. No live data, credentials or identifying fixtures belong here.

All package checks use the repository's strict TypeScript, ESLint and coverage standards, with full
`pnpm qa` for acceptance. See the [documentation hub](../../docs/README.md) and
[operator skill](../../skills/headstart-intake-sla-review/SKILL.md).
