# Codex-Managed Workflow Architecture

## Purpose

This document defines how Headstart can package and operate the subset of successful local Codex
workflows that require organization-managed execution, without replacing the reasoning and tool-use
behavior that made the local workflow effective.

Use the [workflow authoring guide](workflow-authoring-guide.md) before this document to determine
whether a managed workflow is warranted. Use the [documentation hub](README.md) to navigate the
portable skill, contract, workflow runtime, runner, and standards documentation around this
architecture. Use the
[managed runtime completion roadmap](managed-runtime-completion-roadmap.md) for the ordered
implementation slices between the current library foundation and Operational V1.

This architecture applies only after managed execution is selected. It is not the expected eventual
state of every recurring agent workflow. A managed workflow may use only prompts, skills, and
approved existing tools; workflow-specific deterministic adapters are optional. The platform's
identity, policy, state, validation, and failure controls remain deterministic in either case.

Managed execution is an additional operating context, not a replacement for local Codex use. Most
team members will continue consuming portable and workflow skills from their local agents through
the workstation updater. The same reviewed skill source can be pinned into this runtime, and a
managed package can be loaded locally from a repository checkout for development, evaluation, or an
explicitly supported supervised run.

The managed platform reproduces the functional ingredients of local Codex work:

- versioned prompts and skills;
- permitted MCP servers and CLI tools;
- checked-out repositories and optional deterministic adapters;
- structured inputs and outputs;
- multi-step reasoning; and
- targeted human decisions.

The platform makes the implicit parts of a person's workstation explicit and reviewable. It owns
triggers, service identities, versions, isolation, durable run state, approvals, retries,
observability, and operational responsibility. Business systems remain authoritative for their own
records.

## Codex Execution Is A Product Requirement

The first managed runtime must execute the reviewed workflow through Codex, not merely use an OpenAI
model inside another agent loop. This requirement preserves the behavior employees already rely on:
repository navigation, instruction discovery, skill composition, MCP and CLI use, iterative tool
reasoning, and structured completion through the Codex SDK.

ChatGPT Workspace Agents are a separate product and execution runtime. Codex can configure their
instructions, skills, connections, schedules, and triggers, but it does not execute them. A workflow
may deliberately target Workspace Agents when its owner accepts that runtime and validates it
independently. Workspace Agents are not a hosting substitute for a workflow whose acceptance
criteria require Codex behavior, and their configuration must not be presented as a deployment of
the managed Codex runner. Their API trigger also does not currently return a run id or make the
result retrievable through the API, so it cannot satisfy this architecture's durable run-correlation
contract.

This distinction separates two decisions that must not be conflated:

- **Execution engine:** the initial managed engine is the repository-owned Codex SDK runner.
- **Compute substrate:** AgentCore Runtime, ECS/Fargate, or another approved host may run that exact
  engine without changing the workflow contract.

Amazon Bedrock AgentCore Runtime is the preferred managed-hosting candidate because Runtime accepts
customer-owned agent code and containers while supplying isolated sessions, identity integration,
scaling, and observability. AgentCore Harness is not the selected path: Harness supplies its own
agent loop, so using an OpenAI model there would not establish equivalence with Codex. Runtime must
pass the compatibility gate in the
[managed runtime completion roadmap](managed-runtime-completion-roadmap.md) before adoption.

## Repository Responsibilities

This monorepo has four internal layers:

1. `skills/` contains portable capabilities and interactive workflow skills that Codex, Claude Code,
   Cursor, and compatible hosts can install.
2. `workflows/` contains deployable managed-workflow packages with prompts, schemas, tool policy,
   ownership, and operating configuration.
3. `packages/` contains reusable contracts, runtime-safe package loading and validation, and
   deterministic adapters shared by managed workflows and the runner.
4. `apps/codex-runner/` contains the managed Codex execution worker.

The existing Headstart application repositories retain their established responsibilities:

- The backend owns control-plane APIs, durable database records, idempotency, approval execution,
  Salesforce event intake, and business-system writes.
- The admin panel owns workflow discovery, manual launch, run history, evidence review, approvals,
  cancellation, and retry controls.
- Headstart MCP owns bounded permission-gated tools. It does not own schedules, workflow state, or
  retries.
- This repository owns the executable workflow definition and worker code. It does not become the
  source of truth for Salesforce, Aloha, Google Drive, or another business system.

## Portable Skills Versus Managed Workflows

A **workflow skill** is portable agent guidance. It can tell an interactive agent which skills to
compose, which evidence to gather, which questions to ask, and which output to prepare. The person
running the agent supplies important context implicitly: their login, available tools, working
directory, approvals, and judgment.

A **managed workflow** is a deployable service contract. Its package must declare the corresponding
operational information explicitly:

