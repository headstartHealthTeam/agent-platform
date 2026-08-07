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

## Consequential Work

Workflow composition does not combine or widen permissions. External writes, PHI access, production
reads, releases, and status transitions retain their normal authorization boundaries at every step.

## Related Guidance

- [Documentation hub](../docs/README.md)
- [Workflow authoring guide](../docs/workflow-authoring-guide.md)
- [Managed workflow architecture](../docs/codex-managed-workflow-architecture.md)
- [Portable skill contract](portable-skill-contract.md)
- [Security and data handling](security-and-data-handling.md)
