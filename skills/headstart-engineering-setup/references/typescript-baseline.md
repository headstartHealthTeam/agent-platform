# TypeScript Engineering Baseline

This is Headstart's opinionated baseline, not a claim that one stack fits every language or product.
Use it for new Node-oriented code; preserve appropriate framework conventions and stronger existing
checks. The [main skill](../SKILL.md) owns scope, approval, and completion requirements.

## Start From Executable Examples

The [Node TypeScript example directory](../assets/node-typescript/) contains configuration, not an
application generator. Read and adapt the relevant files into the selected repository with normal
editing tools. Do not recursively overwrite an existing project. No script creates a repository,
changes global configuration, or publishes anything on the user's behalf.

| File                                                                       | Purpose                                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [package.json](../assets/node-typescript/package.json)                     | Tool dependencies, pinned pnpm, supported Node range, focused/full QA commands |
| [tsconfig.json](../assets/node-typescript/tsconfig.json)                   | Strict type checks covering source, tests, scripts, and Vitest configuration   |
| [tsconfig.build.json](../assets/node-typescript/tsconfig.build.json)       | Compile production source without shipping tests                               |
| [eslint.config.mjs](../assets/node-typescript/eslint.config.mjs)           | Typed lint, promise safety, complexity, imports, and narrow test exceptions    |
| [vitest.config.ts](../assets/node-typescript/vitest.config.ts)             | Behavioral test discovery and explicit coverage of all source/scripts          |
| [.prettierrc.json](../assets/node-typescript/.prettierrc.json)             | Consistent formatting                                                          |
| [.prettierignore](../assets/node-typescript/.prettierignore)               | Generated output and lockfile exclusions                                       |
| [lint-staged.config.mjs](../assets/node-typescript/lint-staged.config.mjs) | Staged-only ESLint fixes and formatting                                        |
| [.gitattributes](../assets/node-typescript/.gitattributes)                 | Stable LF line endings across machines                                         |
| [.npmrc](../assets/node-typescript/.npmrc)                                 | Enforce the declared runtime and package-manager engines                       |
| [.gitignore](../assets/node-typescript/.gitignore)                         | Generated files and private local material                                     |
| [pre-commit](../assets/node-typescript/.husky/pre-commit)                  | Staged lint/format checks                                                      |
| [pre-push](../assets/node-typescript/.husky/pre-push)                      | Clean working tree and full QA                                                 |
| [run-pnpm.sh](../assets/node-typescript/.husky/run-pnpm.sh)                | Shared hook launcher preferring the manifest-selected Corepack pnpm            |
| [CI example](../assets/node-typescript/.github/workflows/qa.yml)           | Cross-platform QA, dependency audit, and aggregate required status             |

Rename the example package and tailor source paths and entry points. Add the real implementation
and its tests; do not create vacuous tests or enable `passWithNoTests` to turn an empty scaffold
green. Add runtime dependencies to the package that uses them, not to devDependencies by accident.
The example needs no registry-private package or Agent Platform installation.

The tool ranges are a tested starting point, not an evergreen claim about latest versions. They are
tested against Agent Platform's lockfile; the target repository must resolve its own dependencies,
commit its own lockfile, and run its own QA. Keep Vitest and its coverage provider compatible.
Review major upgrades deliberately. Never edit package versions to accommodate the wrong global
package manager on someone's machine.

For a new project, use the exact pnpm version from `packageManager` through Corepack when available,
or install that version through the supported pnpm procedure. Confirm the version before installing.
Use a normal install to create the first lockfile, then frozen installs in CI and validation.
Do not require Corepack to be preinstalled on every supported Node distribution.

## Preserve The Important Invariants

- Strict TypeScript includes unchecked-index and exact-optional-property checks, unknown catch
  values, exhaustive control flow, and unused-code checks. Keep public contracts explicit.
- Treat external API responses, JSON, environment/configuration, and model output as untrusted.
  Parse/validate before assigning domain types; a cast is not validation. Use an existing schema
  library when appropriate rather than adding a new one by default.
- Ban explicit `any`, unsafe typed operations, non-null assertions, and chained assertions that
  pretend an incompatible value fits. Tests must meet the same type standard. Prefer typed factories,
  `satisfies`, or narrow dependency interfaces over casting a partial fake into a complete service.
- Handle asynchronous failures explicitly. Do not hide an unhandled promise behind `void`, an empty
  catch, or an unrelated fallback result. Distinguish a legitimate empty response from a failed read.
- Cognitive complexity is an error above 15. The metric concerns branching/nesting, not line count.
  Extract a coherent named responsibility when it helps; do not fragment code just to pass a metric.
- Preserve dependency direction and package exports. Add specific import-boundary restrictions when
  real module boundaries exist; do not manufacture layers or publishable packages to justify them.
