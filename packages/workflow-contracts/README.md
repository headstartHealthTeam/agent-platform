# Managed Workflow Contracts

This package is the canonical typed boundary between locally developed agent workflows, the
managed Codex runner, the selected operational control plane, and durable run records. It deliberately
contains no business workflow behavior and performs no external operations.

## Responsibilities

- Validate versioned managed-workflow manifests.
- Require explicit owners, triggers, input and output schemas, tools, retries, data classification,
  and side-effect policy.
- Require a backup owner and actionable business, technical, and backup contacts before a workflow
  can leave draft status.
- Require immutable skill revisions before a workflow can leave draft status.
- Define durable run requests and results independently of a transient Codex thread.
- Runtime-parse untrusted run requests before they reach an executor.
- Fail closed when a manifest omits a required operational boundary.

## Boundary

A portable workflow skill tells an interactive agent how to perform a task. A managed workflow
manifest makes that behavior deployable by declaring everything the local user previously supplied
implicitly: identity, trigger, workspace, tools, schemas, permissions, approvals, retries,
observability, and ownership.

The schemas are intentionally runtime-neutral. The first executor is Codex, but the control plane
can persist and reason about a run without depending on Codex-internal thread formats. Codex thread
events may be recorded only when the manifest's data policy permits them.

Read [`../../docs/codex-managed-workflow-architecture.md`](../../docs/codex-managed-workflow-architecture.md)
for the end-to-end design and deployment progression.

Use the [documentation hub](../../docs/README.md) for repository navigation and the
[workflow authoring guide](../../docs/workflow-authoring-guide.md) before introducing a managed
package. Runtime package loading and JSON Schema fixture validation are owned by the
[workflow runtime](../workflow-runtime/README.md).
