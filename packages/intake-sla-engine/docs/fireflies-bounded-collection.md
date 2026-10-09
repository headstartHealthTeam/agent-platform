# Bounded Fireflies Collection

This protected-file bridge selects fresh candidate bodies and checkpoints their
authorized connector responses. It does not call Fireflies, reuse prior bodies,
interpret transcripts, publish a Sheet, or write Salesforce. It replaces
task-authored candidate selection and body writers, not source collection
authority or the [collection contract](fireflies-collection-contract.md).

## Explicit modes

- `bounded-fresh`: planned search outcomes select bodies inside dependent
  identity windows and the fixed cutoff. Unrelated discovery entries are not
  body requirements and cannot block operations merely because they are live.
  Every required candidate still needs a complete fresh body.
- `cache-shadow-experiment`: deliberate whole-inventory body validation, not
  bounded operational collection. A failed experiment cannot establish a cache
  baseline or authorize use of incomplete evidence.
- `cache-reuse`: separate approved-policy path; this change approves neither
  reuse nor a validation-age policy.

One private run cannot mix these plans. Commands never silently switch modes,
erase a conflicting plan, or overwrite an unrelated transcript inventory.

## Current-run inputs

Use an owner-only private run directory outside Git, containing the exact
`identity_profile_rows.json`, generated `fireflies_run_inventory.json`, and
fully paginated, scope-verified `fireflies_discovery.json`. Preserve raw discovery
and its receipt when using the normalization adapter. Reuse valid already
collected discovery; these commands do not request another poll.

Save actual finalized query outcomes as `fireflies_search_execution.json`:

```json
{
  "version": "2026-09-11.1",
  "runId": "synthetic-run",
  "asOf": "2026-01-10T17:00:00.000Z",
  "startedAt": "2026-01-10T17:00:00.000Z",
  "completedAt": "2026-01-10T17:02:00.000Z",
  "collectionPlanHash": "sha256Json of the exact collection plan",
  "scopeHash": "sha256Json of verified discovery scope",
  "accessVerified": true,
  "attempts": [
    {
      "requestKey": "exact planned request key",
      "completed": true,
      "paginationComplete": true,
      "pages": 1,
      "meetingIds": ["synthetic-transcript"]
    }
  ]
}
```

These operator-recorded receipts attest source coverage; they are not remote
cryptographic proofs. A completed zero-hit search requires a real exhausted
query, `meetingIds: []`, and a positive page count. Never manufacture completion
from a missing cursor or relabel historical attempts as current. Missing and
failed requests remain row-level exceptions. Unknown/duplicate request keys,
invalid provenance, and missing discovery metadata fail planning. Selection
preserves every recorded hit inside a dependent identity window, deduplicated
by transcript ID; a missing body is never proof of irrelevance.

Conditional fallback skips use `skipped: true`, `completed: false`, `pages: 0`,
`meetingIds: []`, and one `skipProofs` entry per dependent Opportunity. Each
entry names `opportunityId`, an actually completed lower-tier `priorRequestKey`,
nonempty `usableMeetingIds`, and `providerIdentityVerified: true`. The planner
checks the same provider, every mandatory primary email, the identity window,
and discovery metadata. Finalization also requires the cited fresh bodies to be
nonempty. Silent or unavailable bodies invalidate the skip. A skip is not a
completed-empty search; missing primary paths and identity gaps stay blocked.

## Plan and resume

```bash
headstart-intake-sla review:fireflies-bounded --action plan --run-dir <private-run>
headstart-intake-sla review:fireflies-bounded --action status --run-dir <private-run>
```

The immutable `fireflies_candidate_fetch_manifest.json` binds discovery, search
execution, identities, collection plan, run ID, and cutoff. Stdout reports only
counts. Status verifies accepted bodies and writes private
`fireflies_pending_fetches.json`; retrieve only those IDs under the existing
primary/retry/fallback policy.

Use one queue owner and wait for its preceding batch to finish before running
status again. Never resume from an in-memory counter or a stale pending file.
Each pending entry includes its manifest `index`, protected `captureFile`, and
`action`: `Fetch` or `Resume capture`. A retained raw capture requires local
resume, not another remote request.

### Response-gated native reads

For a host with an in-process approved connector binding, use
`executeFirefliesReads` from the public `@headstart-health/intake-sla-engine` API. Supply the native
body reader as `read({ transcriptId })`; it returns the untouched connector
response. The explicit endpoint is `fireflies_fetch` or the existing permitted
`fireflies_get_transcript` fallback. The helper does not acquire credentials,
select an alternate API, expand the manifest, finalize evidence or publish.

It refreshes pending work from verified checkpoints, resumes retained raw
captures locally, dispatches one read at a time, and checkpoints an accepted body
before the next read. Successes are paced by at least 1,100 ms; this is pacing,
not a guarantee against a shared provider quota. Native/structured error
envelopes, thrown transport failures and malformed bodies stop the queue
immediately. Failed responses never count as fetched or accepted evidence.

