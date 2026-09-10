# Managed Runtime Completion Roadmap

## Purpose

This document defines the remaining work between the repository's tested managed-workflow
foundation and an operational Headstart-managed Codex platform. It is the canonical delivery
roadmap for that gap. Use the [workflow authoring guide](workflow-authoring-guide.md) to decide
whether an individual workflow needs managed execution and the
[managed workflow architecture](codex-managed-workflow-architecture.md) for the complete system
design.

No particular business workflow is a prerequisite. **Slice 1: isolated materialization and local
launch** establishes a reusable test boundary with synthetic packages. **Gate A** selects compatible
hosting, and **Gate B** decides whether to adopt an operations service or build the minimum custom
control plane. Begin requirements and provider screening alongside Slice 1; execute the gates
against its boundary before committing to deployment, custom backend persistence, or admin screens.

The ordered progression is materialization -> hosting and operations decisions -> immutable worker
and dev identity -> durable operations -> operator surface -> platform acceptance. Business-workflow
adoption follows its own gate. These are proposed implementation slices, not claims that any hosting
or control-plane service is already installed or selected.

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
2. The worker receives an immutable workflow revision and validates the request before execution.
3. A fresh workspace contains only declared repositories, revisions, and skills.
4. The worker exposes only declared MCP servers, CLI commands, environment variables, and network
   destinations.
5. The reviewed execution profile binds logical capabilities to verified targets and scoped
   identities; AWS identity retrieves only its declared secrets when secret delivery is required.
6. Codex, Headstart MCP, AWS, and external providers use separate scoped identities with independent
   rotation.
7. The runner validates structured output and durably reports completion, failure, usage, and
   permitted audit events.
8. Operators can inspect status, cancel an active run, and retry an eligible failure without
   duplicating work.
9. Missing tools, identity, secrets, or configuration fail closed before model execution.
10. Logs and metrics follow the workflow's data classification and never expose credentials, PHI,
    raw tool payloads, or unrestricted model event streams.
11. Deployment records the exact repository commit, workflow version, skill revision, runner image
    digest, schema fingerprints, and model identifier.
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

| Owner                  | Responsibilities                                                                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| This repository        | Workflow packages, contracts, materialization, runner executable, Docker image, runtime adapters, deployment infrastructure, service-profile schema, ECR publishing, and smoke tests                 |
| Selected control plane | Schedules, trigger deduplication, durable run transitions, leases, dispatch, cancellation, retries, operational approvals, and operator controls; adopted service or custom implementation, not both |
| Headstart backend      | Business state, authorization, event intake, and idempotent approved business-system writes; custom operational APIs and persistence only if Gate B selects them                                     |
| Headstart admin panel  | Application-specific interfaces; a custom operator surface only if Gate B identifies a requirement not met by the selected service                                                                   |
| Headstart MCP          | Bounded permission-gated Headstart operations; it does not own scheduling, run state, or workflow retries                                                                                            |
| AWS                    | Workload identity, ECR, selected compute target, optional queue and dead-letter queue, Secrets Manager, KMS, CloudWatch, and network controls                                                        |
| External providers     | OAuth application registration, delegated or service-account authorization, scopes, refresh behavior, and provider-side revocation                                                                   |

No new general infrastructure repository is required for the first implementation. The deployable
worker's Dockerfile, GitHub deployment workflow, and AWS infrastructure-as-code should live here,
following the existing Headstart pattern of keeping a service's deployment definition with the
service. Adopted-service configuration and runtime integration live here where appropriate; custom
backend and admin changes remain in their owning repositories. Do not create duplicate run-state
stores or schedulers merely to preserve the old repository allocation.

## Authentication And Secret Contract

AWS Secrets Manager is the store for declared long-lived secrets, not a universal identity or a
requirement to turn every identity into an API key. The deployment must
preserve these separate boundaries:

- The AgentCore runtime role, ECS task role, or temporary pilot VM role authenticates the worker to
  AWS without static AWS keys.
