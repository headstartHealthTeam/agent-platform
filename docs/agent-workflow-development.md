# Agent Workflow Development And Integration

## One Workflow, Three Validation Contexts

For workflows requiring an application-controlled agent, use this development sequence. Local
application development does not require local agent compute.

1. **Desktop authoring and fresh-context behavior trials.** Develop canonical skills, tools,
   contracts and synthetic cases. Let the agent investigate evidence and adapt within its scope.
   Add deterministic code for validation and enforced invariants, not a replacement scripted
   decision engine. A successful Desktop run proves neither managed identity nor application control.
2. **Normal local applications with real Agents API and OpenAI-hosted execution.** Keep backend
   and authenticated admin on their established local setup; let OpenAI supply the agent's sandbox.
   Exercise start, operator input, questions, stop request/confirmation, reconnect, recovery and
   structured results through the actual API, not an API-shaped mock around a Desktop conversation.
   Make required MCP and webhook endpoints reachable through the existing approved ingress path.
3. **Deployed-application acceptance.** Carry the same workflow and hosted configuration into the
   intended application environment. Revalidate identity, tools, artifact storage, callbacks,
   lifetime and recovery there. This changes application deployment bindings, not necessarily the
   agent compute provider. Passing local-app acceptance is not production activation.

## Hosted-First Connected Execution

The September 22, 2026 decision supersedes the earlier required local-executor intermediate stage.
OpenAI-hosted execution is the default connected-test path and intended compute direction for
credentialing, subject to actual acceptance. It does not make every supervised workflow managed.