- A lint exception needs a narrow scope, a concrete reason, and review. Do not lower repository-wide
  rules, exclude tests wholesale, or add unbounded suppression comments.

## Adapt To The Actual Project

The example uses Node ESM/NodeNext. A Vite/Next.js or other bundled application should use its
framework's appropriate module settings, JSX mode, types, browser globals, and build command while
retaining strictness. Its `.tsx` and nested source must still enter lint, types, tests, and coverage.
Add browser/component testing for UI behavior; a Node test environment is not browser verification.

Use a single package until multiple actual applications/libraries justify a monorepo. For a
monorepo, use pnpm workspaces, explicit `workspace:*` dependencies, package exports, and a Turbo task
graph reflecting real build dependencies. Each code package gets its own checks and coverage floor;
one well-tested package must not hide another's untested implementation. Shared setup files should
have one owner. Consult the Agent Platform links in
[examples and sources](examples-and-sources.md), not a copied application architecture.

In an existing project, retain its package manager and framework unless a migration is explicitly
approved. Extend existing hooks rather than installing a second manager. If existing debt prevents
adoption, identify the affected scope and propose remediation; do not silently lower standards or
present a temporarily partial migration as complete.

## Testing And Feedback

Use real behavior assertions and regressions for meaningful boundary conditions: invalid input,
missing/conflicting data, time boundaries, partial failures, and repeated execution when relevant.
Keep ordinary tests synthetic and deterministic. Use actual isolated databases when testing
transaction or query semantics; do not substitute a mock for the behavior being claimed.

For database behavior, apply [integration testing](integration-testing.md): Vitest plus
Testcontainers for new TypeScript projects, preserving the existing runner in established repos.
Add the separately invocable integration command to full local verification and required CI.
The Node-only example intentionally does not install a database stack for every consumer.

The minimum coverage floor is 80% for statements, branches, functions, and lines. Explicitly include
source that tests never import. Exclude generated declarations and tests, not real modules or every
file called `index`. Higher-risk code needs stronger scenario coverage, not merely a higher number.
Do not reward assertion counts, constant-return tests, or broad snapshots as proof of correctness.

For agents, make failures actionable: name the failed invariant, module, and useful next check.
Document startup, safe configuration, redacted diagnostics, and a representative synthetic input
and output where applicable. A bug fix should demonstrate the failing case before the correction
and preserve it as a regression. A complex task needs a bounded plan; a trivial fix does not need a
new planning subsystem. Add specialist review or iterative model grading only for a demonstrated
need, with clear acceptance and stopping criteria.

The example's pre-commit runs staged lint/format only. The pre-push hook runs the same `qa` command
as CI. Add cheap repo-specific commit checks when useful, but keep credentialed live checks and
registry audits out of the local gate. Husky's lifecycle setup must succeed; do not mask failures
with `|| true`. Git supplies a shell on Windows; keep substantial helper logic in a declared
cross-platform runtime, not platform-specific shell utilities.

For a database-enabled project, extend pre-push to run its required integration command as well as
`qa`, or use a documented full-verification wrapper. Respect existing separate-lane policies, but
never pretend unit QA proves database behavior. Missing Docker is a failed or unverified lane.

## CI And Repository Protection

Adapt the example's `main` filters to the real delivery model, including `dev` where applicable.
Do not impose Agent Platform's single-main delivery on an application that uses promotion branches.
Run all mandatory deterministic checks on PRs and again after merges/pushes to the stable target.
Use supported OS/runtime lanes appropriate to the repo; shared developer tooling should cover
Windows, macOS, and Linux. Use exact compatible runtime versions when a project requires them.

The aggregate `Required` job uses `always()` and rejects any required job result other than
`success`. Keep all mandatory lanes in its dependencies. An upstream skipped job must not make the
aggregate pass. Retain a manual dispatch for recovery, not as a substitute for automatic triggers.

CI gets read-only permissions by default. Never use `pull_request_target` with untrusted checkout
and privileged credentials as a shortcut around fork or Dependabot restrictions. Verify applicable
organization policy and approvals instead. Keep deployment permissions and approved credentials in
separate, explicitly authorized workflows. Ordinary QA must not access Production.

When remote administration is authorized, configure PR-only delivery, required checks from the
intended CI app, at least one independent human approval, stale-approval handling, conversation
resolution, and restricted bypasses/force pushes. Inspect actual merge methods and target rules;
do not assume tool defaults. Report any parent-policy limitation without claiming it is configured.
Skill setup never grants authority to waive these rules or to merge its own work.

## Maintaining The Baseline

Agent Platform owns these examples and their regression tests. The tests exercise invalid code,
unimported coverage, hooks, and compatibility with the platform's core policy. When changing a core
rule or toolchain there, update the examples and tests together if the portable contract changes.
Record intentional framework differences rather than copying the entire platform toolchain.
Consumer repositories own their applied configuration. Skill updates do not migrate those files.
