# Workflow Composition

## Layers

1. Tools expose bounded reads and writes.
2. Reusable skills explain one capability.
3. Workflow skills sequence capabilities, decisions, and handoffs.
4. Runtime services own triggers, identities, durable state, retries, and observability.

Do not place runtime state or business-system authority inside a skill merely because the skill uses
that system.

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
