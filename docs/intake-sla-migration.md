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

The standalone packaging path assembles the actual built runtime dependency closure, preserves
external lockfile snapshots/integrities and uses the pinned frozen production install. It reuses
Organic's command/link/fingerprint helpers without changing that workflow. Intake carries its full
compiled synthetic suite as a runtime dependency; validation reruns that suite in a child selecting
production exports, rather than relying on source aliases or a prior pass receipt. Outside-checkout
CLI validation and synthetic workbook build/reimport/render/formula acceptance pass. The packaged setup and runbooks describe deliberate runtime selection; synthetic parity does not
claim live model/provider acceptance or an installed operational cutover.

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

Structured report collection now composes `salesforce-read` for verified reads while Intake owns
the exact cohort and related-record queries, chunking, frozen saved-input reuse, record projections
and artifact order. Saved mode makes no provider calls. Report-specific identities remain distinct
from the generic identity builder: provider/practice roster scope, raw family contact values,
CSM history, search windows and billing reconciliation retain the approved report behavior. Actual
producer-to-adapter contracts are readonly structural projections, not casts or invented fields.
Saved-source loading and health now retain the original capture/proof selection and private
derivations without provider reads. Raw payloads remain untouched until their consumer decodes the
selected fields; the Portal evidence boundary does not validate unused fallback envelopes.
The normal command routes compose these modules; collection tests do not authorize operational
cutover.

The report's Opportunity preparation, communication matching and comparison context now compose
actual typed collection/identity producers. Comparison remains context for source requirements;
the final recommendation takes conflicts only from the approved structured resolvers and admitted
evidence. Authoritative adapters retain order, Date-object cutoff/fallback behavior and accepted
current-run note decisions. Interpretation composition preserves API/precomputed/unavailable
selection, exact bindings, fresh Codex provenance and cohort-aware Slack without admitting raw
conversations a second time. It does not add another interpretation pass or change agent judgment.

Final packet, recommendation and report-context projection retain source coverage, specificity,
action selection and timeline field semantics. Actual producer-to-consumer tests include missing
stage values and the original falsy milestone results; typing does not invent business values or
add a rejection. Saved-payload decoding and complete per-row orchestration now compose these
contracts, retaining source counts, empty/unchecked distinctions, original review and QA status,
reviewer cells and ledger fields. Source and built-package review now cover the complete per-row
composition. The package build checks its
rolled-up public declarations with library checking enabled, in addition to source type checking.

The saved-run builder now composes collection, private identity registries, retained source artifacts,
the complete row evaluator and final artifact/workbook projection. Interpreter startup preserves the
original on/off selection, API preflight lease, bound API artifacts and fresh-current-run Codex
provenance. Explicit registry injection changes configuration location, not identity or roster rules.
Builder, input-boundary and CLI build integration have passed source and built-package comparison
review; no installed skill or operational runtime has been switched. Validation/preparation, source-capture commands and independent runtime packaging have their own
acceptance paths rather than being inferred from a successful saved build.

Local source-capture command composition now connects connector checkpointing, discovery
normalization, bounded Fireflies capture, and Slack capture/resume/delta to the existing typed
implementations. These commands accept agent-supplied private artifacts without provider dispatch.
They retain bounded stdin, exact retry checks, prior-capture archives and sanitized failure output.
Source and built command comparison review passed, including interrupted-write recovery and
exact retry behavior. Standalone packaging is validated independently of source command tests.

Transcript selection now composes the typed provider identity and conversation scoring contracts
with the approved roster-aware context windows. Meeting indexes remain distinct from explicitly
collective updates, competing-client boundaries are preserved, and direct/assumed identity metadata
is retained. This is Intake evidence admission, not vendor transport behavior; it lives in the
engine and does not change the agent's interpretation or additional-tool judgment. Conversation
scoring accepts the original Date-object and numeric date inputs as well as serialized dates.

The existing conversation fact extractor composes typed common, initial-assessment, treatment-plan,
insurance and RBT/first-service modules. It preserves source branch priority, ordered append and
relevance-based deduplication, default follow-up dates, reported-versus-verified completion and
supported wording. `interpretConversation` projects those facts into the original evidence contract,
preserving identity metadata, source-record suffixes and explicit unknown milestone fields. These
are existing deterministic semantics, not a replacement for current-run interpretation or a new
fallback mode. Source adapters and report composition use these same contracts.

