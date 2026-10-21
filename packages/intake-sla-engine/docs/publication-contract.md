# Google Sheet Publication Contract

This contract turns an approved workbook into bounded Google Sheets payloads.
The repository prepares and verifies local artifacts. Its optional staged executor
applies writes only through an explicitly authorized host-supplied capability;
it does not discover credentials or establish authorization. A person-supervised
connector remains the capability provider. See [Durable Recovery Adapters](recovery-adapters.md).
The artifacts are provider-neutral so a future Agent Platform runner
can consume the same hashes, stages, and readback rules.

## Required Fresh Inputs

`review:prepare-publish` requires current `google_sheet_metadata_current.json`,
`google_publication_state.json`, `live_sheet_marker_current.json`,
`reviewer_state_current.json`, `salesforce_cohort_refresh.json`,
`production-drift-check.json`, and `competing_run_state.json`, plus the initial
`live_sheet_marker_initial.json` and `reviewer_state.json` captures. Current
artifacts must be at most two hours old.

To revalidate an unchanged retained Sheet without repeating full-ledger reads,
`review:google-capture --revalidate <proof.json>` accepts a current native Drive
`files.get` metadata response for the exact Sheet, with `modified_time` at or
before the original full capture. The proof has `checkedAt`, the raw successful
`response`, and a fresh independent `concurrency` check. Changed/missing file
timestamps or identity, failed responses and unverified concurrency fail closed.
The original capture is archived and its `capturedAt` remains unchanged; a
hash-bound `revalidatedAt` establishes current freshness. Preparation recomputes
the entire capture transaction before using it. Still perform the immediate
bounded reviewer/marker/count/sentinel comparison before the first write.

`google_publication_state.json` identifies the same approved spreadsheet and
contains one entry per governed tab with `title`, metadata-resolved `sheetId`,
and exact `usedRowCount`. Its Source & Run Notes, Generation Ledger, and Run
History entries also contain `values` covering their full used extent. The
connector capture must use user-entered values so formulas and booleans can be
hashed deterministically.

`competing_run_state.json` contains `checkedAt`, `currentRunId`, and `conflict`.
The authorized operator or future control plane sets `conflict: false` only
after confirming that no newer or concurrent publication owns the target.

The workbook is a frozen snapshot at `run_manifest.json.startedAt`. A fresh
Salesforce cohort refresh still verifies Production and detects changes, but
business activity after that cutoff does not invalidate the snapshot. When the
cohort changed materially, `salesforce_cohort_refresh.json` must include a
`postCutoffDisposition` that covers every materially changed Opportunity exactly
once, records a Salesforce `observedModifiedAt` later than the frozen cutoff,
confirms the check was read-only, and defers those records to the next run. A
missing record, duplicate record, unverifiable timestamp, or change at or before
the cutoff fails closed. Sheet-marker, reviewer-state, competing-run,
spreadsheet-identity, fingerprint, payload, and readback gates are unaffected.

## Stage Order

1. Expand grid capacity when required.
2. Replace Review Queue and clear only its exact stale tail.
3. Replace On-Hold Review and clear only its exact stale tail.
4. Replace Evidence Detail and clear only its exact stale tail.
5. Replace Data Dictionary and clear only its exact stale tail.
6. Replace nonterminal Source & Run Notes while retaining the prior live marker.
7. Append missing Generation Ledger rows with a publishing status.
8. Move `Last Refresh` and `Run ID` and finalize those ledger rows as Published.
9. Append the Published Run History row last.

Generation Ledger and Run History are never bulk-cleared or replacement-written.
The only permitted existing-cell change is the current run's exact ledger status
transition from publishing to Published in the terminal-marker stage. Their
stable run keys make preparation idempotent. An exact already-present row is
skipped; a partial exact ledger append resumes; a conflicting duplicate fails
closed.

Presentation requests are part of the same prepared payload, not an after-the-fact
restyle. Review Queue, On-Hold Review, Evidence Detail, and Source & Run Notes use bounded used
ranges with explicit wrapping, top alignment, and selected fixed dimensions.
Both operator queues use 72-pixel headers and 240-pixel body rows, matching the
local workbook preview. Long summaries and actions retain their full values.
Run History formatting affects only newly appended rows; existing audit-row
formatting and column dimensions remain unchanged. No sheet-wide autofit, hidden
column change, or reviewer-value mutation is authorized by this presentation
policy. Fixed heights improve scanning but cannot guarantee arbitrary evidence
text fits on screen; full values remain the content authority.

## Applying And Reading Back