- stable workflow identity and version;
- business owner, technical steward, and backup;
- entry prompt and required skills;
- immutable skill source revision;
- input and output JSON Schemas;
- allowed MCP servers, MCP tools, and CLI commands;
- sandbox and network policy;
- triggers;
- side-effect and human-approval policy;
- retry limits and timeout;
- data classification, event-emission policy, and retention; and
- synthetic fixtures and evaluation evidence.

A workflow skill can remain the correct long-term architecture without becoming a managed workflow.
A managed workflow may compose several skills and approval steps with or without workflow-specific
deterministic adapters. Neither form silently grants permissions.

When both forms represent the same business workflow, they must share canonical portable skills
rather than duplicate their instructions. The managed package adds the operational contract that a
workstation user otherwise supplies through their presence and environment. Any real behavioral
difference must be expressed as a reviewed input, policy, adapter, or separate workflow identity.

## End-To-End Runtime

```text
Salesforce event, EventBridge schedule, or manual request
  -> control plane validates trigger and creates durable run record
  -> control plane dispatches immutable request through the selected runtime adapter
  -> isolated Codex runner receives exact workflow version and idempotency key
  -> runner resolves pinned skills and approved workspace
  -> runner validates input schema and policy
  -> Codex executes prompt using allowed skills, MCPs, CLIs, and any declared adapters
  -> runner validates structured output schema
  -> control plane persists result, checkpoint, usage, and audit evidence
  -> configured destination delivers read-only output when appropriate
  -> if review or operations are required, the admin UI presents the run or requests a decision
  -> if an approved external action is required, a deterministic backend executor performs it
```

The destination, human-review surface, and action executor are conditional branches. A read-only
managed workflow may finish after persisted output is delivered through an existing approved
capability, with no workflow-specific backend, admin-panel, or adapter code. The shared control plane
and runner still provide identity, versioning, policy, durable state, and operational evidence.

The persistent unit is the workflow definition and durable run record. A Codex process, thread,
AgentCore session, container, queue message, or worker lease is an execution detail. Compute can
disappear and be replaced without losing the authoritative run status, approvals, or business
outcome. Runtime-native session or memory state must never become the business system of record.

## Local Development And Managed Packaging

The intended authoring loop begins with Codex locally because that is where employees already prove
useful workflows:

1. Develop the capability interactively using approved tools and synthetic or explicitly authorized
   data.
2. Reuse existing skills and extract new portable behavior only when shared guidance is warranted.
3. Add a managed workflow package only when the workflow should run independently of a person's
   laptop.
4. Define input and output schemas, permissions, owners, failure handling, and evaluation fixtures.
5. Run repository QA and local synthetic workflow evaluation.
6. Use a future publishing skill to prepare the manifest, identify missing operational decisions,
   and open a pull request.
7. After review, deploy the exact merged commit and record it in the control plane.

Managed packaging is not the act of copying a prompt to a server. It converts a successful
interactive workflow into an explicit, testable operating contract only when independent execution
is required.

The local authoring loop should exercise the same manifest, prompt references, schemas, policy
validation, and deterministic adapters used by the hosted runner. Local test or supervised modes
may substitute synthetic inputs and an explicitly authorized user identity, but they must not
silently relax package rules. Distribution remains separate: `skills:update` installs portable
skills for local agents, while workflow packages are consumed from a checkout or immutable managed
artifact.

## Runner Coordination

The complete managed runtime, comprising the control plane, materializer, and runner, loads one
workflow package for one run. Before a real workflow can become active, that runtime must:

1. runtime-validate the durable run request;
2. verify that the requested workflow identity, version, and repository commit match the
   materialized package;
3. reject draft, paused, or retired workflows;
4. validate the trigger payload against the input schema;
5. construct an isolated workspace from declared sources;
6. expose only the approved environment variables, skills, MCP configuration, and CLI tools;
7. start Codex with the declared model, sandbox, network policy, and timeout;
8. request output through the workflow JSON Schema;
9. capture permitted structured lifecycle events;
10. validate the final response independently of model claims; and
11. report the result to the control plane before destroying temporary state.

The current runner library enforces workflow identity, repository commit, lifecycle, trigger, input,
read-only side-effect mode, model settings, timeout, and output schema. It does not yet materialize
repositories or skills, consume the manifest tool allowlists, provision service identity, constrain
CLI availability, or construct the environment allowlist. Repository validation therefore blocks
checked-in `active` workflows. The synthetic package remains `draft`, and no real workflow may be
activated until those runtime controls and their tests exist.

The initial runner also rejects `propose-only` and `approved-write` packages until the durable
approval and deterministic action executor exist. This is a safety boundary, not an architectural
limitation.

## Codex Integration

The TypeScript runner uses the supported `@openai/codex-sdk`. The SDK wraps the Codex CLI and exposes
structured thread events plus output-schema enforcement.

The runner starts each thread with:

