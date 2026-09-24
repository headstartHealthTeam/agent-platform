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
be copied from a prior serialization. Cross-version resume preserves existing saved bytes. The next
section describes denial-context contracts; full source-adapter and workflow integration remain.

The source authorization adapter maps existing Salesforce fields, standalone versus linked Reviews,
dated approval notes and opportunity milestones into the existing core resolver. It does not define
new payer policy. Supported nullable raw fields are retained; null state values that actually reach
the strict core retain the approved failure behavior, not an implicit approval or empty-string default.
Denial-context planning uses full identity searches, not redundant keyword-restricted reads. Coverage
is recomputed from original captures and exact merged/thread evidence; valid terminal empty results
remain complete. Missing coverage remains a row-level exception under the existing explicit
Blocked-row/source publication rule. The private verifier reads artifacts without modifying them.
Full source-adapter, command, workbook and publication composition still require their own parity.

Publication planning foundations preserve capacity-only expansion, consecutive bounded assertion
read unions, operator presentation and the exact selected stage-plan fingerprint. These functions
do not perform reads or writes. Presentation affects only its requested ranges; Run History keeps
existing column widths and prior rows. Shared Google readers remain read-only; Intake still owns
full write-plan construction, gate evaluation, readback acceptance and uncertain-write recovery.

Publication-gate contracts preserve fresh checks separately from frozen assessment. Reviewer hashes
retain exact own values and ignore unrelated metadata. Stable cohorts and proven, complete post-cutoff
dispositions follow the approved rule; the exact two-hour lease applies before further writes, not
to read-only recovery. Gate checks retain their original ordering and plan/Sheet/run bindings.
The injected executor is implemented below; full provider and publication command integration remain
unfinished.

Stage/final readback contracts hash actual captured values against exact assertions, verify prepared
call reconstruction and preserve ordered recovery. Checkbox and color normalization retain the
approved narrow semantics. Final verification uses the durable final-state contract, not superseded
stage assertions. These pure functions perform no provider I/O and do not replace independent live
captures, write authorization or executor recovery.

The original bounded replan helpers retain verified capacity only after a definitive pre-dispatch
size rejection, or exact completed stages/call prefixes after the supported atomic cell-length
rejection. Changed already-completed content, uncertain outcomes and mismatched resume bindings are
not successes.
These helpers neither execute writes nor replace the independent readback required for recovery.

Google capture composes shared provider format/validation types with Intake's range, extent,
reviewer, history and concurrency rules. Sparse blanks and formulas retain exact readback meaning.
Unchanged-file revalidation preserves the original capture timestamp and values while hashing the
current envelope and revalidation proof; it does not pretend it recollected the ledger. Native
partial metadata and shared grid-reader results compose with the same acceptance functions.
Private state verification consumes required fields from unknown JSON and compares all five saved
projections against the original raw capture without writes. Unrelated tab values are not new input
requirements. Legacy timestamp values keep their original parsing and raw hash semantics; unknown
inputs retain unknown timestamp types, while typed capture producers retain string types.
Supplied-capture persistence preserves private atomic projections, writer exclusion, immutable
published runs and retained raw archives. The raw capture is written last as the transaction marker;
an interrupted projection fails verification and can resume from the same supplied proof. Provider
reads and command routing remain unfinished.

The complete pure publication planner constructs the original nine ordered stages and separate
durable final assertions. It preserves exact reviewer values, bounded expanded-JSON requests,
append-only ledger/history, capacity-only grid expansion, label-bound terminal markers and Run
History last. A sanitized reviewer proof binds exact prepared cells. The planner performs no I/O
and does not itself establish authority, freshness, independent readback or operational readiness.
Pure artifact preparation binds stage/call filenames, exact payload hashes and reviewer proof into
the prepared manifest. Saved-file preparation composes it with the existing planner, validates and
archives prior rejected plans before replacements, retains only verified recovery prefixes, and
writes the new manifest last. Higher-level validation/gate preparation and CLI routing remain work.

The injected-adapter publication executor preserves exact-plan authority, payload reconstruction,
fresh write leases and live concurrency checks, durable per-call journals, and readback-only recovery
after uncertain writes. Finalization makes two independent samples and remains read-only after lease
expiry; partial or mismatching captures are retained privately without a Published receipt. It does
not discover credentials. The Google adapter composes shared read-only transport/Sheets capabilities
with Intake-owned bounded read retries and single-attempt exact prepared writes. Explicit ADC binding
is supplied by the host through the shared provider. Saved-file next-stage/readback functions retain
their source behavior; CLI and end-to-end command composition remain work.

The migration is not yet an operational replacement: source orchestration and checkpoint consumers,
workbook, publication and standalone packaging must pass their own source-case parity before cutover.
Do not launch a daily run from this partial package or infer approval from a successful unit test.

The built `headstart-intake-sla` entrypoint currently exposes the saved-file routes
`review:next-publish-stage`, `review:capture-publish-readback`, `review:verify-publish`,
`review:google-capture`, and `build-google-payloads <run-directory> [rejection-file]`. These routes
compose the functions above; they do not dispatch provider writes. The remaining CLI and standalone
runtime packaging are still being migrated. Synthetic tests exercise the source entrypoint from
another working directory; that does not establish a complete independently installed runtime.

Codex retains contextual evidence judgment and additional authorized source reads. This package
does not turn new wording into mandatory keyword rules or impose a new blanket publication gate.
Salesforce remains read-only. No live data, credentials or identifying fixtures belong here.

All package checks use the repository's strict TypeScript, ESLint and coverage standards, with full
`pnpm qa` for acceptance. See the [documentation hub](../../docs/README.md) and
[operator skill](../../skills/headstart-intake-sla-review/SKILL.md).
