# Durable Recovery Adapters

These code-only corrections replace the failure-prone local normalization,
checkpoint and publication helpers. They do not change Intake policy, authorize
a live run, establish credentials, approve cache reuse, or replace any QA gate.
Use a reviewed revision and an approved host capability before operational use.
The installed operator skill and the main runbook still own run selection.

## Setup and runtime

Provision the reviewed standalone runtime using [Local Setup](local-setup.md), then run
`headstart-intake-sla review:validate` for the compiled synthetic suite and distribution check.
The locked runtime includes `csv-parse` for strict native Portal CSV parsing.
Run `headstart-intake-sla review:runtime-preflight --run-dir <private-run>` before a
rebuild. `review:build` invokes it automatically. Resolution uses the explicit
`SLA_ARTIFACT_TOOL_PATH`, otherwise package resolution including `NODE_PATH`.
Use the host's approved dependency loader to obtain these bindings; never copy
another operator's absolute runtime path. Node 22+ and the Workbook/FileBlob/
SpreadsheetFile export contract are required. Provenance records the runtime
identity and resolution method, not its filesystem path.

## Billing evidence and the legacy Production baseline

The `2026-09-14.1` evidence contract distinguishes an explicitly completed
**session** from whole-assessment completion. `IA_Completed_Date__c` is the
Production **97151 Started Date**; that field alone does not prove final
assessment completion or a stale stage. Do not import the newer Partial-only
provider-confirmed lifecycle into this contract.

The bounded collector retrieves all Billing / Claims rows linked to each cohort
Opportunity directly **or through its Authorization parent**, without a date or
status limit. Its current-contract receipt binds the complete response, query,
cohort and frozen cutoff. Existing structured rebuilds require that exact
receipt; a missing or obsolete receipt requires refreshing Billing only, not
discarding unrelated evidence. Both relationship paths are checked; conflicting
owners produce review exceptions for the affected cohort rows.

The shared normalizer requires explicit `Completed__c = Yes`, a valid nonfuture
service date and no conflicting completion/status/relationship signals. A
completion timestamp after the frozen cutoff is not current completion proof.
Completed inactive sessions remain historical evidence but do not prove an
Active-only catch-up transition. Negative status text and populated dates alone
never count as completion.

Exact 97151 session evidence, complete linked coverage and no incomplete active
assessment work support the legacy Production transition check. Outstanding
assessment-support sessions count as work remaining, but support-only activity
cannot supply the 97151 start. A populated start date plus `IA Scheduled` is
not automatically wrong: outstanding sessions and the field meaning control.
The final storyline must not promote session/start facts into whole-assessment
completion through text matching. Partial-assessment wording must not invent the
subtype of the remaining work. When all outstanding sessions have known current
or future dates and there is no conflicting evidence, preserve the earliest
scheduled date and Monitor action. A separate past unresolved session still
requires outcome verification; a future booking cannot conceal it.
Treatment uses completed Active nonfuture direct care (including the documented
service-name fallback), with order-independent earliest qualifying evidence.
Existing first-treatment dates that disagree require provenance review, not an
automatic overwrite or an assumed admission transition.

Known Production edge cases are not accepted as business truth. Ambiguous,
conflicting or unsupported conclusions remain `Review`, including through an
authorization gate. Confirmed reconciliation gaps name the supporting mismatch
and route Salesforce-owner follow-up; the engine performs no Salesforce write.
`billing_reconciliation_report.json` records every row and aggregate counts.
Any private fingerprint acceptance must separately identify the reviewed live
hash and operator authorization; this contract does not auto-accept future drift.

## Durable connector transport

Native Fireflies text captures may be normalized with `headstart-intake-sla review:fireflies-body-capture
--run-dir <private-run> --input <raw-capture.json> --index <candidate-index>`.
The input preserves `response`, `retrievalEndpoint`, and the original `retrievedAt`.
The adapter verifies the exact candidate identity, title, organizer, participant
and attendee emails and processed/live state. The JSON listing retains its
millisecond timestamp when the native text envelope renders that same second
with `.000Z`; any different second or conflicting fractional value fails.
The separate calendar `Date` field is not substituted for `dateString`.
`No meeting attendees` must agree with an empty listing, and the exact native
`No sentences` marker becomes explicit empty evidence, never transcript speech.
Raw hashes and normalization provenance remain private. The existing bounded
manifest, timestamp, conflicting-retry and full-body gates still apply.

