# Workflow Authoring Guide

## Purpose

This guide helps a Headstart team member and their coding agent turn a useful task into the smallest
durable artifact that can support it safely. It covers one-off Codex work, reusable skills,
interactive workflows, deterministic helpers, and organization-managed cloud execution.

From a workstation with the shared skills installed, invoke
[`headstart-agent-workflow-authoring`](../skills/headstart-agent-workflow-authoring/SKILL.md) to have
the agent apply this decision process. This document remains the canonical detailed guidance.

Start with the business outcome and operating constraints. Do not assume that every workflow needs
custom code, a managed runner, a visual orchestration system, or application changes.

## Start Here

When beginning work with Codex or another supported coding agent:

1. Describe the desired outcome, trigger, inputs, outputs, human decisions, side effects, and
   failure consequences.
2. Identify the systems that own the source data and final business state.
3. Confirm which authenticated capabilities are available through native connectors, MCP, APIs,
   browser control, or CLIs.
4. Choose the smallest workflow shape below that satisfies the operating requirement.
5. Prototype with synthetic or explicitly authorized data before adding persistent runtime or
   production-write capability.
6. Record unresolved ownership, permission, data-handling, and failure-recovery decisions rather
   than hiding them in prompt prose.

The agent should read the [repository guide](../AGENTS.md), this guide, and the standards linked for
the selected shape before creating files.

## Choose The Artifact Boundary

Do not map workflow steps one-for-one to skills. Classify each durable concern by what it must own:

| Artifact                      | Owns                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------ |
| Tool, API, MCP server, or CLI | Authenticated operations and permission-aware capability contracts             |
| Reference                     | Supporting rules, examples, templates, checklists, or source excerpts          |
| Reusable skill                | One independently useful procedure, judgment contract, or safety boundary      |
| Workflow skill                | Sequencing, handoffs, exceptions, and human decisions across capabilities      |
| Deterministic helper          | Reproducible parsing, calculation, transformation, or validation               |
| Managed package               | Independent execution contract, pinned dependencies, policies, and evaluations |
| Owning application or service | Durable state, authorization, concurrency, business invariants, and writes     |

Extract a separate skill when the capability is independently reusable, has a meaningful contract,
or needs its own safety or evaluation boundary. Keep workflow-specific instructions in the workflow
skill and static supporting material in references. Do not wrap existing tool descriptions in a
skill or rely on prompt prose to enforce an application invariant. See
[workflow composition](../standards/workflow-composition.md).

## Shapes Are Steady States, Not Maturity Levels

The shapes in this guide are alternatives and composable elements, not stages that every workflow
should graduate through. A recurring workflow that is reliably handled by a person launching Codex,
following a reviewed skill, and using an authenticated MCP or API can remain that way indefinitely.
Do not add workflow-specific code or managed infrastructure merely to make it appear more mature.

Make two independent decisions:

1. **Execution model:** Will a person launch and supervise every run, or must it run independently
   with an explicit identity, trigger, durable state, retries, and operational ownership?
2. **Implementation support:** Can prompts, skills, and existing tools reliably perform the work, or
   does a bounded transformation, invariant, or integration need deterministic code and tests?

Those decisions produce four valid long-term combinations:

| Execution model | Guidance and existing tools only                                                               | With workflow-specific deterministic support             |
| --------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Supervised      | One-off task or reusable workflow skill using MCPs, APIs, connectors, browser control, or CLIs | Interactive workflow skill plus a focused tested helper  |
| Managed         | Managed package whose prompt and skills use approved existing capabilities                     | Managed package plus tested adapters or shared libraries |

A managed runtime always needs deterministic platform controls for identity, policy, state, and
failure handling. That does not mean every managed workflow needs custom business-logic code.
Revisit the chosen steady state only when observed reliability, scale, side effects, or operating
requirements change.

## Choose Execution Topology Separately

After selecting supervised or managed execution and deciding whether deterministic support is
needed, choose the smallest control-flow topology that reliably completes the task. One pass, a
quality loop, and a graph are alternatives or composable elements, not maturity levels.

