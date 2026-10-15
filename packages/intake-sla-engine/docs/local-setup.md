# Local Intake runtime setup

This is the supervised Intake SLA workflow. Agent Platform owns both its canonical
`headstart-intake-sla-review` skill and its typed runtime. The former standalone Intake repository
is the pinned migration reference, not a runtime dependency. This setup does not run a live review,
activate a schedule, enable Fireflies reuse, or authorize publication.

## Install the reviewed revision

1. Select the reviewed Agent Platform revision designated for operation. Follow the organization's
   repository/worktree procedure; do not implement changes in a stable checkout.
2. Require Node 22+ and the repository-pinned Corepack pnpm version (`9.15.0`). From that checkout,
   install the frozen lockfile and run the complete acceptance lane:

   ```sh
   corepack pnpm --version
   corepack pnpm install --frozen-lockfile
   corepack pnpm qa
   ```

3. Package to a **new absolute directory outside the source checkout**, with an existing real
   parent directory:

   ```sh
   corepack pnpm intake:package --target <absolute-new-runtime-directory>
   ```

   The packager assembles the actual built workspace dependency closure and performs a pinned,
   frozen, offline production install. Use the same pnpm store that was populated by the source
   install. An unavailable cached dependency is a provisioning failure, not permission to omit it
   or change the lockfile. No private configuration, credentials, source checkout, or original
   Intake repository is copied. The workbook vendor library remains separately provisioned.

4. Inspect `runtime-receipt.json`: source revision, dirty-source flag, package version, lock hash,
   workspace closure and artifact fingerprint. A dirty development artifact is not a reviewed
   release. Record the receipt with the operator's setup evidence.
5. Invoke `node <absolute-runtime-directory>/dist/cli.js` from outside either checkout. In the
   commands below and other packaged docs, `headstart-intake-sla` means that installed entrypoint;
   a host may expose its package bin on PATH. No global npm install or creator-specific path is
   required. Run:

   ```sh
   headstart-intake-sla review:validate
   ```

   With no run directory this executes the packaged full compiled synthetic suite and distribution
   check, without providers or private inputs. It runs in a bounded child selecting production
   package exports; a prior test receipt is not substituted for execution.

6. Install the reviewed skill through Agent Platform's normal skills updater. That updater copies
   skills only, not this runtime. Confirm both versions independently in a fresh agent session.

This package preserves evidence engine `2026-09-22.2` and the interpretation bindings from the
approved Intake reference `15b66ac3904fec49c42d60496ff6000cc8f3c60b`. The runtime package version is
`0.1.0`; operator skill `0.3.0` describes this location. Package revision and engine binding version
serve different purposes: do not relabel old evidence or interpretation receipts during migration.

## Workbook dependency

Provision the organization's approved `@oai/artifact-tool` through the active host's dependency
loader or approved installation. Set `SLA_ARTIFACT_TOOL_PATH` to its actual entry module, or use
package resolution including `NODE_PATH`. The runtime does not download or redistribute it.

```sh
headstart-intake-sla review:runtime-preflight
headstart-intake-sla review:workbook-runtime-smoke --output-dir <new-synthetic-output-directory>
```

The smoke creates, exports and reimports a synthetic workbook, renders the existing previews and
checks formulas. It is setup acceptance, not a new daily business gate. Record the vendor version
and loader identity separately; the resolver receipt cannot prove a vendor version. Normal report
build and validation retain their existing workbook checks.

## Private inputs and capabilities

Keep private inputs and all run artifacts outside Git and the runtime artifact. Use owner-only
storage (equivalent account-restricted ACLs on Windows) on the approved encrypted volume. Obtain
these values through the existing secure handoff, not from another operator's machine paths:

