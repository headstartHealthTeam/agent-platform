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

## Hosted-First Development Direction

Follow the [canonical connected-test pattern](../../docs/agent-workflow-development.md#hosted-first-connected-execution):
normal local applications use OpenAI-hosted compute by default. Existing `openai_hosted` schema
support is limited to template/network selection; package/file/setup configuration and actual
credentialing acceptance remain unfinished. Extend this provider surface as needed, not a second
launcher. The self-hosted implementation below is optional and retained, not required for hosted
sessions or evidence that hosted execution cannot run our packages.

## Optional Self-Hosted Development Boundary

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

## Operator activity and owning-service integration

Portable port types now come from `@headstart-health/workflow-contracts`; the adapter retains its
existing type exports. See [shared operator integration](../../docs/shared-operator-integration.md)
for cross-repository ownership and the interim generated-contract distribution boundary.

`OpenAIPlatform.openOperatorObservation` and `OperatorItems` project verified root turns'
assistant commentary/final text and generic tool-activity notices. They omit private reasoning,
shell arguments, raw results and routing content. Failed question requests and other failed tools
produce explicit, sanitized notices; they never invent a pending question or imply business failure.
New messages can stream incrementally; saved
final items win during recovery. When reconnect misses a message's opening event, show an explicit
writing placeholder until its complete text arrives rather than guessing overlapping delta offsets.
Obvious credential patterns are withheld, but pattern matching is not comprehensive data-loss
prevention. Keep source/tool access and data classification constrained upstream.

`OperatorRuntimePort` extends this existing package rather than creating another runner or service.
It verifies exact target/session/initial-root/workflow-revision correlation, merges bounded saved
history with the stream, and derives ad hoc `ask_operator` questions from current required actions,
not historical messages. The owning backend supplies the trusted binding, human authorization and
immutable message/answer/outbox records. Each binding anchors the first root of a dedicated,
exclusively application-owned session. The complete paginated ordered root chain must retain that
anchor; prior roots must be terminal, not overlapping. An older failed/cancelled turn does not make
an existing later turn foreign or invalidate observation. Reading history neither starts nor
authorizes continuation; the backend still owns Stop and explicit recovery authority. The latest root owns
current questions and exact replies. Subagent activity is not projected. A provider-completed turn
maps to `idle`, not business completion; general input can start another turn in the same session.
This is not resume after cancellation, failure or a protected business stop.

The port's `send` delegates to guarded message, tool-result and cancellation operations. General
messages carry a stable command ID as the SDK idempotency key, never a question ID or approval.
Subscribe/reconcile before input. An exact HTTP 400/409 `active_turn_not_steerable` SDK refusal is
returned as `rejected/not_steerable`; preserve that result and allow the pending exact answer rather
than automatically retrying or interrupting the agent. Other failures remain uncertain. Delivery
does not prove the agent acknowledged or used a correction. Messages and function replies require
a bounded caller-authorized inference window;
observation and cancellation do not create one. A successful send means API acceptance, not a
completed action. Initial start uses the separate launch boundary below. Controlled resume remains
unimplemented; local compute uses the retained provisioner below. It is not safe to call its write
methods directly from an untrusted agent. The owner serializes
actual provider I/O per run, including Stop, and must not release that serialization on a local
timeout while a detached send can still run. SDK requests have bounded timeouts and no automatic retries.

Observers are coalesced per binding, limited to 20 sessions and closed after 45 seconds without a
snapshot request. Call `close()` on application teardown. Session history follows every API page;
100 is the page size, not a session lifetime limit. The observer keeps a rolling window of 180
projected items and 10,000 event deduplication IDs. Long assistant messages are split into stable
10,000-character display parts instead of failing observation. Applications retain durable events
and expose their own history pagination; a recent-activity window must not disable operator controls.
`history(binding, cursor)` is the separate lossless finalized-item recovery lane: at most 100 raw
provider items and 180 projected display parts per page, with a checkpoint inside long messages.
The application commits returned items, their provider-order ordinals and the next cursor atomically.
Retry reads after a crash; never advance a cursor before retention succeeds. Mutable items keep
`hasMore` true and cannot be passed by the checkpoint. Recover finalized questions from their exact
call identity, not as newly pending questions. Keep recovery independent of live frames/controls,
and drain outstanding history even after a run reaches terminal status.
MCP/function activity includes tool names and lifecycle status, never raw arguments/results or
private reasoning. This follows the official [Agents item contract](https://developers.openai.com/api/reference/typescript/resources/beta/subresources/agents).
A disconnect never resends input, cancels the agent or proves completion.
`createLocalOperatorRuntimePort` resolves the existing private profile inside trusted application
composition, never inside the isolated executor. This is a development helper, not production
credential provisioning. No credential lookup happens merely by importing the package.

The build also produces `dist/operator/operator-module.cjs`, a standalone CommonJS artifact with
all non-Node dependencies bundled, including the pinned OpenAI SDK. It exposes the versioned
`headstart-openai-operator/v1` boundary and adapter version `0.7.0`. An owning service can use
`createOperatorRuntimePort` with its trusted configuration and independently provisioned credential;
`createLocalOperatorRuntimePort` retains the workstation resolver. Neither factory provisions an
executor or creates a session merely by initialization. Credential lookup is never an import-time side effect.

Deploy the reviewed artifact to protected application storage and pin its exact SHA-256 in trusted
deployment configuration alongside source revision and lockfile provenance. The backend's local
composition verifies and executes those same bytes, checks protocol/version, disallows unbundled
dependencies and owns shutdown. This is trusted application code, **not** a JavaScript sandbox or
a package registry/release pipeline. Never use agent scratch, browser input, or an agent-generated
digest as deployment authority. Separate service identities and production credential delivery
remain deployment work.

Synthetic SDK/projection tests and the backend's explicit packaged-adapter HTTP integration lane
exercise this boundary without credentials or inference. The backend can now select the real port
for an explicitly configured local synthetic run; missing configuration remains closed. The console
distinguishes simulated activity from real API transport, and neither mode claims that fixture
preparation packages were agent-produced. Real-API connected acceptance, retained provisioning,
exact producer authority and hosted-environment validation remain separate evidence gates. The
same observation/message/reply/cancel adapter serves local-executor and hosted sessions; provisioning and
credential delivery differ, not the operator contract.

The provider implementation uses the official `openai` Node/TypeScript SDK (pinned in this package),
including `client.beta.agents`; it is not the separate Agents SDK orchestration library. Follow the
[official session input/recovery contract](https://developers.openai.com/api/docs/guides/agents-api/sessions).

### Application functions and normal application launch

`pendingFunctions` / `completeFunction` share the verified session/root chain with operator
observation. Only application-registered names are returned; `ask_operator` remains human-only.
Each result binds to the exact currently pending call and requires the same bounded inference
authority. The owning backend validates arguments, current domain authority and output size, saves
the handler result before delivery, and serializes processing with human commands. Function
arguments/results do not become operator commentary. This is not a generic arbitrary-code executor.

`createSession` accepts a trusted canonical `AgentLaunchDefinition` and one request UUID. Optional
`launchSettings` selects model, reasoning, environment and native `mcpServers` using the same narrow
SDK action schema as supervised creation. MCP is the agent's source-access surface; it is not
proxied through new workflow-specific backend functions. Credentials/configuration must be supplied
by protected application composition, never model/browser input. Synthetic profiles must not bind
live source tools. The backend registers only its own context/publication functions.

The optional second `createSession(request, credentials)` argument carries ephemeral
`AgentSessionCredential` bindings from trusted application composition, never from the agent or
browser. It does not mutate the saved request or reusable launch settings. Each binding must match
exactly one required service-origin MCP server's label, HTTPS audience and allowed-tool subset;
preexisting profile authorization, missing/duplicate bindings or environment-origin transports
are rejected before creation. Authorization is attached only to that session's native MCP
transport. The owning application provisions the non-human identity, issues and revokes run grants
and enforces source permissions. This package does not implement employee OAuth or mint Headstart
credentials. The same attachment path works with hosted and retained local execution; it does not
make a credential valid at a different MCP deployment/database. Adapter `0.7.0` pins the credential
and dispatch/recovery contract together, so an older artifact cannot silently ignore either.

Call `preflightLaunch(request, descriptors)` before issuing a run credential. Descriptors contain
the intended MCP label, audience and tools, never authorization. This validates the same definition,
deployment settings and bindings as creation and verifies the configured provider project with a
read-only request. Persist its returned target fingerprint with the application launch attempt.
Recheck it before issuance if configuration could have changed. The third
`createSession(request, credentials, { expectedTarget, beforeDispatch })` argument is required for
successful creation. A mismatched/absent target fails before any provider request.

The owner first persists a `preparing` attempt, then issues the credential. `beforeDispatch` must
durably change that attempt to `creating`; it runs after all predictable validation/provider reads,
immediately before the one SDK create call. A callback failure prevents that call, even if its
database acknowledgment was lost. A crashed `preparing` attempt therefore never dispatched; the
owning application can explicitly retire/reissue credentials using its transactional attempt policy.
A crash after `creating` is uncertain. Never infer safe recreation from a timeout, generic SDK
failure or zero search matches, and never reset an issued credential merely because creation is
uncertain. Retain separate Stop/revocation authority.

The result is `created` with a receipt, `not-attempted` with a sanitized local-validation,
provider-preflight or pre-dispatch reason, or `unknown` after crossing the dispatch boundary or
receiving an unusable response. Unknown results may retain a provider request ID and candidate
session ID as diagnostic hints, not proof of ownership. Creation includes initial input and exact
`launch_request` UUID / `workflow_revision` metadata. The returned receipt must be saved before further work.
The pinned SDK has no documented session-create idempotency guarantee; arbitrary header acceptance
does not create one. It does have a separate, documented message-event idempotency field.

`inspectLaunchCandidate(expectedTarget, sessionId)` reads a webhook/response hint in the pinned
project and returns only its session ID, creation time and launch correlation. Missing resources,
valid unrelated resources and failed reads are distinct. `discoverLaunchCandidates(identity, after)`
reads one page of at most 100 sessions and returns every exact request/revision match plus a cursor.
Persist the cursor and candidate/conflict evidence atomically. A malformed/nonadvancing page fails
without advancing; a completed empty pass remains uncertain. Reinspect a candidate and correlate
under the application's launch lock before adoption. Metadata is mutable, not provider-enforced
uniqueness; conflicting matches must not be resolved by picking the newest. Recovery needs read
access, not a source credential, executor, launch profile or fresh inference authorization.

`inspectSession` reads only that known session and returns its first root when available. It never
recreates a session or resends input after uncertainty. `cancelSession` validates that same receipt.
The application owns positive-match recovery, Stop-before-continuation and conflict handling;
the adapter never adopts or recreates on its own. `reconcileEnvironment` follows the
saved receipt and starts or reconciles a configured `SessionExecutor` only for initial startup or
a current environment-connection request. Self-hosted creation without a provisioner fails before
the API call. The reusable `DockerSessionExecutor` retains local compute and session files; the
local factory accepts a private `executorSettings` image/credential binding. No compute starts at
factory initialization. See [retained local executor](../../docs/local-agent-executor.md) for setup,
isolation, recovery and the distinction from hosted execution. Source identity issuance, exact file
materialization and a provider-backed launch demonstration remain separate work; a created
self-hosted session alone has no running executor. Follow the official
[environment lifecycle](https://developers.openai.com/api/docs/guides/agents-api/environments/lifecycle)
and keep one provisioning owner per session. The existing local smoke launcher is not that retained
provisioner and must not silently supply its invented evidence to this workflow.

### Connected acceptance boundary — September 18, 2026

A bounded synthetic connected trial verified general guidance while waiting and working, an exact
first-turn answer, model acknowledgement, reload recovery, same-session continuation with retained
context, and browser-originated cancellation. It did **not** establish complete multi-turn question
handling: a second-turn `ask_operator` call and its output failed with
`The managed agent session has no active turn.` even though that root completed. The runtime /
provider / executor cause remains unresolved. Keep this failure distinct from passing transport
checks and synthetic later-turn tests; a completed turn is not proof that its tools succeeded.

A second, direct-API synthetic diagnostic removed the backend, admin and operator adapter from the
question/reply path. Its second question failed inside the managed function service with HTTP 503,
while the first and three subsequent questions succeeded in the same session. This isolates that
failure from the application path, but does **not** reproduce the exact earlier error or establish
one cause for both. Later function success is not proof of restored sandbox execution or full
connected-console acceptance. The initial failed reconnect probe and both failures remain retained
evidence, not overwritten by the later successes. No documented fix for either exact error was
established by the official documentation review.

Follow the [function recovery contract](https://developers.openai.com/api/docs/guides/agents-api/tools/functions):
retrieve current `required_actions` and use the exact turn/call identity, not historical items.
Follow the [environment lifecycle contract](https://developers.openai.com/api/docs/guides/agents-api/environments/lifecycle):
connection events report state rather than request startup; later input can request a connection,
and one provisioner must coordinate shutdown with incoming work. Function-only success does not
validate that provisioner. Do not automatically replay messages or tool effects to hide a failed
tool, or treat a completed root as workflow success. Resolve and verify the failure/recovery
boundary before claiming full continuation acceptance. No canonical credentialing workflow, hosted
runtime or payer action was accepted by these trials.

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
