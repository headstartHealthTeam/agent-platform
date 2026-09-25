# Intake SLA engine

The supervised Intake SLA evidence workflow, implemented as strict TypeScript in Agent Platform.
It preserves the [approved Intake reference and package ownership map](../../docs/intake-sla-migration.md).
It does not add hosting, a scheduler, a service identity, a UI, or Salesforce write authority.

## Runtime and operating instructions

- [Local setup](docs/local-setup.md): build/package a reviewed revision, provision the workbook
  library, supply private configuration, and validate outside the checkout.
- [Automation runbook](docs/automation-runbook.md): due-work selection, cohort, evidence,
  interpretation, exceptions and authorized publication.
- [Operator handoff](docs/operator-handoff.md) and [schedule template](docs/scheduled-task-template.md):
  readiness, coverage and one-active-operator transfer; installation creates no schedule.
- [Recovery adapters](docs/recovery-adapters.md): protected checkpoints, bounded collection,
  correction runs, credential handoff and uncertain-write recovery.
- [Interpretation contract](docs/transcript-interpretation-contract.md): source-bound agent
  judgment, API/current-run Codex provenance and optional note adjudication.
- [Fireflies collection](docs/fireflies-collection-contract.md),
  [bounded fresh collection](docs/fireflies-bounded-collection.md) and
  [optional cache](docs/fireflies-cache.md): explicit modes, source coverage and provenance.
- [Publication contract](docs/publication-contract.md): fresh write leases, exact bounded stages,
  reviewer preservation, every readback and Run History last.

The canonical operator skill is `headstart-intake-sla-review` in this repository. Installing or
refreshing skills does not install or update this runtime. Keep the complete packaged docs with
the artifact; the source-checkout navigation links below are not runtime dependencies.

## Package boundaries

| Reusable package                                 | Responsibility                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `salesforce-read`                                | Explicit target/Organization verification and bounded read-only queries.                   |
| `fireflies-data`                                 | Native discovery/body normalization, provider completeness and failure signals.            |
| `slack-data`                                     | Native search/thread envelopes, pagination and identity normalization.                     |
| `google-read-transport` and `google-sheets-data` | Explicit credential binding, sanitized failures, exact bounded Sheet reads.                |
| `artifact-workbook`                              | Injected workbook-library operations, independent of Intake filenames/layout.              |
| `openai-platform/responses`                      | Isolated structured Responses transport with explicit model/effort/schema and non-storage. |

Intake owns cohort/source queries, frozen cutoff, matching, cache eligibility, checkpoint state,
interpretation prompts and exact bindings, evidence semantics, QA, recovery, seven-tab layout,
publication authority and readback acceptance. Product-specific Portal capture stays here; no
speculative product SDK is introduced. Shared providers never depend on Intake.

## Preserved behavior

Context-dependent meaning remains with the agent under the existing evidence rules. It may make
additional authorized scoped reads or model calls; a novel phrase is not a new deterministic
language rule. Code enforces reproducible transformations, identity/provenance, temporal meaning,
row parity and publication integrity. Review/Blocked exceptions and the approved partial-publication
rule remain; neither perfect Salesforce data nor a new whole-run gate is required.

Fresh current-run Codex interpretation remains available when the approved API is unavailable.
Only exact-bound API interpretations qualify for the existing cross-run reuse path. API execution
requires the approved credential/model and synthetic preflight, explicit low effort and
`store: false`. The AWS helper injects its key only into the consuming child, never arguments or
saved artifacts.

Saved replay, packet generation and rebuild consume the retained evidence without recollection.
Published runs remain immutable. A fresh publication lease is separate from the frozen assessment:
fully proven post-cutoff changes are deferred through the existing disposition, while changed
reviewer state, competing publication and unaccounted changes still block writes.

The CLI prepares and verifies exact Google payloads; native authorized tools may execute them.
The optional injected executor applies only an authorized, hash-bound call and uses live concurrency
checks, journals and readback-only recovery for uncertain writes. Shared Google readers remain
read-only. Finalization requires the existing independent final samples; no prepared payload or
successful HTTP acknowledgment alone means Published.

## Validation and delivery

Use repository `corepack pnpm qa` for changes. The package also checks its rolled-up public
declarations with library checking enabled. All tests are synthetic and provider-independent.
The installed `review:validate` route executes the full compiled suite and distribution checks
in its own bounded child, rather than relying on checkout aliases or a saved pass receipt.

The standalone packager includes the built runtime closure, compiled tests and these docs, with a
source/lock/artifact receipt. Private registries, credentials, source data and `@oai/artifact-tool`
are external. Workbook provisioning smoke is separate from live source acceptance. Operational
handoff still requires the existing supervised live checks; migration does not claim they ran.

[Documentation hub](../../docs/README.md) ·
[Workflow authoring](../../docs/workflow-authoring-guide.md) ·
[Migration traceability](../../docs/intake-sla-migration.md) ·
[Canonical operator skill](../../skills/headstart-intake-sla-review/SKILL.md)