- an isolated working directory;
- the workflow's sandbox setting;
- network access enabled only when external egress is constrained outside Codex to approved
  destinations;
- `approvalPolicy: never`, because unattended workers cannot satisfy interactive terminal approval
  prompts; and
- an abort signal derived from the workflow timeout.

`approvalPolicy: never` does not mean that external writes are approved. Managed external actions
are governed above the Codex process. A write-capable workflow produces a typed proposal, the
control plane records a human decision, and a deterministic executor performs the approved action
with an idempotency key.

The runner constructor accepts an explicit environment mapping. A future deployment adapter must
build that mapping from a reviewed allowlist and must never pass all host environment variables,
since that could expose unrelated credentials to commands or MCP subprocesses. Codex authentication,
MCP credentials, and AWS access are provisioned independently and delivered through the deployment
environment's secret and identity systems.

## Skills And Version Pinning

Workstation users may follow protected `main` or a reviewed semantic skill release through the
opt-in updater. Managed runtimes have a stronger requirement: each deployed workflow pins an exact
skill tag or full repository commit.

This is one-source, multiple-consumer versioning. Local installations, local package evaluation, and
hosted runs should all be traceable to reviewed repository revisions even though their update and
deployment mechanisms differ.

Every run record should preserve:

- workflow id and version;
- repository commit;
- skill source revision;
- runner image digest;
- model identifier;
- input and output schema fingerprints;
- MCP server versions where available; and
- deterministic adapter versions.

This makes a past result explainable even after skills or runtime code change.

## MCP, CLI, And Custom Code

The same categories available to a successful local Codex session remain available in managed
execution, but each becomes declared and bounded.

### MCP

Use MCP for authenticated, permission-gated operations that benefit from structured tool metadata.
A workflow lists required servers and, where practical, an explicit tool allowlist. The deployment
must fail if a required server cannot initialize.

Headstart MCP is the preferred interface for approved Headstart system operations. Availability of
a tool does not authorize its use; the workflow identity and backend permission layer still govern
the operation.

### CLI

Use a CLI when it is the supported interface for a platform or deterministic repository operation.
The runner image must pin the CLI version. A workflow declares the command family it needs, and OS
or container controls constrain executable availability and network egress.

Shell access is not a substitute for a missing permission model. Credentials must be scoped to the
workflow identity and never passed as prompt text or command-line arguments that can enter logs.

### Custom Code

Place code according to reuse and authority:

- Workflow-specific parsing or transformation belongs under that workflow's `src/` directory.
- Reusable deterministic logic belongs in a narrowly named package under `packages/`.
- Business-system writes, idempotency, and database authority belong in the backend or an owning
  service.
- A reusable external integration may become a backend adapter, MCP tool, or tightly scoped CLI.

Custom code should turn nondeterministic model output into typed inputs and consume typed outputs.
It should not hide consequential behavior inside a prompt helper.

## Durable State And Artifacts

The control plane, rather than a local Codex session directory, owns durable state. A minimum run
model includes:

- request and idempotency key;
- workflow and runtime versions;
- trigger metadata;
- status and timestamps;
- retry attempt and lease;
- validated input and output references;
- checkpoints and approval requests;
- external action receipts;
- failure classification; and
- operational usage and cost metadata.

Postgres is appropriate for structured run and approval state. Approved encrypted object storage is
appropriate for larger artifacts. Salesforce or another business system receives only the business
record it owns. Runtime logs are not a second business database.

## Data Handling

The manifest classifies each workflow as public, internal, confidential, or PHI. That declaration
drives execution and observability behavior.

PHI workflows must not emit raw Codex event streams because events can contain prompts, tool
arguments, command output, or model responses. They require minimum-necessary inputs, approved
workspace and API data handling, PHI-safe operational events, encrypted storage, retention policy,
and audit records. Secrets and raw credentials never appear in prompts, workflow packages, fixtures,
logs, or generated review artifacts.

All committed tests use synthetic data. Live read-only validation is separately authorized and is
never a dependency of local hooks or ordinary CI.

## Side Effects And Human Review

The side-effect modes are:

- `read-only`: the agent may retrieve and analyze approved information but cannot request an
  external mutation;
- `propose-only`: the agent may produce a typed proposed action, but no external mutation occurs;
  and
- `approved-write`: the proposal can enter a durable human approval flow and, after approval, a
  deterministic executor may perform it.

For proposed or approved writes, the backend must validate authorization and current business state
again immediately before execution. It must apply a stable idempotency key, record the external
receipt, and make replay behavior explicit. Human approval never converts arbitrary model text into
authority.

## Hosting Decision And AWS Deployment Progression

The code remains compute-neutral, but the first deployment decision is now explicit: evaluate
AgentCore Runtime before implementing a custom long-lived VM or ECS worker fleet.