`review:checkpoint` accepts `--action plan|status|accept|finalize`, `--run-dir`,
and `--plan <private-plan.json>`. Accept additionally takes `--input <file>` or
`--input -` for complete JSON stdin, capped at 64 MB.

The version-1 plan contains `runId`, `source` (a lowercase identifier), `asOf`,
`inputHash` (the hash of the exact source plan), and `requests`, each with a
unique stable `requestKey`. `checkpointPlan` computes `planHash`.
An accepted batch contains:

```json
{
  "version": 1,
  "runId": "synthetic-run",
  "planHash": "exact checkpoint plan hash",
  "batchId": "synthetic-batch-1",
  "expectedRequestCount": 1,
  "complete": true,
  "results": [{ "requestKey": "planned-key", "status": "Complete", "output": {} }]
}
```

`Complete` here means the connector response was captured, not that the source
has passed pagination, identity, content, or semantic validation. `Blocked`,
`Timed Out`, and `Unsupported` are terminal accounted outcomes, never successes.
Source adapters must still validate the output. Every result gets a hashed,
atomic item checkpoint. The complete batch is validated before item writes;
identical retries do not replace saved results. Conflicting retries fail closed.
Status derives missing requests from saved item checkpoints; temporary streams
do not count. Finalization requires every planned outcome and preserves failed
statuses. Files stay owner-only outside Git. One writer owns a run at a time.
Never remove an active writer lock. A crashed lock requires operator inspection
of the owning process before recovery; it is not automatically broken.

Source checkpoint, Portal/Slack capture, bounded Fireflies acceptance and replay
transactions now wait up to ten seconds for the run writer, then fail with the
lock intact. The mutable-run check executes again after acquisition. This is
bounded cross-process serialization of short local transactions, not permission
to overlap collection owners or queue publication behind a competing run.
Publication and shared-cache leases retain immediate contention rejection.

Use the protected capture/checkpoint commands and their documented stdin or private-file inputs,
not JSON in command-line arguments. They validate input, reject conflicting retries, use private
atomic writes, and do not print source values. Published
runs and their subdirectories are immutable, including receipts using the actual
`publicationStatus: Published` schema.
The cache plan/materialization command checks this before creating directories
or locks and again under its writer locks. Fireflies replay uses the same run
lock and immutable-run guard; experiments and corrections require a separate run.

## Portal Authorization Requests

`review:portal-auth-capture --run-dir <private-run> --input <private-capture>`
accepts a version-1 capture with exact `runId`, ISO `asOf`, `collectedAt`,
`readOnly: true`, `accessVerified: true`, and `complete: true`.

- API-first: `mode: api`, `method: GET`,
  `endpoint: /authrequest/admin/all-requests`, `paginationComplete: true`,
  `expectedCount`, and `records` containing the complete authorized response.
- Native fallback: `mode: native-csv`, `exporterTimezone: America/New_York`,
  and exactly two `views` (`active` and `inactive`). Each has `csv` (original
  text), `expectedCount`, `complete: true`, and `unfiltered: true`. A header-only
  zero-row view is explicit; a missing export is not zero.

