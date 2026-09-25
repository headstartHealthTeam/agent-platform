# Shared operator integration boundaries

Credentialing is the first connected consumer, not the owner of reusable agent plumbing.

- `packages/workflow-contracts/src/operator.ts` owns portable operator binding, item, command and
  snapshot types. These contain no business workflow or SDK dependency.
- `packages/openai-platform` implements provider observation and guarded delivery using those
  contracts. Its existing exports remain compatible; extraction does not introduce another runner.
- Backend owns its shared run/activity/outbox module, permission-admitted streaming and serialized
  dispatch. Each business module owns its immutable run relationship, admission, stop intent,
  review and protected-action policy. Provider acceptance is not business completion.
  General messages do not resolve exact questions or authorize review/actions. Completed provider
  turns are `idle` within a dedicated session, not terminal business work. The initial root remains
  the immutable anchor while the adapter verifies later roots. Stop intent blocks new input;
  actual sends and cancellation are serialized. Explicit recovery reuses the original message
  idempotency key or exact still-pending question; uncertain delivery never creates a new command.
- Backend owns the browser-facing wire projection. Admin's shared panel/stream parser consumes it
  through a narrow client bound by the business page. Exact-document rendering/byte verification
  is also shared; evidence semantics, package membership and access authority are not.

While package distribution is unfinished, backend's `scripts/sync-agent-contracts.mjs` generates a
checksum-pinned contract/guard snapshot from this package and the admin HTTP snapshot from backend's canonical
source. Its default mode verifies source parity using explicitly supplied checkout roots. Change
canonical types, regenerate and validate all three repositories together; do not independently edit
snapshots. Local checksum tests detect body edits but cannot prove upstream freshness. This interim
mechanism does not install the OpenAI adapter or provide independently versioned package releases.
The OpenAI package now additionally builds a versioned, standalone operator artifact consumed by
the backend's explicit local composition. See its [artifact boundary](../packages/openai-platform/README.md#operator-activity-and-owning-service-integration).
The protected deployment pin and source/lockfile provenance must travel together. This establishes
dependency-independent local distribution, not automated package publication or production release.

Launch contracts also live in `workflow-contracts`. Operator adapter `0.10.0` retains the change
creation from a receipt-or-error promise to `created` / proven `not-attempted` / `unknown` outcomes.
Its read-only descriptor preflight precedes issue-once credentials and pins the expected project;
the dispatch callback lets backend commit its attempt journal after validation and immediately
before the SDK call. Read-only candidate inspection and bounded, cursor-based exact-metadata
discovery support backend-owned positive-match recovery after lost receipts. A zero-match scan is
not proof of absence, and mutable metadata is not a uniqueness guarantee. Backend retains atomic
journal/cursor/binding persistence, competing-candidate handling and Stop authority. The adapter
also requires a durably acknowledged non-secret per-launch vault receipt before delivering the
existing run's MCP credential to hosted file tools. Proven-undispatched setup can reuse that vault;
uncertain session creation still cannot be replayed. Agent Platform does not add a recovery
database or service. See the
[launch contract details](../packages/openai-platform/README.md#application-functions-and-normal-application-launch).

Hosted credential files additionally require a restricted explicit egress allowlist and the
`retainCredentialProtection` acknowledgement before any credential installation or session dispatch.
The application stores the non-secret launch-bound file hashes, unions proven-undispatched retry
hashes, and applies the canonical guard before function input/output or evidence bytes enter durable
records. A secret-storage outage must not disable controls for existing runs. These protections
target credentials, not the complete business evidence the agent needs to investigate.

The backend tests the same shared core with unrelated invented inventory work, not just a second
payer. Admin has a matching independent synthetic panel consumer. These prove reuse of mechanics;
they are not another product, a real-API run or credentialing behavior evaluation. Keep canonical
credentialing instructions and semantic validation in its workflow package, and retain separate
[desktop, normal-app/hosted-API and deployed-application acceptance lanes](agent-workflow-development.md).

## Recoverable foundation completion

Before operator handoff, complete and verify four boundaries in the existing owners: human command
reconciliation, explicit continuation after failed/stopped work, incremental observation, and a
source-neutral retained-evidence handoff. These are application contracts, not hosted provisioning.
No change permits agent-side approval, tool replay, silent credential renewal or replacement
session creation after an uncertain create.

`OperatorRuntimePort.recover` reuses the retained command identity and text. Guidance uses the
provider's message idempotency key. An answer is resubmitted only for its exact pending call; an
ended or changed question returns `superseded`, which does not claim prior delivery succeeded.
The owning service authorizes and serializes recovery with Stop, persists its outcome and retains
the original intent. Legacy adapters without recovery support must not silently replay.

Explicit `continue` is a new turn in the same owned session, not replay of an interrupted tool or
permission to undo a business review. The first dispatch verifies the exact ended root. Recovery
reuses that command's message key even if its first attempt already created a later turn. Backend
must persist the decision before dispatch, recheck current authority, and serialize it with Stop
and executor cleanup. Expired/revoked authority is a visible unavailable condition, not silently
renewed configuration. The original session/root binding and earlier decisions remain immutable.

Observation retains an ephemeral checkpoint of verified terminal roots and refreshes only the
mutable/new turn tail. Live display reconciles the newest saved-item page with its open stream.
The separate application-owned history cursor still retrieves every finalized display item; the
recent display window is not a retention limit. Restart discards the optimization and revalidates
the root chain. No provider transcript or business evidence is replaced by this cache.
