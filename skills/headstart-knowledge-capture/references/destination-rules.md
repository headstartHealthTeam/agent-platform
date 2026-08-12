# Knowledge Destination Rules

Choose by ownership and future retrieval, not by whichever tool is currently open.

## Recurring Behavior Decision

Before adding agent instructions, identify the behavior and choose the strongest appropriate owner:

1. **Deterministic enforcement** for behavior that code, schemas, configuration, permissions,
   tests, linting, hooks, or CI can reliably enforce.
2. **Instructions** for judgment, coordination, tool choice, safety boundaries, or conventions that
   cannot be fully mechanical.
3. **A reusable skill** for a recognizable multi-step procedure with stable inputs, outputs,
   boundaries, and value across contexts.
4. **A runbook or reference** for detailed, infrequent operational material that should be loaded
   only when triggered.
5. **A knowledge system** for durable facts, concepts, decisions, and context rather than commands.
6. **No persistence** for unverified, temporary, already-covered, or non-reusable observations.

Documentation may explain deterministic enforcement, but it must not be the only control when a
reliable mechanical guard is practical.

## Instruction Scope

Discover the actual host and repository conventions before choosing a path. The following are
semantic layers, not required filenames or directories:

| Layer                                 | Use when                                                                             | Avoid                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| User-level preference                 | One person's agent behavior should apply across unrelated workspaces                 | Committing personal paths or preferences as team policy               |
| Workspace or organization instruction | Coordination, safety, or ownership spans several repositories or domains             | Copying repository-specific implementation rules upward               |
| Repository instruction                | Every relevant task in one repository needs the rule                                 | Embedding long operational procedures or volatile state               |
| Subtree instruction                   | A genuinely narrower module or directory has different rules                         | Creating a nested file merely to override an accidental contradiction |
| Shared skill                          | A stable procedure should be reusable across users, repositories, or supported hosts | Using a skill as a fact database or a substitute for enforcement      |
| Runbook or reference                  | Detailed material is needed only for a recognizable operation                        | Loading the full procedure into every task                            |
| Knowledge system                      | People or agents need durable context, terminology, decisions, or relationships      | Treating knowledge prose as an executable policy owner                |

If a setup has no workspace root, knowledge system, compatibility bridge, or other listed layer,
use the smallest applicable layer that actually exists. Do not scaffold a new information
architecture merely to store one correction.

## Instruction Hierarchy Audit

Before editing instructions:

1. Inventory the applicable user, workspace, repository, subtree, host adapter, skill, runbook, and
   deterministic-enforcement artifacts.
2. Determine precedence, inheritance, and import behavior from the actual tools in use. Do not
   assume `AGENTS.md`, `CLAUDE.md`, Cursor rules, or any other filename is universally canonical.
3. Search for the same rule and nearby rules that could conflict. Distinguish a contradiction from
   an intentional narrower scope.
4. Choose one canonical owner. Make other host files thin imports, bridges, or links when the host
   supports that model.
5. Keep always-loaded instructions limited to durable triggers, boundaries, and routing. Move
   examples, command cookbooks, troubleshooting, and rare procedures behind on-demand references.
6. Identify whether the target is local-only or shared. Follow the owning repository's normal
   review and release process for shared changes.

After editing, reread the applicable hierarchy as a fresh agent would. Verify that precedence is
unambiguous, references resolve, safeguards remain intact, and the new rule reaches the intended
tasks without burdening unrelated ones.

## Repository Instruction

Use the owning repository's canonical or closest scoped instruction file for a rule that should
apply to every relevant coding task, such as canonical commands, code conventions, validation, or a
repeated agent mistake. Keep it concise and pair mechanically enforceable rules with code, linting,
tests, hooks, or CI. Determine the canonical filename from the repository and supported agent hosts
rather than imposing one host's convention.

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
