# Weekday Intake SLA Review Queue Runbook

Source runbook version: `2026-08-24.1`, including the subsequent corrections in approved Intake
revision `15b66ac3904fec49c42d60496ff6000cc8f3c60b` (engine `2026-09-22.2`). Agent Platform changes
the owning package and command launcher, not this workflow's evidence or publication policy.

## Purpose

For protected connector checkpoints, correction initialization, source-capture
adapters, bounded interpretation concurrency and staged execution interfaces,
see [Durable Recovery Adapters](recovery-adapters.md). These tools preserve the
gates below and do not establish live operating authority.

For unfamiliar note wording or a mismatch between an interpretation and the
rendered report, follow the shared operator skill's failure classification and
the [interpretation boundary](transcript-interpretation-contract.md#agent-judgment-and-deterministic-enforcement).
Use supported source-bound judgment before proposing a phrase-specific code rule;
the same publication gates still apply.

Refresh the existing Intake SLA Review Queue Google Sheet from live Headstart
Production sources using the deterministic engine in this project. The run is
read-only in Salesforce. It must never update Salesforce or create Tasks.

The operating spreadsheet is the approved Intake SLA Review Queue identified by
`SLA_SPREADSHEET_ID` in the operator's private configuration. Never infer or select a new target.

## Run Gate

Read `Source & Run Notes` and `Run History` before collecting evidence.

- The weekday 5 PM ET run is the normal afternoon refresh.
- The Monday 8 AM ET run is a normal full refresh even when Friday has a
  successful 5 PM-or-later publication.
- The Monday 10 AM ET run is a catch-up only when the Monday 8 AM refresh did
  not publish successfully.
- The Tuesday-Friday 8 AM ET run is a catch-up only when the previous business
  day lacks a successful 5 PM-or-later publication.
- The Tuesday-Friday 10 AM ET run is a second catch-up only when the missing
  prior-day publication was not completed by the 8 AM run.
- When no refresh is due, record a verified no-op without changing queue data.

## Reviewer Safety

Before building:

1. Read both live queue tabs.
2. Capture `Reviewer Notes`, `Copied to Salesforce?`, `Needs CSM Review`,
   `Reviewed By`, and `Reviewed At` by Opportunity ID, with Opportunity Name as
   fallback.
3. Write that capture to the run's `reviewer_state.json`.
4. Capture the existing Run History into `run_history_state.json`.
5. Run with `REQUIRE_REVIEWER_STATE=1`.
6. Carry forward `generation_ledger_state.json` from the prior successful run,
   or point `SLA_GENERATION_LEDGER_PATH` to the canonical protected ledger.

On the first build, the engine freezes that input in the private run's
`generation_ledger_baseline.json`, bound to the run ID. Later builds use this
baseline for generated-note exclusion and historical rows; they do not read
their own draft output as prior history. The output keeps its existing name,
`generation_ledger_state.json`, and is rebuilt atomically as the unchanged
baseline plus the latest current-run rows. Rebuilding the same run replaces its
draft summaries and drops exited draft rows rather than keeping the first
draft. Only same-run `Built - Pending Publish` rows in a legacy input are
excluded; published or unclassified same-run rows are rejected.

The explicit input override remains supported, but it must match an existing
frozen baseline; a missing override is an error. Do not replace the baseline to
accept new live history mid-run. Use the existing concurrency/correction
procedure when the published baseline changes. Completed published runs remain
immutable, and these local files do not themselves update the Sheet.

Do not publish when the capture fails or is more than two hours old. After
publication, compare all reviewer values with the capture and restore any
mismatch. `Needs CSM Review` is fully manual and must never be inferred, set, or
cleared. For a brand-new row the builder prepares no value. Google Sheets may
canonicalize that blank BOOLEAN checkbox to unchecked (`false`); this means only
that no person has flagged the new row for CSM review, not that the automation
decided review is unnecessary. Existing checked and unchecked values must
round-trip exactly.

## Cohort

Pull every active breached Client Intake Opportunity SLA. Exclude:

- completed SLAs;
- test records;
- Opportunities in `Pending Discharge`.

Route on-hold Opportunities to `On-Hold Review`; route all others to
`Review Queue`. Opportunity ID is the primary key. Ambiguous resolution is
`Blocked`.

Build the complete Identity Profile before communications retrieval:

- Opportunity and SLA identifiers;
- client name, family contacts, aliases, and known spelling variants;
- practice and Business Profile;
- Rendering, IA Rendering, TA Rendering, current, prior, and practice-roster
  providers;
- provider Salesforce IDs, backend IDs, emails, phones, aliases, and meeting
  identities;
- current and prior CSM names and emails;
- payer and authorization numbers;
- RBT requests, Ticket Matches, candidates, interviews, staffing, and assigned
  RBT;
- current stage, stage-entry date, stage history, and SLA transitions.

For `TA Approved - Pending Scheduling`, use the later of the treatment
authorization approval/approval-check date and `Active_RBT_Checked_At__c` as
the automation-aligned stage-entry date. A later Active RBT check can restart
that SLA position even when the authorization approval is older.

## Structured Salesforce Pass

Retrieve and normalize:

- Opportunity, current SLA, intake notes, on-hold notes, scheduling fields, and
  stage history;
- Authorization, Authorization Review, VOB, and Clinical Quality;
- RBT Request, Ticket Match, Talent Acquisition, RBT First Interview, and
  Staffing;
- Tasks, TaskFeed changes, substantive Task Chatter, Salesforce emails, calls,
  and texts;
- Opportunity milestone fields and `Billing_and_Claims__c`.

Link Staffing both directly and through
`RBT_Request__c.Client_Opportunity__c -> RBT_Request__c.RBT_Assigned__c`.
Do not assume `Staffing__c.Client_Opportunity_Record__c` is populated.

Do not retrieve Aloha directly. Use Salesforce Opportunity milestone fields
first. Use Salesforce-linked billing and claims records as the fallback for
actual appointment and service dates.

Billing reconciliation uses only records created at or before the exact frozen
cutoff, including pre-normalized appointment inputs. A backdated service date
does not make a later-created record eligible. A future appointment created by
the cutoff remains scheduling evidence. Missing or invalid creation timestamps
cannot establish eligibility; retain the source evidence and resolve that
provenance gap rather than treating it as an empty result or inferring completion.

## Authorization Gate

Determine the prerequisite before ranking evidence:

- `Initial Consultation` never satisfies IA authorization.
- A current `Initial` authorization must be `Approved` or `No Auth Needed`
  before IA scheduling or occurrence.
- A current `Treatment` authorization must be `Approved` or `No Auth Needed`
  before 97153.
- Historical, expired, superseded, cancelled, duplicate, void, or wrong-phase
  records cannot satisfy the current gate.
- Pending review, additional details, denial, appeal, peer review, partial
  approval, and withdrawal are distinct unresolved states.
- Authorization prerequisites override an inconsistent Opportunity stage only
  after that authorization phase has actually begun.
- A portal Treatment Authorization request does not prove payer submission.
  Require a true Salesforce payer-submission date for the TA Requested gate.
- In `97151 Started - Pending Treatment Plan`, a dated Headstart portal
  Treatment Authorization request in `Reviewing` or `In Progress`, with no
  Salesforce Treatment Authorization payer submission and no Clinical Quality
  record, is an internal handoff: the provider submitted the plan, and
  Insurance Ops must create the downstream Salesforce records and advance the
  stage to `Treatment Plan In-review`.
- Material conflicts produce `Review` and name the conflicting records.

## Calls And Texts

Search these approved lines:

- Intake: `+14783476197`
- Insurance Ops Other: `+17372370310`
- Insurance Ops VOB: `+17372048734`
- Customer Success: `+14152869208`
- Scheduling Pilot: `+12197773755`
- RBT: `+12294896491`

Search direct Opportunity links first, then family phone, client/family names,
provider/practice, authorization/payer, RBT/candidate, and current-stage terms.
Retrieve full call transcripts when available. Call summaries are
fallback-only and must be labeled. Use the original SMS body and activity date.

## Client Intake Denial Context

Run `headstart-intake-sla review:slack-plan` after the identity profiles, current-run
Authorization/Authorization Review rows, and frozen run manifest are materialized.
The versioned planner emits `slack_full_sweep_plan.json` with one target per
Opportunity and exact-name, Opportunity-ID, and stage-relevant authorization
number queries, plus channel-scoped denial-context queries for the applicable
structured denied IA/TA gates. The planner is idempotent and refuses to overwrite
a changed saved plan or a published run. Execute every query against all accessible public channels,
private channels, group DMs, and DMs; paginate every query to completion; and
retrieve individual messages.

Save the approved connector results in the private run directory using the
artifact names expected by `review:slack-merge`, then run
`headstart-intake-sla review:slack-merge`. That merge verifies collected current-story threads and
emits `slack_rows.json` plus `slack_full_sweep_execution.json`. A missing
cohort row, incomplete pagination, or incomplete required thread expansion
remains blocked coverage for that Opportunity. Do not substitute an ad hoc
search or claim complete Slack coverage.

Thread captures in `slack_full_sweep_threads.json` retain the raw response as
`text`, with the exact `channelId` and `messageTs`. The merge recognizes the
connector's explicit `THREAD REPLIES (N total)` envelope only when all numbered
replies are present, sequential, nonempty, and consistent with the total and
search reply count. JSON-wrapped `messages`/`results` text is also supported.
Other text or structured message arrays require an explicit
`paginationComplete: true` receipt from collection. Structured arrays must
identify exactly one parent (`ts === thread_ts`), unique reply timestamps linked
to that parent, and an actual reply count matching its captured `reply_count`
and meeting the captured search count. The parent is not a reply. Missing or
ambiguous identities fail closed. This checks supplied captures only; it does
not refresh counts or move the run cutoff. Both outer and payload `ok: false`
signals are failures. Errors, truncation, and
unconsumed cursors always block; an absent cursor alone does not prove completion.

If a live search count includes replies after the frozen cutoff, retain the
cutoff-filtered native thread and attach one complete native `unboundedReadback`
with the same channel/message identity. The merge validates the full observed
count, explicit terminal pagination, unique parent/reply timestamps, and exact
content equality for every message at or before `run_manifest.json.startedAt`.
Only those in-snapshot messages are admitted. Later replies are counted as
deferred; missing, edited, ambiguous, or incomplete comparisons remain blocked.
Do not lower the search count or move the cutoff to reconcile live activity.
Do not erase a blocked flag to make a response parse. Slack search pagination
and bounded delta collection remain separate collector responsibilities.

Every row in `slack_full_sweep_exact_name.json` and every continuation record
in `slack_full_sweep_page2.json` must carry the `opportunityId` from the
versioned plan. The merge joins evidence by Opportunity ID. A legacy
name-only row may be used only when that name resolves to exactly one
Opportunity in the current identity profiles; duplicate-name and otherwise
ambiguous rows remain unassigned and make cohort coverage incomplete.

Slack evidence content remains supporting context, but complete sweep coverage
is required for every Opportunity. No row may be marked `Ready to Copy = Yes`
unless `slack_full_sweep_execution.json` confirms the entire current cohort,
pagination, artifact assignment, and required thread expansion are complete
and the Opportunity row is also complete.

When the deterministic gate resolves an `IA Requested` or `TA Requested`
authorization as denied, search `#client-intake` (`C083BNXBH6F`) for the client
and name variants, Opportunity ID/link, authorization number, payer, provider,
and practice. Add denial, partial denial, appeal, reconsideration, peer review,
and additional-details terms, and retrieve the individual message plus thread.
The planner uses fully paginated identity-only searches as supersets of the
same identity plus payer/denial/appeal/detail refinements. Do not repeat narrower
queries once that superset is complete, or search payer-only traffic unrelated
to these identity paths. Use the existing protected `review:slack-capture` and
`review:slack-merge` paths, including required raw thread captures.

The build emits `slack_denial_coverage.json` with applicable, complete, and
incomplete counts. `review:validate` (also run by `review:prepare-publish`)
recomputes this proof from the structured gate, expected queries, frozen-cutoff
raw search capture, pagination, retained threads, and merged report inputs;
a saved success flag or general-sweep count is not proof. Complete searches
with no relevant matches are valid. Missing coverage must be shown as required
Slack `Blocked` coverage and `Ready to Copy = Blocked` with a denial-context
explanation; the existing partial-publication rule still applies. Zero applicable
denied gates require no extra queries. Do this before publication, not as closeout.

Salesforce remains authoritative for the denial state and evidence date. Use a
Direct/Likely Client Intake match only to make the denial reason more specific
in the short and expanded summaries. Prefer structured Authorization denial
reason/explanation fields when available. That denial-reason event cannot reset
freshness, alter the gate, assign the owner, change the follow-up date, or make
a row copy-ready. Other Direct/Likely, client-specific Slack facts may inform
the primary SLA story when they state a concrete operational change. Weak or
ambiguous matches remain audit-only.

## Portal

Collect the Admin Portal Authorization Request inventory separately from chats.
Use the authorized read-only `GET /authrequest/admin/all-requests` path and save
the complete current-run response as `portal_auth_request_inventory.json`.
Never infer absence from Salesforce because a portal request may precede all
Salesforce Authorization and Clinical Quality records. A missing or incomplete
inventory blocks the portal-auth-request source for 97151-stage rows.

The live builder matches Portal Authorization Requests to Opportunities by an
explicit Opportunity ID when supplied, otherwise by an exact normalized client
identity. When more than one Opportunity shares the client identity, an exact
provider identity may disambiguate the request. Ambiguous and unmatched requests
stay in `portal_auth_request_rows.json` for audit and are not admitted as
Opportunity evidence.

Search governed portal conversations regardless of channel label. Intake,
Insurance Ops, RBT, Clinical, General Admin, provider, practice, and
client-linked chats are all eligible when the Opportunity identity match is
valid. Channel mismatch is audit context, not a reason to discard a relevant
message. Retrieve complete messages and paginate all result sets.

`review:portal-materialize` derives missing chat `requestKey` fields from their
parent in `portal_conversation_inventory.json` without rewriting that raw input.
Every parent must match one unique planned request, and an existing child key
must agree with its parent. Persist one finalized execution per request (not
multiple retry attempts); unknown/duplicate parents, conflicting child keys,
and missing chat arrays on completed requests are rejected. Missing or failed
requests still leave their affected Opportunities blocked. This binding does
not establish pagination completion or repair interrupted collection.

## Fireflies

Fireflies is searched for every SLA. Execute `headstart-intake-sla review:fireflies-plan`
after Identity Profiles are available. Follow [the collection contract](fireflies-collection-contract.md).

For bounded fresh-body planning and resumable capture, use
`review:fireflies-bounded` under `docs/fireflies-bounded-collection.md`.
Do not substitute a whole-inventory cache experiment for bounded collection.

Execute `fireflies_run_inventory.json` as the retrieval plan. Do not execute
the same provider, practice-title, or CSM request separately for every
Opportunity. Retrieve each meeting inventory once per run, preserve pagination
and transcript provenance, then use `fireflies_search_requests.json` to perform
the Opportunity-specific roster match and bounded transcript interpretation.
Run all `Primary` provider-email requests first. Execute `Identity Fallback`
only when primary coverage is empty or unusable, and `CSM Fallback` only when
provider email and title coverage remain insufficient. A skipped fallback must
record the successful prior-tier request that made it redundant.

For every distinct provider identity:

1. Search by every verified participant email.
2. Search by provider name, alias, meeting alias, and practice title.
3. Search meetings involving every current or prior CSM.
4. Paginate every result set.
5. Build the provider's complete accessible meeting set once per run.
6. Search that meeting set using the Opportunity's full name, first name,
   spelling/transcription variants, compact/reversed/initial forms, provider
   roster, stage terms, authorization/payer, and RBT/candidate terms.
7. Retrieve the full transcript for every candidate meeting.
8. Segment the transcript around the possible client reference and rematch the
   client within that segment.

Use `fireflies_fetch` as the first full-transcript endpoint. Retry transient
429/5xx responses twice, then use `fireflies_get_transcript` as the fallback.
Only classify a transcript `Timed Out` after both endpoint paths are exhausted.

The practice roster narrows fuzzy matching. A fuzzy client rendering may be
`Likely` when one roster client is clearly closest and provider/practice plus
current-stage context agree. Record the assumed name and runner-up for review.
CSM-only or unanchored first-name matches remain `Weak`. A sentence that names
multiple clients cannot establish client-specific details. One explicit shared
status for a short named list may be applied to an exact or approved
roster-matched target; unrelated details about another listed client may not.
Common speech words cannot be promoted as fuzzy name matches.

A Fireflies source result is not complete until all identity paths, pages,
candidate meetings, and full transcripts are accounted for. Use:

- `Found` when at least one Direct or Likely substantive transcript fact exists;
- `Searched - Not Found` when the complete search found no relevant fact;
- `Blocked`, `Timed Out`, or `Unsupported` when applicable;
- `Partial` only as internal coverage state, which blocks automatic copy
  readiness.

Never carry a prior meeting into the current run as if it were freshly
searched. Current-run discovery and packet construction are always required.
The optional [Fireflies cache](fireflies-cache.md) retains full discovery,
defaults to fresh-body shadow comparisons, and permits bounded-age body reuse
only under an explicitly approved revalidation policy with verified run receipts.
Without that path, retrieve every candidate body in the current run.
An earlier API interpretation may be reused only when its canonical binding
exactly matches the current packet, provider, model, prompt, schema, and engine
version. Current-run Codex-precomputed results are never reusable as a later
run's current evaluation. Changed, legacy-unbound, non-API, or missing
interpretations require a fresh evaluation.

## AI Transcript Interpretation

API interpretation requires `SLA_AI_INTERPRETATION=on`,
`SLA_INTERPRETER_PROVIDER=openai-responses`, and
`SLA_INTERPRETER_MODEL=gpt-5.6-sol`. The approved credential provider injects
`OPENAI_API_KEY` only into the interpretation child process and sets a non-secret
`SLA_APPROVED_CREDENTIAL_SOURCE` marker. The engine does not select an inherited
credential or silently fall back to another provider or model.

Before any transcript content is transmitted, run the non-PHI structured
preflight with the same provider, model, credential, schema, and `store: false`
contract:

```bash
headstart-intake-sla review:ai-preflight --run-dir <run-dir>
```

Then interpret the current packets. Exact bindings may be reused from the prior
run; every changed, new, or unbound packet is freshly interpreted, and an exact
checkpoint supports deterministic resume:

```bash
headstart-intake-sla review:interpret-delta \
  --run-dir <run-dir> \
  --prior-run-dir <prior-successful-run-dir>
```

When no API key is available, the scheduled Codex run must create
`ai_interpretation_candidate.json` from fresh current-run evaluation, then run:

```bash
headstart-intake-sla review:finalize-precomputed --run-dir <run-dir>
```

The command validates one result for every current packet and creates
`ai_interpretation_precomputed.json` before workbook construction. It records
distinct `codex-current-run` execution provenance and a packet-validation
binding; it does not claim an OpenAI Responses API execution, API model, or
provider-side storage setting. Its `rows` array is keyed by Opportunity ID and
contains
an `interpretations` array. Each interpretation contains `sourceRecordId` in
`<meeting id>:<segment number>` form and a `findings` array conforming to
`TRANSCRIPT_INTERPRETATION_SCHEMA`. The engine revalidates every supplied
finding against the transcript segment and rejects the entire precomputed
interpretation unless its validation binding matches the current packet,
instructions, schema, and engine contract.

The AI receives only:

- the resolved Opportunity identity;
- provider roles and roster context;
- the deterministic gate;
- source metadata;
- the bounded transcript segment.

It may synthesize operational facts, blocker impact, owner/action, and explicit
milestone or follow-up dates. It may not determine the gate, promote identity
quality, invent dates, or use facts outside the segment. Every substantive AI
finding must include an exact support span present in the transcript. Findings
without support are rejected. Raw transcript text is audit-only and never
appears in either operator summary.

When AI interpretation is unavailable or fails, use the deterministic
interpreter only for diagnostics. The scheduled review build excludes those
candidate segments from evidence and blocks dependent provider-facing rows.

## Evidence Ranking

Normalize each fact with Opportunity ID, source/record ID, event and collection
dates, matched entities, process-gate relevance, match quality, substantive
classification, and support/conflict relationship.

Reconcile admitted evidence chronologically before rendering a recommendation.
Carry each unresolved issue forward until structured completion, a downstream
prerequisite, same-record supersession, or explicit Direct/Likely evidence
proves resolution. Then rank facts inside the reconciled story by:

1. process-gate relevance;
2. identity confidence;
3. structured-record reliability;
4. substantiveness;
5. recency;
6. specificity.

The newest relevant fact describes the current status, but it cannot silently
erase an older unresolved issue. Structured milestones win direct conflicts.
Dated SLA, intake, authorization, and on-hold notes are eligible evidence.
Existing SLA action items are comparison-only. Administrative reminders do not
reset freshness. Questions or requests for an update cannot become asserted
milestones or provider commitments. Weak matches stay audit-only. Future
milestones remain future milestones until completion is confirmed. When a
structured status and a Direct/Likely conversation agree, use the structured
record for the gate and the conversation for corroborated chronology or
specific detail.

## Output And Confidence

Publish the existing tabs in place:

- `Review Queue`
- `On-Hold Review`
- `Evidence Detail`
- `Source & Run Notes`
- `Data Dictionary`
- append-only `Run History`
- hidden, warning-protected `Generation Ledger`

Each row must provide:

- process position and exact unresolved gate;
- newest substantive update, date, and source;
- synthesized Salesforce-ready summary under 255 characters;
- substantive operational narrative with the full admitted delay history and no arbitrary sentence ceiling;
- one action type, one accountable owner, and one expected outcome;
- follow-up date and basis;
- freshness and copy-readiness;
- material gaps;
- separate Gate Confidence, Identity Confidence, Source Coverage, and Evidence
  Conflict fields in Evidence Detail.

Freshness is `Current` for 0-2 calendar days, `Semi-Stale` for 3-6, `Stale` for
7+, and `Missing` when no dated substantive update exists. A recent unrelated
activity cannot reset freshness. Future milestones are not historical updates.

## Failure Safety And Publication

Run the complete test suite and workbook QA before publication. Audit every
Fireflies-backed row, every `Ready to Copy = Yes` row, every authorization
conflict, and every Missing row.

Downgrade to `Review` or `Blocked` for:

- identity ambiguity;
- incomplete Fireflies retrieval;
- material source failure;
- conflicting gates;
- unsupported conclusions;
- AI claims without transcript support.

Partial runs may publish only with affected rows clearly marked and Jimmy's
partial-publication rule satisfied. Publication is an ordered, read-after-write
protocol, not one monolithic batch. The payload planner resolves every tab ID
from fresh metadata, clears only the exact stale tail of replaceable tabs, and
never bulk-clears or replacement-writes `Generation Ledger` or `Run History`.
Only the exact current-run ledger status may move from publishing to Published
in the terminal-marker stage.

The stages are capacity, Review Queue, On-Hold Review, Evidence Detail, Data
Dictionary, nonterminal Source & Run Notes, append-only Generation Ledger,
terminal marker plus ledger finalization, and append-only Run History. Verify
each stage before advancing. `Last Refresh` and `Run ID` move only in the
terminal-marker stage, and Run History is always last. A repeated run ID may
resume only when every already-present append row and payload hash is exact.

Preparation automatically writes `reviewer_payload_preservation_proof.json`,
bound to the exact emitted plan, current reviewer-state hash, and queue payload
hashes. It compares every prepared reviewer cell by Opportunity ID and reports
only aggregate blank/unchecked/populated/new/removed counts. Present this proof
with the exact payload when native approval questions full-width reviewer cells;
do not omit those columns when row order changes or bypass approval. The proof
does not replace the current reviewer-state gate or the live readbacks.

Prepared presentation follows the [Publication Contract](publication-contract.md):
verify its exact text-layout and dimension-pixel assertions at each affected stage
and in final samples. Confirm the read provider supports those assertions before
applying the plan; never add ad hoc formatting after publication.

Before preparation, refresh and retain the live marker, reviewer state,
Salesforce cohort, Production fingerprint, Sheet metadata and exact used
extents, and competing-run state. All current checks must be no more than two
hours old. The run is a frozen snapshot at its declared source cutoff. Material
Salesforce business changes observed strictly after that cutoff must be fully
accounted for, verified read-only, and deferred to the next scheduled run; they
do not invalidate the truthfully labeled snapshot. Any unaccounted material
record, duplicate, unverifiable timestamp, or change at or before the cutoff
fails closed. Changed Sheet markers or reviewer values, spreadsheet identity
mismatches, Production fingerprint drift, payload hash mismatches, and
competing runs also remain blocking. See [Publication Contract](publication-contract.md).

The Generation Ledger stores the SLA ID, Opportunity ID, generated summary,
summary hash, engine version, source cutoff, and generated timestamp. Exact
prior generated notes are excluded from future evidence. For a substantially
similar note, only substantive human additions may re-enter the evidence story.

## Package navigation

[Local setup](local-setup.md) · [Package overview](../README.md)