Opportunity notes retain source date and identity precedence and compose the current-run note
adjudicator: an accepted empty result stays empty, while an absent
decision retains the original parser fallback. Public producer contracts accept the report builder's
Date cutoff and nullable gate fields without changing callback values, packet hashes or frozen-date
semantics. This adapter remains Intake-owned evidence admission, not generic provider behavior.

Routine reachability is required before porting an original export. The original unused
`adaptAlohaAppointments`, `adaptClaims`, `adaptNormalizedNotes`, `adaptEscalationMessages` and
non-AI `adaptFireflies` exports have no routine callers and are excluded. Linked Billing / Claims
and current-run Fireflies interpretation remain required and are not replaced by those legacy paths.

Routine call/text and task adapters preserve approved line and relationship selection, the lower
confidence of call summaries, Task/flattened/embedded Chatter evidence, reported occurrence dates,
and bounded SMS request/response pairing. These consume already collected Salesforce records and
reuse the engine's identity and conversation contracts; they introduce no provider read, new text
matching policy, or automatic Salesforce action.

Routine authorization report evidence retains phase-specific field meaning, current record and
coverage selection, individual-coverage progress versus whole-prerequisite completion, expiration,
and dated post-approval confirmations or corrections. It composes the existing core resolver but
does not replace its distinct report-evidence normalization with the live prerequisite projection.
The actual report producer's Date cutoff and nullable gate fields remain supported.

Portal report evidence retains the original capture-envelope precedence, content/sender deduplication
across channel labels, direct lookup and relationship admission, and roster-clause selection in
provider-wide conversations. Channel labels remain non-authoritative; original messages remain raw
evidence while the target-specific segment supplies interpretation. These are Intake-owned product
and evidence rules, not a new generic provider SDK or source-health gate.

Slack report evidence composes shared `slack-data` markup and display-timestamp projection with
Intake-owned client/roster segmentation, structured and legacy captured-input selection, automated
stage-post exclusion, supporting-only denial context and historical hold dates. Source captures and
their hashes remain unchanged. The original distinctions between structured and rendered channel
exclusions and between structured-only and rendered-path deduplication are preserved; the migration
does not redesign those business rules.

Fireflies report evidence composes the shared-provider-derived meeting records, existing roster
segmentation, bound API interpretation and current-run Codex validation paths. It preserves the
approved findings, admitted-match accounting, coverage failures and explicit fallback flag; it does
not enable fallback or prior-run reuse. Packet context retains the actual identity producer's raw
metadata and own undefined fields without inventing a closed data shape or changing hashes. Provider
execution remains in the isolated Responses entry point; Intake owns packets, bindings, provenance,
support and report meaning.

Portal collection planning and materialization preserve shared-provider request grouping, exact
parent/child request bindings, frozen chat cutoff, content deduplication, roster admission and
row-local missing/incomplete results. A legitimately empty planned sentinel may use another complete
nonempty current-run request, under the existing separate all-zero health rule. This is the approved
product-specific capture protocol, not new transport, a new source requirement or relaxed coverage.

The existing Portal report-summary projection remains distinct from evidence admission. It preserves
message fallback and decoding order, date sorting, channel-conflict deduplication, system-noise and
stage-relevance accounting, and unchecked versus confirmed-empty results. It supplies the approved
builder/freshness contract without changing the stronger evidence adapter or adding source reads.

Supplemental search pathways retain the original name variants, provider/CSM/authorization/staffing
anchors, query order and conversation admission scores. They consume real identity profiles and
prepared pathways, preserving direct-lookup precedence, weak/competing matches and country-prefix
phone matching. This Intake-specific relevance policy is distinct from generic provider search and
from the engine's separate conversation-window scorer; neither is substituted for the other.

Freshness note and candidate helpers retain the approved administrative-pattern exclusions,
generated-draft signatures, embedded-note dates, date-prefix display, family-specific substantive
evidence tests, relevance priorities and summary wording. These are the existing report's rules,
not new agent constraints. Routine freshness assembly composes those helpers with the typed source
projections and current interpreted events. It retains the frozen cutoff, current-gate evidence
window, source/relevance ranking, provenance and own unknown milestone fields, distinct audit and
substantive views, elapsed-day freshness and chronological changes. Search bundles stay auditable
without independently establishing freshness. The approved routine builder supplies no raw
Fireflies/Aloha/Claims/Slack inputs here; unreferenced raw-transcript fallback and standalone
file-processing CLI are excluded. Final recommendations and report composition consume this same freshness projection.

