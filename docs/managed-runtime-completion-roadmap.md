# Managed Runtime Completion Roadmap

## Purpose

This document defines the remaining work between the repository's tested managed-workflow
foundation and an operational Headstart-managed Codex platform. It is the canonical delivery
roadmap for that gap. Use the [workflow authoring guide](workflow-authoring-guide.md) to decide
whether an individual workflow needs managed execution and the
[managed workflow architecture](codex-managed-workflow-architecture.md) for the complete system
design.

No particular business workflow is a prerequisite. **Slice 1** establishes a shared preparation
contract and isolated local conformance path. **Gate A** evaluates Agents API with OpenAI-hosted
execution first; self-hosted API execution or SDK hosting follows only for a concrete unmet need.
**Gate B** selects the remaining operational integration. Begin provider screening alongside Slice 1
without building an AWS worker merely to evaluate a hosted API.

The progression is shared preparation -> execution and operations decisions -> immutable artifact
and selected adapter -> dev identity/integration -> durable operations -> operator surface ->
platform acceptance. These are proposed slices, not implemented capabilities. The
[compatibility assessment](agents-api-compatibility.md) records the code-level impact, official
capabilities and remaining live questions; each real workflow retains a separate adoption gate.

## Current Baseline

The repository already provides:

- runtime-neutral workflow manifest and run-request contracts;
- workflow-package loading, reference resolution, and JSON Schema validation;
- a Codex SDK executor with explicit environment, sandbox, network, timeout, and output schema;
- read-only runner validation bound to an exact workflow identity and repository commit;
- a disabled synthetic reference workflow with fixtures and evaluation definitions;
- portable skill installation and opt-in workstation refreshes;
- cross-platform QA, coverage, documentation, skill, and workflow validation; and
- documented contracts for business services, MCP, the managed worker, and a yet-to-be-selected
  operational control plane.

The current runner is a tested library. It does not yet construct an isolated workspace, install
pinned skills, select approved CLIs, generate MCP configuration, resolve a service profile, retrieve
scoped secrets, accept hosted dispatch, deploy an image, or report to a durable control plane.

## Platform Operational V1 Definition Of Done

The managed runtime foundation is operational when synthetic reference packages demonstrate the
following in Headstart's approved dev environment without an employee laptop. This proves platform
operation, not acceptance of a real business workflow:

1. A manual request or approved event creates a durable run with an idempotency key.
2. Trusted preparation validates the immutable workflow revision and request before dispatch.
3. A fresh environment contains only the approved workflow sources, skills and dependency bundle
   plus the declared provider runtime baseline; unrelated developer/workload files are inaccessible.
4. The selected adapter/environment or broker enforces declared tool, executable, filesystem,
   environment-variable and network policy; unsupported restrictions fail closed.
5. The reviewed execution profile binds logical capabilities to verified targets and scoped
   identities; the selected secret-delivery mechanism exposes only approved credentials.
6. The application, Codex execution, Headstart MCP and external providers have scoped identities
   with independent rotation; self-hosted executor and AWS roles apply only when selected.
7. The runner validates structured output and durably reports completion, failure, usage, and
   permitted audit events.
8. Operators can inspect status, cancel an active run, and retry an eligible failure without
   duplicating work.
9. Missing tools, identity, secrets, or configuration fail closed before model execution.
10. Logs and metrics follow the workflow's data classification and never expose credentials, PHI,
    raw tool payloads, or unrestricted model event streams.
11. Deployment records source, workflow, skill, artifact and schema versions, adapter/client version,
    effective configuration, model identifier, available provider revision metadata and applicable
    customer-controlled image digest. Missing provider-internal pins remain explicit limitations.
12. Synthetic end-to-end tests and separately approved dev smoke runs demonstrate the complete
    path, including interruption, recovery, denied access, and operator alerting.
13. Run transitions and schedules have one authoritative owner, whether provided by an adopted
    service or implemented in the Headstart backend.
14. Approved checkpoints and artifacts survive worker loss, and reuse is validated rather than
    silently trusting the prior worker's filesystem.
15. Execution health and validated workflow outcome are distinguishable; missing evidence or denied
    access cannot appear as a successful empty result.