- Codex receives an approved non-interactive organization identity through deployment policy; use
  workload identity federation when enabled and verified, or an approved token/API credential as
  described in the architecture's
  [authentication contract](codex-managed-workflow-architecture.md#authentication-and-capability-binding).
- Headstart MCP receives a dedicated service identity with only the workflow's approved
  permissions.
- Each external CLI or API receives an organization-owned credential scoped to its required
  operations.
- Dev and production credentials, service profiles, compute roles, and secret access remain
  separate.

Workflow manifests contain logical secret identifiers only. A reviewed deployment service profile
maps those identifiers to exact Secrets Manager resources and delivery methods. IAM grants the
worker access only to those resources. Secret values are never committed, placed in prompts, passed
as command arguments, emitted in logs, or inherited from an unrestricted host environment.

The infrastructure-as-code owns secret resources, mappings, and access policy where practical.
Secure operational setup supplies the actual values and performs external OAuth registration.
Federated identity setup also owns upstream token renewal and protected delivery; it is not solved
by copying a secret. Each profile must identify the provider's actual target, scopes, owner, and
revocation path. Verify those rather than relying on a workstation alias or an available desktop
plugin. Synthetic profiles exercise the same validation contract without live credentials.

## Final Runtime Contract

```text
manual request, backend event, or schedule
  -> selected control plane validates request and persists run
  -> selected runtime adapter dispatches immutable run request and idempotency key
  -> worker in the approved host acquires the execution
  -> materializer resolves exact workflow commit and package
  -> materializer creates isolated workspace and Codex home
  -> materializer installs pinned skills and declared repositories
  -> deployment adapter selects approved MCPs and pinned CLIs
  -> service profile resolves allowlisted environment and scoped secrets
  -> runner validates request and executes Codex
  -> runner validates structured output
  -> control plane persists result, usage, and permitted audit events
  -> worker destroys temporary workspace and credentials
  -> operator receives success or actionable failure state
```

Consequential external writes remain outside the Codex thread. A future write-capable workflow
produces a typed proposal; its owning backend or service revalidates current authorization and
business state before an idempotent executor performs an approved action.

## Binding Invariants

- Managed runs never reuse a developer's global Codex home, installed skills, credential cache, or
  working tree.
- Every source, image, schema, model, and workflow version is immutable and recorded.
- Manifest declarations narrow runtime access but cannot grant authority beyond IAM, MCP, backend,
  or provider permissions.
- The worker receives an explicit environment mapping; unrestricted `process.env` is prohibited.
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
- AgentCore session state, container filesystems, and optional runtime memory are never authoritative
  run or business state.
- Local skill installation remains independent: `skills:update` continues to distribute only
  `skills/` and never becomes a managed deployment mechanism.

## Slice-To-Behavior Mapping

- Workspace, skill, repository, MCP, CLI, and environment preparation -> Slice 1
- AgentCore Runtime compatibility and hosting decision -> Gate A
- Operations build-versus-buy and authoritative state/interface ownership -> Gate B
- Container image and immutable build artifact -> Slice 2
- AWS compute, runtime dispatch, optional queue, workload identity, secret delivery, logging, and
  deployment -> Slice 3
- Durable run state, trigger intake, leases, cancellation, and retries -> Slice 4
- Operator launch, status, review, cancellation, and retry experience -> Slice 5
- Shared platform acceptance and recovery/observability evidence -> Slice 6
- Real workflow acceptance and activation -> Per-workflow adoption gate
- Approved external writes -> Deferred beyond Operational V1

## Commit Slices

### Slice 1 - Isolated Materialization And Local Launch

Objective:

- Make one workflow package executable from an explicit checkout using only declared, synthetic
  inputs and injected credential-free test configuration.

Includes:

- Add a materialization boundary, initially under `packages/workflow-materializer/`, shared by local
  evaluation and hosted execution.
- Resolve an exact workflow repository commit and package identity.
- Create a fresh temporary workspace and isolated Codex home.
- Materialize pinned skills and declared repository revisions.
- Validate approved CLI inventory and generate MCP configuration from a typed, secret-free input.
- Construct the environment from an explicit allowlist supplied by the caller.
- Invoke the existing runner and remove temporary state after durable result acknowledgement.
- Add a local synthetic launch command and failure tests for missing skills, tools, repositories,
  configuration, and cleanup.

Explicitly excludes:

- AWS SDK calls, real credentials, live MCPs, live external CLIs, queues, deployment, backend state,
  admin UI, and external writes.

Files / subsystems:

- `packages/workflow-materializer/`
- `apps/codex-runner/`
- `workflows/synthetic-read-only-reference/`
- root Turborepo, TypeScript, lint, test, and documentation configuration

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

### Gate A - AgentCore Runtime Compatibility Spike

Objective:

- Determine whether AgentCore Runtime can host the existing Codex SDK runner without changing the
  workflow's execution engine or weakening its contracts.

Includes:

- Package the current runner and Slice 1 materializer in the smallest AgentCore-compatible custom
  container needed for the test. Verify the selected compute mode's architecture and sandbox
  requirements rather than assuming every AgentCore mode has identical constraints.
- Invoke one synthetic read-only workflow through AgentCore Runtime using the exact reviewed prompt,
  skills, schemas, and runner code.
- Verify approved non-interactive Codex authentication without placing credentials in the image,
  workflow package, prompt, command arguments, or logs.
- Verify Headstart MCP-compatible configuration, one synthetic or dev-safe MCP connection, approved
  CLI execution, explicit environment delivery, and constrained egress.
- Verify structured output, timeout, cancellation, failure cleanup, runtime versioning, and
  PHI-safe CloudWatch telemetry.
- Measure cold start, execution latency, cost, quotas, long-running invocation behavior, and the
  selected compute mode's session lifetime and storage semantics. Persistence features do not
  replace durable run state or artifact validity checks.
- Record a pass/fail decision against the criteria below; do not expand the spike into a live
  business workflow.

Pass criteria:

- The repository-owned `@openai/codex-sdk` loop remains the execution engine; AgentCore does not
  replace it with Harness or another agent loop.
- The same synthetic workflow contract passes locally and in AgentCore Runtime.
- Exact source revisions and isolated materialization remain verifiable.
- Required MCPs, CLIs, credentials, network policy, cancellation, and telemetry fail closed.
- A contract-test control-plane adapter can correlate the compute session to a stable run id
  without making session state authoritative. Final control-plane integration follows Gate B.
- Security, compliance, cost, latency, quotas, and regional availability are acceptable for the
  platform operating requirements established before the test.

Decision:

- If every material criterion passes, AgentCore Runtime qualifies as the preferred host for Slice 3.
- If a material criterion fails, evaluate ECS/Fargate against the same criteria and preserve the
  runner, image inputs, workflow contracts, and control-plane boundary. A fallback is not exempt
  from verification.
- Finalize the compute/operations pairing with Gate B before deployment. An operations service
  that hosts the runner directly must pass the same hosting criteria; do not add a second compute
  layer when it supplies no required capability.
- Do not select AgentCore Harness or ChatGPT Workspace Agents as an equivalent substitute. Either
  would require its own workflow classification and behavioral acceptance evidence.

Verification:

- Full `pnpm qa` for repository changes.
- Credential-free contract tests around the AgentCore adapter.
- An explicitly approved AWS dev smoke run with synthetic data only.
- A short decision record containing evidence, limitations, measured cost and latency, and the
  selected target.

### Gate B - Operations Build-Versus-Buy

Objective:

- Select one operational control plane and the smallest operator surface without changing Codex
  execution or prematurely building application-specific infrastructure.

Includes:

- Evaluate Windmill as a concrete candidate against the architecture's
  [operations criteria](codex-managed-workflow-architecture.md#operations-build-versus-buy-gate).
- Use the same runner contract and synthetic fixtures to check immutable Git-based launch,
  run correlation, authorized status/cancel/retry, schedule deduplication, and recoverable delivery.
- Assess authenticated approval controls with synthetic decisions; do not enable real write modes.
- Determine whether the service invokes the Gate A worker or hosts it directly. Verify the chosen
  integration rather than assuming native AgentCore/Codex support.
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

Verification and decision:

- Run repository QA for any code and separately authorize vendor/cloud checks.
- Compare the smallest adopted-service integration with the minimum custom backend/admin option.
- Select adoption when it meets material requirements at acceptable operating cost; otherwise name
  the concrete gaps that justify custom code. Document prerequisites and evidence in the canonical
  architecture and roadmap before Slices 3-5.
- A product feature list or successful job exit is not a pass. Demonstrate state recovery,
  authorization, cancellation, and useful failure visibility using synthetic fixtures.

Review note:

- Judge the operating contract and ownership decision, not a replacement for Codex or a requirement
  to express prompt-and-skill workflows as graph nodes.

### Slice 2 - Containerized Worker Artifact

Objective:

- Produce one reproducible Linux image that can execute the Slice 1 contract without developer
  machine dependencies.

Includes:

- Add a production runner entrypoint and graceful shutdown behavior.
- Add a multi-stage Dockerfile with pinned Node, pnpm, Codex, and explicitly approved CLI versions.
  Target the image architecture and worker contract verified by Gates A and B; do not assume a
  container built for one execution mode works unchanged in every hosting mode.
- Run as a non-root user with a writable ephemeral workspace and read-only application files.
- Add image build, vulnerability scan, synthetic container smoke test, and immutable ECR tagging.
- Add a GitHub Actions workflow that authenticates to AWS through OIDC and publishes the image after
  protected `main` passes QA.

Explicitly excludes:

- Starting AgentCore Runtime, a VM, or an ECS service; consuming SQS; real secrets; live MCP
  authentication; backend APIs; and production deployment.

Files / subsystems:

- `apps/codex-runner/`
- `infra/docker/`
- `.github/workflows/`
- ECR repository infrastructure under `infra/`

Verification:

- Reproducible local image build.
- Synthetic container execution with no mounted developer home.
- Image scan and least-privilege filesystem checks.
- CI proof that the published digest corresponds to the tested commit.

Review note:

- Judge this slice on reproducibility and isolation of the deployable artifact, not runtime
  scheduling.

### Slice 3 - AWS Dev Worker And Secret Delivery

Objective:

- Run the container in Headstart AWS dev with bounded identity, dispatch, secrets, and
  observability.

Includes:

- Use the compute/operations pairing selected by Gates A and B. AgentCore is the preferred hosting
  candidate and ECS/Fargate the fallback, not preselected deployments. A controlled VM requires a
  separately justified, time-boxed contingency decision.
- Add infrastructure-as-code for the selected compute and dispatch path, ECR consumption,
  CloudWatch, KMS, network policy, and a dedicated workload role. Add SQS and a dead-letter queue
  only when the selected dispatch design requires them.
- Add typed service-profile configuration mapping logical workflow requirements to exact secret
  resources and delivery methods.
- Resolve declared Secrets Manager values at runtime without exposing them to prompts or logs;
  configure protected token delivery/renewal instead where federated identity is selected.
- Generate MCP and CLI authentication configuration in ephemeral files or allowlisted environment
  variables.
- Add the selected runtime invocation or queue-consumption adapter, cancellation and shutdown
  behavior, and durable result-delivery interfaces.
- Add sanitized run/attempt/stage telemetry and alerts for startup failures, missing or expired
  identity, authenticated access denial, timeout, retry exhaustion, and dead-lettered runs.
- Add approved artifact storage and checkpoint delivery interfaces with retention, isolation, and
  integrity checks. Temporary credentials and execution scratch do not belong in reusable caches.

Explicitly excludes:

- Production deployment, broad backend business logic, admin UI, approved writes, and a general
  visual workflow builder.

Files / subsystems:

- `apps/codex-runner/`
- `infra/`
- `.github/workflows/`
- secure external setup for Codex, Headstart MCP, and the selected dev capability identities

Verification:

- Infrastructure template validation and least-privilege policy review.
- Dev deployment from an immutable ECR digest.
- Synthetic hosted run covering success, retry, timeout, cancellation, runtime termination, and any
  selected dead-letter behavior.
- Credential-redaction and environment-allowlist tests.
- Explicitly approved read-only smoke test against the selected dev capabilities.

Review note:

- Judge this slice on service isolation, identity, secret boundaries, and recoverable operation in
  dev. No business workflow should become production-active here.

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
- Receive worker lifecycle and final result updates through an authenticated service boundary.
- Record exact workflow, skill, schema, model, and image versions.
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
- Verify pinned versions, isolated identity/tool access, structured results, and durable receipts.
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
2. pinned source, skill, model, schema, tool, adapter, and image revisions;
3. verified provider identities, target visibility, cadence, and exactly-one-schedule ownership;
4. approved data classification, retention, side effects, and human-decision boundaries;
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

1. the hosting and operational-service pairing based on Gates A and B;
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
- Live AWS, Codex, MCP, and provider checks run only in explicit integration or smoke lanes with
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
