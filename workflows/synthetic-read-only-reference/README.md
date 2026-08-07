# Synthetic Read-Only Reference

This package is a disabled, synthetic example of the managed workflow format. It exists so the
repository can validate the complete package shape before a real business workflow is promoted.

It is intentionally marked `draft`, has no schedule or event trigger, permits no network access,
declares no MCP or CLI tools, and cannot be executed by the managed runner. Draft workflows may use
the `workspace` skill revision while being developed; promotion requires an immutable commit or
semantic release.

Copy the package only as a structural starting point. Replace the example ownership, contracts,
prompt, policy, fixtures, evaluation definitions, tests, and evaluation evidence rather than
treating synthetic defaults as an approved operating configuration. `fixtures/` contains one valid
input and output contract example. `evals/evals.json` contains happy-path, boundary, and invalid-input
cases that repository validation checks for shape and schema compatibility; it does not represent a
completed model evaluation run.

Before copying it, use the [workflow authoring guide](../../docs/workflow-authoring-guide.md) to
confirm that independent managed execution is required. Then read the
[documentation hub](../../docs/README.md),
[managed workflow architecture](../../docs/codex-managed-workflow-architecture.md),
[workflow contracts](../../packages/workflow-contracts/README.md), and
[workflow runtime](../../packages/workflow-runtime/README.md).
