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

| Skill                         | Purpose                                                                     |
| ----------------------------- | --------------------------------------------------------------------------- |
| `deep-pr-review`              | Generic evidence-backed pull request review method                          |
| `headstart-pr-review-context` | Headstart repository, Linear, integration, privacy, and side-effect context |
| `headstart-pr-review`         | Complete Headstart review workflow that composes the two review skills      |
| `headstart-dev-to-main-pr`    | Explicit-only production promotion inventory and PR workflow                |
| `headstart-skill-authoring`   | Authoring and evaluation rules for shared Headstart skills                  |

## Compatibility Model

`skills/<name>/SKILL.md` is always canonical. Host-specific files are adapters only.

| Host        | Installer selection   | Repository instructions         |
| ----------- | --------------------- | ------------------------------- |
| Codex       | `--agent codex`       | `AGENTS.md`                     |
| Claude Code | `--agent claude-code` | `CLAUDE.md` imports `AGENTS.md` |
| Cursor      | `--agent cursor`      | `AGENTS.md`                     |

The GitHub skill installer is currently a preview convenience. The repository remains valid without
it because every skill follows the open filesystem format.

## Local Installation Before A Remote Exists

The repository includes a cross-platform TypeScript installer so setup does not depend on the
preview GitHub CLI command being present. Preview the install for the host you use:

```bash
pnpm skills:install -- --agent codex --scope user --all --dry-run
pnpm skills:install -- --agent claude-code --scope user --all --dry-run
pnpm skills:install -- --agent cursor --scope user --all --dry-run
```

Remove `--dry-run` after checking the destination. Use `--force` only when intentionally replacing a
previously installed version. Run only the command for the desired host, or repeat it for multiple
hosts. The installer copies files into the host's managed skill directory; edit the source
repository, not those copies.

After the organization remote and first release exist, GitHub CLI versions that include the preview
skill command may install from the reviewed tag instead:

```bash
gh skill install headstartHealthTeam/headstart-agent-skills <skill>@<tag> --agent <host> --scope user
```

Managed runners should pin an exact tag or commit. Individual workstations should inspect updates
before applying them:

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

CI runs the same complete QA suite on Linux, macOS, and Windows, and against both the minimum Node.js
version and the current Node.js release. A separate job audits production and development
dependencies at moderate severity or higher.

Read [AGENTS.md](AGENTS.md) and the documents under [standards](standards/) before changing a skill.

## Release Policy

`main` contains stable reviewed source. Releases use semantic tags. A skill change must identify its
behavioral and compatibility impact, pass the repository QA command, and include release notes.
Cloud or scheduled runtimes never follow an unreviewed branch automatically.

## Security

Do not place credentials, PHI, production records, private downloaded files, or machine-local paths
in skills, scripts, fixtures, evaluations, or documentation. A skill never grants permission to use
a connector or perform a consequential write.
