# OpenAI Platform Access

Reusable, supervised OpenAI project access through the official TypeScript SDK. The same package
owns read operations, explicitly approved agent/session/template changes, and preparation of
revision-pinned skill archives. It does not implement an unattended runner or business-system writes.

Reuse decision: reuse `capability-contracts` and `capability-runtime` for the existing private profile
and read preflight, and `workflow-runtime` for manifest/prompt/schema loading. Create this provider
package because OpenAI authentication, lifecycle operations, and hosted skill preparation are shared
by local development and future execution adapters. Do not extend the read-only capability runtime
or Codex runner to grant managed write authority.

Public exports include `resolveConfig`, `readCredential`, `OpenAIPlatform`, `planAction`,
`bundleSkills`, and `inspectWorkflow`. All operations are bounded; lists return one page with
`has_more` and `last_id`, and accept an explicit `query.after`. SDK Page instances and transport
state never enter output. Full resource content is returned to library callers; the CLI defaults
to IDs/statuses and exposes content only through `--include-content`.

## Self-Hosted Development Boundary

The supervised session-creation contract also accepts `self_hosted` with an explicit normalized
absolute POSIX `workspace_directory`. Choose either a saved `agent_id` or an inline agent with an
explicit model, instructions, reasoning and scoped tools; simultaneous overrides are deliberately
unsupported. Initial input can be omitted for an executor-backed session so the application can
subscribe and connect the environment before sending work. `none` still requires initial input.
Creation remains behind exact-target/payload approval and the conservative billable gate, even
when input is deferred.

`selfHostedExecutorConnection` validates a retrieved session against its expected ID and returns
an argument array for `codex exec-server`, preserving the provider's remote URL unchanged. It does
not spawn a process, provision isolation, retrieve a key or prove that an environment connected.
Its routing data belongs only in protected provisioning state, not the operator activity feed.
The current connection policy allows only the documented OpenAI WSS host; a future host change
requires an explicit adapter review, not an arbitrary endpoint fallback.

Use a separate restricted environment key inside each isolated executor; keep the application key,
personal auth caches and unrelated workspace files outside. Self-hosted templates, capability
mounts, secret fields and network-policy fields are rejected by this bounded surface. Network
isolation must be enforced by the provisioner, not inferred from a path or this request schema.

These are offline-tested SDK request/connection contracts, not a completed local executor or
backend/admin integration. Stream subscription/recovery, materialization, scoped identity, durable
business approval/action enforcement and actual API acceptance remain separate implementation and
verification work. See the [development sequence](../../docs/agent-workflow-development.md).

## Safety And Failure Contract

- Explicit organization/project routing and successful Agents read preflight are required. The API
  must return the expected project ID; missing evidence fails closed. Organization is supplied in
  the authenticated request, not inferred from a local alias or compared to a response slug.
- Credentials resolve from an explicitly selected Headstart 1Password account and matching user.
  Only the consuming process receives the key. No plaintext file, command argument, log, or archive
  contains the key. No fallback to another account, environment key, or endpoint occurs.
  Each developer supplies their own private profile and reference. CLI `--config` takes precedence
  over the optional path-only `HEADSTART_OPENAI_CONFIG`; neither exposes a key to the environment.
- `planAction` is offline. `apply` requires the digest of the exact target and parsed action, plus
  separate billable authorization for session creation or input. This is a caller-intent guard,
  not an independent human-approval service; an untrusted agent must not mint its own approval.
- Agent/template update and deletion require the fingerprint of a fresh read. The recheck detects
  changes since review but is **not atomic compare-and-set**: serialize supervised writers. The
  API does not establish a general cross-process lock here. This package is not safe as an
  unattended concurrent business-write executor.
- SDK retries and redirects are disabled. On an uncertain write outcome, stop and reconcile IDs
  before retrying. Submitted session messages use the explicit API-supported idempotency key;
  preserve the same key and payload when reconciling one submission. Do not infer that other
  operations are idempotent or that one local approval prevents replay across processes.
- A successful session creation is not a completed turn. Inspect turns/items and terminal outcome;
  cancellation and deletion do not establish immediate sandbox cleanup. There is no invented
  saved-agent `disable` endpoint: workflow pause policy and agent deletion are separate actions.

See [local setup and action contracts](../../docs/openai-platform-access.md), the
[documentation hub](../../docs/README.md), [workflow authoring guide](../../docs/workflow-authoring-guide.md),
and [managed runtime architecture](../../docs/codex-managed-workflow-architecture.md).
