# Codex Runner

The Codex runner is the managed execution boundary for versioned Headstart agent workflows. It
provides the same core reasoning, skills, MCP, CLI, and repository capabilities that make a local
Codex workflow useful, plus custom-code adapters when the workflow actually requires them, while
removing reliance on an employee laptop or personal session.

## Coordination Model

The runner is a worker, not the control plane. It receives an already-authorized durable run request
and an exact workflow package. It does not decide when a workflow should run, own business state,
grant permissions, or treat a Codex thread as durable workflow history.

For each run, the surrounding infrastructure must provide:

- an exact merged repository commit and workflow version;
- a fresh isolated workspace;
- the required pinned skills;
- only the declared MCP servers and CLI commands;
- an explicit environment-variable allowlist;
- a service identity and scoped secrets;
- the validated run request;
- a durable event and result sink; and
- cancellation and timeout signals.

The runner then validates input, starts Codex with the workflow policy, requests structured output,
validates that output independently, and returns it to the control plane.

## Current Safety Boundary

This package is currently a tested execution library, not a deployable worker service. It can execute
only an already-materialized active workflow whose side-effect mode is `read-only`; repository
validation blocks checked-in active workflows until the surrounding workspace, skill, tool, and
environment materialization controls are implemented and tested. The checked-in reference workflow
is `draft` and cannot execute.

The runner rejects draft workflows and all `propose-only` or `approved-write` workflows. This remains
in place until durable approval and a deterministic action executor in the owning service are
implemented. Selecting an operations service does not remove these restrictions.

The SDK receives `approvalPolicy: never` because a queue worker has no interactive terminal user.
That setting does not authorize external writes. Write authority is intentionally outside the Codex
thread and must pass through the control plane.

The constructor requires an explicit environment mapping. Production code must build that mapping
from a documented allowlist. Passing all of `process.env`, a developer auth cache, or unrelated
service credentials would violate the runner contract.

## Execution Sequence

1. Load `workflow.yaml`, the prompt, and input/output schemas.
2. Runtime-validate the durable run request and confirm its workflow id, version, and repository
   commit match the materialized workflow source.
3. Require `active` lifecycle status and the currently supported read-only policy.
4. Validate the untrusted run input against JSON Schema.
5. Start a new Codex thread in the supplied isolated workspace.
6. Apply the declared model, reasoning effort, sandbox, network policy, and timeout.
7. Pass the output JSON Schema directly to Codex.
8. Optionally forward structured Codex events when the data policy permits it.
9. Parse and independently validate the final response.
10. Return the thread id, validated output, and usage to the control plane.

The input is marked as untrusted data in the generated prompt. Prompt injection remains a workflow
and tool-design concern, so tool permissions and side-effect controls cannot depend on prompt text
alone.

## Event Handling

Codex can emit thread, turn, command, file-change, MCP, web-search, reasoning, and message events.
The runner accepts an event sink so deployments can translate permitted events into durable,
PHI-safe operational records.

Raw event emission is prohibited for workflows classified as PHI by the manifest contract. A later
telemetry adapter should map raw events into a stable internal event schema and redact tool-specific
payloads before persistence.

## Authentication

Codex authentication is supplied by the deployment, not stored in this package. Follow the
[architecture's authentication contract](../../docs/codex-managed-workflow-architecture.md#authentication-and-capability-binding)
for workload identity federation where enabled, or an approved Codex access token or API
credential. No method is provisioned by this package, and product entitlement must be verified.
Headstart MCP, AWS, and external providers retain separate identities, permissions, and rotation.

Declared secrets are delivered at runtime through scoped AWS identity and Secrets Manager; federated
tokens require protected delivery and renewal by trusted infrastructure instead of a stored static
key. Credentials must never be
written into prompts, workflow manifests, source control, command arguments, or logs.

## Workspace And Skill Materialization

The current class accepts an existing workspace directory and does not consume the manifest MCP or
CLI allowlists. A subsequent infrastructure package must materialize and constrain the run by:

- cloning or mounting only declared repositories;
- checking out immutable revisions;
- installing the workflow's pinned skill set under an isolated Codex home;
- generating MCP configuration from the manifest and deployment policy;
- installing or selecting pinned CLI binaries; and
- deleting temporary state after the result is durably acknowledged.

Managed runs must not reuse a developer's global Codex home or globally installed skills.

## Testing

Unit tests inject a fake Codex client and use synthetic workflow packages. They verify policy
translation, event handling, input/output validation, and failure behavior without authenticating to
OpenAI or another external system.

A hermetic SDK subprocess contract test uses `codexPathOverride` with a synthetic executable. It
verifies the CLI arguments, prompt transport, JSON event stream, and final response mapping without
network access or credentials. This catches SDK-to-CLI protocol drift that an injected client double
cannot exercise.

Live Codex, MCP, or AWS validation belongs in an explicit integration lane with separately approved
credentials and data policy. It must never run in Git hooks or ordinary pull-request CI.

## Further Reading

Use the [documentation hub](../../docs/README.md) to navigate the complete repository and the
[workflow authoring guide](../../docs/workflow-authoring-guide.md) to decide when a managed runner is
actually required.

Read [`../../docs/codex-managed-workflow-architecture.md`](../../docs/codex-managed-workflow-architecture.md)
for the complete repository, control-plane, runtime, security, deployment, and promotion model.

The [completion roadmap](../../docs/managed-runtime-completion-roadmap.md) separates hosting
compatibility and operations-service selection from shared platform acceptance and later business
workflow adoption. The same runner contract applies whether an adopted service or custom Headstart
control plane dispatches it; neither integration is implemented by this package today.

The runner consumes the contracts from
[`@headstart-health/workflow-contracts`](../../packages/workflow-contracts/README.md) and validated
packages loaded through
[`@headstart-health/workflow-runtime`](../../packages/workflow-runtime/README.md).

Official OpenAI references:

- [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk)
- [Codex access tokens](https://learn.chatgpt.com/docs/enterprise/access-tokens)
- [Codex workload identity federation](https://learn.chatgpt.com/docs/enterprise/workload-identity)
- [Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)
