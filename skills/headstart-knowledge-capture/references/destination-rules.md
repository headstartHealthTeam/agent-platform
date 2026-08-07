# Knowledge Destination Rules

Choose by ownership and future retrieval, not by whichever tool is currently open.

## Repository Instruction

Use the owning repository's `AGENTS.md` or closest scoped instruction file for a rule that should
apply to every relevant coding task, such as canonical commands, code conventions, validation, or a
repeated agent mistake. Keep it concise and pair mechanically enforceable rules with code, linting,
tests, hooks, or CI.

## Shared Skill

Use the Headstart Agent Platform repository's `skills/` directory for a repeatable Headstart
procedure or domain capability that has a recognizable trigger, explicit inputs and outputs, stable
boundaries, and value across users or repositories. Do not create a skill merely to store facts.

## Managed Workflow

Use a managed package in the Headstart Agent Platform only when a proven workflow must run
independently of an employee laptop or requires explicit triggers, service identity, durable run
state, retries, observability, or operational ownership. Keep person-supervised composition as a
workflow skill and keep business-system authority in the owning application.

## Application Code Or Configuration

Use code, schemas, validation, migrations, feature flags, or controlled runtime configuration for
business invariants and behavior that must be enforced deterministically.

## Google Docs Or Notion

Use the team's approved collaborative system for policies, procedures, planning, decision records,
or reference material owned outside one codebase. When both contain similar material, identify the
canonical owner before writing and link from the secondary surface.

## Approved Knowledge Repository

Use the organization's approved durable knowledge system for cross-project concepts, terminology,
people or team context, initiative history, and curated operational knowledge. Preserve links to the
live systems that own volatile state.

## Linear

Use an issue for actionable work with an owner, state, priority, and completion condition. Link to the
canonical knowledge artifact instead of copying its full contents into the issue.

## Gmail Or Slack

Use communication systems to communicate or recover evidence. They are not the preferred durable
home for a learning. Summarize an approved conclusion into its owning system and retain only the
necessary source link or attribution.

## Do Not Persist

Do not preserve a learning when it is:

- unverified speculation;
- temporary execution status;
- a machine-local workaround with no team value;
- already covered accurately and discoverably;
- raw sensitive content that can remain in its protected source; or
- better enforced mechanically than documented.
