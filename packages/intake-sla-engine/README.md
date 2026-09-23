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
they do not authenticate a source or make old data fresh. Private storage and source checkpoint
persistence preserve atomic writes, bounded writer locks, idempotent captures and publication-receipt
immutability. Inventory health checks preserve explicit empty bodies and cache-proof freshness.
Provider identity and source projection, role grouping, search plans and participant proposals retain
their approved ordering and provenance. Shared Fireflies participant parsing is composed here; the
provider never decides identity matches or updates the registry. Collection plans retain primary and
conditional fallback paths, exact deduplication and cohort membership. Cache replay verifies the
current identity-derived plan and exact consumed profile/row snapshots, preserving extra hash-bound
metadata. Bounded collection selects candidate bodies within each identity's frozen window, retains
row-local incomplete searches, verifies conditional fallback skips and derives missing-CSM coverage
only from usable primary evidence. Raw captures, normalization receipts, body checkpoints and final
inventories are written in the approved recoverable order. The injected native reader is serial and
paced, preserves per-tool attempts and provider-wide cooldowns across local recovery, and refuses
published-run writes. Full evidence replay and operational command integration remain migration work.

Client alias selection, candidate status priority, identity profiles, roster scoring and transcript
segmentation remain Intake-owned. Conversation relevance preserves the approved direct/assumed/weak
distinctions, competing-client margins, context scores and source-health precedence. The approved
empty client registry is retained; the migration does not add or infer aliases. Matching is not a
replacement for evidence admission, cutoff checks or agent review.

Current-run Codex findings retain packet-validation provenance, without model/provider/API-execution
claims or prior-run API reuse. Bound note adjudication preserves supported agent judgment and the
existing parser fallback when a decision is missing; it is not a QA override. Note receipts bind
source, gate, cutoff and supplied findings, and later verification detects changed inputs. Evidence
assembly preserves date meaning, provenance and original authoritative events across projections.
Source adapters and final report composition still need their end-to-end regressions.

Report inputs retain staffing links and bounded Fireflies coverage. Reviewer-state projection keeps
exact values without trimming or stringification. Generated-note provenance excludes prior generated
text while admitting distinct human additions; frozen ledger storage preserves historical rows and
replaces only current unpublished drafts. Workbook and publication integration remain unfinished.

Slack capture composes shared provider decoding with Intake's complete-cohort plan, exact receipt
bindings, connected pagination, cutoff and delta checks. Bounded thread reconciliation accounts for
later replies without admitting their content. The injected reader preserves bounded retries,
spacing, checkpoint recovery and published-run immutability. No desktop binding or direct Slack
write is introduced. Typed serialization can reorder newly written plan/inventory JSON keys; their
values and canonical hashes match, and any byte receipt must describe the actual new bytes, never
be copied from a prior serialization. Cross-version resume preserves existing saved bytes. Denial
context, source adapters and full workflow composition still require their own parity checks.

The migration is not yet an operational replacement: source orchestration and checkpoint consumers,
workbook, publication and standalone packaging must pass their own source-case parity before cutover.
Do not launch a daily run from this partial package or infer approval from a successful unit test.

Codex retains contextual evidence judgment and additional authorized source reads. This package
does not turn new wording into mandatory keyword rules or impose a new blanket publication gate.
Salesforce remains read-only. No live data, credentials or identifying fixtures belong here.

All package checks use the repository's strict TypeScript, ESLint and coverage standards, with full
`pnpm qa` for acceptance. See the [documentation hub](../../docs/README.md) and
[operator skill](../../skills/headstart-intake-sla-review/SKILL.md).