Storyline assembly retains the approved frozen story window, evidence admission, issue inference,
explicit and implied resolution, restatement/supersession and conflict rules, current-gate succession,
unresolved authorization precedence, future milestone monitoring and narrative/source projections.
Typed lifecycle modules preserve the original rule order and arbitrary producer metadata without
mutating inputs. These remain Intake-specific report semantics; no new provider capability or agent
judgment constraint is introduced. The final recommendation and rendered report compose these contracts.

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

This table records provider-level extraction and its Intake consumers. Existing source test
expectations remain the behavioral reference; shared-provider tests alone do not establish report parity.

| Source responsibility and baseline case                                                                                                                                             | Provider destination and regression                                                                                                                                                         | Intake remainder                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `salesforce-target.mjs`; `salesforce-target.test.mjs`; complete `sf data query` envelope                                                                                            | `salesforce-read`: `contracts.test.ts`, `cli.test.ts` verify actual org/environment, complete counts, valid zero, malformed/partial rejection and bounded CLI execution                     | Production target configuration, business SOQL, fingerprints and cohort                                                                    |
| `google-rest-adapter.mjs`; `google-rest-adapter.test.mjs` HTTP/transport metadata                                                                                                   | `google-read-transport`: `failure-metadata.test.ts` preserves status, retry-after and body-consumption transport failures; no provider retries                                              | Pacing, bounded attempts/waits, coalescing, write authorization and uncertain outcomes                                                     |
| `google-rest-adapter.mjs` metadata/cell/dimension field masks; `google-capture.mjs` typed values                                                                                    | `google-sheets-data`: `grid-reader.test.ts` preserves exact entered types, whitespace, formulas, formats, validation and metadata with a single bounded sample                              | Coordinate assertion capture, reviewer fields, stable snapshots and exact acceptance                                                       |
| `fireflies-connector-response.mjs` plus vendor metadata from `fireflies-cache.mjs`; `fireflies-connector-response.test.mjs` and error cases from `fireflies-read-executor.test.mjs` | `fireflies-data`: `transcript.test.ts`, `failure.test.ts` cover listing milliseconds/body seconds, silence versus speech, identity/completeness changes and sanitized quota/read failures   | Raw capture hash/version, discovery scope, cutoff, candidate selection, cache policy, executor state and durable cooldown                  |
| `slack-response.mjs` single-response normalization and `slack-plugin-search.mjs` transport unwrap; non-cutoff `slack-response.test.mjs` cases                                       | `slack-data`: `thread.test.ts`, `envelope.test.ts` preserve no-reply receipts, explicit count, structured pagination/identity and transport rejection                                       | Run hashes, cutoff reconciliation, cohort queries and admission remain Intake-owned; see Slack capture traceability below                  |
| `ai-interpretation.mjs#createOpenAIResponsesClient`; request/failure cases in `ai-interpretation-schema.test.mjs`                                                                   | Isolated `openai-platform/responses`: `responses.test.ts` checks model, explicit reasoning effort, schema name, strict output, non-storage, sanitization and no implicit retry/model switch | Exact prompt/schema, approved AWS credential selection, low effort, preflight, support/binding policy and fresh-current-run Codex fallback |

Future vendor mechanics follow the same shared-provider boundary. Do not move them into Intake
because a first provider contract already exists, or claim whole-workflow parity from this table.

### Typed domain traceability

| Source responsibility                              | Intake destination and regression                                                                                                                                                                                                                               | Composed consumers                                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `billing-claims.mjs`; billing reconciliation cases | `billing-types`, `billing-normalization`, `billing-claims`, `billing-collection`; `billing.test.ts` preserves cutoff-before-aggregation on raw/normalized paths, partial sessions, explicit completion, relationship conflicts and complete collection receipts | Source adapters, final storyline/recommendation and collector composition; their source tests remain applicable |
| `evidence.mjs`, `source-result.mjs`, `drift.mjs`   | `evidence`, `source-result`, `drift`; `evidence.test.ts` preserves ranking, specificity, source-empty versus failed/incomplete results and exact fingerprint comparison                                                                                         | Admission, collection and publication consumers                                                                 |
| `authorization-gate.mjs`                           | `authorization-types`, `authorization-record`, `authorization-gate`; `authorization.test.ts` preserves phase-specific milestones, unresolved coverage, episodes, conflicts and insurance-position priority                                                      | Raw Salesforce/notes mapping and final report                                                                   |
| `ia-occurrence.mjs`                                | `ia-occurrence-types`, `ia-occurrence`; `ia-occurrence.test.ts` preserves partial completion, future monitoring, passed unverified plans and row-local reconciliation                                                                                           | Final report and source adapter regressions                                                                     |
| `gate-engine.mjs`, `gate-context.mjs`              | `gate-engine`, `gate-context`; `gates.test.ts` preserves prerequisite ordering, excluded/unknown stages, authoritative authorization evidence and newer contextual non-authorization evidence                                                                   | Full evidence engine, storyline, recommendations and workbook                                                   |