The official [hosted sandbox guide](https://developers.openai.com/api/docs/guides/agents-api/environments/openai-hosted),
checked September 22, documents a Linux workspace with dependency installation, supplied files,
setup commands, network configuration and reusable environment templates. These are platform
capabilities, not proof that this repository has configured or tested them. Use those facilities
to provide reviewed Agent Platform tools; installing a package is not a reason to build a custom
executor, image service, SDK service or API emulator.

Keep the [local Docker executor](local-agent-executor.md) as an optional diagnostic or compatibility
fallback. Use or extend self-hosting only for an explicit local-execution requirement or a concrete
hosted limitation, such as a required custom image or private network. Record the unmet requirement,
evidence and approved exception before changing paths. Existing Docker code or a missing hosted
configuration is not itself such evidence. Do not silently switch an uncertain existing session,
remove the fallback code, clean up its resources or rotate its credentials because of this decision.

### Final Runtime Contract

- One reviewed Agent Platform source owns instructions, tool packages, schemas and evaluations.
  Environment setup supplies those dependencies without separate local/cloud prompt copies.
- Agents API supplies session execution and hosted compute; backend owns application permissions,
  run correlation, messages, reviews, durable artifacts and audit. Admin remains the operator UI.
  Reuse the existing provider adapter and application integration, not another control plane.
- Full source evidence must reach the primary agent. Read-only MCP/Drive source access is separate
  from normal backend persistence. Runtime files or provider artifacts do not automatically become
  authorized, retained reviewer attachments.
- Preserve exact question/reply binding, unsolicited guidance, approval invalidation, truthful
  delivery status and Stop/recovery semantics. A turn ending or a stream closing is not business
  completion. Reconcile uncertainty without replaying actions or creating a replacement session.

### Implementation Follow-Through

The provider schema in [`operations.ts`](../packages/openai-platform/src/operations.ts) now accepts
hosted package/file/setup and non-secret environment fields for inline sessions and templates;
the [provider README](../packages/openai-platform/README.md#hosted-first-development-direction) owns
the precise supported contract and its remaining credential/deployment boundaries. The existing
[`SessionLaunchPort`](../packages/openai-platform/src/session-launch.ts) already separates optional
self-hosted provisioning from session control. Extend those existing boundaries rather than add a
parallel launcher. The credentialing application composition still needs a hosted profile and
connected verification; a configuration-label change alone does not complete that work.

The shared adapter also supports explicit same-run MCP credential delivery to hosted tools through
OpenAI's credential vault. Backend persists only its non-secret launch-correlated receipt and can
resume proven-undispatched setup after restart. Its `openai-service` composition supplies the
application key from an explicitly selected managed secret, while `openai-local` retains the
workstation resolver; both use the same provider artifact. These implementations have synthetic
SDK/database coverage, not deployed or live-source acceptance. Google credential binding and
hosted-file-to-reviewer evidence delivery remain distinct integration work.

The next implementation checkpoint is one normal-app source-to-review/correction demonstration.
Its reviewable changes have these distinct owners:

| Change                                     | Includes / owning files or subsystem                                                                                                                                                                                      | Explicitly excludes                                                                                                    | Verification                                                                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosted launch and tool setup               | Existing `operations.ts`, `session-launch.ts`, provider packaging and backend runtime composition; reviewed dependencies, explicit Google/MCP bindings, supported credential delivery and hosted readiness/error handling | A new executor service, Docker provisioning as a prerequisite, automatic adapter fallback, payer writes                | Ordinary QA plus configuration/launch regressions; hosted selection must not require or invoke `DockerSessionExecutor`; actual tool/file access needs authorized connected evidence |
| Exact reviewer artifact handoff            | Agent Platform source/output receipts and the existing backend document-retention/publication boundary; original versus export/derived identity and matching bytes                                                        | A backend Drive reader, runtime scratch treated as durable evidence, changed review authority                          | Original/export/derived receipt, mismatch and permission tests; inspect retained files in the normal admin                                                                          |
| Connected workflow and recovery acceptance | Existing preparation/publication functions, live panel, durable message/review history and recovery paths; fix observed defects in their owner                                                                            | Fixture packages presented as agent output, reopening MVP alignment, claiming payer population or production readiness | Real agent reads full sources, publishes, receives guidance/questions or corrections, revises; browser closure/reload, backend restart and Stop remain truthful                     |

Keep safe coding and preflight ahead of live execution; do not add another standalone playground.
Before a paid check, verify required identities, source visibility, package compatibility and the
approved test scope. Google credential delivery must be supported by the actual reader and hosting
configuration; neither a Desktop connector nor an MCP grant supplies it automatically. Missing
configuration calls for completing that binding, not inventing a new credential service.

Hosted startup is provider-managed; the application still records launch intent/receipt, observes
setup failures and reconciles the known session. Stop is not session deletion or loss of retained
evidence. Use the provider's supported files/artifacts interfaces and preserve needed output in its
application owner before cleanup. Active-work, human-wait and sandbox lifetimes remain distinct.
The [compatibility assessment](agents-api-compatibility.md) and [roadmap](managed-runtime-completion-roadmap.md)
continue to own broader admission gates; this checkpoint does not remove controlled-resume,
source-coverage, hosted-storage, payer-action or deployment work from the credentialing MVP.

## Supervised Desktop Behavior Trial Procedure

For the initial synthetic development loop, use a fresh task in the desktop app and existing
workflow tools. A custom CLI harness or sealed benchmark is not a prerequisite to learning whether
the workflow can investigate evidence and produce a useful proposal. This is a supervised behavior
lane, not proof of access isolation, managed execution or the complete MVP.

1. The coordinator verifies the target task's history and records a trial ID, source revision and
   dirty-source fingerprints, canonical skill/schema/tool/fixture versions, approved model and
   reasoning effort, and budgets. Record requested settings separately from independently observed
   runtime settings; mark unavailable token/cost telemetry as unavailable.
2. Send only the canonical skill, output contract, case selector and authorized synthetic-tool
   interface. Use the adopting workflow's canonical desktop-trial launch template.
   Do not provide project conversations, vault narratives, other trial answers, rubrics, tests or
   full fixture snapshots. Mandatory host safety instructions remain applicable. Explicitly scope
   this as evidence preparation, not repository research or implementation.
3. Start with one case and one pass. The reference prompt bounds work to twelve synthetic data
   calls and approximately five minutes; the supervisor enforces the elapsed-time limit. The worker
   must stop on setup failure rather than install dependencies, repair tooling or expand access.
   Provision the checkout before the trial. No external reads, writes, subagents or code changes
   are authorized in this synthetic lane.
4. Save the original response and actual activity before giving feedback. Independently validate
   the structured output, then check source support, contradictions, necessary versus avoidable
   questions, exact scope/revisions, human stops and truthful outcome claims. Review actual tool
   activity, not only the worker's self-reported receipt. Excluded-context or out-of-scope access
   invalidates the trial; record the failure rather than silently rerunning or counting a pass.
5. Preserve a sanitized receipt outside worker context: exact launch prompt, proposal, activity,
   provenance, observed duration/usage, reviewer findings and limitations. Keep raw private reasoning
   and sensitive data out. Detailed local evidence belongs in the owning repository hub's ignored
   artifacts, not in shared instructions or the vault project narrative.
6. For independent repeats, use another fresh task or a supported context reset explicitly
   authorized for that exact task. Save evidence first and verify prior case history is absent.
   Compaction, a fork that retains history, or asking the agent to forget is not a clean reset.
   Never edit native session files or clear unrelated/global memory. If reset is unavailable,
   disclose that limit instead of labeling a continuation independent.
7. Once the smoke path works, repeat contrasting and exception cases, including less-leading
   variants and an unseen case. Compare approved reasoning settings with identical source/prompt
   versions and repeated matched trials. A single easy pass is not reliability, generalization,
   skill-discovery or model-selection evidence. Do not make a large benchmark a new prerequisite
   for the thin real-API connected slice.

The workflow owner maintains its trial inputs and reviewer criteria. Recheck this procedure when
the host, tool interface, skill, schema, model or reasoning setting changes. The same business
behavior remains canonical across Desktop and managed contexts; this launch procedure is only a
host-specific test adapter. Isolation and control-plane acceptance still belong to stages 2 and 3.

## Stable Ownership And Contracts

Keep instructions, tools, schemas, fixtures and workflow-specific code together in Agent Platform.
The application owns its business records, permissions, review/action enforcement and operator UI.
Use one run-control authority; do not create an application scheduler/retry engine that competes
with the adopted API. Persist business checkpoints and approved artifacts independently from
ephemeral execution files or provider conversation memory.

Across contexts preserve work identity, exact evidence/route/source revisions, structured proposals,
approval invalidation, question/reply state, operation receipts and truthful milestones. An uncertain
launch or external effect must be reconciled, not retried by switching adapters. Stop requested is
not stopped; operator commentary is not an action receipt. Expose permitted activity summaries,
evidence and tool outcomes, not raw secrets, private data or private chain of thought.

Use existing scoped Headstart MCP reads where suitable. Capability bindings must verify identity,
target and permission; inherited Desktop tools and employee credentials are not managed profiles.
Track a revocable worker identity separately from payer/browser access and any protected artifact
delivery. See the [MCP identity gate](managed-runtime-completion-roadmap.md#headstart-mcp-worker-identity-follow-through).

## Reference And Evidence Boundary

Provider credentialing is the intended reference implementation, delivered in a separate consumer
review. Its preparation contracts, connected instructions, tools and application handoff definitions
remain workflow-owned; this shared runtime alone does not establish real-source hosted acceptance.

Develop a thin connected case early, then expand its evidence and failure coverage. Do not label
schema-valid fixtures or mocked actions as a completed agent evaluation. Record Desktop behavior,
real-API connected behavior and deployed-application acceptance separately. Missing identity or payer authority
blocks affected live operations, not safe synthetic implementation.

Return to the [documentation hub](README.md) or [workflow authoring guide](workflow-authoring-guide.md).