| Topology             | Use when                                                                                                 | Avoid when                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| One coherent pass    | One agent can complete the task with shared context and the result can be reviewed or verified afterward | Repeated evidence shows a specific, repairable failure that needs iterative feedback              |
| Bounded quality loop | A verifier has explicit criteria, can explain failures, and refinement produces measurable improvement   | The verifier is subjective, correlated with the generator, or cannot tell whether progress occurs |
| Explicit graph       | Branches, joins, parallel work, or isolated context, permissions, ownership, or models must be visible   | The work is sequential, shares one reasoning state, or merely has several named steps             |

A managed workflow may still be one-pass. A supervised workflow may use a quality loop. A graph may
contain deterministic steps, model calls, human decisions, and application actions; it does not
require a separate agent for every node. A single agent using several skills and tools is not
automatically a graph.

### Quality Loop Contract

Add a produce-verify-revise loop only when all of the following can be stated:

- the exact artifact being improved;
- objective pass criteria and the grader or verifier that applies them;
- actionable feedback that changes the next attempt rather than repeating the same prompt;
- maximum attempts, elapsed time, token or cost budget, and tool-call budget where measurable;
- a no-progress rule, such as repeated identical failures or no score improvement;
- human escalation or a safe fallback when the loop cannot pass; and
- a side-effect policy that keeps refinement read-only or proposal-only until approval.

Use deterministic validation first: schemas, types, tests, calculations, policy checks, or source
and citation verification. Use model grading only for behavior that cannot be reduced to those
checks, define one-dimensional rubric criteria, and calibrate the grader against representative
human judgments. Consider a fresh or context-isolated verifier when generator and verifier would
otherwise share the same assumptions. A verifier that can only say that an output "looks good" is
not a release gate.

Operational retry and quality refinement are different. Retry repeats an operation after a
transient infrastructure failure. A quality loop revises a completed artifact that failed its
acceptance criteria. Do not use a quality loop to repeat external writes.

### Graph And Multi-Agent Contract

Use explicit graph orchestration only when the topology itself provides value:

- independent work can run in parallel and be joined through a typed aggregation contract;
- branches or approval paths must be inspectable without asking the model what happened;
- specialists need materially different context, tools, permissions, owners, or models; or
- evaluation shows that one agent with the relevant tools cannot meet the required quality,
  latency, or safety bar.

Default to a coordinator that delegates bounded work and owns final synthesis. Peer-to-peer or
debate-style coordination adds context growth, routing uncertainty, cost, and failure modes and
requires separate evidence. Keep tightly sequential work with shared reasoning state in one agent
unless repeated evaluations prove decomposition is beneficial.

### Context Across Loops And Handoffs

Every repeated attempt or graph edge must define what context continues, what is compacted, and what
is discarded. Preserve durable identifiers, source versions, decisions, verifier results, and
unresolved failures rather than replaying an entire transcript by default. Treat context as a finite
budget and persisted state as minimum-necessary data, especially for PHI. A compacted handoff must
remain attributable to its source and must not silently turn an inference into a fact.

## Design For Local And Managed Consumption

Local and managed describe where and under whose identity a workflow runs. They do not require
separate copies of its reasoning or procedures.

- Treat locally installed skills as the primary team-facing distribution surface. Most employees
  will invoke them from their own Codex or another supported coding agent, and the repository
  updater keeps those installed copies current.
- Reuse the same reviewed skills when a managed runner needs the capability. Pin the exact source
  revision and add the managed contract around it instead of rewriting the behavior for the cloud.
- When one business workflow needs both experiences, use a workflow skill for person-supervised
  operation and a managed package for independent execution. Share skills, schemas, and narrowly
  owned code where their contracts are genuinely the same; keep identity, trigger, approval, and
  runtime policy specific to the execution context.
- A package under `workflows/` may support local development, synthetic evaluation, and an
  intentional supervised launch from a repository checkout. It is not copied into a global skill
  directory, and local execution must validate its package contract rather than bypassing policy.
- Do not create local and hosted prompt forks. If their behavior diverges, identify whether the
  difference belongs in an explicit input, policy, adapter, or separate workflow identity.

The self-updater serves the common workstation skill path. It is deliberately not a managed
workflow installer or deployment system.

## Choose A Workflow Shape

### One-Off Agent Task

Use the current Codex task when the work is exploratory, infrequent, person-supervised, and not a
team capability. The task may use existing skills, MCPs, CLIs, and repository code without adding a
new shared artifact.

Persist only the durable result in its owning system. Do not turn every successful prompt into a
skill.

