# Intake SLA migration: package ownership and parity

## Required architecture

This is the supervised Intake SLA workflow moved into Agent Platform's existing typed package
architecture. **Reusable provider mechanics belong outside `intake-sla-engine`. Internal provider
folders in that engine are not a substitute for independently consumable packages.**

Follow [HEA-517](https://linear.app/headstarthealth/issue/HEA-517) for delivery scope and
[reusable data capabilities](reusable-data-capabilities.md) for the platform pattern. This document
owns Intake's concrete source-to-package decisions, not a second business policy or runbook.

## Behavioral reference

The reference is Intake merged main
`15b66ac3904fec49c42d60496ff6000cc8f3c60b`, engine `2026-09-22.2`, with canonical operator skill
`0.2.2`. It includes [PR #5](https://github.com/headstartHealthTeam/intake-sla-evidence-engine/pull/5)
(authored by Mark, approved by Jimmy, merged by Mark) and Jimmy's subsequently merged
[PR #6](https://github.com/headstartHealthTeam/intake-sla-evidence-engine/pull/6) and
[PR #7](https://github.com/headstartHealthTeam/intake-sla-evidence-engine/pull/7).
The initial Agent Platform target is `7e9d213feece3aa56a3e4adcb25f270663d27649`.
Refresh later source changes deliberately; never lose a reviewed correction or relabel existing
interpretation bindings. The superseded migration attempt is not a behavioral or architectural
reference.

## Final runtime contract

One canonical skill coordinates a versioned local runtime, scoped provider reads, interpretation,
semantic review and authorized Sheet publication. The runtime works outside either source checkout
with explicit private configuration and dependency readiness. Installing the skill does not install
the runtime. Native tools use a supported injected callback or the existing agent read/capture
protocol, not an assumed Node-to-desktop binding.

Codex retains judgment over contextual evidence and useful additional authorized reads/model calls.
Code preserves identity, provenance, dates, exact bindings, typed transformations, recovery and
publication invariants. A new phrase is not automatically a new parser rule. Real uncertainty stays
Review/Blocked under the existing rules; no new blanket publication ban is introduced.

Preserve frozen-cutoff assessment and bounded recovery separately from fresh publication checks;
approved model/credential and `store: false` contracts; fresh-current-run Codex fallback provenance;
reviewer-owned values; immutable published evidence; stage readbacks and Run History last. Salesforce
remains read-only. No live run, schedule, cloud deployment, service-identity change, cache activation,
UI or Salesforce operational-context utility is added by this migration.

## Package ownership map

Names for new packages identify concrete boundaries, not one package per source script. A second
consumer is not required where the vendor-level contract is already coherent. Shared providers must
not depend on Intake types, filenames, run locks, cohort policy or business decisions.

| Owner                                                                                                 | Reuse / extend / create                                      | Source behavior assigned here                                                                                      | Remains in Intake                                                                                            |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `capability-contracts`, `capability-runtime`                                                          | Reuse                                                        | Profile, effect, target, binding and readiness contracts                                                           | Workflow-selected requirements and verified Production/Sheet targets                                         |
| `google-read-transport`                                                                               | Extend                                                       | Sanitized HTTP status, retry-after and failure metadata; approved injected credentials                             | Read scheduling, attempt/wait budgets and concurrency policy; no transport retry loop                        |
| `google-sheets-data`                                                                                  | Extend                                                       | Exact bounded grid/metadata/formula/format reads without table coercion                                            | Assertion planning, reviewer reconciliation, write plans, readback acceptance                                |
| `salesforce-read`                                                                                     | Create                                                       | Explicit target and Organization verification, bounded CLI query/metadata reads, pagination and sanitized failures | Cohort SOQL/fields, Production fingerprints, milestone and reconciliation meaning                            |
| `fireflies-data`                                                                                      | Create                                                       | Native discovery/body response contracts, provider identity/pagination/error normalization and cooldown signals    | Candidate relevance, roster matching, segmentation, cache eligibility, checkpoints and sufficiency           |
| `slack-data`                                                                                          | Create                                                       | Native search/message/thread contracts, pagination/visibility and failure normalization                            | Cohort queries, denial context, client assignment and evidence admission                                     |
| `artifact-workbook`                                                                                   | Create after inventory found no compatible workbook executor | Injected vendor create/import/export, range formatting, inspection and rendering                                   | Seven-tab report layout, formula scan decisions, runtime selection and private run files                     |
| Isolated Responses entry point in `openai-platform`, or a sibling if dependency isolation requires it | Extend or extract after inspecting its exports               | Credential-injected structured request execution and sanitized provider results                                    | AWS selection, exact model, prompts/schema, preflight policy, support checks, bindings, workers and fallback |
| `intake-sla-engine`                                                                                   | Create                                                       | Domain, evidence semantics, recommendation, QA, recovery, workbook, publication and composition                    | All business policy remains here or in the canonical skill/runbooks                                          |
| Portal/Headstart MCP adapters in Intake                                                               | Port narrowly                                                | Existing product-specific read/capture mapping                                                                     | No speculative generic product SDK                                                                           |
| Existing Organic runtime packaging approach                                                           | Reuse; extract only actually shared build helpers            | Dependency closure, revision/digest receipts and outside-checkout smoke pattern                                    | Intake recovery and installation compatibility                                                               |

The shared Google packages remain read-only. Prepared writes and their authorization, uncertain
outcome reconciliation and exact acceptance remain Intake-owned. Do not route reviewer state through
the current Sheets header-table trimming/stringification helper.

## Source inventory and case traceability

Inventory the routine `review:*` entrypoints and their imports, commands, live collectors, source
modules, contracts, docs and synthetic tests from the pinned reference. Exclude unrelated utilities
unless a routine import proves the dependency. Record a destination and parity case for each
migrated responsibility; split mixed modules at the actual provider/policy boundary. Do not copy a
whole executor into a shared provider when it owns Intake run files or policy.

All applicable baseline cases must survive. Test count alone is not proof. Compare source/target
cohort, admitted evidence, gates, actions, exceptions, workbook values and exact publication plans;
normalize only documented version/provenance differences. Test provider contracts independently
with synthetic non-Intake callers and preserve existing Google/Organic consumers.

### Provider extraction traceability

This table records implemented provider-level extraction, not completion of the Intake callers.
The later engine must compose these packages before its corresponding source cases are considered
migrated. Existing source test expectations remain the behavioral reference.

| Source responsibility and baseline case                                                                                                                                             | Provider destination and regression                                                                                                                                                         | Intake remainder                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `salesforce-target.mjs`; `salesforce-target.test.mjs`; complete `sf data query` envelope                                                                                            | `salesforce-read`: `contracts.test.ts`, `cli.test.ts` verify actual org/environment, complete counts, valid zero, malformed/partial rejection and bounded CLI execution                     | Production target configuration, business SOQL, fingerprints and cohort                                                                    |
| `google-rest-adapter.mjs`; `google-rest-adapter.test.mjs` HTTP/transport metadata                                                                                                   | `google-read-transport`: `failure-metadata.test.ts` preserves status, retry-after and body-consumption transport failures; no provider retries                                              | Pacing, bounded attempts/waits, coalescing, write authorization and uncertain outcomes                                                     |
| `google-rest-adapter.mjs` metadata/cell/dimension field masks; `google-capture.mjs` typed values                                                                                    | `google-sheets-data`: `grid-reader.test.ts` preserves exact entered types, whitespace, formulas, formats, validation and metadata with a single bounded sample                              | Coordinate assertion capture, reviewer fields, stable snapshots and exact acceptance                                                       |
| `fireflies-connector-response.mjs` plus vendor metadata from `fireflies-cache.mjs`; `fireflies-connector-response.test.mjs` and error cases from `fireflies-read-executor.test.mjs` | `fireflies-data`: `transcript.test.ts`, `failure.test.ts` cover listing milliseconds/body seconds, silence versus speech, identity/completeness changes and sanitized quota/read failures   | Raw capture hash/version, discovery scope, cutoff, candidate selection, cache policy, executor state and durable cooldown                  |
| `slack-response.mjs` single-response normalization and `slack-plugin-search.mjs` transport unwrap; non-cutoff `slack-response.test.mjs` cases                                       | `slack-data`: `thread.test.ts`, `envelope.test.ts` preserve no-reply receipts, explicit count, structured pagination/identity and transport rejection                                       | Run hashes, cutoff reconciliation, cohort queries and admission remain Intake-owned; see Slack capture traceability below                  |
| `ai-interpretation.mjs#createOpenAIResponsesClient`; request/failure cases in `ai-interpretation-schema.test.mjs`                                                                   | Isolated `openai-platform/responses`: `responses.test.ts` checks model, explicit reasoning effort, schema name, strict output, non-storage, sanitization and no implicit retry/model switch | Exact prompt/schema, approved AWS credential selection, low effort, preflight, support/binding policy and fresh-current-run Codex fallback |

Provider extension is still required where source execution needs additional generic discovery,
search or metadata behavior. Do not move that responsibility into Intake merely because the first
provider contract is already present. Do not claim the whole workflow has parity from this table.

### Typed domain traceability

| Source responsibility                              | Intake destination and regression                                                                                                                                                                                                                               | Integration still required                                                                                      |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `billing-claims.mjs`; billing reconciliation cases | `billing-types`, `billing-normalization`, `billing-claims`, `billing-collection`; `billing.test.ts` preserves cutoff-before-aggregation on raw/normalized paths, partial sessions, explicit completion, relationship conflicts and complete collection receipts | Source adapters, final storyline/recommendation and collector composition; their source tests remain applicable |
| `evidence.mjs`, `source-result.mjs`, `drift.mjs`   | `evidence`, `source-result`, `drift`; `evidence.test.ts` preserves ranking, specificity, source-empty versus failed/incomplete results and exact fingerprint comparison                                                                                         | Admission, collection and publication consumers                                                                 |
| `authorization-gate.mjs`                           | `authorization-types`, `authorization-record`, `authorization-gate`; `authorization.test.ts` preserves phase-specific milestones, unresolved coverage, episodes, conflicts and insurance-position priority                                                      | Raw Salesforce/notes mapping and final report                                                                   |
| `ia-occurrence.mjs`                                | `ia-occurrence-types`, `ia-occurrence`; `ia-occurrence.test.ts` preserves partial completion, future monitoring, passed unverified plans and row-local reconciliation                                                                                           | Final report and source adapter regressions                                                                     |
| `gate-engine.mjs`, `gate-context.mjs`              | `gate-engine`, `gate-context`; `gates.test.ts` preserves prerequisite ordering, excluded/unknown stages, authoritative authorization evidence and newer contextual non-authorization evidence                                                                   | Full evidence engine, storyline, recommendations and workbook                                                   |

Salesforce metadata queries use the shared reader's explicit Tooling API option. Fireflies identity
normalization and offset-chain validation use `fireflies-data`; the Intake wrapper must still bind
the raw/normalized hashes, run, complete discovery scope and frozen cutoff. Provider page validation
does not itself certify an Intake collection. No business decision moved into those providers.

### Interpretation, coverage and recovery contracts

- `stage-entry.mjs`, `source-outcome.mjs` and `source-requirements.mjs` (including Slack cohort
  coverage) map to Intake's `stage-entry`, `source-outcome`, `source-requirements` and
  `slack-coverage`; `source-policy.test.ts` preserves source failure precedence, the existing
  current-run window, optional enrichment and cohort/denial completeness.
- `interpretation-binding.mjs`, `interpretation-gate.mjs` and pure/domain portions of
  `ai-interpretation.mjs` map to Intake's binding, contract, packet, findings and AI composition
  modules. Golden prompt/schema/packet hashes, legacy semantics, support, identity and date-role
  regressions live in `interpretation-binding.test.ts` and `ai-interpretation.test.ts`. Vendor
  execution imports only `openai-platform/responses`, with Intake supplying low reasoning effort.
- `bounded-worker-pool.mjs` and `bounded-delta-interpretation.mjs` map to the same-named typed Intake
  modules and tests: retry limits, terminal dispatch, serialized successful in-flight persistence,
  cancellation and resume/reuse/fresh decisions. Standard callback Errors retain identity; non-Error
  failures are wrapped with their original cause. Typed transport validation returns sanitized
  errors for malformed response fields, without changing supported finding admission.
- The detailed-page parser from `slack-plugin-search.mjs` maps to shared `slack-data/search.ts` and
  `search.test.ts`. It returns the exact individual readback reference rather than imposing Intake's
  hashing or collection-time rule. Intake's capture consumer hashes original responses, validates
  readback timing, reconciles continuation signals and applies cutoff/cohort rules, as mapped below.

These contracts do not establish complete workflow parity. The caller integration must preserve
artifact-byte receipts, leave published artifacts immutable and exercise the original recovery and
publication tests. Grouped interpretation objects preserve values and canonical hashes; newly
serialized files need new actual-byte receipts, never copied receipts from prior artifacts.

### Fireflies discovery and cache traceability

- `fireflies-discovery.mjs` maps to Intake's `fireflies-discovery.ts`, composing shared identity and
  pagination normalization while retaining raw/normalized receipt hashes and current-run scope.
- Provider-only complete-record validation from `fireflies-cache.mjs` maps to shared
  `fireflies-data/complete-transcript.ts`; no cache or Intake policy moves into that package.
- Cache policy, baseline eligibility, planning, materialization and replay proof validation from
  `fireflies-cache.mjs` map to Intake's `fireflies-cache-*` modules. Discovery and cache tests retain
  cutoff filtering, exact page exhaustion, shadow fresh reads, explicitly approved reuse, unchanged
  retrieval timestamps, metadata/content changes, bounded age and tampered/transplanted receipt
  rejection. Provider failures translate to Intake command categories without raw payload causes.
- `fireflies-cache-storage.mjs` file/lock primitives and `connector-checkpoint.mjs` map to Intake's
  `private-run-storage.ts` and `connector-checkpoint.ts`; `fireflies-collection-mode.mjs` retains its
  explicit mutually exclusive mode receipts. These are private run/recovery mechanics, not provider
  code. Existing packages do not expose a compatible private-run storage contract; no generic
  framework is introduced for this workflow-owned persistence.
- Content-addressed cache load/save and raw/normalized discovery proof checks map to Intake's
  `fireflies-cache-storage.ts`. Inventory health maps to `run-artifact-health.ts`. Synthetic
  filesystem tests cover concurrent acceptance, bounded lock retention, atomic failure cleanup,
  exact hashes, failed outcomes, ancestor publication receipts, corrupted objects and provenance.
- `provider-identity.mjs` maps to Intake's provider identity/source projection, role grouping,
  search-term, coverage and participant-proposal modules. Generic vendor participant decoding is
  shared `fireflies-data/participants.ts`; alias matching, confidence and registry proposals stay
  Intake-owned. No automatic registry write is introduced. Nullable/falsey source-array omissions
  survive projection until the original normalization step.
- `fireflies-collection.mjs` maps to `fireflies-collection.ts` and `fireflies-search-execution.ts`:
  run-wide windows, deduplicated requests, role/cohort membership, fallback phases, pagination and
  newly discovered participant-email searches retain their source behavior.
- `readCacheRunProof` maps to `fireflies-cache-replay-proof.ts`. Regressions bind the current
  identity-derived plan, exact consumed profile/row snapshots, discovery and materialization;
  decoders preserve additional hash-bound metadata. No later disk row read replaces the builder's
  snapshot. These contracts do not certify full evidence replay or operational readiness.
- `fireflies-bounded.mjs` maps to Intake's bounded contract/search/manifest, candidate-body and
  conditional-coverage modules. Tests retain per-row windows and missing-query exceptions,
  prior-tier skip receipts, mandatory alternative primary emails, nonempty fresh bodies and the
  existing missing-CSM resolution without changing the original manifest.
- `fireflies-bounded-storage.mjs` maps to bounded files/storage/proof modules. Raw captures precede
  normalization receipts and checkpoints; pending finalization precedes the inventory and complete
  proof. Tests preserve interrupted/concurrent recovery, idempotent finalization, private files,
  published-run immutability and exact consumer replay/conditional-coverage bindings.
- `fireflies-read-executor.mjs` maps to Intake's read-state/executor, composing shared provider error
  and body normalization. The host supplies the authorized callback. Serial pacing, endpoint budgets,
  durable provider-wide cooldowns, local raw/accepted recovery and sanitized failures retain their
  source behavior; no new direct API, credential route or cross-workflow retry policy is introduced.

### Client and conversation matching traceability

- `client-identity.mjs`, `candidate-match.mjs` and `roster-matching.mjs` map to Intake's client
  identity/name, candidate-match and roster matching/scoring modules. The approved empty client
  registry is preserved exactly. Regression coverage retains practice scope, exact-ID precedence,
  alias provenance, active-candidate ranking, uniqueness thresholds and common-speech exclusions.
- `matching.mjs` maps to identity-profile, text-match and transcript-segments. Tests retain profile
  composition, direct and assumed identity distinctions, context and competing-client handling,
  excerpt overlap and sentence-ID deduplication. The legacy first-name regular-expression semantics
  (including normalized `.` and `+`) use one documented line-scoped lint exception, not a new
  matching rule or global lint relaxation. Literal regressions preserve their existing behavior,
  including the short-name short circuit and malformed-pattern error.
- `conversation-search-result.mjs` maps to conversation matching, name/anchor scoring, typed search
  results and source health. Tests retain roster ties and fallback identity, approved confidence
  thresholds, date contributions, completeness and failure precedence. Provider parsers do not
  make these workflow-specific relevance or source-admission decisions.

These matching contracts still require full source-adapter and report integration. Synthetic
comparison against the approved reference is not a live interpretation acceptance or cutover.

### Current-run judgment and evidence assembly

- `precomputed-interpretation.mjs` maps to Intake's precomputed candidate validation and finalizer.
  Findings retain the approved exact-field contract and receive packet-validation bindings without
  claiming API execution. A compiling integration test feeds the complete artifact into the delta
  planner and confirms that current-run Codex findings are not eligible for prior-run API reuse.
  Explicitly undefined meeting IDs remain own properties rather than being removed for typing.
- Malformed-input disposition: the legacy JavaScript date regex accidentally accepted one-element
  arrays through string coercion. The typed boundary rejects array dates under the already-approved
  `string | null` finding schema; it does not coerce them into valid evidence. Null finding members
  remain rejected with a deliberate schema error instead of an incidental `Object.keys` TypeError.
  Parity claims cover the approved schema, not identical acceptance of every malformed JS value.
- `note-adjudication.mjs` maps to Intake's note decision, adjudicator, storage verification and
  freshness-projection modules. Supported agent judgment remains bound to the current run, cutoff,
  exact source text and gate. Missing decisions retain parser fallback; administrative judgments
  cannot dismiss unreviewed segments or create freshness events. Malformed envelopes fail at the
  typed provenance boundary; retained metadata still participates in exact decision hashes.
- `evidence-assembly.mjs` maps to the typed evidence projection and deduplication module. Regressions
  preserve typed semantics/provenance, absent versus explicit unknown milestone meaning, source
  aliases, audit identities, equivalent timestamps and last-authoritative-event precedence.

These contracts preserve agent judgment, not a new deterministic classification requirement.
Source-adapter, freshness-analyzer and final report integration remain separate parity work.

### Report inputs and historical state

- `staffing-linkage.mjs` and `fireflies-report-coverage.mjs` map to Intake-owned typed projections.
  Direct/request linkage and the existing capital-ID deduplication behavior remain unchanged.
  Report coverage consumes revalidated bounded proof; identity resolution cannot erase incomplete
  retrieval. Tests compose real proof output with required-source outcome and blocking decisions.
- `reviewer-state.mjs` preserves exact reviewer values, including whitespace, booleans and falsey
  values. Duplicate-ID precedence and null defaults remain unchanged. This does not route reviewer
  state through a provider's stringifying table helper or authorize writes.
- `generation-ledger.mjs` retains canonical summary hashes, sentence/token similarity, generated
  text exclusion and admission of distinct human additions. `generation-ledger-storage.mjs` freezes
  historical input, removes only unpublished current-run drafts and replaces draft output without
  rebasing history. Original extra fields and output bytes survive; published runs stay immutable.
- `text-truncation.mjs` retains code-point slicing and the approved ellipsis behavior. It is a small
  Intake report helper, not a speculative new utility package.

These projections and persistence contracts still require workbook, source-adapter and publication
composition. They preserve existing rules rather than adding evidence classifications or gates.

### Slack capture and read recovery traceability

- Shared `slack-data` owns structured and detailed rendered page decoding, reply counts, continuation,
  response failure status/Retry-After and receipt-level thread failures. Intake imports those public
  contracts; the provider does not import run files, workflow types or Intake policies. The
  structured-page, rendered-search and failure-metadata functions sanitize unexpected accessor
  errors, including errors resembling a public provider error; only private, deliberate validation
  errors retain diagnostics there. Envelope and thread helpers retain their existing behavior.
- `slack-search-capture.mjs` maps to Intake's typed capture and page modules; its
  `extendSlackSearchCapture` and `mergeSlackDelta` functions map to the separate typed resume and
  delta modules. They retain full-cohort scope, raw hashes, exact readback bindings, connected
  pagination, duplicate/conflict handling and frozen-cutoff admission. Normalized records retain
  extra source metadata and use original readbacks for binding; resume/delta preserve underlying
  page/record references. Later adapters must expose consumed metadata through validated typed
  contracts, not discard it for narrower types.
- `slack-read-executor.mjs` maps to Intake's injected reader, composing shared failure metadata with
  the approved retry bounds, pacing, checkpoints and publication immutability. Typed plan/inventory
  serialization may reorder JSON keys on new writes; values and canonical hashes are unchanged.
  New byte receipts must bind actual emitted bytes. Cross-version resume retains existing saved
  artifacts without reserializing them or duplicating completed reads.
- The cutoff cases from `slack-response.mjs` remain Intake-owned and compose the shared non-temporal
  thread parser. Post-cutoff replies require complete bounded/unbounded reconciliation; neither a
  lower reply count nor content beyond the cutoff is silently admitted.

Provider tests use synthetic non-Intake responses. Intake tests compose captures, exact readbacks,
recovery, terminal failures and cutoff threads. The next section maps denial-context contracts;
actual source-adapter and full operational composition remain separate work. This is not readiness.

### Authorization source projection and denial context

- `scripts/live-collector/authorization-gate.mjs` maps to Intake's source authorization types,
  normalization, milestone/supersession and gate modules. This is the existing live adapter feeding
  existing core policy, not a new authorization policy. Preserve direct-denial fallback, linked versus
  standalone Reviews, phase-specific approvals, source record identity and stage-entry relevance.
  Supported nullable fields and own undefined projections are modeled explicitly. Null status or
  determination that reaches the strict core still throws the approved TypeError; the migration does
  not reinterpret those failures as approval, missing evidence or an empty string.
- `src/slack-denial-context.mjs` maps to Intake's denial requirements, context verification,
  publication check and private storage modules. The shared Slack package owns reply metadata and
  generic decoding; Intake owns required identity searches, selected Review numbers, exact plan and
  capture bindings, merged/thread evidence and row-level exceptions. Complete empty searches and
  not-applicable rows do not require invented evidence or extra reads.
- Private coverage is recomputed from original source artifacts, not a saved success receipt. Missing
  or invalid raw capture stays row-level incomplete. Optional artifacts are validated only when
  consumed: zero applicable denials do not inspect unused Slack rows, and empty/no-reply results do
  not require a thread array. Original raw hashes and file-read/JSON-parse errors remain. Unusable
  consumed structural inputs receive explicit errors rather than incidental JavaScript failures.
  No private evidence is rewritten. The
  publication check retains the existing partial-publication rule: every genuinely missing required
  row/source must be visibly marked Blocked with denial-context rationale.

These pure contracts and private readback do not complete the CLI, source-adapter, workbook or final
publication integration; those consumers still need full reference-case composition.

### Publication planning foundations

- `google-grid.mjs` maps to Intake's required-capacity calculation, retaining numeric conversion and
  integer-only expansion without shrinking the current grid.
- `google-read-plan.mjs` maps to Intake's assertion read grouping: only consecutive adjacent value
  assertions in the same tab/columns can share a bounded read. Original assertions remain unchanged
  and retain their references; read groups retain extra metadata. Full adapter validation still
  occurs before dispatch, and each fresh readback sample must perform its own reads.
- `google-presentation.mjs` maps to Intake's exact bounded presentation requests/assertions. Only
  wrap/alignment and chosen dimensions are touched. Run History appends retain historical rows and
  existing column widths; grid/data/filter/reviewer ownership is not broadened.
- `publication-plan.mjs` maps to the same selected-field stage/final-assertion hash. Extra operator
  metadata does not enter that hash; payloads, dependencies, flags and assertion order do.

These are pure workflow planning helpers, not new provider write capabilities. The following
sections record complete pure planning, capture acceptance, gate and readback contracts. Their
file preparation persistence, provider and operational command integration remain unfinished. The
injected executor is described below. No live writes
or cutover are authorized by these tests.

### Publication freshness and frozen-snapshot gate

- `publication-gate.mjs` maps to the typed publication gate, freshness, cohort and reviewer snapshot
  modules. `publication-gate.test.ts` retains the original check order, exact two-hour write-lease
  boundary, future/invalid timestamp rejection, approved Sheet identities, unchanged marker and
  reviewer state, complete post-cutoff disposition, plan hash and Run History/terminal ordering.
- Snapshot hashing preserves raw reviewer values, own undefined versus absent fields and
  non-enumerable own reviewer fields. Unrelated metadata is not read; no trimming, stringification
  or formula conversion is introduced. Actual Google capture producers compose with the gate.
- A proven post-cutoff material change remains deferrable under the approved frozen-snapshot rule.
  Write-lease expiration does not change the assessment cutoff or itself require recollection.
  Binding checks and read-only recovery remain independent of the lease check before further writes.

This gate adds no business requirement. The following sections record captured-readback and pure
planner parity and injected execution; provider and operational command integration remain work.

### Exact stage and final readback contracts

`publication-readback.mjs` maps to typed readback, actual-value hashing and prepared-payload modules.
`publication-readback.test.ts` retains ordered stage recovery, exact call reconstruction and control
hashes, capture-evidence receipts, coordinate checks, range padding, explicitly allowed blank
checkboxes, float32 color normalization, text/dimension/filter/validation assertions and independent
durable final assertions. A passed intermediate stage does not substitute for the final live sample.
Readonly recovery and binding remain available after the write lease expires. Checkbox coordinates
keep the original numeric-property behavior; negative/fractional coordinates are not reinterpreted
as array offsets. Raw values are hash-verified, not accepted from operator-authored actual hashes.

These contracts do not themselves read or write Google. The capture and planner composition below
retain them; provider I/O, retries/uncertain outcomes and command integration remain separate work.

`publication-replan.mjs` maps to the typed replan contracts and helpers. The original capacity-only
pre-dispatch rejection and definitive atomic cell-length rejection retain only exact verified
stage/call prefixes. `publication-replan.test.ts` preserves rejection cases, immutable input receipts,
caller call subtypes and exact resume-prefix comparison. No generic retry of uncertain writes is
introduced; publication execution and command integration remain separate work.

### Google capture and retained state

`google-capture.mjs` maps to the typed capture-values, assertion-capture and state-capture modules.
Intake composes the shared `google-sheets-data` format/validation contracts; native partial-metadata
captures and shared reader responses both enter the same exact range/assertion acceptance path.
`google-capture.test.ts` checks provider -> capture -> readback composition, sparse cells/formulas,
overlapping grids, exact property indices and dimensions, uniform formats/validation, reviewer
identity and fields, governed extents, history IDs and independent concurrency. Blank scalar strings
normalize only in state-table projection; assertion values retain their provider types.

Fresh unchanged-file revalidation binds the original capture and retains its collection timestamp.
It does not relabel old ledger evidence as a new read. The proof and current concurrency are checked
under the existing rule. All-sheet duplicate identity checks still apply, while only governed tabs
are projected. `google-state-storage.mjs` maps to the read-only `verifyGoogleStateCapture` transaction
verifier: all five saved projections must match the raw envelope; missing, changed, malformed or
symlinked files are not successful captures. Original unhashed legacy metadata retains its existing
compatibility path. Unknown JSON is consumed field-by-field, not eagerly validated for unused tab
data. Original timestamp parsing and raw values/hashes remain intact, including legacy non-string
timestamps; unknown input has unknown timestamp output rather than an unsafe string assertion.
`google-state-storage.test.ts` covers these saved transactions and retained proof semantics.
`capture-google-state.mjs` persistence maps to `saveGoogleStateCapture`: supplied evidence is
validated before taking the existing writer lock, published runs remain immutable, retained raw
captures are archived identically, and all projections precede the final raw transaction marker.
A synthetic mid-projection failure proves old raw/archive retention, failed partial verification,
lock/temporary-file cleanup and successful same-proof resume. Provider reads and command routing
remain work. These capture functions do not make provider calls or authorize publication.

### Complete pure publication planner

`google-publication.mjs` maps to the typed builder and its internal cell, append, reviewer, notes,
presentation and stage modules. This remains Intake-owned business publication logic, not a shared
Google writer. `google-publication.test.ts` covers the original nine-stage ordering, exact stale-tail
clears, reviewer movement/new/removed rows, prepared-cell proof, ledger/history append recovery,
terminal marker labels, typed cells, UTF-16 limit and expanded UTF-8 request budgets. Calls reconstruct
the original prepared stage payload; final assertions describe only durable final workbook state.
Append selection narrows current-run desired ledger/history rows only after filtering; unrelated
historical entries are not a new matrix-validation requirement. Replacement, notes and live-state
rows remain fully consumed and checked, and malformed selected current-run entries still fail.
The pure assembly from `build-google-payloads.mjs` maps to `prepareGooglePublicationArtifacts`:
exact stage/call filenames, payloads, prepared-manifest hash and bound reviewer proof are returned
without I/O. Shared Google types remain read-only provider contracts. Publication-plan persistence,
native/REST adapter composition and operational command acceptance remain
distinct migration work.

### Injected-adapter publication execution

`publication-executor.mjs` maps to typed execution, private loading and capture-retention modules.
The host supplies explicit read/write capabilities and exact-plan authority. Each stage and call
retains the approved lease/concurrency checks, payload reconstruction and journal prefix validation.
An uncertain call is never replayed: only whole-stage live readback can advance it. The finalizer
requires every stage, makes two independent bounded-interval samples and writes the immutable receipt
only after both match. Expired write leases do not disable this read-only final verification.

`publication-executor.test.ts` covers stage ordering, write expiry, interrupted acknowledgments,
authority/capability/concurrency failures, exact saved prefixes, changed local bindings, partial
captures, second-sample drift and lock cleanup. Raw prepared JSON is narrowed without reconstruction
so original controls, unknown metadata and saved hashes survive. This ports execution policy, not
provider mechanics: native/REST composition, preparation persistence and CLI acceptance remain work.

The explicit credential mechanics from `google-adc-reader.mjs` belong in shared
`google-read-transport`, exposed as `createGoogleAdcTokenProvider`. They preserve private
file/client/account checks, child-only environment isolation, verified identity, in-memory cache and
coalesced refresh, and sanitized failures. Intake still selects its approved paths/account and owns
read-only adapter composition. `bound-adc.test.ts` tests the provider without Intake imports; the
existing Google/Organic default ADC behavior is unchanged. No credential is read by migration tests.

`google-rest-adapter.mjs` now composes shared transport and raw field-selected Sheets reads in
Intake's `google-publication-adapter`/`google-publication-http`. The provider packages remain
read-only; Intake retains exact prepared POST controls, single-attempt writes, 1100ms read pacing,
five-attempt/60-second wait bounds, per-sample coalescing and assertion capture. Queue wait precedes
HTTP timeout creation. Raw partial captures narrow only consumed fields, preserving null blanks and
unused provider metadata without weakening the existing strict grid reader. The read-only facade
from `google-adc-reader.mjs` exposes no apply operation. Permanent adapter/failure/pacing tests retain
independent 117-assertion samples, partial failures, transient metadata and construction bindings.
Operational CLI composition and preparation persistence remain distinct work.

The saved-file bodies of `next-publication-stage.mjs`, `capture-publication-stage-readback.mjs`
and `verify-publication-readback.mjs` map to the exported next-stage/readback command functions.
They perform no provider calls. The next-stage function checks the same bound lease before and
after loading selected payloads, including resumed call prefixes; completed state remains
inspectable after expiry. Recording reads current observations after payload validation so it
cannot overwrite a newer receipt sampled during that I/O. Final supplied-sample verification also
reads observations after all payloads, preserves the original incomplete exit status and writes
the same exact receipt. This manual single-supplied-sample path remains distinct from the executor's
two independent adapter samples. Raw saved assertion metadata is narrowed only where consumed;
producer types remain precise and raw plan/evidence hashes are preserved. The permanent saved-file
tests cover expiry, resume, nullable unused metadata, ordering and interleaved receipt updates.
CLI routing/distribution and the higher-level validation/gate preparation command remain work.

`build-google-payloads.mjs` saved-file persistence maps to `prepareSavedGooglePublication`,
composing the existing typed planner and pure artifact assembler. It reads prior receipts before
building, removes the obsolete monolithic payload only after a valid plan, validates every archived
stage/call, archives the exact prior manifest/gate/receipts/rejection before replacements, and writes
the new manifest last. Capacity-only and definitive rejected-cell replans retain only the original
verified prefixes; same-plan preparation leaves receipts unchanged. Published runs remain immutable.
Raw input metadata is narrowed at consumption and retains its original reviewer hash. Synthetic
filesystem tests cover exact files, modes, unused inputs, replan failures and interrupted writes.
The higher-level validation/gate preparation command, CLI routing and distribution remain work;
this local file builder performs no provider calls and does not establish publication readiness.

The local `headstart-intake-sla` executable begins routing the saved-file commands through these
same functions: `review:next-publish-stage`, `review:capture-publish-readback`,
`review:verify-publish`, `review:google-capture`, and the positional `build-google-payloads` helper.
Existing successful JSON, incomplete-verification exit status 2, and capture-specific sanitized
failures are retained. Usage text names the compiled executable; other uncaught failures use a
concise error line instead of a Node stack. Synthetic subprocess tests run from a separate working
directory with no provider access. Other command routes and standalone dependency-closure packaging
remain incomplete; this executable is not a replacement for the approved operational runtime yet.

## Five implementation slices

1. **Characterize and assign ownership.** Pin sources and map routine behavior/tests to the owners
   above. No provider replacement or live execution. The map governs each later slice.
2. **Typed Intake semantics.** Port business/domain/evidence and pure interpretation contracts with
   case-level parity. Excludes source execution, workbook and publication implementation.
3. **Shared providers and recovery.** Implement the provider packages/extensions above and compose
   them with Intake-owned capture, workers, checkpoints and fallback. Excludes new identities,
   cache activation and consequential writes. Do not postpone extraction until after a monolith.
4. **Workbook, ledger and publication.** Preserve output, prior-ledger inputs, reviewer state,
   prepared writes, readbacks and uncertain-write recovery. No live publication or policy change.
5. **Distribution, instructions and cutover preparation.** Package the complete dependency closure,
   update canonical setup/runbook links and validate outside-checkout execution. Private replay and
   supervised live acceptance remain distinct explicitly authorized activities.

The slices define ownership, not an artificial command sequence for operating agents. Provider
contracts may be established early when required to prevent incorrect dependencies in domain work.
Only create executable packages when their first real source behavior is being implemented; no
empty framework or placeholder packages.

## Verification and dependency direction

Before each slice is considered complete, its actual imports, package manifests, source-case mapping
and parity results must agree with the ownership map. Automated import/dependency checks enforce
provider independence; review still checks whether the substance contains Intake policy. Do not
mistake a correctly named empty package for separation.

Use strict TypeScript, existing ESLint/complexity rules, package coverage, normal hooks and full
`corepack pnpm qa`. No broad assertions, JavaScript islands, test exclusions or weakened checks to
make a port pass. Preserve existing consumers, native capture/recovery semantics and cross-platform
behavior. Ordinary tests remain synthetic, network-free and credential-free.

## Workbook provisioning decision

The source uses `@oai/artifact-tool` for export/import, rendering and formula verification. Verify
either a supported distributable dependency or an explicitly provisioned versioned host capability.
An external host prerequisite can still support execution outside both source checkouts. Do not
replace the workbook library incidentally or infer rights from a previous migration note. Any
necessary replacement needs an explicit disposition and complete parity, not only XLSX creation.

The typed `resolveArtifactRuntime` and `review:runtime-preflight` route preserve the approved
resolution/check contract and optional private identity receipt. They check Node 22+, the explicit
entry or package fallback, and the same minimal library factories; they do not add a full workbook
validation gate. Factory results remain unknown until workbook consumers narrow their actual
contracts. No vendor package is copied or redistributed by this preflight. Workstation-specific
paths stay in private operator configuration, not the receipt. Host provisioning documentation and
complete outside-checkout dependency-closure acceptance remain work.

`artifact-workbook` now supplies the injected vendor operation adapter; Intake's
`populateIntakeWorkbook`, `exportIntakeWorkbook` and `verifyIntakeWorkbook` retain the original
seven-tab layout, values, operator sizing, sixteen preview ranges and formula-error scan policy.
The builder's upstream report/evidence assembly and higher-level validation command still need
composition; migrating these workbook functions does not make the entire workflow runnable.

`review:workbook-runtime-smoke --output-dir <new-directory>` is a separate manually launched
synthetic host-acceptance tool. It uses the selected provisioned library, writes synthetic values,
exports/reimports the workbook and runs the unchanged verifier. It requires a new output directory
to avoid overwriting run evidence and performs no source/API collection or external writes. It is
not a new daily operational gate. Record the provisioned library version and loader/bundle identity
with the manual acceptance evidence; its stdout reports resolver identity, not an independently
verified vendor version. A different working directory is not proof that dependency closure has
been packaged independently of this checkout.

## Credential handoff and interpretation preflight

The typed `withAwsOpenAICredential` preserves the source's explicit profile/region/secret selection,
early model/provider validation, credential removal from the AWS subprocess environment, sanitized
lookup failure and ephemeral consumer-only key. It injects a caller-provided process operation;
it neither hard-codes an organizational secret nor retrieves credentials at import time. Intake
owns this approved binding policy rather than adding an unneeded universal secrets package.

`preflightInterpretation` and `review:ai-preflight --run-dir <private-run-directory>` preserve the
synthetic packet, exact model/schema/binding and success/failure receipt. They compose the existing
isolated shared Responses client, including `store: false`, and do not invent a different model
or fallback. Tests use injected fake AWS and Responses operations only. Separate live acceptance
remains explicitly authorized work.

The saved `review:finalize-precomputed` route now composes the current-run Codex candidate validator
and exact-packet binding with the approved file ordering, private output mode and summary. Packet
hashing retains the original JSON rather than reconstructing a narrower packet. This fallback
does not claim API execution or make prior-run Codex judgments eligible for reuse. Saved artifacts
are checked only for the structural fields consumed here; transcript interpretation remains a
separate consumer. Empty candidate rows remain ignored until they actually contain interpretations.
Typed callers retain their known meeting-ID type while raw saved metadata remains uncoerced.

`interpretSavedDelta` and `review:interpret-delta` now compose the existing exact-bound reuse plan,
private writer lock, mutable-run guard, current preflight, bounded workers, serialized checkpoints,
signal cancellation and final execution receipt. Successful in-flight interpretations survive a
later failure. Only fresh packets are passed to the shared Responses client; reuse never narrows or
reconstructs unused packet fields. The API consumer accepts the original optional source/opportunity
fields and validates only the fields used for finding support. These routes do not collect sources
or change the frozen cutoff. Complete operational orchestration remains unfinished. Newly
serialized grouping may differ only in object-key insertion order; all values and
canonical hashes are retained, and new byte receipts must describe the actual new bytes.

`runAwsInterpretation` and `review:interpret-with-aws` preserve the approved action selection,
private/mutable current-run check, ephemeral credential handoff, inherited child output, signal
forwarding and sanitized wrapper failures. The child invokes the selected route in the built local
CLI instead of a source-repository script; its working directory is that entrypoint's directory.
This removes the source-checkout dependency without changing provider identity or making a live
call during testing. A real synthetic Node child supplements injected-process tests; complete
outside-checkout dependency closure remains a separate migration acceptance.

## Related guidance

- [Documentation hub](README.md)
- [Workflow authoring](workflow-authoring-guide.md)
- [Reusable data capabilities](reusable-data-capabilities.md)
- [Testing and release](../standards/testing-and-release.md)
- [Canonical operator skill](../skills/headstart-intake-sla-review/SKILL.md)
