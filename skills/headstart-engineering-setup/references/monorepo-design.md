# Decide When A Monorepo Helps

Use this reference from the [main skill](../SKILL.md) when a growing engine or new project has
multiple credible package boundaries. A monorepo is an organizational choice, not a maturity badge.

## Decision Signals

Prefer pnpm workspaces and Turborepo when several signals apply:

- Multiple real applications or entry points share maintained code, such as a CLI and a worker.
- Domain logic or contracts have independent consumers and a stable, testable public interface.
- Connectors and execution code need distinct runtime dependencies, tests, or deployment packaging.
- Coordinated changes across these components benefit from one review and atomic source revision.
- Dependency-aware builds, scoped verification, and caching would reduce repeated actual work.

Stay single-package when there is one deployable program, its modules change together, and exports
would add ceremony rather than meaningful boundaries. File count or one long script is not enough:
first separate coherent modules, then introduce packages if consumers/ownership justify them.

State the reason and rejected alternative briefly. Do not ask a non-engineer to invent a package
architecture when the code and intended outcome provide enough evidence to recommend one.

## A Possible Engine Shape

For an engine with reusable policy logic, integrations, and independent execution entry points,
one possible layout is domain/contracts under `packages/`, actual connectors under `packages/`,
and a CLI or worker under `apps/`. Only create components required now; no empty runner, shared
utility package, database service, or framework layer in anticipation of future needs.

Keep dependency direction explicit: domain logic must not import the CLI/worker or concrete
provider credentials. Entrypoints compose adapters with narrow contracts. Keep business-system
authority with its owning service. Packages need not be published to a registry or independently
deployed to be useful.

## Configuration Standards

- Use one root lockfile and pinned pnpm version, workspace globs for the real packages, and explicit
  `workspace:*` internal dependencies. Every package declares the runtime and build/test tools it
  actually consumes. Do not rely on accidental hoisting or a sibling's dependencies.
- Export narrow supported entry points through package exports. Do not reach across a package's
  source tree with relative paths or undeclared deep imports. Enforce actual dependency boundaries
  with lint/configuration rather than requiring a universal architectural pattern.
- Share compiler/lint/format policy where it reduces drift. Preserve framework-appropriate module
  resolution and test environments. Do not force one bundler or one runtime on dissimilar apps.
- Give each code package appropriate build, lint, types, test, coverage, and cleanup commands, and
  retain coverage floors per measured package. Root QA must include the whole required task graph,
  not merely whichever workspace the agent happened to edit.
- Define Turbo dependencies from how packages are consumed. Use upstream builds when consumers
  resolve built exports; do not require them when a supported source-resolution strategy makes that
  unnecessary. Verify the actual clean-checkout build and type-check order.
- Cache only reproducible tasks with complete file/environment inputs and declared outputs. Never
  cache live verification, deployment, destructive cleanup, or database integration whose external
  lifecycle must actually execute. Include schema/migrations and relevant environment inputs in
  tasks whose results depend on them. Do not cache secrets or private runtime artifacts.
- Keep development servers persistent and uncached. Avoid putting watch tasks in CI or a finite
  pre-push graph. Check cache behavior after changing a dependency, schema, or relevant configuration.
- Use the same explicit database-integration standard as a single package when applicable, with
  container ownership and no silent skips. Add the lane to the required aggregate even when it is
  intentionally outside ordinary cached unit QA.

## Migration And Verification

For an existing engine, make an approved incremental migration. Preserve its CLI commands, output
contracts, authentication boundaries, and operational runbook. Move one real boundary at a time,
update imports and packaging, and prove equivalent behavior with tests before deleting old paths.
Do not change scheduling, business logic, or deployment architecture just to reorganize files.

Verify a clean locked install; dependency-ordered build/types; all package QA; runtime resolution
from built artifacts where applicable; meaningful invalid cross-package imports; required CI
aggregation; and cache invalidation. A successful root build with stale `dist` folders is not proof.

Keep root `AGENTS.md` a short routing map. Package READMEs explain contracts and commands and link
back to the documentation hub. Add nested instructions only for genuine local differences.

## Agent Platform Examples

Reviewed revision: `6fe414107120ca2b2d633d0dc74f52b13c98a6ff` on 2026-09-05. These examples inform
the structure; they do not require the managed Codex runner or its contracts in another engine.

- [Workspace definition](https://github.com/headstartHealthTeam/agent-platform/blob/6fe414107120ca2b2d633d0dc74f52b13c98a6ff/pnpm-workspace.yaml)
- [Turbo tasks](https://github.com/headstartHealthTeam/agent-platform/blob/6fe414107120ca2b2d633d0dc74f52b13c98a6ff/turbo.json)
- [Root orchestration](https://github.com/headstartHealthTeam/agent-platform/blob/6fe414107120ca2b2d633d0dc74f52b13c98a6ff/package.json)
- [Package exports and commands](https://github.com/headstartHealthTeam/agent-platform/blob/6fe414107120ca2b2d633d0dc74f52b13c98a6ff/packages/workflow-contracts/package.json)
- [Turborepo: task configuration](https://turborepo.com/docs/crafting-your-repository/configuring-tasks)
- [Turborepo: caching](https://turborepo.com/docs/crafting-your-repository/caching)

Agent Platform maintainers own this guidance. Revalidate on package-boundary changes, Turbo or
package-manager upgrades, and stale-cache failures. Current target behavior and tested contracts
take precedence over a historical example. Record deliberate deviations rather than copying blindly.
