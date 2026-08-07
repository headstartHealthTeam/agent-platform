---
name: headstart-agent-workflow-authoring
description: 'Classify, design, scaffold, or evolve a Headstart agent-assisted workflow using the smallest appropriate steady-state shape: one-off Codex task, reusable skill, interactive workflow skill, optional deterministic helper, managed workflow package, or application/platform feature. Use when someone wants to create a recurring Codex workflow, automate a process with MCPs or CLIs, build a persistent or cloud agent, schedule or trigger an agent, or decide what belongs in the Headstart Agent Platform repository.'
compatibility: Requires read access to the Headstart Agent Platform repository for canonical implementation guidance.
metadata:
  author: headstart-health
  version: '0.1.0'
---

# Headstart Agent Workflow Authoring

Choose an operating shape before choosing infrastructure. Preserve successful local Codex behavior
while making only the context that must be shared, tested, or operated durable.

## Load Canonical Guidance

1. Locate a current checkout or authenticated repository view of
   `headstartHealthTeam/agent-skills`.
2. Read the root `AGENTS.md`, `docs/README.md`, and `docs/workflow-authoring-guide.md`.
3. Read `docs/codex-managed-workflow-architecture.md` only when independent managed execution is a
   plausible requirement.
4. Read the standards and package READMEs linked for the selected shape before editing files.

If the canonical repository is unavailable, provide a provisional classification and name the
missing source. Do not invent current manifests, package conventions, runtime capabilities, or
deployment state from this skill alone.

## Establish The Requirement

Determine:

- business outcome and success signal;
- trigger and whether work must continue while the creator is offline;
- source systems, inputs, outputs, and durable identifiers;
- deterministic, model-assisted, and human-only decisions;
- available native connectors, MCPs, APIs, browser operations, and CLIs;
- read, proposal, and write side effects;
- missing, conflicting, duplicate, stale, timeout, and partial-completion behavior;
- data classification and minimum necessary access; and
- the person who reviews the output, resolves exceptions, and approves side effects.

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

## Place Deterministic Support Correctly When Needed

- Use `skills/<name>/scripts/` for a portable helper that supports only that skill.
- Use the owning repository's normal source or script location for supervised helper code tied to
  that repository's artifacts or domain contracts, then expose a bounded CLI or API to the skill.
  Do not create a managed package merely to house that code.
- Use `workflows/<id>/src/` for workflow-specific code when managed execution and deterministic
  support are both justified.
- Use a narrowly named `packages/` workspace for runtime-neutral logic shared by workflows or the
  runner.
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
4. systems of record and capability providers;
5. only the proposed artifacts actually required, organized by repository and path;
6. input, output, handoff, side-effect, and human-review contracts;
7. deterministic, model-assisted, and human responsibilities;
8. test and evaluation plan;
9. deployment and operating requirements when managed execution applies; and
10. local installation or launch behavior and managed consumption behavior when both are supported;
    and
11. unresolved decisions that block safe implementation.

When the user asked only for design, stop before editing. When implementation was requested, follow
the canonical checklist for each selected artifact, scaffold only those artifacts, and run `pnpm qa`
in the platform repository.

## Safety Boundaries

- Tool availability and authentication do not grant permission.
- Do not copy personal credentials, local auth caches, machine paths, PHI, or production records into
  shared artifacts or fixtures.
- Keep external writes explicit and independently authorized.
- A managed workflow may produce a typed proposal; the owning application must revalidate current
  authorization and business state before a consequential write.
- Keep live external validation separate from ordinary Git hooks and pull-request CI.
- Do not add deterministic code merely to make an agent workflow appear production-ready.
- Leave uncertain workflows in an exploratory or draft state rather than encoding assumptions as
  unattended behavior.