Operational V1 does not require a visual workflow builder, custom admin screens, general-purpose
agent memory, a selected business workflow, or arbitrary external writes. The existing read-only
runner restriction remains until write controls are separately implemented; it is not a permanent
product restriction on workflows requiring approved writes or PHI access.

## Ownership By Repository And System

| Owner                  | Responsibilities                                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| This repository        | Complete workflow packages, shared preparation, execution adapters, artifact/configuration generation, profile/receipt contracts and tests; image/IaC/publishing only for selected self-hosted resources |
| Selected control plane | Schedules, trigger deduplication, durable run transitions, leases, dispatch, cancellation, retries, operational approvals, and operator controls; adopted service or custom implementation, not both     |
| Headstart backend      | Business state, authorization, event intake, and idempotent approved business-system writes; custom operational APIs and persistence only if Gate B selects them                                         |
| Headstart admin panel  | Application-specific interfaces; a custom operator surface only if Gate B identifies a requirement not met by the selected service                                                                       |
| Headstart MCP          | Bounded permission-gated Headstart operations; it does not own scheduling, run state, or workflow retries                                                                                                |
| Execution providers    | Managed Codex harness/environment or selected self-hosted compute; documented session, storage, networking and identity facilities, never business authorization                                         |
| External providers     | OAuth application registration, delegated or service-account authorization, scopes, refresh behavior, and provider-side revocation                                                                       |

No new general infrastructure repository is required. Workflow-owned packaging, execution adapters
and deployment configuration live here. A required worker image and its infrastructure also live
here, but OpenAI-hosted execution does not require ECR or an AWS agent worker. Custom backend/admin
changes remain in their owning repositories. Use existing shared scheduling, state and operator
facilities where sufficient; do not create duplicate stores or services merely to preserve an older
repository allocation.

## Authentication And Secret Contract

The selected profile binds logical capabilities to approved targets, scopes, credential delivery,
rotation owners and revocation procedures. Reuse `packages/capability-contracts/` and
`packages/capability-runtime/`; they validate bindings and evidence but do not issue credentials.
Workflow manifests contain logical references, never secret values or provider-specific token IDs.

- Agents API requires a Platform API project credential held by trusted application infrastructure,
  outside the sandbox. Workspace Codex tokens/federation are not established substitutes for it.
