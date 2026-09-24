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
- Define the source-neutral `RetainedEvidenceManifest` for original Salesforce/Drive files,
  explicit Google exports, complete Google Docs structure JSON, and runtime-derived files with exact parent references. This typed
  handoff is not a storage receipt: the owning application verifies and retains the actual bytes,
  rechecks case authority, and only then accepts the artifact into a review package.

## Boundary

`src/operator.ts` additionally owns the portable operator-port v1 types: immutable provider binding,
safe items/snapshot and human reply/stop command. `openai-platform` consumes these types and keeps
provider behavior in its adapter. They are distinct from workflow business outcomes and from the
backend-owned HTTP projection. No SDK, workflow policy, database entity or credential lookup is
included. See [shared operator integration](../../docs/shared-operator-integration.md).

A portable workflow skill tells an interactive agent how to perform a task. A managed workflow
manifest makes that behavior deployable by declaring everything the local user previously supplied
implicitly: identity, trigger, workspace, tools, schemas, permissions, approvals, retries,
observability, and ownership.

The schemas are intentionally runtime-neutral. The first executor is Codex, but the control plane
can persist and reason about a run without depending on Codex-internal thread formats. Codex thread
events may be recorded only when the manifest's data policy permits them.

The proposed [Agents API integration](../../docs/agents-api-compatibility.md#code-level-impact-and-reuse-decisions)
preserves these business contracts. Provider/session/turn correlation and effective execution
configuration need a versioned receipt or profile extension; they are not current schema fields.
Do not equate provider session status with workflow outcome or silently ignore an unsupported
sandbox, network, tool or retention requirement.

Read [`../../docs/codex-managed-workflow-architecture.md`](../../docs/codex-managed-workflow-architecture.md)
for the end-to-end design and deployment progression.

Use the [documentation hub](../../docs/README.md) for repository navigation and the
[workflow authoring guide](../../docs/workflow-authoring-guide.md) before introducing a managed
package. Runtime package loading and JSON Schema fixture validation are owned by the
[workflow runtime](../workflow-runtime/README.md).
