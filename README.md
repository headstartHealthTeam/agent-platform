# Headstart Agent Platform

Canonical, versioned agent skills, managed workflow definitions, and Codex execution tooling for
Headstart Health engineering and operations. Portable skills use the open Agent Skills format so
the same reviewed source can run in Codex, Claude Code, Cursor, and other compatible coding agents.

## Why This Repository Exists

Headstart workflow definitions should not depend on copied prompts that drift independently, and
workflows that require independent operation should not depend on one employee's laptop. This
repository separates these composable concerns:

1. integration tools that expose bounded operations;
2. reusable skills that explain one capability;
3. workflow skills that compose capabilities and handoffs;
4. managed workflow packages that make execution requirements explicit; and
5. managed runtimes that schedule work and own durable execution state.

The repository owns layers two through four and the Codex worker code within layer five. The
Headstart backend and admin panel retain control-plane state and user interfaces. This repository
does not replace application code, MCP servers, business systems of record, or project tracking.
These are not sequential maturity levels. Many final team workflows should remain a reviewed skill
or prompt using existing MCPs, APIs, connectors, browser control, or CLIs.

## Start Here

Use the [documentation hub](docs/README.md) as the repository map. If you are designing a new Codex
workflow, agent, or cloud automation, begin with the
[workflow authoring guide](docs/workflow-authoring-guide.md). It helps choose among:

- a one-off supervised agent task;
- one reusable skill;
- an interactive workflow skill that composes skills, MCPs, connectors, or CLIs;
- a code-assisted workflow with deterministic parsing, validation, or transformation;
- a managed workflow package that runs independently of a person's laptop; and
- application or infrastructure changes for durable state, permissions, writes, and user interfaces.

Start with the smallest shape that satisfies the operating requirement. Existing authenticated
capabilities plus a clear skill are often sufficient; managed infrastructure is appropriate when a
workflow needs explicit triggers, service identity, durable state, retries, observability, or
operational ownership. Decide separately whether any workflow-specific calculation,
transformation, validation, or invariant warrants deterministic code.

Also choose one coherent pass, a bounded verifier-driven quality loop, or an explicit graph as a
separate topology decision. Multiple workflow steps do not by themselves justify multiple agents.

After installing the shared skills, a team member can start from any Codex session with a request
such as:

> Use `headstart-agent-workflow-authoring` to recommend and explain the best steady-state design for
> this workflow before we implement it, including whether it needs workflow-specific code or managed
> execution and whether one-pass, loop, or graph topology is justified: [describe the business
> outcome and current manual process].

## Local And Managed Consumption

Most Headstart use of this repository is expected to begin and often remain on team members'
workstations. The updater installs and refreshes the reviewed contents of `skills/` for local Codex,
Claude Code, and Cursor agents so a person can launch and supervise those capabilities from their
normal working context.

The same canonical skills can also be pinned into an organization-managed run. Do not create a
second cloud-specific copy of behavior that already belongs in a portable skill. A business
workflow may offer both a local workflow skill for supervised use and a managed package under
`workflows/` for independent execution; the package should reference the shared skill and add only
the explicit schemas, identity, trigger, policy, ownership, and operating contract required by the
managed context.

A managed package may also be loaded from a repository checkout for local development, synthetic
evaluation, or an intentionally supported supervised launch. It is not installed into a user's
global skills directory. The workstation updater intentionally distributes `skills/` only; managed
deployments use a separate pinned checkout or artifact path. Local and managed are execution
contexts, not competing sources of truth.

## Monorepo Structure

| Path                                   | Responsibility                                                        |
| -------------------------------------- | --------------------------------------------------------------------- |
| `skills/`                              | Portable capabilities and interactive workflow skills                 |
| `workflows/`                           | Deployable workflow prompts, schemas, ownership, triggers, and policy |
| `packages/capability-*/`               | Provider-neutral capability profiles and runtime preflight            |
| `packages/google-*/`                   | Reusable bounded Google read adapters and normalization               |
| `packages/semrush-data/`               | Reusable provider-neutral Semrush read contracts                      |
| `packages/organic-performance-engine/` | Deterministic organic reporting evidence analysis                     |
| `packages/workflow-contracts/`         | Runtime-neutral workflow manifest and run schemas                     |
| `packages/workflow-runtime/`           | Safe package loading, reference resolution, and schema validation     |
| `apps/codex-runner/`                   | Managed Codex SDK execution worker                                    |
| `docs/`                                | Documentation map, workflow design guide, and managed architecture    |
| `standards/`                           | Shared authoring, security, composition, testing, and release rules   |