Evaluate whether a shared artifact is warranted when the same procedure repeats, multiple people
need it, mistakes have meaningful cost, or the workflow needs a stable output contract. Repetition
alone is not enough when the task remains personal, low-risk, and adequately supported in its
current context.

### Reusable Skill

Create `skills/<name>/` when one bounded procedure, decision method, or Headstart-specific safety
contract should be reusable across people, repositories, or workflows.

A skill should define:

- activation boundary;
- required capabilities and inputs;
- expected output;
- side effects and approval boundary;
- failure and unsupported behavior; and
- positive, near-miss, and safety evaluations.

Use the [portable skill contract](../standards/portable-skill-contract.md) and
[`headstart-skill-authoring`](../skills/headstart-skill-authoring/SKILL.md). A skill can call a
deterministic helper under its own `scripts/` directory when that helper is portable and exists only
to support the skill.

### Interactive Workflow Skill

Create a workflow skill under `skills/` when a person will continue launching and supervising an
agent, but the agent should sequence several reusable capabilities, evidence sources, decisions,
and handoffs consistently.

The workflow skill must declare its component skills in `metadata.headstart-requires`, define the
contract between steps, and state what happens when a capability is unavailable or evidence is
incomplete. The person may still supply login context, approve writes, answer judgment questions,
and choose when to rerun the workflow.

This is often enough for recurring Google Docs, Gmail, Linear, GitHub, Salesforce, or Headstart MCP
work. A composed skill plus existing authenticated capabilities should remain the default until a
concrete reliability or operating need justifies more infrastructure.

Read [workflow composition](../standards/workflow-composition.md), [tool capabilities](../standards/tool-capabilities.md),
and [knowledge workflow sources](../standards/knowledge-workflow-sources.md).

### Code-Assisted Interactive Workflow

Keep the person-supervised workflow shape while adding deterministic code when repeated parsing,
calculation, validation, file transformation, schema enforcement, or fragile API preparation should
be reproducible and directly tested.

Custom code does not automatically require a managed workflow. Put it in the narrowest owning
location described below, expose a clear typed boundary to the agent, and retain human approval for
consequential actions.

### Managed Workflow Package

Create `workflows/<id>/` only when the workflow must run independently of an employee laptop or
requires an explicit schedule or event trigger, service identity, isolated workspace, durable run
state, retries, cancellation, observability, operational ownership, or controlled approval flow.

A calendar reminder or recurring cadence that still requires a person to launch and supervise Codex
does not make the workflow managed. A schedule or event implies managed execution only when it starts
work independently of a supervising person.

Selecting a managed package does not prohibit local use. The exact package should be runnable with
synthetic inputs from a checkout for development and evaluation, and it may expose a supported
person-launched mode when that is useful. Hosted operation differs because the control plane and
runner supply explicit identity, trigger, isolation, durable state, retries, and observability.

The package converts implicit workstation context into an explicit operating contract:

- immutable workflow, skill, model, repository, and runtime versions;
- named business and technical owners, plus an accountable backup and actionable contact for each
  before activation;
- input and output JSON Schemas;
- declared triggers, MCP servers, CLI commands, repositories, and environment variables;
- sandbox, network, timeout, retry, side-effect, data, and retention policies; and
- schema-valid synthetic fixtures, happy-path and boundary evaluation definitions, and repeated
  evaluation evidence before activation.

Read the [managed workflow architecture](codex-managed-workflow-architecture.md),
[workflow contracts](../packages/workflow-contracts/README.md),
[workflow runtime](../packages/workflow-runtime/README.md), and
[synthetic reference workflow](../workflows/synthetic-read-only-reference/README.md).

### Application Or Platform Feature

Implement behavior in the owning backend, admin panel, MCP server, or infrastructure repository when
it owns business invariants, durable records, authentication, authorization, idempotent external
writes, user interfaces, deployment, or operational service health.

A managed workflow may propose a typed action. It does not become the source of authority merely
because Codex reasoned about the action. The owning application must revalidate authorization and
current business state before a consequential write.

## Design Repeated And Concurrent Execution

Before allowing a shared workflow to write, define what happens when the same work is run twice or
two authorized people run it at the same time. Identify the business unit of work, deduplication or
idempotency key, append-versus-overwrite behavior, stale-read behavior, and the system that enforces
collision safety.

