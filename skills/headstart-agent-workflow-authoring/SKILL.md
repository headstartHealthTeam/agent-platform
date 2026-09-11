---
name: headstart-agent-workflow-authoring
description: 'Classify, design, scaffold, or evolve a Headstart agent-assisted workflow using the smallest appropriate steady-state shape: one-off Codex task, reusable skill, interactive workflow skill, optional deterministic helper, managed workflow package, or application/platform feature. Use when someone wants to create a recurring Codex workflow, automate a process with MCPs or CLIs, build a persistent or cloud agent, schedule or trigger an agent, or decide what belongs in the Headstart Agent Platform repository.'
compatibility: Requires read access to the Headstart Agent Platform repository for canonical implementation guidance.
metadata:
  author: headstart-health
  version: '0.5.0'
  headstart-requires: headstart-engineering-setup
---

# Headstart Agent Workflow Authoring

Choose an operating shape before choosing infrastructure. Preserve successful local Codex behavior
while making only the context that must be shared, tested, or operated durable.

## Load Canonical Guidance

1. Locate a current checkout or authenticated repository view of
   `headstartHealthTeam/agent-platform`.
2. Read the root `AGENTS.md`, `docs/README.md`, and `docs/workflow-authoring-guide.md`.
3. Read `docs/codex-managed-workflow-architecture.md` only when independent managed execution is a
   plausible requirement.
4. Inspect the current package inventory and public interfaces before proposing a new engine,
   provider, adapter, transport, utility, or contract.
5. Read the standards and package READMEs linked for the selected shape before editing files.

If the canonical repository is unavailable, provide a provisional classification and name the
missing source. Do not invent current manifests, package conventions, runtime capabilities, or
deployment state from this skill alone.

## Establish The Requirement

Determine:

- business outcome, success signal, and whether one pass is sufficient;
- trigger and whether work must continue while the creator is offline;
- source systems, inputs, outputs, and durable identifiers;
- deterministic, model-assisted, and human-only decisions;
- existing Agent Platform packages that could satisfy or be safely extended for each deterministic
  or provider capability;
- ownership of every proposed code artifact, including whether it remains independently useful
  without this workflow;
- available native connectors, MCPs, APIs, browser operations, and CLIs;
- read, proposal, and write side effects;
- repeated and concurrent-run behavior, plus the system that enforces collision safety;
- missing, conflicting, duplicate, stale, timeout, and partial-completion behavior;
- sequential dependencies, genuinely independent work, and any context, permission, or model
  boundaries that might justify explicit orchestration;
- any derived rule pack or reference, including its source revision, citations, owner, and freshness
  behavior;
- any external outcome that can later validate the recommendation without rewriting it automatically;
- data classification and minimum necessary access; and
- the person who reviews the output, resolves exceptions, and approves side effects; and
- whether a second authorized operator can run it from canonical instructions without creator-only
  context.

When managed execution is plausible, also determine:

- retention and audit requirements; and
- business owner, technical steward, backup, actionable contacts, and escalation path.

State what is already known, what is inferred, and what requires confirmation. Ask only questions
whose answers materially affect the selected shape or safety boundary.

## Treat The Recommendation As A Steady State

The available shapes are not maturity levels. A skill or prompt using an MCP, API, connector,
browser, or CLI can be the final design for a recurring supervised workflow. Do not manufacture
workflow-specific code or cloud infrastructure merely because a workflow is important or proven.

Decide independently:

- whether execution remains person-launched and supervised or requires managed operation; and
- whether existing skills and tools are sufficient or a bounded behavior requires deterministic
  code and tests.

All four combinations are valid: supervised without custom code, supervised with a tested helper,
managed without workflow-specific code, and managed with deterministic adapters. Revisit the
decision only when evidence or operating requirements change.

When the selected design creates a code repository or explicitly adopts an engineering baseline,
delegate that setup to `headstart-engineering-setup`. It owns typed tooling, risk-appropriate tests,
conditional database integration and monorepo design, hooks, CI, and repository agent instructions.
For code inside an existing repository, preserve and use its established checks; do not recreate
them. For guidance-only workflows, do not invoke engineering setup. If the setup skill is missing,
read its canonical source from Agent Platform or report that prerequisite rather than inventing
its current standard.

