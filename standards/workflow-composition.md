# Workflow Composition

## Composable Elements

- Tools expose bounded reads and writes.
- Reusable skills explain one capability.
- Workflow skills sequence capabilities, decisions, and handoffs.
- Managed workflow packages declare deployable prompts, schemas, tools, ownership, and policy.
- Runtime services own triggers, identities, durable state, retries, and observability.

These elements are not maturity levels. Use only the elements required by the operating model. A
recurring interactive workflow may remain a skill using existing tools permanently. Managed
execution and workflow-specific deterministic code are independent choices: either supervised or
managed execution can use guidance and existing tools alone or add focused tested support.

Do not place runtime state or business-system authority inside a skill merely because the skill uses
that system.

## Repository Cohesion And Reuse

Agent Platform owns the complete executable definition of an agent workflow. Its workflow skill or
managed package, supporting skills, prompts, schemas, evaluations, fixtures, workflow-specific code,
engines, and shared provider or utility packages belong in this repository. Do not split canonical
workflow instructions and their deterministic implementation across Agent Platform and a separate
workflow repository.

Another application or service remains an external dependency only when it owns the capability
independently of the workflow: durable business state, authorization, concurrency, idempotent writes,
an end-user interface, deployment, or a permission-aware API. The workflow consumes that capability
through a declared versioned boundary; the external repository is not a second workflow source.

Before adding an engine, adapter, provider, transport, utility, or contract, inspect the existing
package inventory and public interfaces. Reuse a compatible package. Extend one only when the added
behavior remains independently reusable and preserves existing consumers. Create a new shared
package only for a coherent cross-workflow or cross-engine contract; keep workflow-specific fields
and transformations in the consuming engine.

## Choose The Right Artifact Boundary

- A tool, API, MCP server, or CLI owns bounded authenticated operations and their permission model.
- A reference owns supporting knowledge, examples, templates, or checklists; it does not activate or
  orchestrate behavior by itself.
- A reusable skill owns one independently useful Headstart procedure, judgment contract, or safety
  boundary.
- A workflow skill owns sequencing, handoffs, exception behavior, and human decisions across
  capabilities.
- A deterministic helper owns parsing, calculation, transformation, or validation that benefits
  from reproducibility and focused tests.
- An owning application or service owns durable state, authorization, concurrency controls,
  business invariants, and consequential writes.

A workflow step does not need its own skill merely because it is a separate step. Extract a skill
when the capability is independently reusable, has a meaningful input/output contract, or needs a
separate safety or evaluation boundary. Keep workflow-specific procedure in the workflow skill and
static supporting material in references. Do not create a skill that only repeats a tool's existing
operation descriptions.

## Shared Source Across Execution Contexts

Most shared skills and workflow skills are consumed from employees' local agents through the
workstation updater. The same canonical skills may also be pinned into managed runs. Local and
managed consumers must reference one reviewed behavior source rather than maintain separate prompt
copies.

When the same business workflow supports both contexts:

- keep shared reasoning, evidence rules, and handoffs in portable skills;
- keep managed identity, triggers, durable state, retries, and policy in the managed package and
  runtime;
- express genuine context differences as explicit inputs, policies, or adapters;
- test the common behavioral contract in both supported contexts; and
- load managed packages locally from a checkout for development or supervised execution rather than
  installing them into global skill directories.

The skills updater distributes `skills/` only. It is not a managed-package deployment mechanism.

## When Managed Execution Is Selected

A local or interactive workflow should become managed only when independent execution is an actual
requirement. The implicit workstation context must then be converted into an explicit package
contract with typed input and output, immutable skill references, named owners, tool and side-effect
policy, timeout and retry behavior, data classification, and synthetic evaluation. Copying a prompt
to a cloud host is not a managed operating model.

Managed workflow orchestration belongs under `workflows/`. Portable interactive composition remains
under `skills/`. Shared deterministic code belongs under `packages/`; system-of-record writes and
idempotency remain with the owning backend or service.

A managed package may execute only prompts, skills, and approved existing tools. Add
workflow-specific adapters or shared deterministic libraries only when a concrete transformation or
invariant requires them.

## Dependency Contract

A workflow skill declares required skills in the string-valued
`metadata.headstart-requires` field. The body must also state:

- which behavior each dependency owns;
- the order or condition under which it is used;
- the identifier or structured output passed between steps;
- the failure and retry behavior; and
- whether the workflow stops, degrades, or asks for human input when a dependency is unavailable.

Dependency graphs must be acyclic. A shared capability cannot depend on a business workflow that
consumes it.

## Execution Shape

Composition does not require one agent per skill. Default to one agent executing a clear sequential
workflow. Add parallel workers or subagents only when tasks are genuinely independent, context
isolation is valuable, or repeated evaluation shows a material quality or latency benefit.

Keep planning and completion visible to the user. A workflow must not hide missing dependencies,
failed handoffs, reduced evidence coverage, or partial completion behind orchestration.

## Control-Flow Topology

Choose one-pass execution, a bounded quality loop, and explicit graph orchestration independently
from choosing supervised or managed execution. None is a maturity level.

- Use one coherent agent pass when one reasoning context can complete the work and the result can be
  reviewed or verified afterward.
- Use a quality loop only when a verifier has explicit acceptance criteria, returns actionable
  feedback, and repeated evaluation shows refinement improves the outcome.
- Use an explicit graph for real branches, joins, parallel work, or context, permission, ownership,
  or model isolation. A graph node may be deterministic code, an agent call, a human decision, or an
  application action; do not create one agent per workflow step.

Every quality loop must declare the artifact, verifier, pass criteria, maximum attempts, applicable
time, token, cost, and tool-call budgets, no-progress behavior, escalation path, and side-effect
boundary. Prefer deterministic graders, then narrowly scoped model graders calibrated against human
judgment. Keep iterative work read-only or proposal-only until a person or owning application
authorizes a consequential action.

Operational retries repeat failed infrastructure operations according to retry policy. Quality
loops revise completed artifacts according to acceptance criteria. Do not combine them into one
ambiguous attempt counter, and never refine by repeatedly executing an external write.

For graph handoffs, define a typed payload and the minimum context the next node needs. Preserve
source identity, decisions, failures, and verifier evidence; compact or discard irrelevant history
to control cost, context degradation, and sensitive-data retention. Default multi-agent graphs to a
coordinator that owns synthesis. Peer-to-peer coordination requires specific evaluation evidence.

## Repeated And Concurrent Runs

For every shared workflow, define whether repeating the same run or launching multiple runs against
the same business record is harmless. A write-capable workflow must identify its unit of work,
deduplication or idempotency key, append-versus-overwrite behavior, stale-read behavior, and the
system that enforces collision safety.

Prompt instructions such as checking whether another person ran recently are advisory, not a lock.
When concurrent or repeated execution could corrupt, duplicate, or overwrite business state, require
the owning application or permission-aware tool to enforce idempotency, version checks,
compare-and-set behavior, a lease, or an equivalent invariant. Until that exists, keep the workflow
read-only or proposal-only and require a person to perform the final action through the owning
system.

## Consequential Work

Workflow composition does not combine or widen permissions. External writes, PHI access, production
reads, releases, and status transitions retain their normal authorization boundaries at every step.

## Related Guidance

- [Documentation hub](../docs/README.md)
- [Workflow authoring guide](../docs/workflow-authoring-guide.md)
- [Managed workflow architecture](../docs/codex-managed-workflow-architecture.md)
- [Portable skill contract](portable-skill-contract.md)
- [Security and data handling](security-and-data-handling.md)