Agent instructions can request a pre-write check, but they are not a lock. If the owning application
or permission-aware capability cannot enforce idempotency, version checks, compare-and-set behavior,
a lease, or an equivalent invariant, keep the workflow read-only or proposal-only and require a
person to complete the write in the owning system.

## Decision Table

| Requirement                                | One-off task | Reusable or workflow skill | Deterministic helper | Managed workflow | Owning application       |
| ------------------------------------------ | ------------ | -------------------------- | -------------------- | ---------------- | ------------------------ |
| Person starts and supervises every run     | Yes          | Yes                        | Yes                  | Optional         | Optional                 |
| Reusable reasoning or procedure            | No           | Yes                        | Optional             | Usually          | Optional                 |
| Stable parsing, calculation, or validation | Optional     | Optional                   | Yes                  | Optional         | Often                    |
| Runs while creator is offline              | No           | No                         | No                   | Yes              | Yes                      |
| Schedule or event trigger                  | No           | No                         | No                   | Yes              | Often supplies trigger   |
| Durable retries and run history            | No           | No                         | No                   | Yes              | Owns state/control plane |
| Business-system write authority            | No           | No                         | No                   | Proposal only    | Yes                      |
| End-user operations UI                     | No           | No                         | No                   | No               | Yes                      |

Use several columns when the workflow spans elements. For example, a cloud workflow uses a managed
package and runner, may use portable skills, and adds deterministic packages or backend
control-plane code only when their separate responsibilities are required. The table chooses
ownership; it does not require one artifact to do everything.

## Choose Where Deterministic Code Belongs

- Put a portable helper under `skills/<name>/scripts/` when it supports only that skill, can run in
  each declared host environment, and owns no durable or consequential business behavior.
- Put a repository-specific helper for a supervised workflow in the owning repository's normal
  source or script location when it operates on that repository's artifacts or domain contracts.
  Follow that repository's instructions and expose a bounded CLI or API to the skill; do not create a
  managed package solely to give the helper a home.
- Put workflow-specific adapters under `workflows/<id>/src/` after the workflow has a managed
  package.
- Put runtime-neutral logic under a narrowly named `packages/` workspace when multiple workflows or
  the runner reuse it.
- Put trigger intake, durable state, permissions, idempotency, business-system writes, and business
  invariants in the owning backend or service.
- Put workflow discovery, manual launch, review, approvals, history, retry, and cancellation views in
  the owning application UI.
- Expose a bounded MCP tool or CLI when agents need a stable, permission-aware operation that more
  than one workflow can use.

Do not hide a fragile business write inside a skill script or make a prompt responsible for an
invariant that code can enforce.

## MCP, CLI, Browser, And Native Connector Choices

Treat each integration as a capability provider:

- Prefer an authenticated native connector for supported semantic reads and explicit user-requested
  writes.
- Prefer MCP for structured, permission-gated operations with useful tool metadata.
- Use an official CLI for deterministic platform or repository operations when it is the supported
  interface and can be versioned.
- Use browser control when no stable semantic interface exists and accept the added UI fragility.
- Add custom adapters only when existing interfaces cannot provide a reliable typed boundary.

The workflow declares the capability it needs and its authorization boundary. Tool availability is
not permission. See [tool capabilities](../standards/tool-capabilities.md) and
[security and data handling](../standards/security-and-data-handling.md).

## Manage Derived Knowledge Deliberately

Use bounded retrieval from the authoritative source when practical. Create a condensed rule pack,
manifest, checklist, or reference only when a reviewed stable artifact materially improves context,
latency, or consistency. Record the source identifier and exact revision or fingerprint, citations,
retrieval date, extraction scope, owner, freshness trigger, and stale behavior. Separate formal
source requirements from human-approved operational interpretation.

Observed outcomes can reveal a stale source, extraction defect, model error, human override,
external-policy change, or upstream data-quality problem. Preserve the original recommendation and
its exact workflow, skill, rule, source, schema, and model versions before classifying the mismatch.
Do not let a workflow automatically rewrite a shared skill or reference from outcome data. Route a
proposed canonical change through review and add regression evidence. See
[knowledge workflow sources](../standards/knowledge-workflow-sources.md).

## Evidence-Based Evolution

