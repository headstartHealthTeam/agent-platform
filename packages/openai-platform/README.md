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
`bundleSkills`, and `inspectWorkflow`. Lists return one bounded page with
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
The connection policy allows the documented OpenAI WSS host and the API-returned HTTPS registration
route at `api.openai.com/v1/agents/api/connect/<route>`. The latter was observed in an authorized
synthetic development session; the SDK contract requires passing it unchanged. Do not synthesize a
WSS URL from it. Other hosts, registration paths, nonstandard ports, URL credentials and fragments
are rejected; future endpoint changes require review, not an arbitrary fallback.

Use a separate restricted environment key inside each isolated executor; keep the application key,
personal auth caches and unrelated workspace files outside. Self-hosted templates, capability
mounts, secret fields and network-policy fields are rejected by this bounded surface. Network
isolation must be enforced by the provisioner, not inferred from a path or this request schema.

`OpenAIPlatform.openSessionObservation({ sessionId }, signal)` opens the official read-only event
stream before input dispatch. Its single-consumer iterable emits allowlisted control metadata only;
callers must own its lifetime and call `close()` on teardown. Abort/close/EOF/disconnect do not mean
the run stopped or succeeded. `observedRootTurnOutcome` correlates only the intended root turn and
does not prove business success. Neither raw content nor error/routing payloads reach this feed.
Ordered, bounded history pages and `sessions.turn.get` support caller-owned recovery; there is no
automatic replay, message resend, or full C-09 commentary/question feed.

`sessions.pending-functions` projects only current `required_actions` for an explicitly selected
session/turn. `pendingFunctionCalls` is the same pure projection for retrieved session resources;
history items never establish pending work. Each call has a fingerprint binding session, turn,
call ID, name and arguments. Arguments remain untrusted content for application-specific schema,
tool-allowlist and permission checks, not an operator-safe feed or automatic tool dispatcher.
`sessions.tool-result` submits one success/error result only after exact plan/billing approval and
a fresh pending-call check. This supports ad hoc questions without prescribing their wording.
It does not persist questions, authorize human decisions or establish a connected admin console.
The check is not atomic: serialize responders in the owning application, persist results before
delivery, and reconcile uncertain outcomes without automatically replaying a tool or reply.

These contracts have deterministic SDK-boundary tests. An authorized synthetic development smoke
also exercised one real session with an isolated official executor, a file read, an agent-authored
function question, a saved synthetic reply and completed root turn. That bounded transport proof
is not a retained executor provisioner or backend/admin integration. Application recovery, source
materialization, managed identity, durable business approval/action enforcement and hosted acceptance
remain separate work. See the [development sequence](../../docs/agent-workflow-development.md).

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
  separate billable authorization for session creation, input or function results. This is a caller-intent guard,
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
