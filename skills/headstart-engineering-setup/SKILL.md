---
name: headstart-engineering-setup
description: Establish Headstart engineering standards and repository agent instructions when creating a new code repository, bootstrapping a reusable CLI or automation project, or explicitly adopting the team quality baseline in an existing project. Sets up an appropriate typed toolchain, tests, coverage, formatting, hooks, CI, and a concise repository-specific AGENTS.md. Do not turn ordinary bug fixes, a single lint change, or prompt-only workflows into a repository overhaul.
compatibility: Requires repository read/write and command execution for implementation. The bundled Node/TypeScript example uses pnpm. Other languages and existing frameworks retain appropriate native tooling. Repository-host administration is optional and requires separate authority.
metadata:
  author: headstart-health
  version: '0.2.0'
---

# Headstart Engineering Setup

Make the repository easy for a fresh teammate and their agent to understand, change, and verify.
Produce two connected outcomes: executable quality checks and accurate repository instructions.
Installing libraries or writing a long instruction file alone does not complete setup.

## Scope And Authority

- For a proposal or audit, remain read-only and return the recommended changes.
- For authorized implementation, edit only the selected repository and preserve existing work.
  Follow the active workspace's checkout/worktree procedure before creating branches or editing.
  Never assume a particular person's directory layout or Git anchor.
- Installing dependencies and local configuration is not permission to publish, deploy, modify
  business records, change repository protections, or configure recurring updates.
- Do not change global Git identity, credentials, agent permissions, or another repository.
- Preserve stronger existing standards. A small maintenance request is not permission to install
  this entire baseline, migrate a language, or replace an existing hook manager.

## Establish The Smallest Appropriate Setup

Read the applicable parent and repository instructions, host bridges, manifests, lockfile, source
layout, tests, hooks, CI, and relevant architecture documents. Identify the intended outcome,
language/runtime, supported operating systems, side effects, and owning repository from evidence.
Ask only for unresolved decisions that materially change the result, not approval after every step.

Choose one path:

| Situation                                                  | Action                                                                                                                                              |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| New Node-oriented application, CLI, or reusable automation | Default to strict TypeScript and the baseline below before substantial implementation                                                               |
| New package/helper inside an established repository        | Use and verify its existing checks; extend their coverage to the new location instead of adding competing root infrastructure                       |
| Explicit adoption in an existing project                   | Report the gap, preserve working conventions, and make the approved bounded migration; do not silently weaken thresholds to accommodate legacy code |
| Python, Apex, or another justified native ecosystem        | Retain native tools with equivalent typing/static analysis, behavioral tests, formatting, and CI; do not add Node solely to look compliant          |
| Prompt/skill using existing tools without custom code      | No application scaffold or runtime dependencies; follow skill authoring and behavioral evaluation requirements                                      |

Default to one package. Use a workspace and Turborepo only for meaningful package or application
boundaries; separate teams are not required. For a growing engine, read [monorepo design](references/monorepo-design.md) to
evaluate shared consumers, execution entry points, dependency boundaries, and build/test needs.
Recommend pnpm workspaces and Turborepo when those benefits justify packages; do not wait for an
arbitrary size threshold or split every module into a package. Framework-specific TypeScript module
resolution, browser tooling, deployment, and database checks must fit the project, not a generic
template. A workflow can remain prompt-only
permanently; deterministic code is not a maturity requirement.

## Establish The Engineering Contract

Read [the TypeScript baseline](references/typescript-baseline.md) when applying the Node profile.
It includes self-contained configuration examples and how to adapt them. The active target
repository owns its resulting versioned configuration; the installed skill is setup guidance.

For new TypeScript engineering code:

- Use strict compilation and type-aware linting, including test code and operational scripts.
  Validate untrusted data at boundaries; use typed fixtures and dependency contracts rather than
  `any`, chained assertions, or non-null assertions to conceal mismatches.
- Enforce cognitive complexity at 15, consistent with Agent Platform. Refactor around coherent
  responsibilities, not arbitrary fragments that merely hide branching. There is no universal
  function-line limit in this baseline.
- Use Vitest with at least 80% statement, branch, function, and line coverage for each measured
  package/tooling area. Include unimported source and avoid whole-file exclusions for real logic.
  Test observable behavior and meaningful failures, not assertion counts or coverage alone.
- Use Prettier and one hook manager. Keep staged checks quick; run full deterministic QA before
  pushing and in CI. Never bypass hooks, reduce checks, or suppress real failures to finish.
- Pin the package manager, commit the lockfile, declare actual runtime/tool dependencies, and
  verify the supported Node versions against the tools' engine requirements.
- Keep live API calls, credentials, and production access outside routine hooks and unit CI.
  Add synthetic contract/integration tests; use isolated databases or browser tests when warranted.
  Treat missing integration infrastructure as unverified coverage, not a silently passing test.