Salesforce metadata queries use the shared reader's explicit Tooling API option. Fireflies identity
normalization and offset-chain validation use `fireflies-data`; the Intake wrapper binds
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

Source adapters and report composition consume these matching contracts. Synthetic
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
Source adapters, freshness analysis and final report composition have separate parity coverage.

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

Workbook, source-adapter and publication composition consume these projections and persistence
contracts. They preserve existing rules rather than adding evidence classifications or gates.

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
source-adapter and full command composition are tested separately. This is not live readiness.

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

CLI, source-adapter, workbook and final publication consumers compose these contracts with their
own reference-case coverage; pure contract tests do not substitute for that integration coverage.

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
sections record complete pure planning, capture acceptance, gate and readback contracts. Their file preparation, persistence and command consumers compose these contracts. The injected
executor is described below. No live writes or cutover are authorized by these tests.

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
planner parity and injected execution; provider and operational command composition use the same contracts.

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
retain them; provider I/O, retries/uncertain outcomes and commands compose these same contracts.

`publication-replan.mjs` maps to the typed replan contracts and helpers. The original capacity-only
pre-dispatch rejection and definitive atomic cell-length rejection retain only exact verified
stage/call prefixes. `publication-replan.test.ts` preserves rejection cases, immutable input receipts,
caller call subtypes and exact resume-prefix comparison. No generic retry of uncertain writes is
introduced; publication execution and commands retain that distinction.

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
lock/temporary-file cleanup and successful same-proof resume. The read command composes these capture functions. These capture functions do not make provider calls or authorize publication.

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
without I/O. Shared Google types remain read-only provider contracts. Publication-plan persistence, native/REST adapter composition and command acceptance each have
separate tests.

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
provider mechanics: native/REST composition, preparation persistence and CLI acceptance are tested separately.

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
CLI composition and preparation persistence retain these adapter boundaries.

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
CLI routing and higher-level validation/gate preparation compose these saved-file functions.

`build-google-payloads.mjs` saved-file persistence maps to `prepareSavedGooglePublication`,
composing the existing typed planner and pure artifact assembler. It reads prior receipts before
building, removes the obsolete monolithic payload only after a valid plan, validates every archived
stage/call, archives the exact prior manifest/gate/receipts/rejection before replacements, and writes
the new manifest last. Capacity-only and definitive rejected-cell replans retain only the original
verified prefixes; same-plan preparation leaves receipts unchanged. Published runs remain immutable.
Raw input metadata is narrowed at consumption and retains its original reviewer hash. Synthetic
filesystem tests cover exact files, modes, unused inputs, replan failures and interrupted writes.
The higher-level validation/gate preparation command retains the same prerequisites; this local
file builder performs no provider calls and does not establish publication readiness.

The local `headstart-intake-sla` executable routes the saved-file commands through these
same functions: `review:next-publish-stage`, `review:capture-publish-readback`,
`review:verify-publish`, `review:google-capture`, and the positional `build-google-payloads` helper.
Existing successful JSON, incomplete-verification exit status 2, and capture-specific sanitized
failures are retained. Usage text names the compiled executable; other uncaught failures use a
concise error line instead of a Node stack. Synthetic subprocess tests run from a separate working
directory with no provider access. Standalone dependency-closure packaging and deliberate operator setup are described in the
[local setup guide](../packages/intake-sla-engine/docs/local-setup.md). No skill update silently
switches an operational runtime.

### Compatibility with shared operator and document capabilities

