# Choose Tests By The Behavior Being Claimed

The [main skill](../SKILL.md) requires agents to discriminate, not default to mocked unit tests or
install infrastructure in every project. Record the selected layers and why in the repository's
testing guide; link it from `AGENTS.md`.

| Behavior                                                                        | Appropriate evidence                                                                                                    |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Pure calculations, parsing, deterministic decisions                             | Fast unit tests with representative boundaries                                                                          |
| SQL, ORM mapping, constraints, transactions, locking, persistence or migrations | Required integration tests against the actual database engine using suite-owned Testcontainers                          |
| HTTP validation, authentication, dependency wiring, serialization               | Application integration tests, with a real test database when persistence matters                                       |
| External API/MCP adapter                                                        | Synthetic contract tests for requests, responses and failures; separately authorized live smoke tests for actual access |
| Browser behavior or critical user journey                                       | Browser/component or end-to-end tests plus rendered inspection                                                          |
| Model reasoning or skill routing                                                | Behavioral evaluations of outcomes, not substituted by unit coverage                                                    |

A mocked ORM's call sequence does not prove database semantics. Conversely, a script calling a
read-only remote API does not need a database stack merely to demonstrate this standard.

## New TypeScript Database Projects

Use Vitest with the appropriate Testcontainers module, such as `@testcontainers/postgresql`.
Match the deployed engine's major version and relevant extensions, encoding, timezone, or collation.
Choose a reproducible image tag/digest and compatible package version; do not use `latest`, SQLite,
or an in-memory emulator as a substitute for PostgreSQL behavior.

Keep unit tests independent of Docker. Add `test:integration:db` with its own Vitest configuration.
Scope unit and integration discovery so tests do not run in both lanes. Keep imported application
code type-checked; Vitest transpilation alone is not a TypeScript check.

Use Vitest `globalSetup` to start a suite-owned container and returned teardown to stop it. Global
setup executes outside test workers: pass only serializable connection context through typed
`provide`/`inject`, not the live container/client or assumed shared globals. An explicitly owned
per-suite lifecycle is also valid when its isolation cost fits. Use the installed Vitest version's
documented API, not another runner's setup syntax.

Require these invariants:

1. **Ownership:** connect only using details returned by the container this suite started. Do not
   accept the application's normal database URL, load a developer `.env`, or fall back to an existing
   local, shared, staging, or Production database.
2. **Isolation:** use suite-generated database/schema identities and synthetic fixtures. Use dynamic
   ports and Testcontainers' reported host rather than a fixed port or assumed localhost. Run tests
   serially when sharing resets, or isolate databases/schemas per worker before enabling parallelism.
   Isolate separate runs too.
3. **Reset safety:** allow destructive reset only through the harness-owned connection, verify the
   actual database/schema identity, and refuse missing/mismatched ownership. A name or environment
   flag alone is not proof of ownership. Never offer arbitrary destructive SQL as a setup shortcut.
4. **Real schema behavior:** exercise production migrations and entities/repositories with ORM
   synchronization and implicit migration execution disabled. Test representative upgrades from
   explicit synthetic pre-state, and fresh creation where a baseline exists. Do not invent unrelated
   historical schema or use schema sync to hide migration prerequisites.
5. **Honest failure:** startup, migrations, assertions, reset, and teardown failures fail the lane.
   No Docker-detection skip, swallowed failure, or catch returning success. Missing infrastructure
   is a prerequisite to fix, not passing evidence.
6. **Cleanup:** close clients/pools and stop only this run's containers, including setup failure after
   startup. Do not disable the resource reaper or prune unrelated containers.
7. **Safe diagnostics:** use only synthetic data. Retain useful failure and migration context without
   printing private credentials, connection URLs, production rows, or downloaded snapshots.

If application imports initialize external clients, supply inert configuration and fakes for
unrelated providers before initialization. Database tests must not inherit live API credentials or
perform real external writes.

## Scenario And Harness Verification

Select cases from the contract: foreign-key/unique/check constraints, null/default handling,
JSON/date/timezone behavior, transactions and rollback, repeated or concurrent writes, idempotency,
out-of-order updates, pagination/order, and migration upgrades. Retain real-engine regressions for
fixed database defects. `SELECT 1` proves connectivity, not the persistence contract.

Test the harness itself: refuse unmanaged/mismatched targets, demonstrate the expected database
version and migration settings, verify isolation/reset/cleanup, and fail when startup is deliberately
unavailable. Keep the same type-safety standard in fixtures and test doubles.

Retain the package coverage floor. Do not exclude persistence adapters just because integration
tests cover them. Where coverage spans lanes, use a supported report-merging mechanism or combined
coverage run, with distinct output locations and thresholds applied to the complete measured source.
Do not average percentages or let one lane overwrite another's evidence.

## Local And CI Operation

Document supported Docker-compatible runtimes on macOS, Windows, and Linux, the integration command,
and first-run image/network requirements. Follow runtime-specific Testcontainers setup, not a
developer's socket path. Unit QA stays separately runnable. Full pre-push verification for new
database projects also runs integration; retain established repositories' separate command policies.

Run required database integration on a Docker-capable CI runner, normally Linux, and include it in
the stable required aggregate. Reject any result other than success. Docker need not run on every
hosted OS lane merely because lint/types/unit checks are cross-platform. Run integration on PRs and
after promotion to the relevant target, initially without fragile path-based skips. Retain sanitized
failure artifacts and allow explicit startup timeouts.

Synthetic containers are local/CI infrastructure, not authority to access a business system.
External live smoke tests remain separately authorized.

## Headstart Example And API References

Backend revision inspected on 2026-09-05: `b335cdf9140cda2817e4f10a2c081c508fa2d75b`.
It uses **Jest and TypeORM**, not Vitest. Carry over its ownership, schema, and failure invariants,
not runner syntax, fixed names, environment aliases, or type assertions. Do not migrate an
established runner merely to apply a new-project default.

- [Backend policy](https://github.com/headstartHealthTeam/headstart-health-backend/blob/b335cdf9140cda2817e4f10a2c081c508fa2d75b/AGENTS.md)
- [Database harness](https://github.com/headstartHealthTeam/headstart-health-backend/tree/b335cdf9140cda2817e4f10a2c081c508fa2d75b/test/support/database)
- [Harness tests](https://github.com/headstartHealthTeam/headstart-health-backend/blob/b335cdf9140cda2817e4f10a2c081c508fa2d75b/test/integration/database/support/database-harness.integration-spec.ts)
- [Required CI lane](https://github.com/headstartHealthTeam/headstart-health-backend/blob/b335cdf9140cda2817e4f10a2c081c508fa2d75b/.github/workflows/dev.yml)
- [Testcontainers PostgreSQL](https://node.testcontainers.org/modules/postgresql/)
- [Supported runtimes](https://node.testcontainers.org/supported-container-runtimes/)
- [Vitest global setup](https://vitest.dev/config/globalsetup.html)
- [Vitest provided context](https://vitest.dev/config/provide.html)

These optional references do not require a backend checkout. Agent Platform maintainers own this
conditional standard. Recheck APIs on runner/container major upgrades or harness failures, and
validate the target repo's actual schema and behavior before publishing its implementation.