| Input                                    | Purpose                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| `SLA_CLIENT_IDENTITY_ALIASES_PATH`       | Exact private client registry; never infer aliases.                    |
| `SLA_PROVIDER_IDENTITY_ALIASES_PATH`     | Exact private provider/roster registry.                                |
| `SLA_PRODUCTION_FINGERPRINT_PATH`        | Separately approved Production automation baseline.                    |
| `SLA_SPREADSHEET_ID`                     | The existing approved publication target.                              |
| `SF_TARGET_ORG`, `SF_EXPECTED_ORG_ID`    | Host-local alias/username plus actual approved Production identity.    |
| `SLA_RUN_DIR`, `RUN_AT`                  | Private run directory and exact frozen assessment cutoff.              |
| `SLA_GENERATION_LEDGER_PATH` when needed | Explicit protected prior ledger; existing frozen-baseline rules apply. |

`review:build` accepts explicit `--client-registry` and `--provider-registry` paths instead of the
corresponding environment variables. Drift/preparation accept `--fingerprint` as an alternative.
No credentials belong in these files or in a shared `.env`.

Use the existing direct, read-only Salesforce Organization probe before diagnosing expired login.
The shared Salesforce adapter verifies actual org identity again before business reads and exposes
no writes. An alias alone never proves Production. Authorize the required native Fireflies, Slack,
Portal and Google capabilities under the [operator handoff](operator-handoff.md). A Node runtime
cannot invoke a desktop connector merely because the agent has it: use the documented injected
callback interfaces or the existing native-read/protected-capture sequence in
[recovery adapters](recovery-adapters.md). Both preserve the same source receipts and gates.

For API interpretation use `SLA_AI_INTERPRETATION=on`,
`SLA_INTERPRETER_PROVIDER=openai-responses`, and `SLA_INTERPRETER_MODEL=gpt-5.6-sol`.
The approved host's AWS profile, region and secret ID are explicit private inputs to
`review:interpret-with-aws --action preflight|interpret`; the key is injected only into the child.
Do not use an inherited key, print it, or persist it. Synthetic preflight must pass with the exact
structured, non-storing contract before transcript transmission. Fresh current-run Codex
interpretation remains the documented fallback, with non-API provenance and no cross-run reuse.

## Operate and resume

Read the [runbook](automation-runbook.md) and [handoff](operator-handoff.md) completely before a live
run. The same agent retains contextual judgment and may make additional authorized scoped reads.
The runtime enforces provenance, transformations and publication invariants; it does not replace
judgment or make new language rules mandatory.

The public CLI keeps the normal `review:*` names. Unlike `npm run`, do **not** insert an extra `--`
between the command name and options. Planning/replay helpers support `--run-dir` or `SLA_RUN_DIR`;
validation, build and publication commands require the documented `--run-dir` option. The former
internal `review:live-build` is composed by the normal `review:build` route, not a second procedure.
The standalone Salesforce operational-summary utilities are outside Intake and are not migrated.

Typical saved-run rebuild and validation, after required collection and interpretation:

```sh
headstart-intake-sla review:build --run-dir <private-run> --run-at <frozen-ISO-cutoff> --use-existing-structured
headstart-intake-sla review:validate --run-dir <private-run>
```

For publication, refresh the existing required live checks, then use `review:prepare-publish`,
`review:next-publish-stage`, the authorized native writer, and
`review:capture-publish-readback` in order. Run History remains last. Complete final assertions
and save the successful `publication-readback.json` before claiming publication. See the
[publication contract](publication-contract.md); packaging and green tests grant no write authority.

Retain saved evidence and exact-bound interpretations when the documented resume rules permit.
Do not change a published run, frozen cutoff, or source timestamps. Provision an updated runtime in
a new directory, verify its receipt/compatibility and tests, and switch the operator's binding
deliberately. Do not overwrite a running installation or assume a skills refresh updated it.
An incompatible engine/prompt/schema requires the existing binding invalidation, not a fabricated
matching receipt. Rollback selects the prior reviewed artifact and compatible skill; private runs
remain intact. Migration alone does not create or move a schedule.

## Acceptance boundaries

Synthetic/package acceptance does not prove source permissions, current live metadata, API model
availability or second-operator readiness. The existing supervised shadow/publication handoff and
separate live interpretation acceptance still apply before operational handoff. They are not
performed by installation or ordinary CI. Report skill installed, runtime validated, provider
access, and operational readiness separately.

[Package overview](../README.md) · [Runbook](automation-runbook.md)
