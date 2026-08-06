# Headstart Agent Skills Repository Guide

This repository is the canonical source for reusable Headstart agent skills and workflow skills.
The source must remain usable from Codex, Claude Code, Cursor, and other hosts that implement the
open Agent Skills format.

## Repository Purpose

- Store reusable team capabilities under `skills/`.
- Define how bounded skills compose into Headstart workflows.
- Validate activation, behavior, portability, safety, and cross-platform scripts before release.
- Publish reviewed, versioned skills that individual workstations and managed runtimes can install.

Do not use this repository for application code, project status, meeting notes, machine-local agent
preferences, or copied repository instructions. Those remain in their owning systems.

## Source Of Truth

- `skills/<name>/` is the canonical source for a published skill.
- Installed copies under `.agents/skills`, `.claude/skills`, `.cursor/skills`, or user home
  directories are deployment artifacts, not editable sources.
- `AGENTS.md` is the canonical repository instruction file.
- `CLAUDE.md` is a thin compatibility bridge and must not duplicate these instructions.
- `standards/` owns shared authoring, composition, security, capability, testing, and release rules.
- GitHub owns current branches, pull requests, reviews, releases, and tags once a remote exists.

## Structure

```text
skills/<skill-name>/
  SKILL.md                 # Portable canonical instructions
  agents/openai.yaml       # Optional Codex/ChatGPT adapter metadata
  evals/evals.json         # Activation and behavior cases
  scripts/                 # Optional deterministic helpers
  references/              # Optional detailed guidance
  assets/                  # Optional output resources
```

Only `SKILL.md` is universally required. Host adapters may add metadata or invocation controls, but
they must never redefine the portable workflow.

## Authoring Rules

- Load `headstart-skill-authoring` before creating or materially changing a shared skill.
- Follow the open Agent Skills specification. Skill directory and frontmatter names must match.
- Write required capabilities, inputs, outputs, side effects, failure behavior, and handoffs
  explicitly.
- Describe capabilities rather than hard-coding host-specific MCP, plugin, or connector identifiers.
- Use relative paths within a skill. Never commit machine-local paths.
- Keep `SKILL.md` under 500 lines and use one-level-deep references for detailed material.
- Put repository-specific coding conventions in the owning application's `AGENTS.md`, not here.
- Consequential workflows must require explicit user intent and preserve external-write approvals.
- Declare workflow dependencies in `metadata.headstart-requires` as a comma-separated string.
- Do not create circular dependencies or make a bounded capability depend on a business workflow.

Read the standards before authoring:

- `standards/portable-skill-contract.md`
- `standards/workflow-composition.md`
- `standards/tool-capabilities.md`
- `standards/security-and-data-handling.md`
- `standards/testing-and-release.md`

## Cross-Agent Compatibility

- The portable source may not require Codex-only, Claude-only, or Cursor-only syntax.
- `agents/openai.yaml` is optional adapter metadata and is not part of another host's contract.
- Claude Code consumes the same repository instructions through `CLAUDE.md` importing `AGENTS.md`.
- Cursor and compatible agents consume `AGENTS.md`; `.cursor/rules` is not a second canonical copy.
- A host-specific feature may be used only as an optional enhancement with a documented fallback.
- When a required capability is unavailable, fail clearly. Never claim an operation was completed.

## Scripts

- Add scripts only when deterministic behavior materially improves reliability or avoids repeated
  implementation.
- Prefer TypeScript for new substantial scripts. A retained script in another cross-platform
  runtime must declare that runtime, remain tested, and have a concrete migration cost that exceeds
  its current benefit.
- Never place credentials, tokens, PHI, production records, or downloaded private artifacts in
  fixtures.
- Scripts that can write to external systems must default to dry-run behavior and require an
  explicit write flag plus user authorization.

## Commands

Use pnpm and the checked-in lockfile:

```bash
pnpm install
pnpm lint
pnpm check-types
pnpm test
pnpm format:check
pnpm validate:skills
pnpm qa
```

`pnpm qa` is the canonical local and CI validation command.

## Quality Rails

- Keep TypeScript in strict mode. Do not weaken a repository-wide compiler or lint rule to make one
  change pass; correct the implementation or use the narrowest documented exception when the rule
  cannot represent a deliberate boundary.
- Treat ESLint errors and Prettier drift as blocking. The lint configuration includes strict typed
  rules plus promise, import, security, secret-detection, complexity, and consistency checks.
- Maintain at least 80% statement, branch, function, and line coverage for the measured TypeScript
  source. Coverage is a floor, not a substitute for assertions that exercise meaningful behavior.
- Keep tests synthetic, deterministic, cross-platform, credential-free, and independent of network
  services. Place live or host-specific validation in an explicitly separate lane if it is ever
  introduced.
- Keep `pnpm-lock.yaml` synchronized with `package.json`. Install with the checked-in pnpm version and
  use `pnpm install --frozen-lockfile` in CI and validation contexts.
- `pnpm qa` must remain the single full local/CI quality command. Add new mandatory checks there
  rather than creating undocumented release-only commands.

## Git Hooks

- Husky owns repository hooks. Do not introduce a second hook manager.
- Pre-commit uses `lint-staged` to run ESLint auto-fixes and Prettier writes only on staged supported
  files, followed by the fast deterministic `pnpm qa:commit` lane.
- Pre-push requires a clean tree, rejects branches behind `origin/main` when that ref exists, and runs
  full `pnpm qa`, including repository-wide `prettier --check`.
- Pre-merge-commit installs from the frozen lockfile and runs full QA.
- Hooks must work in the shell environment Git provides on macOS, Linux, and Windows. Do not add
  credentials, live API calls, production reads, or host-specific absolute paths to a hook.
- Never bypass hooks merely to publish a failing change. If an emergency requires `--no-verify`, the
  reason and equivalent completed validation must be documented in the pull request.

## Testing

- Every skill needs positive, near-miss, and boundary cases in `evals/evals.json`.
- Test deterministic scripts with fixtures that do not require credentials or network access.
- Validate workflow dependency names and cycles.
- Treat agent output as nondeterministic: run activation and behavior evaluations repeatedly when
  changing descriptions or orchestration.
- Cross-agent testing must verify the same behavioral contract, not identical wording.

## Git And Releases

- `main` is the stable source branch for this repository. Feature branches target `main`.
- Use conventional commits and never force-push.
- Do not commit generated installation metadata or installed skill copies.
- Pull requests must identify affected skills, behavior changes, compatibility impact, evaluations,
  and script validation. Include a `## Release Notes` section.
- Branch protection requires the aggregate `Required` CI check. That job must continue to depend on
  the complete cross-platform quality matrix and dependency audit, so matrix changes do not silently
  weaken the stable required-check contract.
- Release reviewed changes with semantic tags. Workstations may follow a reviewed release; managed
  runtimes must pin an exact tag or commit.
- Do not publish, tag, push, create a PR, or update external systems without explicit user approval.

## Security

- Tool availability does not authorize data access or writes.
- Never commit secrets, credentials, tokens, PHI, production records, or sensitive output.
- Skills must inherit the active repository and organization policies for PHI, production access,
  side effects, and review approvals.
- A skill may narrow permissions but must never silently widen them.