The schema follows Admin Portal `AuthRequestList.tsx` and `RequestAuth.types.ts`:
12 exact export columns, ASSESSMENT/TREATMENT, known lifecycle values, required
client/provider/request identities, and valid created/updated timestamps.
Both views are checked for unique non-overlapping request numbers. BOMs, quoted
commas and embedded newlines are parsed with
[csv-parse](https://csv.js.org/parse/options/), not string splitting.
Impossible or DST-ambiguous local timestamps require the API's timezone-bearing
timestamp. No date alone proves business completion.

The command preserves raw capture separately and creates the existing
`portal_auth_request_inventory.json` contract with its capture hash. The builder
recomputes and checks this derivation and its run/cutoff. It does not accept an
edited derived inventory. Source permissions and proof that both exports were
unfiltered remain operator/provider attestations, not cryptographic server proof.
Acquire exports directly into protected storage. If a browser creates a
temporary Downloads export, remove only the specifically verified transient
copy after the protected capture and downstream validation succeed, using the
host's approved cleanup procedure. No automatic broad deletion is performed.

## Slack pagination and bounded delta

Fireflies body dispatch uses the corresponding
[response-gated native read contract](fireflies-bounded-collection.md#response-gated-native-reads).
Await response validation and checkpoint acceptance before another request;
tool-level success does not make an embedded quota/error response valid evidence.

The public `@headstart-health/intake-sla-engine` API provides `executeSlackReads` for hosts that can bind
the approved native connector as `readers.search` and `readers.thread` callbacks.
Its checkpoint plan fixes every request key, `operation: search|thread` and
`arguments`; source must be `slack`. Corresponding `validators` must run the
existing exact search-page or counted-thread parser before acceptance. The
executor does not discover credentials, select another transport, invoke dynamic
tool names or expose a Slack write capability. No new hosted runner is installed.

Only pending requests run, sequentially with 1,100 ms between successes. Explicit
429/rate-limited or 5xx failures retry the same request at most twice, using
exponential backoff, jitter and numeric/date Retry-After; waits over 60 seconds
stop. Access denial, malformed responses and unknown transport failures stop
without retry. Completed responses are checkpointed unchanged. Terminal failed
checkpoints retain sanitized status/attempt counts and require explicit source
recovery, not an automatic new retry budget on each invocation. A source lease
rejects a second concurrent executor. Whole-source pagination, thread expansion,
identity and cutoff validation remain separate mandatory gates.

In a desktop session without an in-process native callback binding, use the same
sequential pacing and bounded retry policy with native tool calls and capture
their real responses through `review:checkpoint`; do not claim the executor is
automatically driving the plugin. This host capability boundary is explicit,
not a temporary credential wrapper or permission for a direct Slack API fallback.

`review:slack-capture` takes a private run and capture file. The capture binds
`version: 1`, `runId`, exact `asOf`, `collectedAt`, `accessVerified: true`,
`planHash` of `slack_full_sweep_plan.json`, `scopeHash` of its scope, and `pages`.
Each page carries the planned `opportunityId`, `query`, one-based `pageNumber`,
exact input `requestCursor` (empty on page one), `complete: true`, and `response`.

Supported structured response contracts are `messages.matches` or `records`,
with explicit `response_metadata.next_cursor`, `next_cursor`, `nextCursor`, or
the [Slack page/pages counters](https://docs.slack.dev/reference/methods/search.messages/).
Messages require channel ID, timestamp and text. When supplied, reply counts
must be consistent nonnegative integers. Missing/null counts stay `null`, not
zero: the documented search response does not guarantee reply metadata.
Current-story matches with unknown counts require a counted message/thread
capture before merge can mark thread coverage complete. An explicitly confirmed
zero remains valid; a pagination flag on uncounted rendered text is insufficient.
No cursor field is not proof of completion. Conflicting signals, repeated pages,
cursor loops, unknown queries, and conflicting duplicate messages fail closed.
Missing pages block only their dependent row. The adapter writes the existing
full-sweep input; `review:slack-merge` still enforces thread expansion and all
normal source gates. Raw capture is retained and the builder verifies it.

The native Slack plugin's **detailed** search envelope is also supported: preserve
the complete raw MCP result (one JSON text block), or its decoded `results` and
`pagination_info` object, in `response`. Collect with `response_format: detailed`,
`include_context: false`, and `content_types: messages`. The adapter requires the
exact planned query header, page-local result count and sequential numbering,
channel IDs, message timestamps, matching Slack permalinks, complete message
boundaries, and an explicit terminal sentence or opaque next-page cursor in the
separate pagination field. It preserves message text and raw response hashes.
Missing reply counts remain unknown and still require counted thread expansion.
Concise search output, ambiguous/truncated envelopes, unsupported pagination
wording, inconsistent IDs/counts, and conflicting completeness signals fail closed.
Never infer a terminal page from a missing cursor or relabel unparsed text as empty.
The explicit-total thread adapter remains separate; search completeness alone
does not establish thread completeness. Unknown provider formats require a tested
adapter update, not an operational text rewrite.

`review:slack-delta --run-dir <private-run> --base <file> --delta <file>
--proof <file>` replaces the run-specific delta merger. Its version-1 proof must
bind both artifact hashes, unchanged scope and identity hashes, the exact base
and current cutoffs, complete pagination, **edits and deletions**. Base/delta
contain `asOf`, `scope`, `identityHash`, and `records`; delta additionally contains
`deletedKeys` in `channelId:messageTs` form. A date-filtered new-message search
alone cannot supply that proof: refresh Slack when incremental completeness is
unproven. The merged private evidence is not a source-readiness receipt and must
go through current matching, search accounting and thread verification.

## New correction run, not a restarted collection

```bash
headstart-intake-sla review:correction-init --base-run-dir <published-base> \
  --run-dir <new-private-run> --run-id <new-run-id> --as-of <new-ISO-cutoff>
headstart-intake-sla review:structured-delta --base-run-dir <published-base> \
  --run-dir <new-private-run>
```

Use the normal `sla-review-<ISO timestamp with colon/dot replaced by hyphen>`
run ID. Initialization verifies the base manifest, passed gate, every stage and
call payload, stage observations, final assertions, object-form ledger identities
and summary hashes, and the base run's exact Published ledger assertions. It
carries only immutable ledger provenance and correction metadata into a new
private directory. It does not copy source artifacts, reviewer state, QA, or
recommendations and never touches the published base. The completion receipt is
written last; identical interrupted initialization can resume. The builder rejects
partial initialization, a different cutoff, or changed inherited ledger rows.

After the authorized structured refresh, delta analysis requires all 17 current
structured artifacts, including explicit empty sources. It compares exact record
content, follows direct/indirect links through both snapshots, includes deletions,
and reports affected, removed and unchanged Opportunity IDs privately. An unknown
owner expands to the whole cohort; it never establishes an unchanged row.

The report does not authorize source reuse. Portal remains current-run fresh.
Fireflies uses current discovery and fresh candidate bodies (see the bounded
collection contract). Slack reuse needs edit/deletion-complete provenance.
Only exact API packet/model/prompt/schema/engine bindings may reuse interpretations.
Rebuild and revalidate every current row, not just changed rows.

`review:post-cutoff-capture` takes a read-only Production capture whose
`organizationId`, `isSandbox: false`, and `checkedAt` match the current cohort
refresh. It requires `salesforceReadOnly: true` and the exact affected `records`
with Salesforce `Id` and `LastModifiedDate`. The command materializes the existing
post-cutoff disposition only when all material IDs are present exactly once and
all modification times are strictly after the frozen cutoff and no later than
the capture. It does not query or write Salesforce and grants no publication
authority. The existing gate still decides whether the snapshot can publish.

## Bounded API interpretation

For an approved AWS-backed host, `review:interpret-with-aws` replaces an external
shell credential wrapper. Supply explicit `--profile`, `--region`, `--secret-id`,
`--run-dir`, and `--action preflight|interpret` (interpret also requires
`--prior-run-dir`). Set `SLA_AI_INTERPRETATION=on`,
`SLA_INTERPRETER_PROVIDER=openai-responses`, and `SLA_INTERPRETER_MODEL=gpt-5.6-sol`
explicitly. No host binding or secret is hard-coded. The command clears the
inherited key, captures Secrets Manager output in memory, accepts an unambiguous
plain-string or named-key JSON secret, and injects it only into the existing
preflight/interpretation child. AWS errors are sanitized; keys never appear on
argv, in artifacts, or in stdout. This does not authenticate AWS or authorize
a different secret. Run the preflight action successfully before interpretation;
the existing structured contract, `store: false`, age and packet-binding gates
remain enforced. Credential/model failure still uses the documented current-run
Codex path, not another API model.

`review:interpret-delta` defaults to two workers; explicitly set
`SLA_INTERPRETER_CONCURRENCY` to 1–4. The configured model, approved credential
source, synthetic preflight, `store: false` and exact bindings remain mandatory.
429 responses reduce concurrency to one. Only 429/5xx retry, at most three
attempts, with exponential backoff, jitter and Retry-After. A delay beyond one
minute stops for later resume. Cancellation stops new dispatch; successful
in-flight results finish their serialized, atomic checkpoint writes. Final
assembly keeps plan order. Checkpoint writes never race. Output is counts and
sanitized errors, not packets or provider payloads. Exact packet binding is the
local idempotency key; no provider-side exactly-once guarantee is claimed.

## Google state, execution and readback

`review:google-capture --run-dir <private-run> --input <capture>
--spreadsheet-id <approved-id> --run-id <run-id>` produces canonical metadata,
publication state, live marker, reviewer state, and competing-run artifacts.
The version-1 capture contains `spreadsheetId`, `capturedAt`,
`valueRenderOption: USER_ENTERED`, `extentsVerified: true`, and `sheets` for all
seven governed tabs. Each tab supplies title, metadata-resolved ID, grid row and
column counts, exact `usedRowCount`, `rangeComplete: true`, and full captured
user-entered-value matrices. Reuse a still-valid exact capture; this command
does not request repeated ledger reads. `concurrency` supplies `currentRunId`,
the same `checkedAt`, `operatorVerified: true`, and `conflict`. An existing current
run in History additionally requires `exactResumeVerified: true`.

Only genuine empty strings/missing cells become null. False, zero, nonblank text,
and whitespace are retained. Formula-valued reviewer fields fail closed because
the current workbook field contract does not preserve that type. They are not
converted to strings. Duplicate IDs, changed markers, incomplete captures and
ambiguous reviewer identities fail closed. A last-written raw receipt binds the
five derived artifacts; preparation verifies the transaction before using them.

The public `@headstart-health/intake-sla-engine` API exposes `advancePublication` (exactly one stage) and
`finalizePublication` (read-only). The host supplies explicit plan-bound authority
and an adapter with `apply`, `readAssertions`, and a real-time `checkConcurrency`.
The latter must confirm expected-stage marker, unchanged reviewer state and no
competing run immediately before each call. A stale gate or changed payload
stops execution. Credentials or a capability flag alone are not authorization.

`createGoogleRestAdapter` supplies the actual Google transport for an approved
host: an injected in-memory token provider, pinned spreadsheet and prepared
manifest, no environment credential fallback, no redirects, and sanitized errors.
It applies only an exact hashed call and maps the prepared connector controls to
Google API field names. [Bounded GET reads](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/get)
capture actual user-entered values, formulas, validation, colors, grid and filter
metadata. Missing filter capability fails before publication; readback never
reapplies a formatting request merely to obtain metadata.

For an explicitly provisioned Headstart-owned Google ADC binding,
`review:google-read` exposes read-only `--action preflight|stage|final` with
`--run-dir`, `--spreadsheet-id`, `--config-dir`, `--client-id-file`, and
`--expected-email`. Supply absolute host paths to the dedicated owner-only
credential directory and approved desktop client; never use an inherited ADC
override or overwrite another workflow's credential store. Provision identity
and Sheets **read-only** scopes through the approved organization-owned client.
The provider verifies the client and signed-in identity before allowing bounded
GETs, keeps tokens in memory, and exposes no publication write operation.

Preflight verifies metadata access, target identity and both queue filters,
writing `google_reader_preflight.json`; it does not verify a new publication.
After the native connector applies a prepared stage, `--action stage --stage-id`
reads that stage's exact assertions into `publication_actual_<stage>.json` and
verifies them. Record the applied payload and verified readback with the existing
`review:capture-publish-readback` command before advancing. The reader does not
assert that a write occurred. `--action final` runs the existing two independent
final samples and creates `publication-readback.json` only after every recorded
stage and both samples verify. Native connector writes, concurrency checks and
Run History-last ordering remain unchanged.

GET starts are serialized at least 1,100 ms apart per adapter, including retries,
to remain below Google's [60 reads/user/project/minute limit](https://developers.google.com/workspace/sheets/api/limits).
Identical bounded requests share one response only within a single sample.
Consecutive adjacent value assertions on the same tab and identical columns can
also share an exact rectangular union, capped at 10,000 cells. No gaps, extra
columns, different tabs or formatting assertions are merged. Every original
assertion still verifies its exact coordinates, typed values and hash; both final
samples fetch independently. For example, 117 adjacent one-cell ledger assertions
require one GET per sample rather than 117. Nonmergeable reads retain pacing.
Reuse one adapter across stages to retain its pacing state. Other consumers can
still exhaust a shared quota: 429, 5xx, and transient fetch failures retry only
the current GET, up to five attempts with exponential backoff, jitter and parsed
Retry-After. Delays beyond 60 seconds stop for later operator resume. Errors retain
only sanitized status, numeric retry delay and attempt count, never source bodies
or credentials. POSTs are never automatically retried.

If reads exhaust recovery, the executor retains the incomplete sample privately,
including its successful assertions, without marking it verified. Incomplete
samples are diagnosis evidence, not a resume baseline or part of another sample.
Both complete final samples are freshly fetched; pre-/post-settle evidence is
never mixed, even when a transient GET retries inside one of them.

The executor retains per-call journals. An uncertain write is checked by live
stage readback before any continuation. If the whole stage is exact, it records
the receipt without repeating the write. An uncertain partial stage that cannot
verify requires operator reconciliation; the executor does not guess or replay
an append. Every stage verifies before advancement; Run History stays last.
Finalization takes two complete final assertion snapshots, separated by a bounded
1–30 second interval, and verifies both. It never repairs formatting automatically.
A change blocks the Published receipt even when the earlier stage passed.

Host credential provisioning and real native/managed capability acceptance remain
separate operational gates. This change does not install a new runner or schedule.
The historical nine-cell color reversion is not reproducible from sanitized source
alone; the exact cause remains open. The regression and two-sample final verifier
protect detection, not a claim that transient provider behavior was repaired.

## Package navigation

[Local setup](local-setup.md) · [Package overview](../README.md)