`publication_stages_manifest.json` binds the run, spreadsheet, ordered stages,
call files, intermediate assertions, dedicated durable `finalAssertions`, and
payload hashes. Use `review:next-publish-stage` before each stage; it rejects a
changed stage or call file and refuses remaining write calls when the publication
gate is more than two hours old, future-dated, or lacks a valid evaluation time.
This applies to both initial publication and a partially completed run. Refresh
the required live checks and re-evaluate the gate through the documented
preparation/recovery path; do not edit its timestamp. Keep the frozen source
cutoff and valid collected evidence. Read-only capture and final verification
remain available after gate expiry. Apply only that stage's call files in order.
No monolithic all-stage request is produced.

Call budgets count expanded JSON, not just compact transport bytes, and default
to 100,000 bytes with headroom for native approval envelopes. If the first
content call is rejected **before dispatch** solely by the native approval size
limit, `review:prepare-publish --capacity-replan-rejection <receipt.json>` can
repartition unwritten content while preserving one byte-identical, verified
capacity stage. The receipt must bind the prior plan, `02-review-queue`, call
index zero, and the actual size-rejection response. The old plan, calls, gate,
and readback are archived together. Changed capacity, any content-stage receipt,
an uncertain transport outcome, or a different target fails closed. This path
does not bypass approval: every smaller call still goes through the same native
approval and every publication gate is rerun before it can be applied.

An explicit `--replan-rejection` also supports a definitive Google
`INVALID_ARGUMENT` single-cell-length rejection in Evidence Detail. Preserve
every verified completed stage and every acknowledged call before the rejected
call byte-for-byte. The receipt includes those native acknowledgments and their
original call hashes. A changed prefix or uncertain outcome fails closed. The
replan archives the prior plan and binds an exact resume prefix; `next-publish-stage`
returns only unwritten calls. The entire stage still needs an exact live readback.
Lifecycle timelines may remove separator padding and group consecutive repeated
issue keys or dates under explicit headings, then use a local legend for repeated
source and lifecycle-state labels to fit a cell; no event, metadata
value, fact, or event order is dropped. Any cell still above 50,000 characters
fails workbook QA and planning.

After the stage, read every listed assertion from the live Sheet and save those
actual values in a private JSON artifact. Include the assertion's sheet/range
coordinates. Supply a matrix of each cell's `userEnteredValue` object (or
`null`) as `values` for value assertions, `gridProperties` for grid assertions,
`rule` for data-validation assertions, `basicFilter` for filter assertions, and
an exact matrix of `backgroundColorStyle` objects as `backgroundColorStyles`
for color assertions; do not copy hashes from the manifest.
For `text-layout`, the canonical capture verifies every cell in the exact range
and returns `format` containing `wrapStrategy` and `verticalAlignment`.
For `dimension-pixels`, it reads the appropriate `rowMetadata` or `columnMetadata`
from bounded grid data and returns the declared `dimension` and exact `pixels`
array. Missing, overlapping, or mismatched metadata fails verification. The
repository's Google read adapter supports both kinds; a different provider must
expose the same fidelity before applying a plan that includes them.
Record the evidence with:

```bash
headstart-intake-sla review:capture-publish-readback \
  --run-dir <run-dir> \
  --stage-id <stage-id> \
  --actual <actual-connector-readback.json>
```

The helper hashes the captured live state itself, verifies it against the
manifest, verifies the applied stage payload from disk, and appends the ordered
stage observation to `publication_stage_readbacks.json`. Do this after every
stage before selecting the next one.

After Run History is captured, read the manifest's dedicated `finalAssertions`
from the final live Sheet into a single artifact with the same top-level
`runId` and `spreadsheetId` plus `assertions`. Intermediate assertions that are
intentionally superseded—such as the old marker and the ledger's publishing
status—are excluded from this final-state contract. Then run:

```bash
headstart-intake-sla review:verify-publish \
  --run-dir <run-dir> \
  --actual <final-connector-readback.json>
```

The final verifier rechecks the passed publication gate, manifest, every stage
and call file, every ordered stage receipt, and every assertion from the final
live snapshot before writing `publication-readback.json`.

A brand-new `Needs CSM Review` value is sent blank. When BOOLEAN validation
canonicalizes it to unchecked (`false`), the readback assertion expects that
normalization. Existing checked and unchecked values must remain exact.
Unchecked means only that no person has flagged the row for CSM review.

The run is Published only when every stage is verified and Run History is the
last successful stage. Otherwise the status remains In Progress and the next
stage is the only safe resume target.

## Package navigation

[Local setup](local-setup.md) · [Package overview](../README.md)