- A self-hosted API executor receives a separate restricted connection key; an SDK worker uses its
  independently approved Codex authentication method from the
  [architecture](codex-managed-workflow-architecture.md#authentication-and-capability-binding).
- Service-origin HTTP MCP may use API credential vaults. Environment-origin MCP/CLI access needs
  its own approved binding. Provider registration, consent, target verification and revocation
  remain explicit regardless of the delivery mechanism.
- AWS roles and Secrets Manager apply where selected infrastructure needs them; an OpenAI-hosted
  sandbox does not inherit an AWS task role or the creator's credentials.
- Keep dev/production identities separate. Secret values never enter source, prompts, command
  arguments or logs. Environment-injected values remain readable by agent code; prefer scoped
  provider tools or a trusted broker when credentials must stay outside it.

Synthetic profiles and fake providers exercise these contracts without live credentials. Required
identity/target/access preflight must complete before model work; tool initialization alone does
not verify business authorization. See the
[API identity and permission findings](agents-api-compatibility.md#tools-identity-and-permissions).

## Final Runtime Contract

```text
manual request, backend event, or schedule
  -> selected control plane validates request and durably records run/attempt launch intent
  -> trusted preparation verifies source, schemas, bundle, policy and capability preflight
  -> selected adapter prepares hosted configuration or an isolated local/self-hosted workspace
  -> adapter launches Codex and durably correlates provider session/turn/environment or thread
  -> Codex uses approved skills, tools and optional deterministic helpers
  -> adapter observes or reconciles completion without replaying uncertain work
  -> trusted handler independently validates final output and workflow outcome
  -> control plane acknowledges result, approved artifacts/checkpoints and sanitized telemetry
  -> selected adapter cleans up execution resources under the retention policy
  -> operator receives success or actionable failure state
```

Business-run state remains independent of agent conversation state. Provider recovery resumes the
known attempt when safe; it does not create a second schedule/retry authority. External actions
remain outside agent control: a future approved-write workflow produces a typed proposal, and its
owning service revalidates authority/current state before idempotent execution.

## Binding Invariants

- Managed runs never reuse a developer's global Codex home, installed skills, credential cache, or
  working tree.
- Reviewed source, skill, schema and workflow artifacts are pinned and recorded. Record effective
  configuration and the exact model identifier; unavailable hosted image/harness pins are explicit
  compatibility risks, not invented provenance or deterministic-output promises.
- Manifest declarations narrow runtime access but cannot grant authority beyond IAM, MCP, backend,
  or provider permissions.
- Trusted validation stays outside agent-editable scratch. The selected adapter receives explicit
  prepared inputs and an environment allowlist; unrestricted `process.env` is prohibited.
- Required MCP or CLI initialization failure prevents the run from starting.
- Network access is disabled or enforced by infrastructure allowlists outside prompt control.
- Read-only remains the only permitted side-effect mode until durable approval and deterministic
  action execution exist.
- Retries cannot duplicate a business action.
- Exactly one control plane owns schedules, run transitions, and operational retry policy; provider
  job ids and Codex thread ids correlate to its stable run id.
- Checkpoints, artifacts, and action receipts survive compute replacement. Workflow-owned freshness
  and compatibility policy controls reuse, not file existence alone.
- Raw credentials, PHI, and unrestricted Codex or tool events do not enter logs.
- API sessions, compute filesystems and runtime memory are not authoritative business-run state or
  cross-run source caches. Persist required artifacts before session deletion.
- Data policy is checked for the actual API endpoint and account, including retained provider
  state. Self-hosting or disabling raw event logs does not establish ZDR/BAA eligibility.
- Local skill installation remains independent: `skills:update` continues to distribute only
  `skills/` and never becomes a managed deployment mechanism.

## Implementation Plan

Build one shared preparation/validation contract, retain the local SDK conformance path and add only
the execution adapter selected by Gate A. The preferred candidate combines a managed Codex harness
and OpenAI-hosted environment. Gate B supplies the remaining durable operations through a thin
integration, an adopted service or justified custom code. Complete workflow source stays in Agent
Platform regardless of where preparation, tools and agent code execute. The
[impact inventory](agents-api-compatibility.md#code-level-impact-and-reuse-decisions) names reuse and
extension boundaries; it does not authorize a speculative framework or duplicate provider packages.

## Slice-To-Behavior Mapping

- Shared prepared-execution/profile/receipt contracts and local materialization -> Slice 1
- Bounded disposable API/environment compatibility probe and candidate decision -> Gate A
- Remaining operations and authoritative state/interface ownership decision -> Gate B
- Production execution adapter and immutable artifact/configuration build -> Slice 2
- Selected dev infrastructure, identity, secret delivery and provider transport integration -> Slice 3
- Durable launch/reconciliation, triggers, cancellation, retry and retention operations -> Slice 4
- Minimum operator interface -> Slice 5
- Integrated platform acceptance and measured recovery/outcome evidence -> Slice 6
- Real workflow acceptance and activation -> Per-workflow adoption gate
- Approved external writes -> Deferred beyond Operational V1

Prototype evidence from Gate A informs Slice 2 but is not a second production adapter. Slice 3 uses
injected operational sinks until Slice 4 supplies the durable owner; it does not implement a hidden
second control plane.

## Commit Slices

### Slice 1 - Isolated Materialization And Local Launch

Objective:

- Make one workflow package executable from an explicit checkout using only declared, synthetic
  inputs and injected credential-free test configuration.

Includes:

- Define a provider-neutral prepared-execution and provenance receipt boundary, reusing workflow
  and capability contracts. Add `packages/workflow-materializer/` only for preparation mechanics
  not already owned by those packages or the existing standalone packaging utilities.
- Separate shared source/dependency/policy resolution from local filesystem realization. The hosted
  path must not require a developer Codex home or local working directory.
- Resolve an exact workflow repository commit and package identity.
- Create a fresh temporary workspace and isolated Codex home.
- Materialize pinned skills and declared repository revisions.
- Validate the profile's supported policy, CLI inventory and typed MCP configuration. Inventory is
  not command enforcement; local isolation must reject undeclared access.
- Construct the environment from an explicit allowlist supplied by the caller.
- Invoke the existing runner and remove temporary state after durable result acknowledgement.
- Add a local synthetic launch command and failure tests for missing skills, tools, repositories,
  configuration, and cleanup.

Explicitly excludes:

- Agents API dispatch, production remote adapters, AWS calls, live credentials/providers, queues,
  deployment, backend state, admin UI and external writes.

Files / subsystems:

- `packages/workflow-materializer/`
- `apps/codex-runner/`
- `workflows/synthetic-read-only-reference/`
- root Turborepo, TypeScript, lint, test, and documentation configuration

Startup / shutdown impact in this slice:

- Only local synthetic workspaces/executors start; clean them up on success, failure, timeout or cancellation. No managed schedule starts.

Verification:

- Full `pnpm qa`.
- Synthetic local end-to-end execution from manifest input through validated output.
- Tests proving no global Codex home, developer environment, or undeclared executable is inherited.
- Tests proving cleanup occurs after success, validation failure, timeout, and cancellation.
- Use an injected acknowledgement/artifact sink for local tests; durable production persistence is
  Slice 4, not an implicit prerequisite or implementation hidden in Slice 1.

Review note:

- Judge this slice on hermetic materialization and fail-closed behavior. It is not an AWS deployment
  or live integration slice.

### Gate A - Codex Execution And Environment Compatibility

Objective:

- Determine whether Agents API with OpenAI-hosted execution preserves the required local workflow
  behavior and enforceable policies, before investing in self-hosted worker infrastructure.

Includes:

- Use a bounded prototype with synthetic prompt/skill-only and deterministic-helper fixtures from
  the Slice 1 contract. No business workflow or complete AWS materializer is a prerequisite.
- Verify JSON Schema results, exact skill/dependency preparation, model configuration and trusted
  input/output validation against the existing SDK path.
- Probe required MCP startup, provider preflight, explicit credentials, exact egress destinations,
  immutable code/input policy, writable scratch and executable restrictions. Fail unsupported
  policies explicitly; do not enable unrestricted networking to accommodate stdio MCP.
- Probe remote root-turn completion, missing text deltas, pagination, disconnect recovery, duplicate
  events, unknown launch outcome, explicit cancellation and artifact retrieval/deletion.
- Establish acceptance thresholds and an accountable technical owner before the probe, then measure
  setup/execution latency, costs, concurrency/quotas, lifetime and recovery limits. Verify account
  entitlement, endpoint retention/regional policy and required contractual eligibility.
- Evaluate a self-hosted API executor only if the API is acceptable and hosted compute fails a
  material requirement. Evaluate SDK hosting, including AgentCore Runtime/ECS, when API behavior
  or data policy fails. Each fallback uses the same acceptance contract.

Explicitly excludes:

- Production adapter/deployment code, permanent vendor resources, operational run database, live
  business workflows, PHI, real writes and silent runtime fallback.
- Enabling checked-in active workflows. Synthetic execution uses temporary test-owned fixtures;
  the repository activation gate is relaxed only in a separately reviewed implementation after
  required platform controls and acceptance evidence exist.

Files / subsystems:

- Synthetic reference inputs, existing runner conformance tests, shared preparation contracts and
  bounded prototype fixtures where needed; architecture and compatibility evidence.

Pass criteria and decision:

- The same reviewed behavior and policies pass with no local/cloud prompt fork or weakened access.
- Provider IDs can correlate to one durable run/attempt without making sessions authoritative.
- Required source, permission, recovery, cost and data-policy criteria pass with measured evidence.
- Classify each criterion as passed, failed or unverified. Document the smallest qualifying path
  and the unmet need for any fallback; finalize operations with Gate B before deployment.
- No automatic switch or second launch follows an ambiguous remote response. Retaining Codex
  behavior is mandatory; retaining the SDK subprocess is not.

Startup / shutdown impact in this gate:

- Only explicitly approved synthetic sessions/resources start. Record and clean them up within
  the probe budget; no persistent scheduler or live workflow is enabled.

Verification:

- Full repository QA for committed changes; protocol fixtures remain credential-free.
- Separately approved synthetic API/cloud probes with named account, bounded spend/time and cleanup.
- An evidence record for every question in the
  [compatibility matrix](agents-api-compatibility.md#acceptance-questions-that-still-require-execution),
  including anything that could not be tested. Public examples alone cannot pass the gate.

Review note:

- Judge behavioral/policy compatibility and candidate selection. This gate does not deploy a
  production adapter or establish real-workflow readiness.

### Gate B - Operations Build-Versus-Buy

Objective:

- Select one operational control plane and the smallest operator surface without changing Codex
  execution or prematurely building application-specific infrastructure.

Includes:

- Evaluate Windmill as a concrete candidate against the architecture's
  [operations criteria](codex-managed-workflow-architecture.md#operations-build-versus-buy-gate).
- Use the same prepared-execution contract and synthetic fixtures to check immutable Git-based launch,
  run correlation, authorized status/cancel/retry, schedule deduplication, and recoverable delivery.
- Assess authenticated approval controls with synthetic decisions; do not enable real write modes.
- Determine whether the service invokes Agents API, a separate SDK worker or a required self-hosted
  executor. Also assess a thin integration with existing scheduling/state/operator facilities.
  Account for API-managed sessions before adding operations machinery; do not assume native support.
- Verify isolation configuration, private artifact handling, audit export, retention, identity
  boundaries, edition/license requirements, hosting effort, support, and exit cost.
- Record one state authority and one schedule/retry owner. Preserve business-system permissions and
  write authority in the owning service; operational approval cannot bypass that authority.

Explicitly excludes:

- Business-workflow selection, production deployment, external writes, a general visual builder,
  a new agent loop, and maintaining both adopted and custom control planes.

Files / subsystems:

- Architecture and this roadmap for the selection and implementation boundaries
- Bounded integration fixtures and adapter tests in this repository where code is needed
- Separately approved dev evaluation resources, with no credentials committed

Startup / shutdown impact in this slice:

- Only approved synthetic evaluation resources start; no production schedule or business write is enabled.

Verification and decision:

- Run repository QA for any code and separately authorize vendor/cloud checks.
- Compare a thin integration using existing services, the smallest adopted-service integration and
  the minimum custom backend/admin option against the remaining operating needs.
- Select adoption when it meets material requirements at acceptable operating cost; otherwise name
  the concrete gaps that justify custom code. Document prerequisites and evidence in the canonical
  architecture and roadmap before Slices 3-5.
- A product feature list or successful job exit is not a pass. Demonstrate state recovery,
  authorization, cancellation, and useful failure visibility using synthetic fixtures.

Review note:

- Judge the operating contract and ownership decision, not a replacement for Codex or a requirement
  to express prompt-and-skill workflows as graph nodes.

### Slice 2 - Selected Execution Adapter And Immutable Artifact

Objective:

- Implement the chosen execution path around the shared workflow contract and reproducible source
  artifact, without adding live infrastructure or changing workflow behavior.

Includes:

- Adapt `apps/codex-runner/` to consume prepared execution rather than assuming every target has a
  local working directory. Keep existing SDK support and independent validation.
- For the API path, implement typed launch/observe/retrieve/cancel protocol operations, normalized
  events/results and correlation receipts using an injected API client and result sink. Durable
  operational reconciliation belongs to Slice 4, not this adapter's process memory.
- Build source/dependency artifacts with integrity receipts and generate pinned skill/plugin and
  agent/environment configuration. Reuse existing compatible packaging rather than duplicating it.
- For a selected self-hosted path only, build the required pinned, scanned Linux image and its
  immutable publishing configuration. Customer-controlled code remains protected from agent writes.
- Preserve declared policy through explicit capability checks; unsupported mappings are errors.
- Version normalized usage, events and receipts instead of casting API values into SDK types.

Explicitly excludes:

- Live API sessions, deployment, cloud identities, provider secrets, queues, durable operational
  persistence, operator UI and real writes. No image/ECR work for OpenAI-hosted execution alone.

Files / subsystems:

- `apps/codex-runner/`, shared preparation/contracts and tests
- Artifact/configuration build tooling and `.github/workflows/` where required
- `infra/docker/` and image publishing only for a selected self-hosted path

Startup / shutdown impact in this slice:

- Test clients and synthetic executables only; exercise cancellation/cleanup protocol without
  starting real vendor resources. Production adapter functions are not a deployed service.

Verification:

- Full repository QA and existing SDK subprocess conformance.
- API protocol fixtures for root/subagent events, absent deltas, invalid output, provider failure,
  explicit cancellation and paginated retrieval. The API's schema support must preserve our schemas.
- Artifact receipt/integrity and no-developer-path tests; image isolation/scan only where applicable.
- Verify that trusted validation uses the reviewed source, not an agent-modified workspace copy.

Review note:

- Judge adapter semantics, artifact reproducibility and policy preservation, not live operation or
  durable recovery implemented later.

### Slice 3 - Selected Dev Execution And Identity Integration

Objective:

- Connect the selected adapter to approved dev execution and provider identities with bounded
  resources, secret delivery, artifact transport and sanitized observability.

Includes:

- Implement the pairing selected by Gates A/B. OpenAI-hosted execution needs API configuration and
  trusted application integration; it does not require deploying a Headstart agent worker.
- Provision only required resources through reviewed configuration/IaC. Self-hosted compute, ECR,
  SQS, CloudWatch or another provider's equivalents are conditional on the chosen path.
- Bind typed execution profiles to approved API project, MCP/CLI identities, targets, scopes and
  credential delivery. Keep the application key outside agent code; use restricted executor keys
  and protected delivery where self-hosted execution is selected.
- Integrate scoped HTTP MCP, supported environment tools or a broker, preserving verified source
  semantics. Do not copy workstation auth caches or grant broader permissions for convenience.
- Connect lifecycle/results, artifacts and sanitized telemetry to injected operational interfaces.
  Add alerts for provisioning, identity, access, timeout, delivery and cleanup failure.
- Verify environment readiness before model input and stop on failed preparation/preflight.

Explicitly excludes:

- Production activation, live PHI, real writes, business logic changes, durable operational state
  implementation from Slice 4 and custom admin UI.

Files / subsystems:

- Selected runtime/profile integrations, required `infra/` and deployment workflows
- Secure external account, credential and provider setup; approved artifact storage configuration
- Existing provider packages only when a verified managed binding requires extension

Startup / shutdown impact in this slice:

- Approved dev resources only. Use bounded smoke-run lifetime and cleanup; no unattended business
  cadence starts. Permanent operational retry and cancellation ownership arrives in Slice 4.

Verification:

- Canonical QA, configuration/IaC validation and least-privilege review.
- Approved synthetic dev runs with exact provenance, denied-access cases, timeout/cancel,
  credential redaction, artifact export and cleanup. Scope live provider reads separately.
- Confirm the real runtime/dependencies and identity targets match the prepared contract.

Review note:

- Judge selected-service access/isolation and transport integration. A dev run does not complete
  the durable control plane or a business workflow's adoption gate.

### Slice 4 - Durable Operational Control Plane

Objective:

- Make workflow runs durable, authorized, idempotent, cancellable, and observable outside transient
  worker processes.

Includes:

- Implement the Gate B decision: configure and integrate the adopted service, or add the minimum
  backend control plane. Use its authoritative workflow, run, attempt, lease, result, and audit
  persistence; do not create a competing operational database.
- Expose authenticated launch, status, cancellation, and eligible retry through the selected
  service or required adapter APIs.
- Validate trigger payloads and dispatch immutable run requests through the selected runtime
  adapter.
- Enforce idempotency and reject stale or duplicate triggers.
- Durably record launch intent and provider session/turn/environment or SDK thread correlation.
  Verify/deduplicate webhook delivery, paginate saved state, reconcile lost streams and unknown
  launch outcomes, and fence stale attempt updates before retry or cancellation completes.
- Receive lifecycle/results through authenticated boundaries; do not infer success from provider
  idleness, subagent completion or closed HTTP connections.
- Record exact workflow, skill, schema, model and artifact/configuration provenance, plus image
  versions where applicable. Implement resource retention/export/deletion with bounded retries.
- Persist compatible checkpoints, artifact references, and result acknowledgements. Reject stale
  updates from superseded attempts and reconcile uncertain effects before replay.
- Keep validated outcome and evidence completeness distinct from worker/process health.

Explicitly excludes:

- Approved external writes unless separately designed, arbitrary workflow editing, and UI
  implementation.

Files / subsystems:

- Adopted-service configuration and integration in this repository, or Headstart backend modules,
  entities, migrations, services, DTOs, and tests when Gate B selects custom implementation
- Coordinating runtime-adapter and worker service-profile definitions in this repository

Startup / shutdown impact in this slice:

- The selected dev controller or adopted-service integration starts. Restart recovery reconciles existing attempts before dispatching new work; shutdown preserves durable intent and pending results.

Verification:

- State-transition, lease, idempotency, cancellation, retry, and stale-event contract tests for the
  selected implementation. Custom persistence uses backend unit and real-Postgres integration tests;
  adopted services need equivalent integration evidence, not an assumed guarantee.
- Synthetic worker-to-control-plane contract tests.
- Dev end-to-end run with durable state surviving worker restart.

Review note:

- Judge this slice on durable state authority and transition correctness. The worker remains an
  executor rather than the source of run truth.

### Slice 5 - Minimum Operator Surface

Objective:

- Give authorized operators the smallest interface needed to launch and safely operate managed
  runs without requiring a particular business workflow.

Includes:

- Prefer the selected service's interface. Add workflow discovery and manual launch using custom
  admin screens only for requirements not met by that interface.
- Show run status, version, timestamps, bounded failure details, and approved result summaries.
- Add cancellation and eligible retry controls.
- Add review or approval UI only when an enabled capability requires a human decision; product
  approval features alone do not enable the runner's unsupported write modes.

Explicitly excludes:

- A visual workflow builder, prompt editor, arbitrary credential administration, raw model event
  streams, and generalized analytics.

Files / subsystems:

- Adopted-service role/interface configuration, or the Headstart admin-panel repository when needed
- Selected control-plane APIs and contracts from Slice 4

Startup / shutdown impact in this slice:

- Enable only the selected operator interface and authorized dev actions; it inherits lifecycle controls from Slice 4 and does not create another scheduler.

Verification:

- Component, API-contract, authorization, and browser workflow tests.
- Desktop and mobile visual verification for the supported operator flow.
- Failure-state testing without exposing secrets, PHI, or raw tool payloads.

Review note:

- Judge this slice on usable launch, supervision, and recovery, not a general workflow-builder
  product or an obligatory custom UI.

### Slice 6 - Platform Acceptance

Objective:

- Prove the reusable platform's execution and operating contract with synthetic packages in the
  approved dev environment, independently of a business-workflow handoff.

Includes:

- Exercise prompt/skill-only execution and a fixture with a small deterministic adapter through
  the same contract. Neither requires a real business workflow or workflow-specific policy.
- Verify pinned versions, isolated identity/tool access, structured results and durable receipts.
- Run two synthetic workflow identities with distinct profiles concurrently. Verify no cross-run
  skill/credential/artifact leakage, correct cancel/retry correlation and bounded shared quotas.
  New workflow admission must not require business-name branches in the shared executor.
- Inject expired authentication, authenticated 403, rate limits, incomplete evidence, timeout,
  worker loss, duplicate triggers, delayed updates, and unavailable result delivery.
- Prove compatible checkpoint/artifact reuse after interruption and rejection of stale or
  incompatible artifacts. Source-specific refresh policy remains workflow-owned.
- Test an ambiguous external-action receipt with a fake provider to establish reconciliation
  expectations without enabling write modes or claiming a production action executor exists.
- Verify status, cancellation, eligible retry, operator alerts, and operational state export.
- Record latency, model versus I/O time, reuse, cost, retention, pause/rollback, and support ownership.

Explicitly excludes:

- Business-workflow onboarding, production activation, approved external writes, live PHI, and
  optional platform features not required by the shared operating contract.

Files / subsystems:

- Synthetic reference packages, evaluation fixtures, and runtime integration tests
- Dev profiles, deployment configuration, and selected operational service integration
- Coordinating backend/admin configuration only when required by the selected implementation

Startup / shutdown impact in this slice:

- Exercise approved dev start, interruption, restart and cleanup paths across workflows; production business activation remains separate.

Verification:

- Repository QA and repeated synthetic evaluations.
- Separately approved dev smoke, failure injection, credential revocation, pause, retry, and rollback.
- A reviewed platform acceptance record with exact versions, measured outcomes, and remaining limits.

Review note:

- Judge the reusable platform contract, not a business result. A passing synthetic suite does not
  certify a real workflow's correctness, PHI handling, or external write capability.

## Per-Workflow Adoption Gate

Once the shared foundation is proven, each real workflow independently requires:

1. named business, technical, and backup owners with actionable contacts;
2. pinned source, skill, schema, tool, adapter and artifact/configuration provenance, exact model
   identifier and applicable image revisions, with unavailable provider pins explicitly assessed;
3. verified provider identities, target visibility, cadence, and exactly-one-schedule ownership;
4. approved data classification, endpoint/account retention and contractual eligibility, side effects
   and human-decision boundaries; self-hosting does not remove Agents API retention constraints;
5. repeated evaluations and an authorized shadow or historical run against its intended outcome;
6. measured quality, latency, cost, failure, and recovery acceptance criteria; and
7. pause, rollback, credential revocation, support handoff, and required deployment approvals.

Select a business workflow at this gate, not as a prerequisite for documenting or implementing the
shared platform. Workflow-specific deterministic code remains optional. If a workflow needs writes,
implement and verify durable approval and deterministic execution before enabling that mode. PHI or
write requirements are supported design needs to provision deliberately, not reasons to redefine
the workflow as permanently read-only.

## Secure Operational Setup

The following work requires authorized human or administrator action even when the surrounding
resources are codified:

- approve and issue the managed Codex credential;
- define and provision the Headstart MCP service identity and permissions;
- register external OAuth applications and approve requested scopes;
- enter initial secret values and verify rotation or revocation procedures;
- approve dev data handling, retention, and observability policy;
- approve Gates A and B, including the selected edition, hosting, identity, and state owner before
  service deployment; and
- approve each real workflow's owners and policies at the per-workflow adoption gate.

These actions must have documented outcomes, but credentials and sensitive provider responses must
not be copied into repository documentation or workflow fixtures.

## Required Decisions Before Implementation

Slice 1 can begin without selecting a business workflow or deployment target. Before Slice 3, the
team must decide:

1. the execution/environment and operational-service pairing based on Gates A and B;
2. approved managed Codex authentication method;
3. Headstart MCP service-identity and permission model;
4. first external integration, if any, and its organization-owned authentication method;
5. service-profile ownership and review requirements;
6. the authoritative control-plane state, artifact, recovery, and integration boundary; and
7. platform operating thresholds and a technical owner for implementation and support.

Business-workflow selection and acceptance belong to the per-workflow adoption gate. Do not block
the shared foundation on an unrelated workflow's readiness, or treat a synthetic platform pass as
permission to activate it.

## Verification Across The Roadmap

- Every repository change runs that repository's canonical QA command and required hooks.
- Ordinary tests and pull-request CI remain synthetic, credential-free, and network-independent.
- Live Agents API, AWS, Codex, MCP and provider checks run only in explicit integration or smoke lanes with
  approved identities and data handling.
- Infrastructure changes include template validation, least-privilege review, deployment smoke,
  rollback evidence, and cost-impact notes.
- Cross-repository contracts are versioned and tested on both sides before deployment.
- Production activation always uses immutable artifacts already proven in dev.
- Recheck provider documentation and edition-specific capabilities at both decision gates. The
  architecture's [official references](codex-managed-workflow-architecture.md#official-references)
  explain the researched candidates, not configured services or proven integrations.

## Deferred Beyond Operational V1

- `propose-only` and `approved-write` execution modes;
- deterministic action executor and durable human approval records;
- visual workflow authoring;
- arbitrary user-created schedules or tool permissions;
- generalized long-term agent memory;
- automatic adoption of unreviewed skills, workflows, models, MCPs, or CLI versions;
- migration to another orchestration framework without measured need; and
- ChatGPT Workspace Agents as a substitute for Codex-managed execution without separate behavioral
  acceptance evidence.
