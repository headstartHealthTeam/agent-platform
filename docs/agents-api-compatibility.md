# Agents API Compatibility And Local Workflow Promotion

## Decision And Evidence Boundary

Evaluate the OpenAI Agents API with an OpenAI-hosted environment first for managed Codex execution.
It provides a hosted Codex harness, so retaining the particular SDK subprocess is no longer a
product requirement. Preserve the workflow's behavior, access policy and validated outcomes across
execution contexts. Use the [architecture](codex-managed-workflow-architecture.md) for ownership and
the [roadmap](managed-runtime-completion-roadmap.md) for implementation order.

This is a documentation-backed candidate assessment as of September 11, 2026. Official guides and
the API schema were inspected alongside the codepaths below. No live Agents API session, provider
credential migration, filesystem enforcement test or hosted business workflow has been verified.
The service is in public beta. Documentation support is distinguished from integration acceptance
throughout this document; no deployment or production activation follows from selecting it for
evaluation. [Launch](https://openai.com/index/introducing-the-agents-api/),
[overview](https://developers.openai.com/api/docs/guides/agents-api/overview).

## Preserve The Local-To-Managed Path

A working local workflow still enters Agent Platform through canonical skills and only the
deterministic code it actually needs. When independent operation is justified, a managed package
adds owners, inputs/outputs, trigger policy, permitted capabilities, identity, failure handling and
evaluations. The selected execution adapter translates that contract into a local SDK launch or an
Agents API session. Workflow authors should not maintain provider-specific prompt copies.

Promotion changes the execution binding, not the ownership of the workflow. Skills, engines and
provider packages stay together here. A saved API agent, template or uploaded skill is a deployment
artifact derived from reviewed source, not a second authoring surface. Installed Desktop plugins,
personal credentials, existing task history and filesystem paths are not implicitly imported.

The target handoff is: reviewed skill/helper -> validated managed package -> immutable dependency
bundle and approved profile -> selected execution adapter -> independently validated outcome.
`skills:update` remains a workstation skill updater. It does not provision runtime dependencies,
publish API agents or deploy managed packages. A successful local run establishes useful behavior;
it does not establish headless credentials, Linux compatibility or hosted permission enforcement.

Capture relevant organization/workflow instructions and required context explicitly. A local workflow
that relies on native macOS/Windows applications, Desktop browser control, interactive approvals or
personal memory needs an approved managed equivalent or a redesigned supervised boundary. The
documented Linux/code/MCP facilities do not establish parity for every Desktop capability. Record
unsupported capabilities during admission rather than making the agent improvise a replacement.

## Code-Level Impact And Reuse Decisions

| Existing boundary                                                   | Inspected behavior                                                                                          | Decision for an Agents API implementation                                                                                                                                                                           |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills/` and `workflows/`                                          | Separate portable guidance from managed operational manifests                                               | Reuse canonical source. Generate hosted skill/plugin archives and API configuration from reviewed revisions; no cloud prompt fork.                                                                                  |
| `packages/workflow-contracts/src/manifest.ts`                       | Strict versioned schemas for policy, sources, model, identity, tools and observability                      | Reuse intent. Keep vendor IDs out of business manifests. Extend versioned profile/receipt contracts where needed; reject unsupported policy mappings rather than dropping fields.                                   |
| `packages/workflow-contracts/src/run.ts`                            | Provider-neutral request/status/result; no session/turn or execution receipt fields                         | Reuse run identity and business transitions. Add a versioned execution receipt for provider/session/turn/environment/attempt IDs and effective configuration; do not overload business status with provider status. |
| `packages/workflow-runtime/src/workflow-package.ts`                 | Loads and validates a package from disk, confines references to its root                                    | Reuse before dispatch on trusted compute. Validate the source bundle there; an agent-editable copy cannot establish authoritative provenance or final validation.                                                   |
| `apps/codex-runner/src/runner.ts`                                   | Validates lifecycle, run/source binding, input, read-only mode and final output around an injected executor | Preserve these checks. Split launch/observation/result handling enough to recover a remote attempt; current caller-supplied commit equality is not a cryptographic source attestation.                              |
| `apps/codex-runner/src/executor.ts`                                 | Local `workingDirectory`, SDK `ThreadEvent`/`Usage`, `threadId`, SDK abort and one awaited execution        | Extend the boundary with typed prepared-execution and normalized outcome/events. Add an Agents adapter; keep the SDK adapter for local conformance and required fallbacks. Do not cast API payloads into SDK types. |
| `packages/capability-contracts/` and `packages/capability-runtime/` | Logical requirements, private profile bindings, adapter revisions, target and preflight checks              | Reuse/extend these packages for approved managed bindings. Do not create a duplicate identity/profile framework. They validate evidence; they do not issue credentials.                                             |
| Runner tests and repository workflow validation                     | Injected client, synthetic SDK subprocess and draft-only activation gate                                    | Retain the existing suite and add API protocol/failure fixtures. No runtime, manifest or activation behavior changes in this documentation revision.                                                                |

This is a bounded second adapter for Codex execution, not a general multi-framework abstraction.
The reviewed deployment profile selects one execution path for an admitted workflow; automatic
fallback after an ambiguous launch or partial action is prohibited.

## Many-Workflow Operating Contract

The unit of admission is a versioned workflow package and its approved execution profile, not an
organization-wide collection of every skill, credential and tool. Resolve only that package's
required capability/dependency closure. Profiles declare the actual provider, account/target,
authority and delivery mechanism; the shared adapter consumes the verified contract without
branching on business workflow names. Introduce a new provider implementation only when no existing
binding satisfies the logical capability and its source semantics.

Separate sessions, execution scratch and credential scopes across incompatible workflows or
principals. Shared caches require explicit principal/source/version compatibility. Concurrency,
quotas and retry budgets must prevent one workflow from starving others or causing retry storms.
A single control-plane authority may operate many schedules, but deduplication, attempt correlation
and cancellation remain scoped to the correct workflow/run. Test at least two synthetic workflow
identities with distinct profiles, concurrent execution and denied cross-workflow access. Do not
infer multi-tenant isolation from one successful workflow or from subagents sharing an environment.

## Verified Capabilities And Consequences

### Preparation And Versioning

Hosted environments accept packages, initial files, setup commands, skills and plugins. Setup failure
blocks startup. Skills can reference an explicit uploaded version; templates and saved agent
configuration can be reused. Supplied override objects/arrays replace their field rather than merge.
Resolve effective configuration, exact skill versions and the complete helper/dependency closure
before launch. Do not use `latest`, mutable template IDs or a package version alone as provenance.
Hosted setup must verify artifact integrity and runtime requirements before model work.
[Configuration](https://developers.openai.com/api/docs/guides/agents-api/configuration),
[plugins](https://developers.openai.com/api/docs/guides/agents-api/tools/plugins),
[session schema](https://developers.openai.com/api/reference/resources/beta/subresources/agents/subresources/sessions/methods/create).

Record the tested source and artifact digests, adapter/SDK version, effective agent/environment
configuration, exact selected model identifier and provider revision information when exposed.
Record an image digest for customer-controlled images. The reviewed API does not establish a
customer-pinnable hosted base-image or harness digest. Treat provider changes as a measured
compatibility risk; do not invent those pins or promise byte-identical model output.

### Tools, Identity And Permissions

MCP supports service-origin HTTP, environment-origin HTTP and environment stdio. `allowed_tools`
limits discovery/calls; `required: true` fails the turn on initialization failure. Required provider
identity/target/access preflight still belongs before model execution; API initialization failure
alone is not that preflight. Application functions run in application handlers, not automatically
inside an attached sandbox. [MCP](https://developers.openai.com/api/docs/guides/agents-api/tools/mcp),
[functions](https://developers.openai.com/api/docs/guides/agents-api/tools/functions).

Hosted egress defaults to enabled. Restricted mode uses exact hostnames, and hosted stdio MCP
currently requires enabled networking. This is a material limitation for existing stdio bindings.
Do not silently enable unrestricted egress to make a workflow pass. A service-origin MCP connection
also has its own approved destination/credential boundary; a sandbox network policy does not govern
traffic originating in OpenAI's service.
[Hosted network policy](https://developers.openai.com/api/docs/guides/agents-api/environments/openai-hosted).

The inspected API schema does not establish equivalents for our SDK `read-only`/`workspace-write`
filesystem policy or per-executable/subcommand restrictions. Pinning a CLI or listing it in a
manifest does not prevent general shell code from doing something else. Gate A must prove the
effective boundary, including immutable code and writable scratch, or reject the profile. A
restricted tool broker or a self-hosted environment may be required. Prompts and `chmod` commands
alone are not proof that agent-generated code cannot bypass a restriction.
[Environment security](https://developers.openai.com/api/docs/guides/agents-api/environments/security).

Keep the application API key outside the sandbox. API credential vaults support service-origin
HTTP MCP; the application still owns provider authorization and revocation. Environment variables
are accessible to agent code. Self-hosted execution uses an outbound `codex exec-server` connection
and a restricted executor key; the broader application key remains outside. Workspace Codex access
tokens/federation are SDK-path options, not established Agents API authentication methods.
[Vaults](https://developers.openai.com/api/docs/guides/agents-api/tools/vaults),
[self-hosted execution](https://developers.openai.com/api/docs/guides/agents-api/environments/self-hosted).

### Outcomes, Recovery And Business Authority

JSON Schema text output is supported, but the exact workflow schemas and independent validation
must pass conformance tests. A completed turn may include failed tools; an idle session is not a
successful business run. Match the root turn, paginate saved items, assemble final message content
and validate outcome/evidence separately. Subagent completion must not complete the parent run.
[Session schema](https://developers.openai.com/api/reference/resources/beta/subresources/agents/subresources/sessions/methods/create),
[events and items](https://developers.openai.com/api/docs/guides/agents-api/sessions/events).

Persist launch intent and the returned provider correlation before acknowledging dispatch. Streams
do not replay missed events; reconnect, buffer events, retrieve saved state/items and reconcile by
IDs. Closing a stream or aborting an HTTP request does not cancel remote work: send a cancellation
event and reconcile its result. Unknown launch/action outcomes must be reconciled before retry;
provider creation idempotency and retry behavior still require verification. New input can steer an
active turn, so retries must not resend it blindly.
[Sessions](https://developers.openai.com/api/docs/guides/agents-api/sessions),
[recovery](https://developers.openai.com/api/docs/guides/agents-api/sessions/events#how-to-recover-a-disconnected-stream).

Webhooks require signature verification, deduplication and durable handling. Application function
results correlate by session, turn and call; approval/authorization/idempotent business writes stay
outside agent control. OpenAI's own example implements application-level triggers and approval
callbacks. No built-in business cron/approval UI or exactly-once publication guarantee was established.
[Webhooks](https://developers.openai.com/api/docs/guides/agents-api/sessions/webhooks),
[incident example](https://developers.openai.com/showcase/agents-api-sev-bot).

Built-in subagents share the filesystem/environment and inherited MCP access, and do not currently
support application function tools. They are useful for bounded parallel reasoning, not separate
permission compartments. Keep them disabled unless the workflow's evaluated topology needs them.
[Multi-agent](https://developers.openai.com/api/docs/guides/agents-api/multi-agent).

### Persistence And Data Policy

Hosted workspaces are per-session and can expire after an hour without activity or keep-alives;
this is not a maximum duration for an active run. Output artifacts survive sandbox expiry, but
required evidence must be retrieved and acknowledged before session deletion. Templates are not
workspace snapshots. Explicit cross-run stores still own baselines, source watermarks, freshness,
reviewer decisions and action receipts.
[Hosted lifecycle](https://developers.openai.com/api/docs/guides/agents-api/environments/openai-hosted),
[files and artifacts](https://developers.openai.com/api/docs/guides/agents-api/environments/files).

Agents API currently supports US residency, is not Zero Data Retention eligible even with a
self-hosted executor, and retains application state until deletion. Disabling local raw-event
emission or using `store:false` in a different model API does not remove saved agent state. Endpoint
BAA eligibility and Headstart's actual approved retention contract remain unverified. Admit PHI only
after those are established; self-hosting does not resolve this question. Manage uploaded files,
sessions, artifacts and provider logs under an explicit deletion/retention inventory.
[Overview](https://developers.openai.com/api/docs/guides/agents-api/overview),
[data controls](https://developers.openai.com/api/docs/guides/your-data).

## Acceptance Questions That Still Require Execution

| Question                                                                   | Required evidence                                                                                                                               | Consequence if unmet                                                                                  |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Can the complete reviewed package run without workstation dependencies?    | Clean Linux bundle/setup, pinned skills/helpers, schema and deterministic-fixture parity                                                        | Adapt packaging/runtime binding; retain local behavior and ownership.                                 |
| Can declared filesystem, executable, tool and egress policies be enforced? | Positive and denied-access probes, immutable trusted validation, subagent inheritance checks if enabled                                         | Reject that hosted profile; evaluate a broker or self-hosted environment.                             |
| Are managed providers equivalent to local capabilities?                    | Verified target/scopes, required preflight, read semantics and explicit unavailable states                                                      | Extend existing provider/profile packages; do not silently drop sources.                              |
| Can remote work be recovered safely?                                       | Disconnect, missing deltas, pagination, duplicate/out-of-order events, unknown launch, cancel and delayed result cases                          | Fix adapter/control-plane protocol before admitting workflows.                                        |
| Are artifacts and state recoverable and appropriately deleted?             | Sandbox loss, durable checkpoint restore, stale-source rejection, export before deletion and cleanup failure                                    | Add approved storage/retention integration; do not depend on conversation memory.                     |
| Does the service meet quality, cost and operating needs?                   | Repeated behavior evaluations, setup/run latency, token/container cost, quotas, regional and support review                                     | Select a justified fallback or keep the workflow supervised.                                          |
| Can many workflows share the platform safely?                              | Two synthetic workflow identities/profiles, concurrent attempts, scoped quotas, isolated credentials/artifacts and correct cancel/retry routing | Fix shared isolation and operational controls; do not add business-specific branches to the executor. |
| Is a workflow's data policy supported?                                     | Endpoint-specific contract/BAA determination where relevant and verified account configuration                                                  | Keep that workflow out of the API; synthetic platform work may continue.                              |

Gate A owns the bounded API/environment compatibility prototype; later roadmap slices own durable
deployment and operations. Public examples and the current SDK subprocess tests do not close these
questions. Ordinary QA remains credential-free; live checks use a separately approved account,
synthetic inputs, explicit spend/time limits and cleanup. Record unavailable evidence honestly.

## Workflow-Specific Implications

The examples below ground the generic design in existing code. They do not define shared platform
requirements, select required providers or establish a required first workflow. Adding a new
workflow should normally add its reviewed package, capability/profile bindings and evaluations;
shared adapter changes are warranted only for a newly required execution capability.

| Example codepath                                  | Observed local dependency                                                   | Example adoption work                                                                                                                                                                                  |
| ------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scripts/package-organic-runtime.ts`              | Builds a standalone dependency artifact and source/lockfile/content receipt | Reuse its packaging principles and existing artifact when compatible. Generalize only reusable mechanics needed by a second consumer; do not make the platform depend on reporting-specific packaging. |
| `packages/google-read-transport/src/transport.ts` | Resolves Google ADC through `gcloud`                                        | Preserve read/target semantics; add an approved managed credential binding or broker. Uploading the engine does not supply ADC.                                                                        |
| `packages/semrush-data/src/mcp-provider.ts`       | Starts a separately installed MCP process with bounded requests             | Verify hosted transport and egress compatibility. HTTP MCP is a possible binding only if it satisfies the same provider contract; substitution is not automatic.                                       |

Organic reporting provides reusable package and provider evidence, not a prerequisite for platform
acceptance. Preserve the existing engine, normalized evidence contracts and agent interpretation.
Its current standalone package does not include Google ADC, the external Semrush MCP installation,
or canonical skills. A hosted profile must bind these explicitly and retain source completeness,
missing-versus-zero and saved-bundle replay semantics. See the
[runtime guide](organic-reporting-runtime.md) and [capability pattern](reusable-data-capabilities.md).

Intake SLA additionally needs approved private-source visibility, PHI handling, durable cross-run
cache/checkpoint storage and independently controlled publication. These are separate workflow
adoption gates. The platform must not reproduce its business policy in a generic API adapter or
move existing workflow-owned code solely because the execution provider changed.

See the [documentation hub](README.md) and
[local/managed authoring guidance](workflow-authoring-guide.md#design-for-local-and-managed-consumption).