### Compatibility Gate

A bounded dev spike must package the existing Codex SDK runner in an AgentCore Runtime custom
container and prove that the exact execution contract survives the move. The spike must use a
synthetic read-only workflow and verify pinned repository and skill materialization, approved Codex
authentication, MCP and CLI startup, explicit environment delivery, structured output, timeout and
cancellation behavior, PHI-safe observability, network restrictions, cold-start and run cost, and
failure cleanup. AgentCore session state remains ephemeral; the Headstart control plane remains
authoritative.

Passing the gate means AgentCore Runtime becomes the initial managed compute target. Failing a
material requirement means ECS/Fargate becomes the fallback without changing workflow packages,
the Codex runner, or control-plane contracts. A controlled VM is reserved for a time-boxed
demonstration or contingency, not the intended Operational V1 architecture.

### Operational V1

- The exact reviewed Codex runner image is published to ECR.
- The selected runtime adapter invokes AgentCore Runtime or dispatches to an ECS/Fargate worker.
- AWS supplies isolated compute, narrowly scoped workload identity, secrets, network controls, and
  CloudWatch observability.
- The backend provides durable run, approval, cancellation, retry, and idempotency APIs independent
  of the selected compute target.
- The admin panel provides the workflow catalog and operations UI required by the pilot.
- Deployment records the exact workflow commit, image digest, runtime configuration, and execution
  target.

### Later Evaluation

AgentCore Gateway, AgentCore Memory, AgentCore Harness, Windmill, or another orchestration platform
may be adopted only when a measured requirement justifies it. AgentCore Runtime adoption does not
implicitly adopt those services. The workflow contract allows the compute adapter to change without
rewriting business workflows. The platform should not acquire a visual graph builder, custom
scheduler, or general-purpose agent memory system until a real operating requirement demonstrates
their value.

## Failure And Recovery Model

Failures are classified rather than blindly retried:

- invalid input: terminal until corrected;
- missing required tool or identity: configuration failure and alert;
- transient dependency failure: bounded retry with backoff;
- schema-invalid model output: retry only when policy permits, then human escalation;
- stale or duplicate trigger: idempotent no-op;
- approval timeout: explicit expired or cancelled state;
- external write ambiguity: stop and reconcile before replay; and
- worker loss: lease expiry permits another worker to resume from durable state.

Retries must never duplicate an external action. A dead-letter queue is an operational signal, not a
hidden backlog.

## Current Implementation Slice

This repository currently establishes:

- pnpm and Turborepo package orchestration;
- canonical workflow manifest and run schemas;
- workflow package loading and JSON Schema validation;
- a Codex SDK executor with explicit environment, sandbox, network, timeout, and structured output;
- a runner that runtime-validates durable requests, binds them to a materialized repository commit,
  and validates read-only workflows before and after Codex execution;
- a disabled synthetic reference workflow; and
- repository validation that enforces fixtures, evaluation definitions, draft-only lifecycle, and
  unit-test coverage for these boundaries.

It does not yet provide a hosted runtime adapter, backend control-plane module, admin UI, service
identity issuance, repository workspace materialization, skill installation into an isolated run,
approval executor, external writes, deployment pipeline, or live workflow. Those are subsequent
reviewed slices. The
[managed runtime completion roadmap](managed-runtime-completion-roadmap.md) defines their ownership,
sequence, exclusions, and verification requirements.

## Required Next Decisions

Before promoting the first real workflow, Headstart must select:

1. the pilot workflow and named owners;
2. the Codex authentication method approved for managed execution;
3. the Headstart MCP service-identity and permission model;
4. whether AgentCore Runtime passes the compatibility gate or ECS/Fargate is required;
5. the control-plane database and API contract;
6. the exact approval boundary for the pilot;
7. PHI classification and observability policy; and
8. measurable success, failure, and rollback criteria.

## Official References

- [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk)
- [Codex access tokens](https://learn.chatgpt.com/docs/enterprise/access-tokens)
- [Non-interactive Codex](https://learn.chatgpt.com/docs/non-interactive-mode)
- [ChatGPT Workspace Agents](https://help.openai.com/en/articles/20001143)
- [AgentCore Harness versus Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-vs-runtime.html)
- [AgentCore Runtime operation](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-how-it-works.html)
- [AgentCore Runtime security practices](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-security-best-practices.html)

## Related Repository Documentation

- [Documentation hub](README.md)
- [Workflow authoring guide](workflow-authoring-guide.md)
- [Workflow contracts](../packages/workflow-contracts/README.md)
- [Workflow runtime](../packages/workflow-runtime/README.md)
- [Codex runner](../apps/codex-runner/README.md)
- [Workflow composition](../standards/workflow-composition.md)
- [Security and data handling](../standards/security-and-data-handling.md)
- [Testing and release](../standards/testing-and-release.md)
