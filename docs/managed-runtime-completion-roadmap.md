# Managed Runtime Completion Roadmap

## Purpose

This document defines the remaining work between the repository's tested managed-workflow
foundation and the first operational Headstart-managed Codex workflow. It is the canonical delivery
roadmap for that gap. Use the [workflow authoring guide](workflow-authoring-guide.md) to decide
whether an individual workflow needs managed execution and the
[managed workflow architecture](codex-managed-workflow-architecture.md) for the complete system
design.

The immediate next step is **Slice 1: isolated workflow materialization and local launch**. That
slice proves that the existing runner can receive a workflow identity and exact source revision,
construct its declared environment without developer-global state, execute with synthetic inputs,
and clean up. It creates the testable boundary that either AgentCore Runtime or the ECS/Fargate
fallback will later call. A bounded AgentCore Runtime compatibility gate follows Slice 1 and
precedes production-image and deployment decisions.

## Current Baseline

The repository already provides:

- runtime-neutral workflow manifest and run-request contracts;
- workflow-package loading, reference resolution, and JSON Schema validation;
- a Codex SDK executor with explicit environment, sandbox, network, timeout, and output schema;
- read-only runner validation bound to an exact workflow identity and repository commit;
- a disabled synthetic reference workflow with fixtures and evaluation definitions;
- portable skill installation and opt-in workstation refreshes;
- cross-platform QA, coverage, documentation, skill, and workflow validation; and
- documented ownership boundaries for the backend, admin panel, MCP, and managed worker.

The current runner is a tested library. It does not yet construct an isolated workspace, install
pinned skills, select approved CLIs, generate MCP configuration, resolve a service profile, retrieve
scoped secrets, accept hosted dispatch, deploy an image, or report to a durable control plane.

## Operational V1 Definition Of Done

The managed runtime foundation is operational when one approved read-only workflow can run in the
Headstart dev environment without an employee laptop and all of the following are true:

1. A manual request or approved event creates a durable run with an idempotency key.
2. The worker receives an immutable workflow revision and validates the request before execution.
3. A fresh workspace contains only declared repositories, revisions, and skills.
4. The worker exposes only declared MCP servers, CLI commands, environment variables, and network
   destinations.
5. AWS workload identity retrieves only the logical secrets declared by the workflow's reviewed
   service profile.
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
12. Synthetic end-to-end tests and a separately approved dev smoke run demonstrate the complete
    path before a production workflow is activated.

Operational V1 does not require a visual workflow builder, general-purpose agent memory, arbitrary
external writes, or support for every candidate workflow.

## Ownership By Repository And System

| Owner                 | Responsibilities                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| This repository       | Workflow packages, contracts, materialization, runner executable, Docker image, runtime adapters, deployment infrastructure, service-profile schema, ECR publishing, and smoke tests |
| Headstart backend     | Durable run and approval records, trigger validation, idempotency, runtime dispatch, cancellation and retry APIs, and deterministic execution of approved business-system writes     |
| Headstart admin panel | Workflow discovery, manual launch, run history, review, approval, cancellation, retry, and operator-facing failure details when those surfaces are required                          |
| Headstart MCP         | Bounded permission-gated Headstart operations; it does not own scheduling, run state, or workflow retries                                                                            |
| AWS                   | Workload identity, ECR, selected compute target, optional queue and dead-letter queue, Secrets Manager, KMS, CloudWatch, and network controls                                        |
| External providers    | OAuth application registration, delegated or service-account authorization, scopes, refresh behavior, and provider-side revocation                                                   |

No new general infrastructure repository is required for the first implementation. The deployable
worker's Dockerfile, GitHub deployment workflow, and AWS infrastructure-as-code should live here,
following the existing Headstart pattern of keeping a service's deployment definition with the
service. Backend and admin changes remain in their owning repositories.

## Authentication And Secret Contract

AWS Secrets Manager is the runtime credential store, not a universal identity. The deployment must
preserve these separate boundaries:

- The AgentCore runtime role, ECS task role, or temporary pilot VM role authenticates the worker to
  AWS without static AWS keys.
- Codex receives an approved non-interactive organization credential through deployment policy.
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

## Final Runtime Contract