## Choose One Pass, A Quality Loop, Or A Graph Separately

Execution topology is independent of supervision, hosting, and deterministic support. Do not treat
one pass, a loop, and a graph as maturity levels.

1. Default to one agent completing one coherent pass when the output can be reviewed or verified
   without iterative refinement.
2. Add a bounded quality loop only when a verifier can identify a repairable failure and provide
   actionable feedback that measurably improves the next attempt.
3. Add explicit graph orchestration only when the workflow has genuine branches, joins, independent
   parallel work, or context, permission, ownership, or model boundaries that benefit from isolated
   nodes and explicit state transitions.

A graph does not require one agent per node. Nodes may be deterministic transformations, agent
calls, human decisions, or application actions. Conversely, a single agent may execute several
skills and tools without becoming a graph. Prefer one coordinator over peer-to-peer agent
coordination unless evaluation demonstrates a need for another topology.

For every proposed quality loop, define:

- the artifact being improved and the verifier's exact pass criteria;
- deterministic checks used before model judgment;
- how verifier feedback changes the next attempt;
- maximum attempts, elapsed time, token or cost budget, and tool calls where measurable;
- a no-progress condition and human escalation path;
- whether a fresh or context-isolated verifier is needed to reduce correlated mistakes; and
- the side-effect boundary, keeping iterative work read-only or proposal-only until approval.

Do not confuse quality refinement with operational retry. Retry handles transient execution failure;
a quality loop revises a completed but inadequate artifact. Never repeatedly execute a consequential
write as a quality-improvement strategy.

Select a multi-agent graph only when the task is demonstrably decomposable or parallelizable, when
specialists need materially different context or permissions, or when explicit routing is itself an
operating requirement. Keep sequential work with tightly shared state in one agent unless repeated
evaluation shows a material quality, latency, or safety improvement from decomposition.

## Reuse One Source Across Execution Contexts

Assume local agent use is the common consumption path. Portable and workflow skills should work
from a team member's installed skill set, which the repository updater can refresh. The same
reviewed skills may also be pinned into managed runs.

When one business workflow needs both local supervised and hosted managed execution, keep shared
behavior in canonical skills and reference it from the managed package. Do not create separate local
and cloud prompt copies. A managed package may support local development, synthetic evaluation, or
an explicit person-launched run from a repository checkout, but it is not installed globally by the
skills updater. Make differences in identity, trigger, side effects, approvals, and runtime policy
explicit.

## Select The Smallest Shape

1. Keep infrequent, exploratory, person-supervised work in the current agent task.
2. Create a reusable skill for one bounded Headstart procedure or judgment contract used across
   people, repositories, or workflows.
3. Create an interactive workflow skill when a person will launch and supervise a repeatable
   sequence of skills, MCPs, connectors, browser operations, or CLIs.
4. Add deterministic code without adding managed infrastructure when repeated parsing,
   calculation, transformation, or validation needs typing and tests.
5. Create a managed workflow package only when the workflow must run independently of a person's
   laptop or requires explicit triggers, service identity, isolated execution, durable state,
   retries, cancellation, observability, or operational ownership.
6. Keep business invariants, durable records, authorization, idempotent writes, deployment, and user
   interfaces in their owning application or infrastructure repository.

Several elements may cooperate. Do not make one prompt, skill, package, or runner own every concern,
and do not scaffold elements that the selected steady state does not need.

A recurring human-launched cadence remains supervised. Treat a schedule or event as a managed
requirement only when it starts work independently of a supervising person.

## Resolve Artifact Boundaries

Do not create one skill per workflow step. Classify each concern before naming artifacts:

- tools, APIs, MCP servers, and CLIs own authenticated operations;
- references own static supporting knowledge and source excerpts;
- reusable skills own independently useful procedures, judgment contracts, or safety boundaries;
- workflow skills own sequencing, handoffs, exceptions, and human decisions;
- deterministic helpers own reproducible parsing, calculation, transformation, or validation; and
- owning applications or services own durable state, authorization, concurrency controls, business
  invariants, and consequential writes.

