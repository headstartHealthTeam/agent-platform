# Headstart Agent Platform Repository Guide

This repository is the canonical source for reusable Headstart agent skills, managed workflow
definitions, shared workflow contracts, and the Codex managed runner. Portable skill source must
remain usable from Codex, Claude Code, Cursor, and other hosts that implement the open Agent Skills
format.

## Repository Purpose

- Store reusable team capabilities under `skills/`.
- Define how bounded skills compose into Headstart workflows.
- Store deployable managed workflow packages under `workflows/`.
- Maintain runtime-neutral workflow and run contracts under `packages/`.
- Maintain the managed Codex execution worker under `apps/codex-runner/`.
- Validate activation, behavior, portability, safety, and cross-platform scripts before release.
- Publish reviewed, versioned skills and workflow artifacts that workstations and managed runtimes
  can consume through their separate installation paths.
- Keep every workflow-owned artifact in this repository: instructions, skills, prompts, schemas,
  evaluations, fixtures, workflow-specific code, engines, and reusable provider or utility packages.

Do not use this repository for application code, project status, meeting notes, machine-local agent
preferences, or copied repository instructions. Those remain in their owning systems.
Do not create or depend on a separate repository for code whose only owner and consumer is an Agent
Platform workflow. An external application or service may remain a declared dependency only when it
owns behavior independently of the workflow, such as durable business state, authorization,
idempotency, a user interface, or a permission-aware operation.

## Start Here

Before creating files for a new agent task or automation:

1. Read [`docs/README.md`](docs/README.md) for the repository and documentation map.
2. Read [`docs/workflow-authoring-guide.md`](docs/workflow-authoring-guide.md) and select the smallest
   durable shape that satisfies the operating requirement.
3. Read only the standards and package documentation linked for that shape.
4. Confirm the source systems, trigger, inputs, outputs, human decisions, side effects, failure
   behavior, data classification, and owner before implementing unattended behavior.

Do not assume that a new request needs a managed workflow. A one-off Codex task, reusable skill, or
interactive workflow skill using existing MCPs, native connectors, browser control, or CLIs is often
the correct solution. Add deterministic code when reproducibility or enforced invariants justify it.
Add a managed package only when execution must be independent of an employee laptop or needs
explicit triggers, service identity, durable state, retries, observability, or operational ownership.
Treat those as independent design decisions, not a maturity ladder. Any selected shape may be the
correct permanent operating model. State why workflow-specific code is or is not warranted, state
why execution should remain supervised or become managed, and create only the artifacts required by
those decisions.

## Source Of Truth

- `skills/<name>/` is the canonical source for a published portable skill.
- `workflows/<id>/` is the canonical source for one deployable managed workflow.
- `packages/workflow-contracts/` owns manifest and durable run schemas.
- `packages/workflow-runtime/` owns safe workflow-package loading, reference resolution, and JSON
  Schema validation used during authoring and execution.
- `apps/codex-runner/` owns Codex execution policy and SDK integration.
- Installed copies under `.agents/skills`, `.claude/skills`, `.cursor/skills`, or user home
  directories are deployment artifacts, not editable sources.
- Workstation refreshes use the repository-owned `skills:update` workflow. Its local receipt owns
  only the copied skills it records and must never be used to remove unrelated skills.
- Most team consumption is local and person-supervised. The same canonical skill source may also be
  pinned into managed runs; never fork shared behavior into separate workstation and cloud copies.
- A managed workflow package may support local development, synthetic evaluation, or an explicitly
  designed supervised launch from a repository checkout. It remains a package, not a globally
  installed skill, and the workstation updater must not distribute it.
- `AGENTS.md` is the canonical repository instruction file.
- `CLAUDE.md` is a thin compatibility bridge and must not duplicate these instructions.
- `standards/` owns shared authoring, composition, security, capability, testing, and release rules.
- `docs/README.md` is the canonical documentation index.
- `docs/workflow-authoring-guide.md` owns the workflow-shape decision process.
- `docs/codex-managed-workflow-architecture.md` owns the managed runtime design and current
  implementation boundary.
- `docs/managed-runtime-completion-roadmap.md` owns the ordered implementation work required to
  reach the first operational managed workflow.
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

