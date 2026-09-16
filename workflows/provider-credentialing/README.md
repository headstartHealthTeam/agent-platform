# Provider Credentialing

This is the first **synthetic preparation foundation**, not the complete credentialing MVP.
It contains payer-neutral work/evidence/proposal contracts, scoped investigative fixture tools,
review-content fingerprinting and regression/evaluation cases. It does not implement browser
population, uploads, approval enforcement, a backend/admin integration, or an Agents API executor.

The intended MVP prepares and, after exact human review, populates the first authorized Georgia
Medicaid route, reads back the result and hands protected actions to a human. Texas existing-provider
group-add is an early design contrast, not a second implemented portal. The core carries payer,
product, jurisdiction, request, location and prior-affiliation scope without Georgia branches.

## Reuse And Ownership

- Reuse the [workflow runtime](../../packages/workflow-runtime/README.md) for package/schema loading.
- Reuse the [capability contracts](../../packages/capability-contracts/README.md) for future
  permission/profile bindings; this package does not issue credentials or duplicate that framework.
- Create only workflow-owned preparation contracts and synthetic read helpers here. Agent judgment
  remains in the [canonical skill](../../skills/headstart-provider-credentialing/SKILL.md), shared
  by Desktop and future managed runs.
- The backend retains authoritative case state, permissions, approval/action enforcement and
  idempotency. The admin panel supplies the focused operator experience through those APIs.
- The [development pattern](../../docs/agent-workflow-development.md) governs connected testing.
  The existing managed runner's draft/read-only gates remain unchanged.

The `synthetic` input contract intentionally excludes live data. Fixtures are invented and are not
payer policy. This is not yet a complete C-01–C-09 wire protocol: attempt/lease handling, durable
question/reply and activity events, protected artifact delivery and server-side approvals remain
integration work. `reviewFingerprint` binds parsed input and output content; it is **not** an
approval token, signature, deduplication key or authorization service.

## Capabilities And Access Gates

Prefer existing permission-aware Headstart MCP schema, record, query and linked-file evidence reads
over a new Salesforce connector. Expose scoped tools that the agent can revisit to investigate
unexpected discrepancies; the tool boundary must constrain actual records, fields and targets.
The inspected backend file tool returns evidence/summaries, not exact-version file bytes. Protected
attachment delivery and narrowly approved actions need separately implemented capabilities.

Before managed access to real Headstart data, establish a revocable, auditable worker identity or
explicitly governed delegated model with the backend identity owner. Current employee authentication
does not prove machine-identity support. Define tool/record/field scope, target, lifetime, renewal,
revocation and initiating-human versus worker attribution; test denied and revoked access.
See the [identity roadmap](../../docs/managed-runtime-completion-roadmap.md#headstart-mcp-worker-identity-follow-through).
No identity or credential is created by this package.

Payer authentication and permission to automate remain independent. A publicly accessible portal
landing page does not prove an anonymous workflow, an authorized automation path or a sandbox.
Verify the exact route and whether navigation, save or upload causes durable/protected effects
before an authorized live test. Never pass an employee's personal cookies to an agent. A secure
same-session human access handoff, if allowed, needs its own approved design and tests.

## Synthetic Tools And Tests

From the repository root, with the pinned pnpm version and installed dependencies:

```bash
corepack pnpm --filter @headstart-health/workflow-provider-credentialing test:coverage
node --import tsx workflows/provider-credentialing/src/cli.ts ga-initial case
node --import tsx workflows/provider-credentialing/src/cli.ts ga-initial list-evidence
node --import tsx workflows/provider-credentialing/src/cli.ts ga-initial read-evidence practice-letter
```

The tools return a scoped case, evidence inventory and individually retrieved evidence.
They do not supply an answer oracle. They are independent synthetic read helpers, not a bypass for
managed-runner policy. Unsupported operations and out-of-case evidence are rejected. The manifest
has no registered MCP/CLI bindings: an isolated managed profile must explicitly bind and enforce
tools before it can run. The fixture CLI is development tooling only.

The full input snapshot is trusted fixture/validation material, not the intended initial model
message. Future preparation must supply the case projection and scoped evidence tools instead of
dumping every evidence body or the evaluation expectations into the prompt. This package does not
yet implement that isolated model-input materialization. Initial supervised development trials can
use the [Desktop procedure](../../docs/agent-workflow-development.md#supervised-desktop-behavior-trial-procedure)
and [launch template](prompts/desktop-trial.md). Those trials rely on supervision and observed access
discipline, not a claim that the Desktop host's other tools have been technically removed.

Scenarios:

| Scenario                 | Behavior to investigate                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `ga-initial`             | Discover a practice letter that resolves a missing date without asking Ops                |
| `tx-group-add`           | Preserve existing affiliation and scope two locations without Georgia assumptions         |
| `late-conflicting-files` | Distinguish a later contradicting source, an awaiting file and expired evidence           |
| `uncertain-save`         | Escalate reconciliation rather than replay a possibly completed save                      |
| `approval-not-billing`   | Notice an approval applies to another location and does not establish billing eligibility |

For a fresh-context behavioral trial, provide the skill, case/schema and access to only these tools.
Do not include expected outcomes, reference output or evaluation rubrics in the agent input.
Fixture `case` omits evidence content deliberately; it must be discovered/read. Model evaluations
must run repeatedly and record exact source, skill, fixture, model/configuration, tool calls, output,
review findings and budgets. Check both answerable investigation and genuinely necessary escalation.
A normal repository Desktop task can inspect other files; it is not a sealed evaluation environment.
Use technical isolation for sealed benchmark claims. Label supervised Desktop findings separately.

`evals/evals.json` defines cases; CI validates their contracts, not model behavior. Deterministic
tests use independently authored reference output, not a canned agent implementation. No passing
model evaluation or API/browser integration follows from these definitions alone; actual run
evidence and its limitations must be recorded separately.

## Failure, Review And Activation

Output schema `0.2.0` requires each question's `kind`: `evidence` maps to H-02, while `access`
and `reconciliation` require blocked status and H-03. Unresolved answers independently require
H-02; mixed conditions require both stops. Any outstanding question prevents prepared-for-review.
The input schema remains `0.1.0`. This is an explicit draft output-contract change: do not silently
coerce old proposals or overwrite historical evaluation results. Schema/stop checks cannot prove
that a question's classification is semantically correct; source review remains necessary.

Malformed or inconsistent snapshots, stale references and invalid proposals fail validation.
An evidence read failure is explicit, never an empty success. Stop and unknown-effect scenarios
cannot be labeled ready. The fingerprint changes with sources, scope, route or proposed values;
the future backend must revalidate current state and authority before each permitted action.

H-01 pre-population review, conditional H-02/H-03, H-04 readback and H-05 protected human actions
remain the MVP boundary. H-05 applies wherever a protected effect occurs. There are no external
effects here to roll back. Future rollback/recovery must reconcile observed destination state,
not blindly repeat actions. Future logs expose sanitized activity, tool purpose/outcome, evidence
references, questions and confirmed effects—not credentials, raw private data or chain of thought.

Keep the package draft until immutable sources, owners/backups/contacts, exact capabilities,
data policy, scoped identity, operational approval/recovery, repeated behavior evaluations and
the [per-workflow adoption gate](../../docs/managed-runtime-completion-roadmap.md) are proven.
No schedule, deployment or live run is authorized.

See the [documentation hub](../../docs/README.md),
[authoring guide](../../docs/workflow-authoring-guide.md) and
[managed architecture](../../docs/codex-managed-workflow-architecture.md).