The private `fireflies-read-session/state.json` records the manifest binding,
per-candidate/per-endpoint attempts and sanitized failure/cooldown state. One
session lease prevents concurrent executors. A quota failure stops with at least
60 seconds of cooldown, or the longer provider Retry-After. An explicit later
invocation may retry only after the cooldown; each endpoint has at most two
attempts per candidate across invocations. No automatic fallback bypasses a
shared quota. Access or invalid-body failures need source recovery, not repeated
logins or unlimited retries. A valid separately recovered canonical capture can
resolve that failed item; never delete state to reset the attempt budget.
Local acceptance or raw-capture recovery does not clear a provider-wide cooldown,
including a longer Retry-After on a transient server error. Both endpoints remain
paused until that deadline, even when the failed candidate is already recovered.

A desktop without callback binding must not claim this helper automatically
drives its plugin. Use the same **read one response, await canonical capture,
then dispatch the next** sequence with native tools. The capture command below
returns a nonzero exit and sanitized `stopDispatch: true` for errors, including
`FIREFLIES_RATE_LIMITED` and a minimum cooldown. Stop immediately, honor the
cooldown and the existing two-attempt-per-tool limit, and preserve the source
attempt receipt privately. Do not use fire-and-forget batches or count
`Promise.allSettled` fulfillments as successful reads: a fulfilled tool call can
contain an error envelope. Already received valid responses may be checkpointed
without refetching, but do not dispatch additional reads while paused.

For native text responses, pass the complete envelope (`retrievedAt`,
`retrievalEndpoint`, and untouched `response`) directly to the protected writer:

```bash
headstart-intake-sla review:fireflies-body-capture --run-dir <private-run> --index <manifest-index> --input -
# Resume the already retained raw response without stdin or a remote read:
headstart-intake-sla review:fireflies-body-capture --run-dir <private-run> --index <manifest-index>
```

The command accepts at most 64 MB on stdin and never prints the body. It binds
the response to current manifest metadata, then writes the immutable raw capture,
normalization receipt, and accepted checkpoint under one run lock, checkpoint
last. Identical retries complete interrupted writes; conflicting captures are
rejected without replacing raw or accepted evidence. The file-input compatibility
path remains available for already captured envelopes, but hosts must not use
overwriting writes to create them. Normalized-record acceptance below is for
other documented adapters, not a reason to bypass native response provenance.

Submit successful normalized full-body records in a JSON envelope with
`version: "2026-09-11.1"`, the exact `runId`, the prepared `manifestHash`, and
`records: [...]`. Records satisfy the cache's normalized transcript contract:
full metadata, explicit completion/empty status, endpoint, original retrieval
timestamp, and full body rather than a summary. Retrieval must follow the
bound discovery and search completion; old timestamps are never rewritten.

```bash
headstart-intake-sla review:fireflies-bounded --action accept --run-dir <private-run> --input <private-capture.json>
# Or pipe the complete JSON envelope directly using --input - (maximum 64 MB).
headstart-intake-sla review:fireflies-bounded --action status --run-dir <private-run>
headstart-intake-sla review:fireflies-bounded --action finalize --run-dir <private-run>
```

The entire incoming batch is validated before item writes. Each body has an
atomic, hash-bound checkpoint. Identical retries are harmless; conflicting,
stale, duplicate, live, incomplete, or unexpected records are rejected.
Interrupted input and `.tmp` files never count. If a batch stops between item
writes, earlier accepted items remain valid and status identifies only missing
bodies. Never remove an active writer lock.

Finalization requires every candidate, writes the existing JSONL inventory and
execution artifact, and publishes `fireflies_bounded_proof.json` last. Pending
proof cannot pass replay/build. Resume interrupted finalization from identical
inputs; completed finalization is verified without rewriting it. Search
exceptions remain blocked after body finalization. Required-body failures
prevent finalization; no older body fills a gap.

Run existing replay with the same explicit `RUN_AT` and `SOURCE_CUTOFF`.
`fireflies_bounded_replay.json` binds the inventory, identities, and rows; the
builder checks exactly what it consumes. Interpretation, QA, fingerprint,
reviewer-preservation, workbook, concurrency, and publication gates remain
unchanged. Source finalization is not publication approval.

Replay emits sanitized phase/count/elapsed progress on stderr; stdout remains
the final JSON summary. `fireflies_replay_execution.json` separately records
`startedAt`, `completedAt`, `elapsedMs`, phase durations, and matching CPU time.
`searchedAt` retains its source meaning and is not execution start time. The
run lock still covers validation, matching, and persistence; sequence other
checkpoint writes after replay instead of removing the lock. These observations
support profiling without changing matching or completeness policy.

## Package navigation

[Local setup](local-setup.md) · [Package overview](../README.md)