```text
workflows/<workflow-id>/
  workflow.yaml            # Ownership, runtime, trigger, tool, and policy contract
  package.json             # Workspace identity
  README.md                # Purpose, boundaries, and operating notes
  prompts/                 # Managed entry prompts
  schemas/                 # Input and output JSON Schemas
  fixtures/                # Valid synthetic input and output contract examples
  src/                     # Optional workflow-specific deterministic adapters
  evals/evals.json         # Synthetic happy-path, boundary, and failure cases
```

A workflow skill and a managed workflow are different artifacts, but they may represent two
execution contexts for the same business workflow. The former is installed for an interactive
agent; the latter supplies the explicit operational contract needed for unattended execution and
may also expose a local development or supervised entry point from its checkout. Put shared
reasoning and procedure in the portable skill and reference it from the package rather than copying
prompt behavior between the two artifacts.

## Authoring Rules

- Load `headstart-skill-authoring` before creating or materially changing a shared skill.
- Load `headstart-engineering-setup` when establishing a new code repository or explicitly adopting
  the engineering baseline. Existing packages inherit their owning repository's checks; do not
  turn an ordinary feature or prompt-only workflow into a tooling migration.
- Load `headstart-agent-workflow-authoring` before classifying or designing a new recurring,
  persistent, scheduled, event-triggered, or cloud agent workflow.
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
- Do not scaffold empty helpers, packages, adapters, or managed runtime artifacts in anticipation of
  a future need. Add them only when the current operating requirement justifies them.
- When one workflow supports both local and managed execution, keep shared guidance in canonical
  skills, make execution-context differences explicit, and test that both consumers honor the same
  behavioral contract. Do not maintain separate prompt forks.
- Before adding an engine, adapter, transport, provider, utility, or contract, inspect the current
  package inventory and public interfaces. Record a reuse, extend, or create decision; prefer an
  existing compatible contract, and extend a shared package only when the added behavior remains
  independently reusable rather than workflow-specific.
- When a skill must be selected proactively from a broader task, do not assume installation alone
  guarantees invocation. Include a minimal persistent-routing reference, keep the detailed behavior
  in the skill, and verify fresh-session discovery from representative launch locations.

Read the standards before authoring:

- `standards/portable-skill-contract.md`
- `standards/workflow-composition.md`
- `standards/tool-capabilities.md`
- `standards/knowledge-workflow-sources.md`
- `standards/security-and-data-handling.md`
- `standards/testing-and-release.md`

Use [`docs/workflow-authoring-guide.md`](docs/workflow-authoring-guide.md) before choosing whether the
artifact belongs under `skills/`, `workflows/`, `packages/`, or an owning application repository.

### New Skill Publication Checklist

Creating `skills/<name>/SKILL.md` is not the complete publication workflow. Before a new shared
skill is ready for review:

1. add the canonical `SKILL.md` with matching directory and frontmatter names;
2. add `evals/evals.json` with positive, near-miss, and safety or boundary coverage;
3. add optional `agents/openai.yaml`, scripts, references, and assets only when they improve the
   portable contract;
4. declare every composed-skill dependency in `metadata.headstart-requires` and in the workflow
   body;
5. add the skill and its purpose to the README `Included Skills` table;
6. update standards or compatibility documentation only when the shared contract actually changes;
7. add and evaluate minimal persistent-routing guidance when future sessions must invoke the skill
   proactively from broader work;
8. test deterministic helpers and every affected operating-system path; and
9. run `pnpm qa` and include the behavior and compatibility impact in the pull request.

The repository validator enforces README inventory parity so a skill cannot silently ship without
being discoverable. Do not add a second skill manifest to avoid this checklist.

### New Managed Workflow Checklist

Before a managed workflow can be reviewed:

1. add `workflows/<id>/workflow.yaml` with an id matching the directory;
2. add package metadata, README, entry prompt, and input/output schemas;
3. declare real business and technical owners, plus a backup and actionable contact for each before
   activation, rather than copying synthetic example owners;
4. declare every skill, MCP server, CLI command, trigger, sandbox, network, retry, and side-effect
   requirement;
5. add schema-valid input/output fixtures plus happy-path and boundary evaluation definitions, and
   test deterministic adapters when the workflow actually has them;
6. add the workflow to the README `Managed Workflows` table;
7. keep lifecycle `draft` until immutable skill and runtime versions, deployment decisions, and the
   repository's active-workflow capability gate are available;