Extract a skill only when it adds independent reuse, a meaningful input/output contract, or a
separate safety or evaluation boundary. Do not wrap existing tool descriptions or encode an
application invariant in prompt prose.

## Keep Workflow-Owned Artifacts In Agent Platform

Keep the complete workflow implementation in this repository: workflow instructions, component
skills, prompts, references, schemas, evaluations, fixtures, deterministic helpers, engines, and
reusable provider or utility packages. Do not create or depend on a separate repository for code
whose purpose exists only as part of the workflow.

An owning application or service remains external only when it has an independent responsibility,
such as durable business state, authorization, concurrency, idempotent writes, an end-user
interface, or a permission-aware operation. Express it as a declared capability dependency rather
than a second source of workflow logic. If ownership is unclear, keep the artifact in Agent Platform
until an independent application boundary is established.

## Place Deterministic Support Correctly When Needed

- Use `skills/<name>/scripts/` for a portable helper that supports only that skill.
- Use a narrowly named Agent Platform package for a supervised workflow's larger engine when it
  needs package-level typing and tests or is shared by skills or execution contexts. A package does
  not imply managed execution.
- Use `workflows/<id>/src/` for workflow-specific code when managed execution and deterministic
  support are both justified.
- Reuse an existing `packages/` contract when it fits. Extend it only with independently reusable
  behavior that preserves existing consumers; otherwise keep the transform in the consuming engine.
- Use a narrowly named `packages/` workspace for runtime-neutral logic shared by workflows, engines,
  skills, execution contexts, or the runner.
- Use an owning backend or service for triggers, durable state, permissions, business-system writes,
  and invariants.
- Use a bounded MCP tool or CLI when multiple workflows need a stable permission-aware operation.

Use `headstart-skill-authoring` when implementing or materially changing a portable or workflow
skill. That dependency owns skill structure, portability, evaluations, and publication rules; this
skill owns the broader workflow-shape decision.

## Produce A Decision Before Implementation

Summarize:

1. recommended steady-state shape and why alternatives are unnecessary or insufficient;
2. supervised or managed execution, with the operating evidence for that decision;
3. whether workflow-specific deterministic code is needed, with the reliability or invariant that
   justifies it;
4. one-pass, quality-loop, or graph topology, including the measured need and verifier contract for
   any added complexity;
5. systems of record and capability providers;
6. only the proposed artifacts actually required, organized by repository and path;
7. input, output, handoff, side-effect, and human-review contracts;
8. deterministic, model-assisted, and human responsibilities;
9. repeated and concurrent-run behavior, including the enforcing system;
10. context selection, compaction, handoff, and durable-progress behavior when applicable;
11. derived-knowledge provenance and freshness behavior when applicable;
12. test, evaluation, clean-handoff, and outcome-feedback validation plans;
13. deployment and operating requirements when managed execution applies;
14. local installation or launch behavior and managed consumption behavior when both are supported;
    and
15. unresolved decisions that block safe implementation.

When the user asked only for design, stop before editing. When implementation was requested, follow
the canonical checklist for each selected artifact, scaffold only those artifacts, and run `pnpm qa`
in the platform repository.

## Safety Boundaries

- Tool availability and authentication do not grant permission.
- Do not copy personal credentials, local auth caches, machine paths, PHI, or production records into
  shared artifacts or fixtures.
- Keep external writes explicit and independently authorized.
- Treat prompt-level duplicate checks as advisory, not concurrency controls. Keep unsafe writes
  proposal-only until the owning system enforces the required invariant.
- A managed workflow may produce a typed proposal; the owning application must revalidate current
  authorization and business state before a consequential write.
- Do not let observed outcomes automatically rewrite canonical skills, rules, or references. Preserve
  provenance, classify the mismatch, and route changes through review with regression evidence.
- Keep live external validation separate from ordinary Git hooks and pull-request CI.
- Do not add an unbounded refinement loop, self-approval loop, or multi-agent graph without explicit
  verification and stopping behavior.
- Do not add deterministic code merely to make an agent workflow appear production-ready.
- Leave uncertain workflows in an exploratory or draft state rather than encoding assumptions as
  unattended behavior.