The pnpm workspace and Turborepo task graph follow the established `new-skunkworks` pattern:
package-local build and test commands, dependency-aware builds, explicit cache outputs, and one root
`pnpm qa` command.

## Included Skills

| Skill                                                                                                | Purpose                                                                                              |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [`bulletin-writer`](skills/bulletin-writer/SKILL.md)                                                 | Provider-portal bulletins with clear actions and grounded Headstart voice                            |
| [`deep-pr-review`](skills/deep-pr-review/SKILL.md)                                                   | Generic evidence-backed pull request review method                                                   |
| [`headstart-agent-workflow-authoring`](skills/headstart-agent-workflow-authoring/SKILL.md)           | Select and design the smallest safe local or managed agent workflow                                  |
| [`headstart-engineering-setup`](skills/headstart-engineering-setup/SKILL.md)                         | Establish typed quality checks, appropriate tests, package boundaries, and repository agent guidance |
| [`headstart-pr-review-context`](skills/headstart-pr-review-context/SKILL.md)                         | Headstart repository, Linear, integration, privacy, and side-effect context                          |
| [`headstart-pr-review`](skills/headstart-pr-review/SKILL.md)                                         | Complete Headstart review workflow that composes the two review skills                               |
| [`headstart-dev-to-main-pr`](skills/headstart-dev-to-main-pr/SKILL.md)                               | Explicit-only production promotion inventory and PR workflow                                         |
| [`headstart-release-pr-review`](skills/headstart-release-pr-review/SKILL.md)                         | Production promotion review gate with critical-risk triage                                           |
| [`headstart-skill-authoring`](skills/headstart-skill-authoring/SKILL.md)                             | Authoring and evaluation rules for shared Headstart skills                                           |
| [`headstart-initiative-shaping`](skills/headstart-initiative-shaping/SKILL.md)                       | Evidence-backed scope, decisions, risks, and stakeholder questions                                   |
| [`headstart-workflow-walkthrough-analysis`](skills/headstart-workflow-walkthrough-analysis/SKILL.md) | Cited current-state analysis from process demonstrations                                             |
| [`headstart-document-review`](skills/headstart-document-review/SKILL.md)                             | Report-first substantive review of shared plans and procedures                                       |
| [`headstart-knowledge-capture`](skills/headstart-knowledge-capture/SKILL.md)                         | Canonical placement for verified learnings and recurring agent corrections                           |
| [`headstart-knowledge-refresh`](skills/headstart-knowledge-refresh/SKILL.md)                         | Evidence-backed audits of knowledge and agent instruction hierarchies                                |
| [`headstart-discovery-to-decision`](skills/headstart-discovery-to-decision/SKILL.md)                 | Composed workflow from mixed discovery evidence to decision packet                                   |
| [`headstart-intake-sla-review`](skills/headstart-intake-sla-review/SKILL.md)                         | Run and hand off the gated Intake SLA Review Queue workflow                                          |
| [`headstart-skills-update`](skills/headstart-skills-update/SKILL.md)                                 | Install, preview, apply, or schedule complete workstation skill refreshes                            |
| [`simulate-provider-perspectives`](skills/simulate-provider-perspectives/SKILL.md)                   | Evidence-backed provider persona evaluation and model calibration                                    |
| [`write-headstart-tone-and-voice`](skills/write-headstart-tone-and-voice/SKILL.md)                   | Write clear audience-facing content in Headstart's voice                                             |
| [`design-headstart-public-website`](skills/design-headstart-public-website/SKILL.md)                 | Design and review Headstart's human, photographic public website                                     |
| [`headstart-content-research`](skills/headstart-content-research/SKILL.md)                           | Build evidence-backed research packets from approved content opportunities                           |
| [`headstart-content-engine`](skills/headstart-content-engine/SKILL.md)                               | Create and revise review-ready Headstart Resource proposals                                          |
| [`organic-performance-reporting`](skills/organic-performance-reporting/SKILL.md)                     | Build evidence-backed organic reports from reproducible source snapshots and agent interpretation    |

