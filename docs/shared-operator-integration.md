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
  actual sends and cancellation are serialized, with no replay after unknown delivery.
- Backend owns the browser-facing wire projection. Admin's shared panel/stream parser consumes it
  through a narrow client bound by the business page. Exact-document rendering/byte verification
  is also shared; evidence semantics, package membership and access authority are not.

While package distribution is unfinished, backend's `scripts/sync-agent-contracts.mjs` generates a
checksum-pinned type snapshot from this package and the admin HTTP snapshot from backend's canonical
source. Its default mode verifies source parity using explicitly supplied checkout roots. Change
canonical types, regenerate and validate all three repositories together; do not independently edit
snapshots. Local checksum tests detect body edits but cannot prove upstream freshness. This interim
mechanism does not install the OpenAI adapter or provide independently versioned package releases.
The OpenAI package now additionally builds a versioned, standalone operator artifact consumed by
the backend's explicit local composition. See its [artifact boundary](../packages/openai-platform/README.md#operator-activity-and-owning-service-integration).
The protected deployment pin and source/lockfile provenance must travel together. This establishes
dependency-independent local distribution, not automated package publication or production release.

The backend tests the same shared core with unrelated invented inventory work, not just a second
payer. Admin has a matching independent synthetic panel consumer. These prove reuse of mechanics;
they are not another product, a real-API run or credentialing behavior evaluation. Keep canonical
credentialing instructions and semantic validation in its workflow package, and retain separate
[desktop, actual-API/local-executor and hosted acceptance lanes](agent-workflow-development.md).