```text
manual request, backend event, or schedule
  -> backend/control plane validates request and persists run
  -> selected runtime adapter dispatches immutable run request and idempotency key
  -> AgentCore Runtime session or ECS worker acquires the execution
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
produces a typed proposal; the backend revalidates current authorization and business state before
an idempotent executor performs an approved action.

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
- Raw credentials, PHI, and unrestricted Codex or tool events do not enter logs.
- AgentCore session state, container filesystems, and optional runtime memory are never authoritative
  run or business state.
- Local skill installation remains independent: `skills:update` continues to distribute only
  `skills/` and never becomes a managed deployment mechanism.

## Slice-To-Behavior Mapping

- Workspace, skill, repository, MCP, CLI, and environment preparation -> Slice 1
- AgentCore Runtime compatibility and hosting decision -> Gate A
- Container image and immutable build artifact -> Slice 2
- AWS compute, runtime dispatch, optional queue, workload identity, secret delivery, logging, and
  deployment -> Slice 3
- Durable run state, trigger intake, leases, cancellation, and retries -> Slice 4
- Operator launch, status, review, cancellation, and retry experience -> Slice 5
- First live read-only workflow activation and production-readiness evidence -> Slice 6
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

Review note:

- Judge this slice on hermetic materialization and fail-closed behavior. It is not an AWS deployment
  or live integration slice.

### Gate A - AgentCore Runtime Compatibility Spike

Objective:

- Determine whether AgentCore Runtime can host the existing Codex SDK runner without changing the
  workflow's execution engine or weakening its contracts.

Includes:

- Package the current runner and Slice 1 materializer in the smallest AgentCore-compatible custom
  ARM64 container needed for the test.
- Invoke one synthetic read-only workflow through AgentCore Runtime using the exact reviewed prompt,
  skills, schemas, and runner code.
- Verify approved non-interactive Codex authentication without placing credentials in the image,
  workflow package, prompt, command arguments, or logs.
- Verify Headstart MCP-compatible configuration, one synthetic or dev-safe MCP connection, approved
  CLI execution, explicit environment delivery, and constrained egress.
- Verify structured output, timeout, cancellation, failure cleanup, runtime versioning, and
  PHI-safe CloudWatch telemetry.
- Measure cold start, execution latency, cost, quotas, and the operational effect of AgentCore's
  session lifetime and ephemeral state.
- Record a pass/fail decision against the criteria below; do not expand the spike into a live
  business workflow.

Pass criteria:

- The repository-owned `@openai/codex-sdk` loop remains the execution engine; AgentCore does not
  replace it with Harness or another agent loop.
- The same synthetic workflow contract passes locally and in AgentCore Runtime.
- Exact source revisions and isolated materialization remain verifiable.
- Required MCPs, CLIs, credentials, network policy, cancellation, and telemetry fail closed.
- The backend can correlate the AgentCore runtime session to its own durable run id without making
  AgentCore state authoritative.
- Security, compliance, cost, latency, quotas, and regional availability are acceptable for the
  pilot.

Decision:

- If every material criterion passes, select AgentCore Runtime for Slice 3.
- If a material criterion fails, select ECS/Fargate and preserve the same runner, image inputs,
  workflow contracts, and control-plane boundary.
- Do not select AgentCore Harness or ChatGPT Workspace Agents as an equivalent substitute. Either
  would require its own workflow classification and behavioral acceptance evidence.

Verification:

- Full `pnpm qa` for repository changes.
- Credential-free contract tests around the AgentCore adapter.
- An explicitly approved AWS dev smoke run with synthetic data only.
- A short decision record containing evidence, limitations, measured cost and latency, and the
  selected target.

### Slice 2 - Containerized Worker Artifact

Objective:

- Produce one reproducible Linux image that can execute the Slice 1 contract without developer
  machine dependencies.

Includes:

- Add a production runner entrypoint and graceful shutdown behavior.
- Add a multi-stage Dockerfile with pinned Node, pnpm, Codex, and explicitly approved CLI versions.
  When Gate A passes, target AgentCore Runtime's ARM64 custom-container contract; otherwise choose
  and document the ECS/Fargate image architecture.
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

- Use the target selected by Gate A: AgentCore Runtime when it passes, otherwise ECS/Fargate. A
  controlled VM requires a separately justified, time-boxed contingency decision.
- Add infrastructure-as-code for the selected compute and dispatch path, ECR consumption,
  CloudWatch, KMS, network policy, and a dedicated workload role. Add SQS and a dead-letter queue
  only when the selected dispatch design requires them.
- Add typed service-profile configuration mapping logical workflow requirements to exact secret
  resources and delivery methods.
- Resolve Secrets Manager values at runtime without exposing them to prompts or logs.
- Generate MCP and CLI authentication configuration in ephemeral files or allowlisted environment
  variables.
- Add the selected runtime invocation or queue-consumption adapter, cancellation and shutdown
  behavior, and durable result-delivery interfaces.
- Add PHI-safe metrics and alerts for startup failures, missing identity, timeout, retry exhaustion,
  and dead-lettered runs.

Explicitly excludes:

- Production deployment, broad backend business logic, admin UI, approved writes, and a general
  visual workflow builder.

Files / subsystems:

- `apps/codex-runner/`
- `infra/`
- `.github/workflows/`
- secure external setup for Codex, Headstart MCP, and pilot integration credentials

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

### Slice 4 - Backend Control Plane

Objective:

- Make workflow runs durable, authorized, idempotent, cancellable, and observable outside transient
  worker processes.

Includes:

- Add workflow-definition, run, attempt, lease, result, and audit persistence as required by the
  selected pilot.
- Add authenticated APIs for manual launch, status, cancellation, and eligible retry.
- Validate trigger payloads and dispatch immutable run requests through the selected runtime
  adapter.
- Enforce idempotency and reject stale or duplicate triggers.
- Receive worker lifecycle and final result updates through an authenticated service boundary.
- Record exact workflow, skill, schema, model, and image versions.

Explicitly excludes:

- Approved external writes unless separately designed, arbitrary workflow editing, and UI
  implementation.

Files / subsystems:

- Headstart backend repository modules, entities, migrations, services, DTOs, tests, and AWS
  integration configuration
- Coordinating runtime-adapter and worker service-profile definitions in this repository

Verification:

- Backend unit and real-Postgres integration tests for transitions, leases, idempotency,
  cancellation, retries, and stale events.
- Synthetic worker-to-control-plane contract tests.
- Dev end-to-end run with durable state surviving worker restart.

Review note:

- Judge this slice on durable state authority and transition correctness. The worker remains an
  executor rather than the source of run truth.

### Slice 5 - Minimum Operator Surface

Objective:

- Give authorized operators the smallest interface needed to launch and safely operate the pilot.

Includes:

- Add workflow discovery and manual launch when the pilot needs person-initiated runs.
- Show run status, version, timestamps, bounded failure details, and approved result summaries.
- Add cancellation and eligible retry controls.
- Add review or approval UI only when the pilot requires a human decision.

Explicitly excludes:

- A visual workflow builder, prompt editor, arbitrary credential administration, raw model event
  streams, and generalized analytics.

Files / subsystems:

- Headstart admin-panel repository
- Backend APIs from Slice 4

Verification:

- Component, API-contract, authorization, and browser workflow tests.
- Desktop and mobile visual verification for the supported operator flow.
- Failure-state testing without exposing secrets, PHI, or raw tool payloads.

Review note:

- Judge this slice on safe operation of the pilot, not on building a general automation product.

### Slice 6 - First Workflow Activation

Objective:

- Promote one approved read-only workflow from synthetic evaluation to measured dev operation and,
  only after acceptance, production operation.

Includes:

- Name business, technical, and backup owners with actionable contacts.
- Pin workflow, skills, repositories, schemas, model, runner image, MCP versions, and CLI versions.
- Complete repeated synthetic evaluations and define success, failure, latency, cost, and business
  outcome thresholds.
- Perform a dev shadow or historical run using explicitly approved data and compare the result with
  the established human process.
- Document rollback, pause, credential revocation, incident response, retention, and ownership
  handoff.
- Activate production only after the acceptance record and required reviews are complete.

Explicitly excludes:

- Additional workflows, approved writes, and platform features not required by the selected pilot.

Files / subsystems:

- `workflows/<pilot-id>/`
- pilot-specific service profile and deployment configuration
- coordinating backend and admin-panel configuration only when required

Verification:

- Repository QA and repeated workflow evaluations.
- Dev smoke, failure injection, credential revocation, pause, retry, and rollback exercises.
- Human acceptance against measured workflow outcomes.
- Production activation checklist with exact artifact versions.

Review note:

- Judge this slice on evidence that one bounded workflow is safe and operable. It does not certify
  every future workflow or write capability.

## Secure Operational Setup

The following work requires authorized human or administrator action even when the surrounding
resources are codified:

- approve and issue the managed Codex credential;
- define and provision the Headstart MCP service identity and permissions;
- register external OAuth applications and approve requested scopes;
- enter initial secret values and verify rotation or revocation procedures;
- approve the pilot data classification, retention, and observability policy;
- approve the Gate A result and selected compute target before Slice 3; and
- select the first workflow and accountable owners before Slice 6.

These actions must have documented outcomes, but credentials and sensitive provider responses must
not be copied into repository documentation or workflow fixtures.

## Required Decisions Before Implementation

Slice 1 can begin without selecting a live pilot or deployment target. Before Slice 3, the team must
decide:

1. AgentCore Runtime or ECS/Fargate based on the Gate A evidence;
2. approved managed Codex authentication method;
3. Headstart MCP service-identity and permission model;
4. first external integration, if any, and its organization-owned authentication method;
5. service-profile ownership and review requirements; and
6. the backend control-plane API and persistence boundary.

Before Slice 6, the team must also decide the pilot workflow, owners, measurable acceptance criteria,
data policy, failure policy, and production approval boundary.

## Verification Across The Roadmap

- Every repository change runs that repository's canonical QA command and required hooks.
- Ordinary tests and pull-request CI remain synthetic, credential-free, and network-independent.
- Live AWS, Codex, MCP, and provider checks run only in explicit integration or smoke lanes with
  approved identities and data handling.
- Infrastructure changes include template validation, least-privilege review, deployment smoke,
  rollback evidence, and cost-impact notes.
- Cross-repository contracts are versioned and tested on both sides before deployment.
- Production activation always uses immutable artifacts already proven in dev.

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