Intake coexists with the application-controlled credentialing workflow without adopting its
execution model or business rules. Shared Google transport retains both the minimal injected JSON
contract and untouched native `Response` reads for Drive/Docs. The explicit file/scopes provider
and Intake's identity-bound ADC provider remain distinct choices, with no fallback between them.
HTTP metadata is shared; Intake still owns bounded retries and single-attempt prepared writes.

The OpenAI build emits the operator/executor artifacts and the isolated `./responses` ESM/types
entrypoint. Transcript interpretation does not acquire an operator-session dependency. Organic
and Drive retain their shared deployment wrapper; Intake retains built-closure assembly with a
frozen offline install. Complete document retrieval/inspection remains independently available,
not a replacement for Salesforce queries or workbook generation and formula verification, and
not a new required Intake source. These integration changes do not install a runtime, change
agent judgment or interpretation fallback, or authorize a live run.

## Five implementation slices

### Routine command coverage

The installed `headstart-intake-sla` executable owns the routine commands below. The public API
exports their underlying typed operations for hosts that supply authorized callbacks. CLI capture
commands accept actual protected tool responses; they do not pretend to dispatch desktop tools.

| Approved entrypoints                                                                                             | Typed composition and permanent regression coverage                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `review:build`                                                                                                   | `cli-build`, report collection/evaluation/finalization; `cli-build.test.ts`, report build/input/composition tests                                           |
| `review:validate`, `review:prepare-publish`                                                                      | `cli-validation`, self-validation and publication preparation; `cli-validation.test.ts`, `self-validation.test.ts`, report validation and preparation tests |
| `review:runtime-preflight`                                                                                       | `cli-runtime`, artifact runtime; `artifact-runtime.test.ts`, `cli-workbook.test.ts`                                                                         |
| `review:checkpoint`                                                                                              | `cli-source-capture`, connector checkpoint; `cli-source-capture.test.ts`, `connector-checkpoint.test.ts`                                                    |
| `review:portal-auth-capture`, `review:correction-init`, `review:structured-delta`, `review:post-cutoff-capture`  | `cli-recovery`; `recovery-storage.test.ts`, correction/delta/Portal/post-cutoff tests                                                                       |
| `review:slack-capture`, `review:slack-delta`                                                                     | `cli-source-capture`, exact raw capture/resume/delta; `cli-slack-capture.test.ts` and source contract tests                                                 |
| `review:slack-plan`, `review:slack-merge`                                                                        | `cli-slack-planning`, sweep planning/merge; `cli-slack-planning.test.ts`                                                                                    |
| `review:google-capture`, `review:next-publish-stage`, `review:capture-publish-readback`, `review:verify-publish` | `cli-publication`, exact saved state/readback; CLI, next-stage and readback-command tests                                                                   |
| `review:google-read`, `review:drift`                                                                             | `cli-source-read`, shared Google/Salesforce readers; `cli-source-read.test.ts` and adapter/fingerprint tests                                                |
| `review:ai-preflight`, `review:interpret-delta`, `review:finalize-precomputed`                                   | `cli-interpretation`; preflight, delta and current-run precomputed command tests                                                                            |
| `review:interpret-with-aws`                                                                                      | `cli-aws-interpretation`; credential handoff and real synthetic child tests                                                                                 |
| `review:fireflies-normalize`, `review:fireflies-body-capture`, `review:fireflies-bounded`                        | `cli-source-capture`; command, bounded proof/storage and provider normalization tests                                                                       |
| `review:fireflies-plan`, `review:fireflies-cache`                                                                | `cli-fireflies-planning`; planning/cache command and locked proof tests                                                                                     |
| `review:fireflies-replay`, `review:fireflies-packets`                                                            | Dedicated CLI modules and tests; exact raw profile/packet bindings, numeric dates, bounded/cache proof and row-local coverage                               |
| `review:portal-plan`, `review:portal-materialize`                                                                | `cli-portal-planning`; request binding, selected-profile projection and row-local materialization tests                                                     |

The source's internal `review:live-build` is composed by `review:build`, not exposed as a second
operating procedure. The positional `build-google-payloads` helper remains available. The added
`review:workbook-runtime-smoke` is a manually invoked synthetic setup check, not a daily workflow gate.
Original `test` and `check:distribution` duties are included in installed `review:validate` and
the repository QA lane. The two standalone `salesforce:*operational-context` utilities and unused
legacy adapters are excluded: neither is part of the read-only Intake workflow.