## Managed Workflows

| Workflow                                                                             | Status | Purpose                                                             |
| ------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------- |
| [`synthetic-read-only-reference`](workflows/synthetic-read-only-reference/README.md) | Draft  | Disabled synthetic example of the managed workflow package contract |

Managed workflow packages are not installed globally with portable skills. They may be loaded from
a repository checkout for local development, evaluation, or an explicitly supported supervised
run. A managed runner pins an exact repository revision and loads only the workflow selected by the
control plane. Use the
[workflow authoring guide](docs/workflow-authoring-guide.md) to decide whether one is needed, then
read the [managed workflow architecture](docs/codex-managed-workflow-architecture.md) before adding
or promoting it. The [managed runtime completion roadmap](docs/managed-runtime-completion-roadmap.md)
defines the remaining implementation slices and names isolated workflow materialization as the
immediate next step. A bounded compatibility gate then evaluates AgentCore Runtime as the preferred
host for the existing Codex SDK runner, with ECS/Fargate retained as the fallback. The current
implementation is intentionally draft-only: repository validation blocks active workflows until
isolated workspace, skill, tool, and environment materialization is implemented and tested.

## Knowledge Workflow Sources

The knowledge-work skills use connected systems according to their role rather than binding the
portable workflow to one host's tool names:

- Google Docs commonly owns collaborative planning, procedures, and stakeholder response surfaces.
- Gmail provides narrowly scoped communication evidence.
- Linear owns delivery state and tracked implementation work.
- Notion may own team knowledge or planning where the relevant team uses it.
- Repositories and business systems own the behavior and records within their actual boundaries.

Native authenticated connectors are preferred for semantic reads and approved writes. Connector
availability never authorizes broad searches or external changes. Read
[`standards/knowledge-workflow-sources.md`](standards/knowledge-workflow-sources.md) for the complete
source and canonical-destination policy.

## Compatibility Model

`skills/<name>/SKILL.md` is always canonical. Host-specific files are adapters only.

| Host        | Installer selection   | Repository instructions         |
| ----------- | --------------------- | ------------------------------- |
| Codex       | `--agent codex`       | `AGENTS.md`                     |
| Claude Code | `--agent claude-code` | `CLAUDE.md` imports `AGENTS.md` |
| Cursor      | `--agent cursor`      | `AGENTS.md`                     |

The GitHub skill installer is currently a preview convenience. The repository remains valid without
it because every skill follows the open filesystem format.

## Local Installation

The repository includes a cross-platform TypeScript installer so setup does not depend on the
preview GitHub CLI command being present. A setup agent should first confirm the host products the
user actually uses, clone or reuse a clean canonical checkout, and install the locked dependencies:

```bash
corepack pnpm --version
corepack pnpm install --frozen-lockfile
```

The first command must report `9.15.0`, the exact version declared by `packageManager` and enforced
by the repository. Do not change `package.json` or regenerate the lockfile to match an unrelated
global pnpm installation. If `corepack` is unavailable, install the official userland Corepack
package first; Node.js no longer bundles it starting with Node 25.

For normal complete workstation setup and ongoing refresh, use the repository-owned updater. It
previews by default and refuses dirty, non-`main`, divergent, or unexpected checkouts:

```bash
corepack pnpm skills:update -- --agent codex
corepack pnpm skills:update -- --agent codex --apply --expected-commit <sha-from-preview>
```

Run `--apply` only after reviewing the preview, using the exact commit it reports. If `main` advances,
the manual apply refuses the new commit and requires another preview. Repeat with `claude-code` or
`cursor` only for hosts you use. Every update reinstalls the complete canonical skill set, including
edits and newly added skills. It records the exact installed commit and removes only retired skills
that its prior receipt identifies as repository-managed. Unrelated local skills remain untouched.
If the preview reports existing unreceipted skill names, confirm that the user intends to replace
those same-name copies before applying.

The lower-level installer is available only for intentionally selected, project-scoped, or
unmanaged copies:

```bash
corepack pnpm skills:install -- --agent codex --scope user --all --dry-run
corepack pnpm skills:install -- --agent claude-code --scope user --all --dry-run
corepack pnpm skills:install -- --agent cursor --scope user --all --dry-run
```