- Classify child-process, Git, package-manager, and filesystem-heavy repository-fixture tests as
  integration tests. Give spawned commands a finite timeout and give each such test an explicit
  timeout derived from the slowest supported CI host. Keep the ordinary unit default strict; do not
  drop Windows or repeatedly rerun timeout-only failures instead of repairing the test boundary.

Use one deterministic QA entry point for formatting, lint, types, tests/coverage, and build. For
behavior relying on a database, read [integration test selection](references/integration-testing.md)
and add a required Testcontainers-backed integration lane using the real database engine. Mocked
repositories do not prove queries, transactions, migrations, or constraints. Keep the lane separately
invocable and document the full pre-push verification set; do not silently skip it when Docker is
unavailable. Pure logic and prompt-only projects do not need containers.

CI must run on implementation PRs and again on pushes/merges to the actual stable target branch.
Keep dependency/security audits in an explicit CI lane. A stable required status must depend on all
mandatory lanes, including database integration when applicable, and fail if any fails, is cancelled,
or unexpectedly skips. Existing repositories may intentionally keep integration outside `qa`; retain
their commands while ensuring full verification and the required aggregate include that lane.

Local hooks provide feedback, not an unbreakable security boundary. Verify required CI, independent
human approval, and normal PR-only delivery in the live host settings when read access exists.
Configure them only when authorized. Otherwise give the owner exact remaining settings; never
claim that committing a workflow file has enabled branch protection. Do not weaken protections as
part of this skill, including for initial setup; a user-granted publishing exception remains a
separate operation outside this procedure.

## Author The Repository Guide

Read [repository instruction design](references/repository-instructions.md). Write a concise,
repo-specific `AGENTS.md`, usually around 100-150 useful lines or fewer, rather than copying Agent
Platform's entire guide. Include non-obvious boundaries, verified commands, evidence expectations,
and links to the smallest useful deeper sources. Do not reproduce the dependency manifest or a
generic programming tutorial.

Preserve existing instructions and reconcile overlap before editing. Keep one canonical guide,
with thin host bridges where necessary. Do not overwrite a substantive `CLAUDE.md`, create drifting
copies, or require teammates to share one person's vault, credentials, or workstation paths.

Make startup and verification observable: document synthetic inputs, configuration variable names,
safe startup/dry-run commands, expected output, and how to diagnose failures when applicable.
For write-capable automation, establish target identity, append/update semantics, idempotency,
partial-failure behavior, redacted diagnostics, and recovery in the appropriate code and runbook.
For UI work, include real-browser inspection. Do not invent successful live verification.

## Verify And Hand Off

1. Install with the declared toolchain; create a lockfile for a new project or preserve the existing
   frozen-lockfile workflow. Confirm the full QA command succeeds without creator-only context.
2. In disposable synthetic fixtures, introduce a type error, unsafe promise, excessive complexity,
   formatting drift, and an untested source module. Confirm the corresponding gates fail for the
   intended reason. Never pollute the real repository or Git identity with fixture configuration.
3. Verify hooks are installed and exercised, and inspect CI dependency wiring. Check the supported
   operating-system paths. For process-heavy integration tests, verify both command-level and test-
   level timeouts against the slowest supported CI host. Local success does not establish unrun
   remote or cross-platform checks.
4. Check instruction links and documented commands. Have a fresh agent, when available, orient from
   the repository guide and complete a bounded synthetic change without the creator's transcript.
   Grade its actual changes and verification, not a claim that it read the guide. Record the host,
   model when available, baseline revision, task, observed result, and any limitation.
5. Re-run the instruction overlap check and inspect the final diff for leaked local paths, secrets,
   unrelated changes, disabled rules, placeholder instructions, and unjustified dependencies.

If verification fails, distinguish an implementation defect from missing infrastructure or access.
Repair the former within scope. Report the latter precisely, complete unaffected work, and do not
manufacture evidence or weaken the gate. Avoid repeated identical attempts without new evidence.

Return the chosen project shape, changes, key commands, verified results, meaningful exceptions,
and remaining human/remote actions. Do not report setup complete with required gates unverified.
Normal skills refresh updates this skill and its examples only; it must not silently rewrite
consumer repositories. Future adoption is an explicit, reviewable repository change.

## References

- [TypeScript baseline and example files](references/typescript-baseline.md)
- [Repository instruction design](references/repository-instructions.md)
- [Integration test selection and Testcontainers](references/integration-testing.md)
- [Monorepo decision and Turborepo standards](references/monorepo-design.md)
- [Agent Platform examples and primary research](references/examples-and-sources.md)

The bundled baseline is sufficient without an Agent Platform checkout. Its repository links are
optional examples, not runtime dependencies. Keep project-specific decisions in the target repo.