### Delivery sequence

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
paths stay in private operator configuration, not the receipt. The [local setup guide](../packages/intake-sla-engine/docs/local-setup.md) documents host provisioning
and outside-checkout dependency-closure acceptance.

`artifact-workbook` now supplies the injected vendor operation adapter; Intake's
`populateIntakeWorkbook`, `exportIntakeWorkbook` and `verifyIntakeWorkbook` retain the original
seven-tab layout, values, operator sizing, sixteen preview ranges and formula-error scan policy.
The saved builder and validation command compose these workbook functions with the complete
report/evidence assembly.

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
or change the frozen cutoff. The normal CLI composes these saved interpretation operations. Newly
serialized grouping may differ only in object-key insertion order; all values and
canonical hashes are retained, and new byte receipts must describe the actual new bytes.

`runAwsInterpretation` and `review:interpret-with-aws` preserve the approved action selection,
private/mutable current-run check, ephemeral credential handoff, inherited child output, signal
forwarding and sanitized wrapper failures. The child invokes the selected route in the built local
CLI instead of a source-repository script; its working directory is that entrypoint's directory.
This removes the source-checkout dependency without changing provider identity or making a live
call during testing. A real synthetic Node child supplements injected-process tests; outside-checkout dependency closure is validated separately from this process test.

Source-adapter foundations now retain the approved `interpretedFindingSemantics` projection and
`structuredEvidenceEvent` defaults. Explicit interpreter semantics, including an intentionally
empty semantic result, bypass the legacy untyped-finding fallback. That fallback retains its
existing category priority and qualified treatment-plan milestone meaning; gate implications are
not separate completion evidence. Structured events preserve default metadata and explicit falsy
values. These functions remain Intake-owned and do not independently admit provider evidence;
their full adapter and report consumers compose these contracts.

`source-adapters.mjs#adaptBillingClaims` now composes the typed billing resolver with report
evidence. It preserves cutoff-before-aggregation, completed sessions without asserting whole-assessment
completion, remaining assessment/support sessions, future monitoring dates, past unverified work,
and Salesforce-owner reconciliation exceptions. The adapter does not infer completion from dates
or write Salesforce. Its synthetic regressions and source comparisons establish adapter parity;
final storyline/recommendation consumers have their own integration and parity checks.

Opportunity milestone and stage-history evidence projections retain
their existing source selection, field precedence, timestamps, actions and audit defaults. A
recorded 97151 start remains separate from assessment completion. These are Intake-specific projections of already collected records,
not provider transport or new completion policy. Source admission and final report composition
remain separate consumers; no additional collection or publication gate is introduced here.

Authorization Review and VOB projections preserve the original phase relevance and business
event dates, including exclusion of status-only modified timestamps from payer-update evidence.
Portal treatment-authorization request evidence keeps the original frozen submitted-date selection,
downstream-record suppression and correction/reconciliation routing. Provider submission is not
relabeled as payer submission. These report projections make no provider calls and do not repair
Salesforce; the authorization-record and final report consumers retain these same distinctions.

Dated-task projection and administrative-template filters retain the existing update-marker,
appointment-date, relative submission and frozen-cutoff handling. Bounded parsing preserves the
original greedy date selection without nested optional regex quantifiers; it does not extend the
date window or add recognized phrases. Note/task/authorization adapters compose these helpers with evidence identity and the existing
interpretation path.

Conversation text, sentence segmentation, mentioned dates, requested information and denial-reason
helpers preserve the approved interpretation's existing vocabulary, ordering, cleanup and date
precedence. HTML normalization remains distinct where the two original source paths differ.
Equivalent flattened regexes satisfy platform security lint without truncating source text or
introducing new policy. These are existing Intake semantics, not generic provider mechanics or a
replacement for current-run Codex judgment; operational fact extraction composes these same helpers.

Clinical Quality evidence composes the requested-information helper with existing status and
signature precedence. Requested edits take priority; signed plans still require the recorded review
outcome and payer submission. Pending review does not become premature signature outreach. Source
timestamps, owners, narratives and fact types retain the original projection; this does not change
the underlying Salesforce lifecycle.