1. **Prove the behavior:** complete the task with a person present and capture observed edge cases.
2. **Select the steady state:** decide separately whether supervision is acceptable and whether any
   workflow-specific behavior needs deterministic enforcement.
3. **Persist only what repeats:** add a reusable skill when shared guidance is valuable; keep a
   successful one-off task one-off when it is not a team capability.
4. **Add code only where justified:** introduce a focused helper or adapter for calculations,
   parsing, validation, transformations, or invariants that need reproducibility and tests.
5. **Add managed execution only where justified:** introduce a package, service identity, durable
   state, retries, observability, and owners when the workflow must operate independently.
6. **Stop at the selected architecture:** do not scaffold unused packages, adapters, control-plane
   features, or deployment infrastructure. Re-evaluate only when new evidence changes the
   requirement.
7. **Prove operational transfer:** for a shared workflow, have a second authorized operator use the
   canonical installation from a fresh agent session without the creator's chat history, local
   files, personal credentials, or implicit knowledge.

An interactive skill can be the permanent production operating model for supervised work. A
managed workflow can also remain prompt-, skill-, and tool-driven when no workflow-specific
deterministic logic is warranted.

## Testing By Shape

- One-off task: verify the requested result and disclose evidence limits.
- Reusable skill: static validation plus positive, near-miss, boundary, and side-effect evaluations.
- Shared operational workflow: fresh-session and second-operator handoff validation using only its
  documented inputs and dependencies.
- Deterministic helper: typed unit tests with synthetic fixtures and meaningful failure assertions.
- Managed package: manifest, reference, schema, policy, and fixture tests, plus adapter tests when
  adapters are present.
- Quality loop: verifier unit tests where deterministic, repeated trials, pass and false-pass rates,
  convergence and no-progress behavior, iteration and cost distributions, and escalation tests.
- Explicit graph: node-contract tests, routing and join tests, partial-failure behavior, repeated
  end-to-end trials, and comparison against the simpler single-agent baseline.
- Runner or shared package: strict TypeScript, lint, package coverage, and integration-boundary tests.
- Live external capability: a separate explicitly authorized read-only or synthetic integration
  lane; never an ordinary Git hook or pull-request dependency.

The canonical commands and coverage policy live in [testing and release](../standards/testing-and-release.md).

## Review Questions Before Building

- What exact outcome tells the user or owner that the workflow succeeded?
- What starts the workflow, and must it run when the creator is offline?
- Which systems own the inputs and final business state?
- Which decisions are deterministic, model-assisted, or human-only?
- Can one coherent agent pass satisfy the outcome, and what evidence would justify a quality loop
  or explicit graph?
- If refinement is proposed, what verifier, stopping rule, budget, no-progress signal, and escalation
  path make the loop safe and measurable?
- If multiple agents are proposed, is the work genuinely parallelizable or isolated by context,
  permissions, ownership, or model requirements?
- What identifiers and structured outputs connect the steps?
- What can the workflow read, propose, or write?
- What happens when the same business record is processed twice or concurrently, and which system
  enforces the required invariant?
- What happens on missing evidence, conflicting evidence, stale state, duplicate triggers, timeout,
  partial completion, or ambiguous external writes?
- Does the workflow create derived knowledge, and if so, how are source version, citations,
  freshness, ownership, and stale behavior preserved?
- Can a later external outcome be compared with the original recommendation without collapsing
  source, extraction, model, human, policy, and data-quality failures into one category?
- Does the workflow touch PHI or another sensitive class, and what is the minimum necessary input and
  retained output?
- Who reviews the output, resolves exceptions, and approves side effects?
- Can a second authorized operator reproduce the behavior from canonical instructions without the
  creator's session or machine context?
- What observation would prove that more infrastructure is now justified?

For managed execution, also ask:

- Who is the business owner, technical steward, and backup, and what actionable contact reaches each
  of them when the workflow fails?
- What retention, audit, continuity, support, and escalation requirements apply?

If these questions cannot yet be answered, keep the artifact exploratory or draft. Do not encode
uncertainty as an active unattended workflow.

## Related Documentation

- [Documentation hub](README.md)
- [Repository guide](../AGENTS.md)
- [Managed workflow architecture](codex-managed-workflow-architecture.md)
- [Workflow composition](../standards/workflow-composition.md)
- [Testing and release](../standards/testing-and-release.md)
