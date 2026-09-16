# Agent Workflow Development And Integration

## One Workflow, Three Validation Contexts

For workflows requiring an application-controlled agent, use this development sequence:

1. **Desktop authoring and fresh-context behavior trials.** Develop canonical skills, tools,
   contracts and synthetic cases. Let the agent investigate evidence and adapt within its scope.
   Add deterministic code for validation and enforced invariants, not a replacement scripted
   decision engine. A successful Desktop run proves neither managed identity nor application control.
2. **Real Agents API with an isolated local executor.** Connect the local application adapters to
   actual API sessions while execution resources run locally. The API already supplies the harness
   and control surface in this stage. Exercise start, operator input, stop request/confirmation,
   reconnect, recovery and structured results through that API—not an API-shaped mock wrapping a
   Desktop conversation. Implement and verify the supported executor protocol before claiming parity.
3. **Intended hosted-environment validation.** Replay the same behavior and control cases against
   the selected hosted execution binding. Revalidate filesystem/network isolation, tools, identity,
   artifact handling and failure semantics. Changing the environment is not permission to fork
   workflow prompts or change business authority.

This is the approved development pattern, not proof that stage 2 infrastructure exists or a
selection of production hosting. The [compatibility assessment](agents-api-compatibility.md) and
[roadmap](managed-runtime-completion-roadmap.md) still govern hosted-provider acceptance. An isolated
local executor is justified here by local cross-application integration; it does not preselect an
AWS worker for production. The tested SDK library remains useful for its existing conformance cases,
but a separate SDK service or API emulator is not a prerequisite to this integration path.

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
   interface. Use the credentialing [launch template](../workflows/provider-credentialing/prompts/desktop-trial.md).
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

[Provider credentialing](../workflows/provider-credentialing/README.md) is the intended reference
implementation. Its current foundation supplies only synthetic preparation contracts, investigative
tools, instructions and tests. It is not yet a connected or hosted reference implementation.

Develop a thin connected case early, then expand its evidence and failure coverage. Do not label
schema-valid fixtures or mocked actions as a completed agent evaluation. Record Desktop behavior,
real-API control behavior and hosted acceptance separately. Missing identity or payer authority
blocks affected live operations, not safe synthetic implementation.

Return to the [documentation hub](README.md) or [workflow authoring guide](workflow-authoring-guide.md).
