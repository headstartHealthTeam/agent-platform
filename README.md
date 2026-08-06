# Headstart Agent Skills

Canonical, versioned agent skills and workflow skills for Headstart Health engineering and
operations. The repository uses the open Agent Skills format so the same reviewed source can run in
Codex, Claude Code, Cursor, and other compatible coding agents.

## Why This Repository Exists

Headstart workflows should not depend on one employee's laptop, one agent product, or copied prompt
files that drift independently. This repository separates:

1. integration tools that expose bounded operations;
2. reusable skills that explain one capability;
3. workflow skills that compose capabilities and handoffs; and
4. managed runtimes that schedule work and own durable execution state.

The repository owns layers two and three. It does not replace application code, MCP servers,
business systems of record, project tracking, or runtime infrastructure.

## Included Skills

| Skill                                     | Purpose                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| `deep-pr-review`                          | Generic evidence-backed pull request review method                          |
| `headstart-pr-review-context`             | Headstart repository, Linear, integration, privacy, and side-effect context |
| `headstart-pr-review`                     | Complete Headstart review workflow that composes the two review skills      |
| `headstart-dev-to-main-pr`                | Explicit-only production promotion inventory and PR workflow                |
| `headstart-skill-authoring`               | Authoring and evaluation rules for shared Headstart skills                  |
| `headstart-initiative-shaping`            | Evidence-backed scope, decisions, risks, and stakeholder questions          |
| `headstart-workflow-walkthrough-analysis` | Cited current-state analysis from process demonstrations                    |
| `headstart-document-review`               | Report-first substantive review of shared plans and procedures              |
| `headstart-knowledge-capture`             | Proposed durable updates from verified team learnings                       |
| `headstart-knowledge-refresh`             | Evidence-backed maintenance proposals for stale or overlapping guidance     |
| `headstart-discovery-to-decision`         | Composed workflow from mixed discovery evidence to decision packet          |
| `headstart-skills-update`                 | Install, preview, apply, or schedule complete workstation skill refreshes   |

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
pnpm install --frozen-lockfile
```

For normal complete workstation setup and ongoing refresh, use the repository-owned updater. It
previews by default and refuses dirty, non-`main`, divergent, or unexpected checkouts:

```bash
pnpm skills:update -- --agent codex
pnpm skills:update -- --agent codex --apply --expected-commit <sha-from-preview>
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
pnpm skills:install -- --agent codex --scope user --all --dry-run
pnpm skills:install -- --agent claude-code --scope user --all --dry-run
pnpm skills:install -- --agent cursor --scope user --all --dry-run
```

Remove `--dry-run` after checking the destination. Use `--force` only when intentionally replacing a
previously installed version. Run only the command for the desired host, or repeat it for multiple
hosts. Edit the source repository, not installed copies. This lower-level command does not establish
the ownership receipt used for automatic retirement cleanup and is not the normal team setup path.

Because most users should not need to remember a manual refresh, setup agents must separately offer
the opt-in user-level daily schedule after the initial installation:

```bash
pnpm skills:auto-update -- --enable --agent codex
pnpm skills:auto-update -- --status
pnpm skills:auto-update -- --disable --agent codex
```

The job attempts a refresh at 09:00 local time through user cron on macOS/Linux or Task Scheduler on
Windows. A sleeping or powered-off workstation may miss that attempt and will retry at the next
scheduled time. It requires no administrator privileges and preserves the same repository safety
guards. Approval to install skills does not imply approval to enable this recurring job; ask
explicitly and leave it disabled when the user declines or does not answer. After setup, report the
installed hosts, schedule state, local log location, and disable command.

Contributors who regularly switch branches or edit this repository should keep a separate clean
`main` checkout for automatic refreshes. The scheduler intentionally refuses an authoring checkout
that is dirty or on a feature branch.

GitHub CLI versions that include the preview skill command may install from a reviewed tag instead:

```bash
gh skill install headstartHealthTeam/agent-skills <skill>@<tag> --agent <host> --scope user
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
pnpm install
pnpm qa
```

`pnpm qa` runs formatting, lint, TypeScript checks, unit tests, portable skill validation, evaluation
schema validation, dependency-cycle checks, and the release collector's deterministic fixture suite.
The TypeScript suite enforces 80% minimum coverage for statements, branches, functions, and lines.

`pnpm install` also configures repository-owned Git hooks through Husky:

- **Pre-commit:** verifies lockfile consistency when `package.json` changes, formats and lints staged
  files with `lint-staged`, then runs lint, type checks, unit tests, and skill validation.
- **Pre-push:** requires a clean working tree, checks that the branch is not behind `origin/main` when
  a remote exists, and runs the complete `pnpm qa` suite. This includes a repository-wide
  non-mutating Prettier check.
- **Pre-merge-commit:** installs from the frozen lockfile and runs complete QA before recording a
  local merge commit.

CI runs for every same-repository feature-branch pull request targeting `main` and again after every
push or merge to `main`. It runs the same complete QA suite on Linux, macOS, and Windows, and against
both the minimum Node.js version and the current Node.js release. A separate job audits production
and development dependencies at moderate severity or higher. The stable `Required` check succeeds
only when the full matrix and dependency audit pass and is the status enforced on `main`. Manual
dispatch remains available for recovery and verification, but does not replace either automatic
trigger.

Read [AGENTS.md](AGENTS.md) and the documents under [standards](standards/) before changing a skill.

## Release Policy

`main` contains stable reviewed source. Releases use semantic tags. A skill change must identify its
behavioral and compatibility impact, pass the repository QA command, and include release notes.
Cloud or scheduled runtimes never follow an unreviewed branch automatically.

## Security

Do not place credentials, PHI, production records, private downloaded files, or machine-local paths
in skills, scripts, fixtures, evaluations, or documentation. A skill never grants permission to use
a connector or perform a consequential write.
