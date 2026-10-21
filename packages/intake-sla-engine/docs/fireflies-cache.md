# Fireflies Transcript Cache

This optional engine path removes repeated body downloads without reusing queue
rows, recommendations, or source-search outcomes. It preserves the existing
[collection contract](fireflies-collection-contract.md), current-cohort matching,
[interpretation bindings](automation-runbook.md#ai-transcript-interpretation),
and every publication gate. It does not read a connector, call a model, publish
a Sheet, or write to Salesforce itself.

## Freshness And Rollout

Within the explicitly selected cache experiment, the default is **shadow**:
fetch every currently discovered transcript,
build with fresh bodies, and report which cached bodies would have been reused
and whether those bodies changed. This is useful validation, not a claim that
retrieval has already become faster.

For bounded operational/correction retrieval, use
[bounded collection](fireflies-bounded-collection.md). Cache CLI invocations
require `--collection-mode cache-shadow-experiment` or `--collection-mode cache-reuse`
matching `--mode`; omission cannot accidentally start whole-inventory fetching.
Do not select a whole-inventory experiment merely because a run says reuse is off.

The [Fireflies transcript schema](https://docs.fireflies.ai/schema/transcript)
does not document a dependable content revision or last-modified marker. Its
date is a creation date, not proof that the content is unchanged. Consequently:

- Every run still discovers the complete accessible meeting inventory over
  the current collection window. No creation-date-only incremental query.
- Metadata changes, new IDs, recent meetings, missing/corrupt objects, expired
  validation, and scheduled full body reconciliation cause a fresh fetch.
- A positive maximum body-validation age accepts **bounded staleness**: an edit
  invisible in discovery metadata can remain undetected until revalidation.
  It is not mathematically equivalent to fetching every body on every run.
- Do not select production intervals on the operator's behalf. Review shadow
  comparisons and approve the private policy before enabling `reuse`. Set
  `maxValidationAgeHours` to zero when fresh body reads are required each run.
- Shadow mismatches require investigation of the proposed policy; fresh bodies
  remain the output. They do not justify suppressing changes or silently
  relaxing evidence requirements.

Body caching retains full discovery and is independent of interpretation
concurrency. The current `review:interpret-delta` command already uses bounded
model workers with durable checkpoints and exact interpretation bindings; see
[AI transcript interpretation](automation-runbook.md#ai-transcript-interpretation).
Incremental source-watermark discovery and staggered reconciliation remain
separate follow-ups, not prerequisites for the body cache. Exact-bound
interpretation reuse does not enable transcript-body cache reuse.

## Private Inputs

Use separate owner-only run and cache directories outside every Git checkout.
On Windows, the operator must provision equivalent account-restricted ACLs;
POSIX mode bits do not establish Windows privacy. These helpers do not encrypt
storage: the underlying approved encrypted volume remains required. Neither
cache objects nor provenance belong in the vault, a PR, or terminal output.

The private policy is explicit, versioned, and has no production age defaults:

```json
{
  "version": "2026-09-10.1",
  "stabilizationHours": 0,
  "maxValidationAgeHours": 0,
  "fullRevalidationHours": 24,
  "approvalReference": ""
}
```

These illustrative values force fresh bodies. For a shadow experiment supply
the proposed intervals; `reuse` additionally requires a real decision reference
in `approvalReference`. A string is a record of approval, not authorization
created by software. Changing any policy field invalidates the old baseline.

First capture the current structured cohort and regenerate
`identity_profile_rows.json` and `fireflies_run_inventory.json` using the normal
`review:fireflies-plan` command with explicit `RUN_AT`. The cache is independent
of yesterday's Opportunity selection: all matching and packet construction run
again for the current profiles, stage, roster, and gate.

Save authorized, fully paginated connector discovery in the envelope below as
`fireflies_discovery_raw.json`, preserving the captured meeting fields. Do not
rewrite the raw file to satisfy downstream validation. Run:

```bash
headstart-intake-sla review:fireflies-normalize --run-dir <private-current-run>
```

The adapter derives `fireflies_discovery.json` and a versioned
`fireflies_discovery_normalization.json` receipt binding the raw and normalized
JSON hashes, collection plan, run/cutoff, and aggregate normalization counts.
It removes only null participant placeholders and defaults missing/null optional
attendee display names to an empty string. Email identities must be valid;
unknown participant objects, malformed attendees, and incomplete pagination
remain blocked. No names or identities are inferred. API field-name/timestamp
mapping is still a separate collection responsibility, not handled by this adapter.

The command never modifies the raw file or replaces different derived outputs.
An identical retry can finish a missing output after an interrupted write.
Cache planning, materialization, and replay verify this provenance when present;
an incomplete or mismatched normalization receipt cannot establish completeness.
Legacy normalized discovery without adapter provenance remains supported, but
must not be relabeled as a pristine connector capture. This command does not
select a collection mode, fetch bodies, or authorize reuse.

The discovery envelope before the adapter adds its `normalization` binding is:

```json
{
  "version": "2026-09-10.1",
  "runId": "synthetic-run",
  "asOf": "2026-01-10T17:00:00.000Z",
  "startedAt": "2026-01-10T17:00:00.000Z",
  "completedAt": "2026-01-10T17:02:00.000Z",
  "collectionPlanHash": "SHA-256 from the public engine sha256Json(collectionPlan)",
  "scope": {
    "provider": "fireflies",
    "principalId": "verified-operator-identity",
    "workspaceId": "verified-source-workspace-identity"
  },
  "accessVerified": true,
  "query": {
    "kind": "all-accessible-transcripts",
    "limit": 50,
    "fromDate": "2026-01-01T00:00:00.000Z",
    "toDate": "2026-01-10T17:00:00.000Z"
  },
  "pages": [
    {
      "offset": 0,
      "nextOffset": null,
      "status": "Complete",
      "meetings": [
        {
          "transcriptId": "synthetic-meeting",
          "date": "2026-01-02T12:00:00.000Z",
          "title": "Synthetic meeting",
          "organizerEmail": "provider@example.test",
          "participants": ["provider@example.test"],
          "meetingAttendees": [],
          "isLive": false
        }
      ]
    }
  ]
}
```

Use the verified connector principal and source workspace, not host aliases or
an arbitrary profile label. `all-accessible-transcripts` means no provider,
organizer, title, channel, or other extra filters. Follow the source's actual
pagination until exhausted. Use pages of 50, with offsets starting at zero and
increasing by exactly 50. Each nonterminal page must contain 50 meetings; the
terminal page must contain fewer than 50 and have `nextOffset: null`. Retain a
terminal empty page when the total is an exact multiple of 50. A jumped offset
or a full page labeled terminal cannot prove complete discovery.
The query must cover the entire generated collection window. Normalize API
snake_case fields, numeric dates, and attendee names explicitly. Do not invent
missing metadata or mark a failed/incomplete response complete. These receipts
record verified operator collection; they are not cryptographic source proofs.
Identity resolution and newly discovered provider-identity review still apply.

## Commands

```bash
headstart-intake-sla review:fireflies-cache --action plan \
  --run-dir <private-current-run> --cache-dir <private-persistent-cache> \
  --policy <private-policy-json> --mode shadow --collection-mode cache-shadow-experiment
```

Read the private `fireflies_cache_plan.json`. Execute only its `fetch` items
through the authorized full-transcript connector using the runbook's retries
and fallback. Save the normalized responses in the array
`fireflies_fetched_transcripts.json`; use `[]` only if no fetches are required.
Each response contains all discovery metadata plus:

```json
{
  "complete": true,
  "fullTranscript": "Full source transcript, not a meeting summary.",
  "transcriptEmpty": false,
  "retrievalEndpoint": "fireflies_fetch",
  "retrievedAt": "2026-01-10T17:03:00.000Z"
}
```

An empty processed transcript must explicitly set `transcriptEmpty: true`.
Incomplete/live transcripts and failed fetches cannot be replaced by older
cached content. Preserve speaker labels and source text before hashing; do not
hash nondeterministically redacted/pseudonymized bodies as source revisions.

```bash
headstart-intake-sla review:fireflies-cache --action materialize \
  --run-dir <private-current-run> --cache-dir <private-persistent-cache> \
  --policy <private-policy-json> --mode shadow --collection-mode cache-shadow-experiment
```

Materialization checks the original plan against current inputs and cache state,
writes the existing `fireflies_transcript_inventory.jsonl`, and binds it to
`fireflies_cache_proof.json`. It preserves original `retrievedAt` values and
records `Fresh`, `Cache Revalidated`, or `Cache Reused` separately. Replay and
the live builder validate the proof and current discovery/identity/collection plan;
partial or mismatched materialization cannot pass the freshness gate.
The replay writes a separate receipt binding its rows to the exact inventory,
identity profiles, and cache plan. The live builder requires that receipt for
cache-backed input and verifies the exact rows and identity profiles it consumes,
not a second read that could differ during a concurrent file replacement. Old
rows cannot be paired with a newer inventory or a different replay receipt.

Continue the existing runbook: `review:fireflies-replay`,
`review:fireflies-packets`, approved AI preflight and `review:interpret-delta`
with a compatible prior successful run, then rebuild and validate. Use the
same explicit `RUN_AT`/cutoff. Cached bodies never carry forward interpretations
unless the existing complete interpretation binding matches independently.
Never carry forward QA, reviewer state, recommendations, or publication approval.

## Recovery And Retention

- The first run builds a verified baseline. Old loose transcript files are not
  automatically imported as a trusted baseline; their scope/coverage is unproven.
- New, changed, or unverified objects are fetched. Deletions or lost visibility
  remove records from the current materialized inventory and active index.
- Content-addressed objects retain old versions for investigation; there is no
  automatic deletion. Apply the approved retention policy separately.
- A missing, invalid, scope-changed, or expired baseline plans full retrieval.
  Required discovery/fetch failures block instead of falling back to stale data.
- Writer locks and index fingerprints prevent concurrent lost updates. After a
  crash, confirm no writer is alive before removing an abandoned lock directory.
- An interrupted materialization is marked Pending. Rerun from the unchanged
  planned baseline; if another run advanced it, replan. Do not hand-edit a receipt.
- JSON writes are atomic and private; the cache index advances only after all
  planned bodies validate and the run artifacts are written. A completed cache
  collection is not a successful business run or a published Sheet.
- Command stdout reports only counts. Investigate private failures in the
  approved workspace; never paste source payloads into debugging messages.

The CLI returns a sanitized error code, never the raw parse error, source text,
or private path. Use the code to select the next check:

| Code                                              | Recovery                                                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `INCOMPLETE_DISCOVERY`                            | Repeat the failed or incomplete discovery using contiguous pages; do not declare an unfinished page terminal.                                    |
| `MISSING_REQUIRED_FETCH`                          | Complete every fetch in the current plan, including explicitly empty processed transcripts. Never substitute stale cache bodies.                 |
| `STALE_CACHE_PLAN`                                | Reload current inputs and replan against the current cache snapshot.                                                                             |
| `CACHE_LOCKED`                                    | Wait for the active writer; remove an abandoned lock only after verifying no writer remains.                                                     |
| `INVALID_ARTIFACT_JSON`                           | Inspect and regenerate the malformed private input, without copying its payload into logs.                                                       |
| `STORAGE_FAILURE`                                 | Check file availability, access, and available space in the private directories.                                                                 |
| `CACHE_VALIDATION_FAILED` / `INVALID_CACHE_INPUT` | Check input schema, scope, policy approval, timestamps, and proof bindings locally; regenerate the invalid stage instead of editing its receipt. |

Before production reuse, require synthetic parity and failure tests plus
representative live shadow runs, interpretation/recommendation comparison,
reviewer preservation, and normal QA/readback. This change itself does not run
that live exercise or activate a schedule.

## Package navigation

[Local setup](local-setup.md) · [Package overview](../README.md)
