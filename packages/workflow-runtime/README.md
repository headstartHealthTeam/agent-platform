# Managed Workflow Runtime

This package provides runtime-safe loading and validation for a managed workflow package. It loads
the package from disk, validates its manifest through `@headstart-health/workflow-contracts`,
resolves every referenced file within the workflow package, and validates inputs and outputs against
the workflow's JSON Schemas.

It is used in three places:

1. local authoring and synthetic evaluation;
2. repository CI before a workflow can merge; and
3. the managed runner before Codex receives a run.

The same runtime contract therefore guards both development and execution. Test fixtures remain in
their consuming workflow or package; this package does not own testing-only assertions or fixture
factories. Workflow tests must remain synthetic, deterministic, credential-free, and independent of
live systems. Live read-only checks belong in a separately authorized validation lane and are never
part of ordinary unit tests or Git hooks.

Use the [documentation hub](../../docs/README.md) for repository navigation, the
[workflow authoring guide](../../docs/workflow-authoring-guide.md) for package selection, the
[managed workflow architecture](../../docs/codex-managed-workflow-architecture.md) for runtime
context, and [workflow contracts](../workflow-contracts/README.md) for the schemas this runtime
enforces.