8. document approval, idempotency, failure, rollback, PHI, retention, and observability behavior;
9. run `pnpm qa`; and
10. identify any required coordinating backend, admin-panel, and infrastructure changes in the pull
    request, or state explicitly that existing shared platform capabilities are sufficient.

Do not promote a local prompt by copying its current machine context. Convert implicit credentials,
files, tools, approvals, and judgment into explicit managed-workflow policy.

### New Package Or Runner Checklist

Before adding a shared package or changing the runner:

1. inspect the current package inventory and public interfaces, then document why the change reuses,
   extends, or creates a package;
2. confirm that new or extended shared behavior is independently reusable or belongs to the
   execution boundary rather than one skill or workflow;
3. define a narrow typed public contract and keep business-system authority in its owning service;
4. add package-local build, lint, check-types, test, coverage, format, and clean commands when the
   workspace contains TypeScript source;
5. declare internal dependencies with `workspace:*` and external runtime dependencies in the
   consuming package;
6. add synthetic tests and package-level coverage thresholds;
7. document purpose, boundaries, failure behavior, and links back to the documentation hub;
8. update the Turborepo task graph only when a new repository-wide task class is required; and
9. run `pnpm qa`.

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
- Skill-local TypeScript helpers and their `*.test.ts` files are covered by the root lint,
  type-check, test, and coverage lanes. Keep them under `skills/<name>/scripts/`; do not create a
  workspace package merely to obtain QA coverage.

## Commands

Use the exact pnpm version declared in `packageManager` and the checked-in lockfile. Bootstrap with
`corepack pnpm --version` and require it to report the declared version before installation. If a
different global pnpm appears on `PATH`, use Corepack or correct the workstation setup; never edit
the manifest or lockfile merely to accommodate that global installation.

```bash
corepack pnpm install
corepack pnpm lint
corepack pnpm check-types
corepack pnpm test
corepack pnpm format:check
corepack pnpm validate:docs
corepack pnpm validate:skills
corepack pnpm validate:workflows
corepack pnpm build
corepack pnpm qa
```

`pnpm qa` is the canonical local and CI validation command.

## Quality Rails

- Keep TypeScript in strict mode. Do not weaken a repository-wide compiler or lint rule to make one
  change pass; correct the implementation or use the narrowest documented exception when the rule
  cannot represent a deliberate boundary.
- Treat ESLint errors and Prettier drift as blocking. The lint configuration includes strict typed
  rules plus promise, import, security, secret-detection, complexity, and consistency checks.
- Maintain at least 80% statement, branch, function, and line coverage for every measured TypeScript
  package and root tooling. Coverage is a floor, not a substitute for assertions that exercise
  meaningful behavior.
- Keep tests synthetic, deterministic, cross-platform, credential-free, and independent of network
  services. Place live or host-specific validation in an explicitly separate lane if it is ever
  introduced.
- Keep `pnpm-lock.yaml` synchronized with `package.json`. Install with the checked-in pnpm version and
  use `pnpm install --frozen-lockfile` in CI and validation contexts.
- Keep `packageManager` and `engines.pnpm` on the same exact version. CI derives its pnpm version from
  `packageManager`; do not add a second independently maintained workflow pin.
- `pnpm qa` must remain the single full local/CI quality command. Add new mandatory checks there
  rather than creating undocumented release-only commands.
- Package manifests must declare the build and test tools they invoke instead of depending on
  accidental root-level binary availability. Keep repository-wide policy and versions coordinated
  from the root lockfile.
- Canonical documents under `docs/` and `standards/` must be reachable from `docs/README.md`.
  Package, application, and managed-workflow READMEs must link back to that hub. Keep local Markdown
  files and heading anchors valid and run the documentation validator through `pnpm qa`.

## Git Hooks

- Husky owns repository hooks. Do not introduce a second hook manager.
- Pre-commit uses `lint-staged` to run ESLint auto-fixes and Prettier writes only on staged supported
  files, followed by the fast deterministic `pnpm qa:commit` lane.
- Pre-push requires a clean tree, rejects branches behind `origin/main` when that ref exists, and runs
  full `pnpm qa`, including repository-wide `prettier --check`.