Remove `--dry-run` after checking the destination. Use `--force` only when intentionally replacing a
previously installed version. Run only the command for the desired host, or repeat it for multiple
hosts. Edit the source repository, not installed copies. This lower-level command does not establish
the ownership receipt used for automatic retirement cleanup and is not the normal team setup path.

Because most users should not need to remember a manual refresh, setup agents must separately offer
the opt-in user-level daily schedule after the initial installation:

```bash
corepack pnpm skills:auto-update -- --enable --agent codex
corepack pnpm skills:auto-update -- --status
corepack pnpm skills:auto-update -- --disable --agent codex
```

The job attempts a refresh at 09:00 local time through user cron on macOS/Linux or Task Scheduler on
Windows. A sleeping or powered-off workstation may miss that attempt and will retry at the next
scheduled time. It requires no administrator privileges and preserves the same repository safety
guards. Setup validates and records a command that resolves the repository's exact pnpm version,
preferring `corepack pnpm` and accepting a direct pnpm executable only when its version matches.
Approval to install skills does not imply approval to enable this recurring job; ask
explicitly and leave it disabled when the user declines or does not answer. After setup, report the
installed hosts, schedule state, local log location, and disable command.

Contributors who regularly switch branches or edit this repository should keep a separate clean
`main` checkout for automatic refreshes. The scheduler intentionally refuses an authoring checkout
that is dirty or on a feature branch.

GitHub CLI versions that include the preview skill command may install from a reviewed tag instead:

```bash
gh skill install headstartHealthTeam/agent-platform <skill>@<tag> --agent <host> --scope user
```

Managed runners should pin an exact tag or commit. The preview GitHub command remains an optional
alternative for installations managed by that preview feature:

```bash
gh skill update --dry-run
```

## Development

Requirements:

- Node.js 22 or newer
- pnpm 9.15
- Python 3.10 or newer for the retained release-note collector

Install and validate:

```bash
corepack pnpm install
corepack pnpm qa
```

`pnpm qa` runs formatting, lint, TypeScript checks, package builds, unit tests, portable skill
validation, managed workflow validation, evaluation schema validation, dependency-cycle checks,
documentation graph validation, and the release collector's deterministic fixture suite. The
TypeScript suites enforce 80% minimum coverage for statements, branches, functions, and lines.

`pnpm install` also configures repository-owned Git hooks through Husky:

- **Pre-commit:** verifies lockfile consistency when `package.json` changes, formats and lints staged
  files with `lint-staged`, then runs lint, type checks, unit tests, and skill validation.
- **Pre-push:** requires a clean working tree, checks that the branch is not behind `origin/main` when
  a remote exists, and runs the complete `pnpm qa` suite. This includes a repository-wide
  non-mutating Prettier check.
- **Pre-merge-commit:** installs from the frozen lockfile and runs complete QA before recording a
  local merge commit.

CI runs for every same-repository feature-branch pull request targeting `main` and again after every
push or merge to `main`. The pnpm setup action reads the exact version from `packageManager`, so CI
and workstation setup share one version source. CI runs the same complete QA suite on Linux, macOS,
and Windows, and against both the minimum Node.js version and the current Node.js release. A separate
job audits production and development dependencies at moderate severity or higher. Complete QA also
scans every non-ignored repository file for credential patterns, including documentation and
configuration outside ESLint's scope. The stable
`Required` check succeeds only when the full matrix and dependency audit pass and is the status
enforced on `main`. Manual dispatch remains available for recovery and verification, but does not
replace either automatic trigger.

Read the [repository guide](AGENTS.md), [documentation hub](docs/README.md), and applicable
[standards](standards/) before changing a skill, workflow, package, or runner.

## Release Policy

`main` contains stable reviewed source. Releases use semantic tags. Skill and workflow changes must
identify their behavioral and compatibility impact, pass the repository QA command, and include
release notes. Cloud or scheduled runtimes never follow an unreviewed branch automatically and must
record the exact repository commit, workflow version, skill revision, and runner image digest.

## Security

Do not place credentials, PHI, production records, private downloaded files, or machine-local paths
in skills, scripts, fixtures, evaluations, or documentation. A skill never grants permission to use
a connector or perform a consequential write. Review the [security policy](SECURITY.md) before
reporting a vulnerability and the
[public repository security contract](docs/public-repository-security.md) before changing repository
or GitHub security controls.
