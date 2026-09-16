# Provider Credentialing

This is the first **synthetic preparation foundation**, not the complete credentialing MVP.
It contains payer-neutral work/evidence/proposal contracts, scoped investigative fixture tools,
review-content fingerprinting and regression/evaluation cases. It does not implement browser
population, uploads, approval enforcement, an admin integration, or an Agents API executor. Its
canonical validator now has a standalone application-consumption artifact for the backend review
boundary described below.

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

The additional `ga-preparation` and `tx-preparation` tool scenarios use the richer contracts below.
Their invented reference proposals live separately under `fixtures/preparation`; they are test
oracles, not tool responses or model outputs. They exercise repeating records, address roles,
conversion lineage, a superseded deficient CV, qualified dates and protected-action handoffs.
Texas retains two locations and existing affiliation and uses different document signers.
These are structural contrasts informed by workflow observations, not complete payer forms,
current payer policy, real documents or evidence of a passing agent behavior trial.

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

### Application Artifact Validation

The package build emits `dist/artifact-worker.cjs`, bundling the existing canonical schema and
proposal validators and their Zod dependency. This is a deterministic validation worker, not an
agent runner, API emulator, service, model call or second workflow implementation. Backend builds
can consume the same bytes locally and in a hosted application. No new engine/package is needed.

From a reviewed, exact Agent Platform revision, run the normal frozen dependency install and package
build. Distribute the generated worker as a protected deployment artifact with its SHA-256 digest
and source revision in the deployment record. Do not publish or install it through the skills
updater, copy canonical validation source into a consuming repository, or trust a digest supplied
by the agent. No registry publication or deployment automation is supplied here.

The application launches the already-pinned worker bytes with one `workerData` object containing
`inputJson` and `proposalJson` (UTF-8 strings, at most 1 MiB each). The worker sends one message and
closes its channel. Success is `{ ok: true, value: ... }`, using protocol
`credentialing-validation/v1`; failure is the static
`{ ok: false, code: "invalid-artifacts" }`, without source-derived diagnostics.

The projection contains synthetic work identity, case/workflow/route revisions, input/output schema
versions, exact-byte fingerprints, parsed-content review fingerprint and preparation readiness.
The caller must independently match the full authoritative case scope/version, recompute the byte
fingerprints, atomically retain immutable bytes/references/history, and enforce human authorization.
The backend's source snapshot uses the decimal review-control version as `caseRevision`; source and
proposal must both bind to that revision. Progress tokens do not increment this version.

Canonical validation establishes schema, reference and stop-contract consistency, not truth of the
evidence, correct judgment, actual workflow execution or a verified worker/run principal. Input
workflow/route revision strings remain claims until the managed producer binds them to its pinned
run manifest. The application validator is trusted deployment code running with application OS
authority; a worker thread and empty environment are not a security sandbox for untrusted code.
Do not load it from agent-writable storage. Managed ingestion, runtime execution and external action
remain separately gated.

### Versioned Preparation Model

The worker and published JSON Schemas accept two explicit pairs; canonical validation rejects
cross-pair combinations. Existing artifacts and evaluations are not migrated in place.

| Input   | Proposal | Role                                                                   |
| ------- | -------- | ---------------------------------------------------------------------- |
| `0.1.0` | `0.2.0`  | Original scalar preparation scenarios and historical artifacts         |
| `0.2.0` | `0.3.0`  | Repeating records, scoped file proposals and protected-action handoffs |

`preparation-contracts.ts` is the richer canonical definition. Regenerate the checked-in JSON
Schemas with the package's `generate:schemas` command, then format and run normal QA. Legacy typed
exports remain unchanged; artifact consumers use the explicit union exports.

- `records` group fields by stable record ID for education, employment, address, ownership,
  management, license and coverage. Separate rows retain their own subjects, related parties,
  locations and periods. Address roles distinguish service, pay-to and mail-to. Unknown period
  boundaries remain null; do not turn a proxy date into a record's verified date range.
- `relatedParties` declare scoped people/organizations and cited relationship evidence. Their
  presence is not a tool authorization or proof of ownership/signing authority. Scope remains
  bounded to this synthetic case. Empty `locationIds` explicitly means case-wide; a null record
  means subject-wide. A record-specific source cannot support a different record.
- Facts preserve documented, declared, verified, operator-selected, proxy, unknown, conflicting
  and not-applicable dispositions. Operator-selected/proxy facts require a rationale. Answers
  retain a visible `basis`; citing a proxy cannot promote it to verification. `supported` means
  a proposed answer with cited support, not objective truth. Evidence-based inference remains
  allowed and must be labeled `inferred`; semantic correctness still needs agent and human review.
- Evidence keeps source system/record/version and observation time. Each proposed attachment
  resolves to one exact artifact ID, revision and digest, with media type, scope and evidence.
  A converted artifact retains exact source references and the transformation ID/revision.
  Validation rejects missing/stale references and cycles and checks the whole proposed lineage.
  There is one declared revision per artifact ID in a snapshot; prior snapshots stay immutable.
- Field and attachment requirements name their destination system/section/field. Protected-action
  requirements name action, designated actor/role, related documents and any fields/documents
  blocked by a mid-form human action. Each gets a `human-required` or `unresolved` disposition.
  These are pending handoff requirements, not grants, signatures or a workflow scheduler.
  `prepared-for-review` can include correctly routed, still-unperformed human actions; it cannot
  include unresolved files or actor routing. Those require H-02 and an incomplete/blocked status.

Artifact digests in the new fixtures are invented metadata; no file bytes are provided. The future
protected file capability must retrieve and hash actual exact-version bytes, verify transformations
and revalidate current authorization before upload. This contract does not implement conversion,
browser selectors, uploads, signatures or execution. Validation establishes structural consistency,
not that an answer is factually correct, a CV complete, or every real route requirement discovered.
Do not turn inferred requirements, supplied `verified` facts or designated actors into trusted
source-policy or permission assertions. Preserve human review and producer trust boundaries.

Both output versions require each question's `kind`: `evidence` maps to H-02, while `access`
and `reconciliation` require blocked status and H-03. Unresolved answers independently require
H-02; mixed conditions require both stops. Any outstanding question prevents prepared-for-review.
Do not silently coerce old proposals or overwrite historical evaluation results. Schema/stop checks cannot prove
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