Staffing, Talent Acquisition and first-interview evidence preserve existing direct/candidate-map
linkage, inactive-path priority, candidate availability versus client milestones, and future-interview
monitoring. Known planned interview dates are excluded from event freshness until they occur, as in
the approved source. These are Intake-specific interpretations of collected records; shared provider
packages do not acquire staffing policy. RBT requests now retain closed-event freshness, later
replacement selection, cancellation-versus-restored-coverage handling and candidate-count meaning.
Ticket Match composition preserves ordered match/candidate/interview events, distinct active
statuses, rejected-path precedence and future-interview monitoring. Its records reuse the candidate
selection contract, including explicit undefined source fields; no lifecycle decision changes.

Delay history consumes already admitted storyline findings and retains their source dates,
identity, lifecycle references, recurrence and unresolved opening context. It does not change
freshness, readiness or the current action. The receipt binds the complete cohort and narrative
to the original manifest contract. Its local HTML companion remains escaped, script-free and
self-contained, with complete cell text rather than truncated summaries. Synthetic source-output
comparisons and real mobile/tablet/desktop/wide browser checks cover this port; final recommendation composition and runtime acceptance have separate coverage.

The typed fact-packet assembly now composes those storyline findings, source coverage and
domain action rules. It preserves staffing assignment/candidate precedence, explicit planned
versus observed dates, required-document and payer-progress actions, conflict/review ordering,
identity caveats and generic provenance on approved facts. Source comparisons cover complete
packet objects and input nonmutation; tests compose the actual assembled-evidence, gate and
source-result producers. Recommendations remain supervised proposals, not Salesforce writes.
The typed short/long renderer retains the original rule priority, complete competing evidence,
source-date versus assessment-cutoff language, attribution and additive delay history. It does not
introduce a sentence ceiling or a new publication rule. Original recommendation regressions and
actual evidence-to-packet-to-render tests cover planned/observed milestones, partial assessment,
payer progress and conflict, raw-leakage checks and nonmutation. Whole-workflow report/QA composition and independent packaging have separate acceptance coverage.

Publication row quality and timeline formatting retain the approved finding order, readiness
relationships, specificity and raw-leakage checks, date-prefix semantics and future-versus-completed
distinction. Timeline compaction changes repeated metadata only; every admitted fact stays literal
and ordered, and a still-oversized cell remains a failure rather than being truncated. These are
existing Intake report contracts, not generic provider rules or new limits on agent investigation.
The full workbook audit and saved validation command compose these contracts.

The report action model retains its distinct Eastern-calendar date handling, owner and action
priority, explicit follow-up precedence and future-milestone monitoring. It is not substituted with
the engine's different UTC date helpers. Specificity auditing retains the approved Review/Error
distinction and focused search suggestions; these guide agent investigation, not mandatory new
provider calls or blanket publication bans. These Intake-owned projections consume collected
evidence and make no external calls or Salesforce writes.

The complete workbook quality audit now composes delay-history receipts, cell limits, narrative,
chronology, readiness and cross-row duplication checks. It retains the original finding order,
Critical-only severity failure, duplicate-cohort failure and No Action owner exception. Review
and Warning findings do not become new blanket publication bans. Raw spreadsheet identity values
retain their equality semantics. Synthetic whole-report comparisons cover this pure audit;
saved-artifact loading and full report/validation command composition have separate coverage.

Report source summaries and task display projections preserve the approved source-specific record
ordering, date precedence, display limits and distinct note formatting. Task Chatter keeps comment
dates and authors; outstanding-task columns retain direct Opportunity linkage, closed-task exclusions,
due-date ordering and the original five-item display with the complete count. These display summaries
do not establish completion or replace normalized evidence. They reuse typed source records and
remain Intake-owned; no provider mechanics or additional source requirements are added.

Row-level review explanations preserve the existing conflict, freshness, milestone and missing-detail
priority, along with Complete/Partial/Conflicting/Missing/Blocked status selection. Next-milestone
display retains active-candidate selection and its original ordered wording. The queue, on-hold,
evidence and history headers, header notes and data dictionary are copied exactly from the approved
builder and checked against source-derived digests. They remain report vocabulary, not new business
requirements; complete row and saved-run assembly compose these same fields.

Report comparison fields, interpretation/coverage audit labels, final row readiness and run-note
metadata retain their original values and precedence. Existing action items stay comparison-only;
the display text does not enable deterministic interpretation fallback or promote weak conversation
matches. The source's zero-precomputed-row and unavailable-interpretation distinctions remain intact.
These projections consume actual source-health, search and interpretation contracts without making
provider calls. Complete row, cohort and saved-run assembly compose these projections.

