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

| Owner                                                                                                 | Reuse / extend / create                           | Source behavior assigned here                                                                                      | Remains in Intake                                                                                            |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `capability-contracts`, `capability-runtime`                                                          | Reuse                                             | Profile, effect, target, binding and readiness contracts                                                           | Workflow-selected requirements and verified Production/Sheet targets                                         |
| `google-read-transport`                                                                               | Extend                                            | Sanitized HTTP status, retry-after and failure metadata; approved injected credentials                             | Read scheduling, attempt/wait budgets and concurrency policy; no transport retry loop                        |
| `google-sheets-data`                                                                                  | Extend                                            | Exact bounded grid/metadata/formula/format reads without table coercion                                            | Assertion planning, reviewer reconciliation, write plans, readback acceptance                                |
| `salesforce-read`                                                                                     | Create                                            | Explicit target and Organization verification, bounded CLI query/metadata reads, pagination and sanitized failures | Cohort SOQL/fields, Production fingerprints, milestone and reconciliation meaning                            |
| `fireflies-data`                                                                                      | Create                                            | Native discovery/body response contracts, provider identity/pagination/error normalization and cooldown signals    | Candidate relevance, roster matching, segmentation, cache eligibility, checkpoints and sufficiency           |
| `slack-data`                                                                                          | Create                                            | Native search/message/thread contracts, pagination/visibility and failure normalization                            | Cohort queries, denial context, client assignment and evidence admission                                     |
| Isolated Responses entry point in `openai-platform`, or a sibling if dependency isolation requires it | Extend or extract after inspecting its exports    | Credential-injected structured request execution and sanitized provider results                                    | AWS selection, exact model, prompts/schema, preflight policy, support checks, bindings, workers and fallback |
| `intake-sla-engine`                                                                                   | Create                                            | Domain, evidence semantics, recommendation, QA, recovery, workbook, publication and composition                    | All business policy remains here or in the canonical skill/runbooks                                          |
| Portal/Headstart MCP adapters in Intake                                                               | Port narrowly                                     | Existing product-specific read/capture mapping                                                                     | No speculative generic product SDK                                                                           |
| Existing Organic runtime packaging approach                                                           | Reuse; extract only actually shared build helpers | Dependency closure, revision/digest receipts and outside-checkout smoke pattern                                    | Intake recovery and installation compatibility                                                               |

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
| `slack-response.mjs` single-response normalization and `slack-plugin-search.mjs` transport unwrap; non-cutoff `slack-response.test.mjs` cases                                       | `slack-data`: `thread.test.ts`, `envelope.test.ts` preserve no-reply receipts, explicit count, structured pagination/identity and transport rejection                                       | Rendered search mapping still to extract; run hashes, cutoff reconciliation, cohort queries and admission remain Intake-owned              |
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

- `stage-entry.mjs`, `source-outcome.mjs`, `source-requirements.mjs` and the cohort policy from
  `slack-response.mjs` map to Intake's `stage-entry`, `source-outcome`, `source-requirements` and
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
  hashing or collection-time rule. Intake's capture consumer still must hash original responses,
  validate readback timing, reconcile all continuation signals and apply cutoff/cohort rules.

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

## Related guidance

- [Documentation hub](README.md)
- [Workflow authoring](workflow-authoring-guide.md)
- [Reusable data capabilities](reusable-data-capabilities.md)
- [Testing and release](../standards/testing-and-release.md)
- [Canonical operator skill](../skills/headstart-intake-sla-review/SKILL.md)