- Pre-merge-commit installs from the frozen lockfile and runs full QA.
- Hooks must work in the shell environment Git provides on macOS, Linux, and Windows. Do not add
  credentials, live API calls, production reads, or host-specific absolute paths to a hook.
- Never bypass repository hooks. Do not use `--no-verify`, set `HUSKY=0`, change or unset
  `core.hooksPath`, rename or disable hook files, or invoke lower-level Git commands to avoid a hook.
- When a hook fails or is unavailable, stop and repair the cause. Running an equivalent command
  manually may help diagnose the failure, but it does not authorize publishing around the hook.
- Tests and subprocesses that create temporary Git repositories must remove inherited
  repository-local Git environment variables before invoking Git. They must never write fixture
  identities or other test configuration into this repository's common or bare Git configuration.
- Preserve LF line endings through the root `.gitattributes` across every supported platform. Do not
  solve Windows formatting failures by weakening Prettier or removing a Windows validation lane.

## Testing

- Every skill needs positive, near-miss, and boundary cases in `evals/evals.json`.
- Every managed workflow needs schema-valid fixtures, happy-path and policy-boundary evaluation
  definitions, deterministic adapter tests where applicable, and representative repeated model
  evaluation evidence before activation.
- Test deterministic scripts with fixtures that do not require credentials or network access.
- Validate workflow dependency names and cycles.
- Treat agent output as nondeterministic: run activation and behavior evaluations repeatedly when
  changing descriptions or orchestration.
- Cross-agent testing must verify the same behavioral contract, not identical wording.

## Documentation Maintenance

- Prefer links to one canonical explanation over copied prose that will drift.
- Update the root README for repository-level capabilities and human onboarding; update this file
  for contributor and coding-agent behavior.
- Add each new canonical document under `docs/` or `standards/` to `docs/README.md`.
- Link package and workflow READMEs to the documentation hub, the authoring guide when relevant, and
  their direct architectural dependencies.
- Keep current implementation status in the managed architecture document or package README rather
  than repeating it across standards.
- Do not put volatile branch, pull-request, deployment, or ticket status in durable documentation.
- Run `pnpm validate:docs` after moving or renaming Markdown files; full QA runs it automatically.

## Git And Releases

- `main` is the stable source branch for this repository. Feature branches target `main`.
- Use conventional commits and never force-push.
- Do not commit generated installation metadata or installed skill copies.
- Pull requests must identify affected skills, behavior changes, compatibility impact, evaluations,
  and script validation. Include a `## Release Notes` section.
- The full CI workflow must run for every same-repository feature-branch pull request targeting
  `main` and again for every push or merge to `main`. Keep `workflow_dispatch` as a recovery path,
  never as a substitute for either automatic trigger. Cancel stale PR runs only; never cancel a
  `main` run when another `main` update arrives.
- Branch protection requires the aggregate `Required` CI check. That job must continue to depend on
  the complete cross-platform quality matrix and dependency audit, so matrix changes do not silently
  weaken the stable required-check contract.
- Release reviewed changes with semantic tags. Workstations may follow protected `main` through the
  opt-in updater or install a reviewed skill release; managed runtimes must pin an exact tag or
  commit and record the workflow version and runner image digest.
- The workstation updater installs only `skills/`. It must never copy managed workflow packages,
  runner code, infrastructure, or workflow credentials into a user's global skill directory.
- A local launcher or evaluation may load a managed package from an explicit repository checkout.
  That path must validate the same package contracts and policies as hosted execution and must not
  turn `skills:update` into a workflow deployment mechanism.
- When helping a person install these skills, separately offer the user-level daily refresh after
  installation. Enable it only after explicit opt-in; never infer recurring-update approval from
  installation approval. Automatic runs must retain all checkout and installation safety guards.
- A workstation setup agent must report which host skill directories it installed, then ask a
  direct follow-up question about daily refresh. If the user opts in, configure only the hosts they
  approved and report the schedule, state location, log location, and disable command. If the user
  declines or does not answer, leave scheduling disabled.
- Do not publish, tag, push, create a PR, or update external systems without explicit user approval.

## Security

- Tool availability does not authorize data access or writes.
- Never commit secrets, credentials, tokens, PHI, production records, or sensitive output.
- Skills must inherit the active repository and organization policies for PHI, production access,
  side effects, and review approvals.
- A skill may narrow permissions but must never silently widen them.