Final queue/evidence row projection and cohort table assembly preserve the approved field order,
reviewer-value handling, issue/timeline text, hold-field insertion, freshness/date/name ordering,
source count distinctions and current-versus-prior Run History rows. The report binds the original
frozen cutoff, delay-history digest and note receipts; pending rows do not become published by being
built. Missing hold duration remains blank, and raw historical ledger/reviewer values are not
coerced. Actual evidence, packet, renderer, freshness, authorization and source producers compose
through these typed Intake-owned projections. Saved-artifact orchestration and commands compose these projections; provider mechanics stay in
their shared packages.

The Production fingerprint reader composes `salesforce-read`'s organization-verified, schema-checked
data and Tooling queries. Intake retains explicit Production target configuration, the approved Apex
and Flow selection, source-body hashes, ordered SLA metadata and baseline comparison. Query order,
null handling and complete outputs match the original drift checker; no business metadata policy or
write capability moves into the provider. The private baseline is supplied by the caller.

Salesforce collection projections preserve practice/provider fallback, original cohort exclusions,
latest linked Authorization Review enrichment, phase-specific Master date fallback, inactive RBT
close dates and direct-versus-assigned staffing merge behavior. These transformations retain raw
metadata and input identity where the approved builder does. They do not establish completion,
replace evidence normalization or expand collection scope. Live and saved-source orchestration compose these same projections.

Saved reviewer and Run History loading preserve exact raw values, key precedence, original header
equality and the 99-row window before current-run filtering. Reviewer capture age at build time
remains relative to the frozen cutoff, not a new ban on later captures; the publication gate owns
live freshness. Saved-report validation composes the existing complete quality audit, sixteen workbook
previews and formula scan, note-input bindings, cohort count equality and recomputed denial-context
coverage. Marked blocked exceptions retain the approved partial-publication rule. Wrong-shaped saved
artifacts fail at the typed boundary without promoting them as valid evidence. The final validation
command must still run distribution safety and the complete synthetic self-tests; this artifact-level
function does not replace that prerequisite.

Report finalization composes the evaluated rows, source outcomes, note receipts, protected ledger,
interpretation audit and table/metadata projections into the original private artifacts. Normalized
evidence retains collection order while operator tables use report order. Assessment and note packets
retain the frozen cutoff; workbook generation time remains separate. No collection, interpretation
or publication occurs in this step. Workbook export consumes the exact persisted seven-table JSON:
empty cells are null, false/zero/whitespace stay literal, and supported vendor cells are not coerced
to strings. Synthetic checks against the provisioned vendor establish equivalent raw-undefined and
persisted-null empty cells. The shared workbook package still owns vendor mechanics, not Intake files.

Saved publication preparation composes report validation, the bound Google capture proof, staged
payload generation and the existing live-observation gate. It does not refresh or re-date captures,
change the frozen assessment, or write a Sheet. The original required artifacts, stale/future-check
rejection, post-cutoff disposition and Run History-last ordering remain intact. Full command-level
self-validation remains a separate prerequisite; the artifact preparation function does not replace it.

Correction initialization verifies the published base's staged and final assertions, exact ledger
hashes and Published cell coverage before deriving a new run. Structured deltas traverse both
snapshots' indirect relationships; unresolved ownership expands affected scope rather than dropping
a change. Post-cutoff disposition retains complete, explicitly observed modification evidence and
defers those changes without moving the assessment cutoff or asserting appointment completion.
These are existing recovery contracts; private commands compose these same recovery contracts.

Portal Authorization Request capture retains the approved API/CSV completeness, exact export
headers, Eastern-time ambiguity checks, raw capture hashes and client/provider matching. Its
product-specific mapping stays Intake-owned rather than introducing a speculative Portal SDK.
Saved correction, structured-delta, Portal-capture and post-cutoff commands now compose the existing
private storage locks and immutable-base protections. Build-input verification recomputes the bound
Portal/Slack derivations and inherited ledger; it does not force new collection or reinterpretation.
These local commands accept supplied evidence and emit sanitized failures without provider calls.

## Related guidance

- [Documentation hub](README.md)
- [Workflow authoring](workflow-authoring-guide.md)
- [Reusable data capabilities](reusable-data-capabilities.md)
- [Testing and release](../standards/testing-and-release.md)
- [Canonical operator skill](../skills/headstart-intake-sla-review/SKILL.md)
