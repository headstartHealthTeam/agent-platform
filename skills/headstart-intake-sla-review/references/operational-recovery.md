# Operational Recovery

Use the reviewed engine's commands and contracts. These instructions govern supervised orchestration;
they do not introduce another source adapter, new approval gate, or permission to change Salesforce.
The engine runbook owns exact command syntax and supported response formats.

## Resume The Same Frozen Run

- Establish one owner for each source queue. Do not let overlapping orchestration cells dispatch the
  same queue. Wait for the previous batch to finish before selecting more work.
- Run the engine's status command and read its newly generated private pending artifact. On-disk
  accepted checkpoints, not a chat counter, an in-memory index, or a prior status artifact, determine
  what remains. Progress messages are informational, not resumption authority.
- Dispatch only pending IDs. If the pending entry says to resume a retained raw capture, normalize
  and accept that capture without another remote read. Pass new complete connector envelopes to the
  engine's protected capture entry point; never overwrite a raw response file from host code.
- Preserve the first response and its original retrieval timestamp. Conflicting duplicates are a
  diagnostic exception, not fresher replacement evidence. Resume after interruption using identical
  inputs and the engine's existing lock and checkpoint contracts; never delete an active lock.
- Keep the frozen cutoff. Refresh only sources and concurrency checks required by the documented
  freshness gates. Fully accounted post-cutoff business changes follow the engine's snapshot rules;
  changed reviewer state, competing publication, or unaccounted material changes still require the
  documented reconciliation. A slow run is not permission to relabel old evidence as fresh.
- Fireflies shadow behavior does not imply fetching every discovered body. Use the reviewed bounded
  candidate manifest for the operational run. Cache reuse and a whole-inventory shadow experiment
  remain separately selected and authorized operating modes.

## Classify The Failure Before Retrying

| Observation                                                           | Required response                                                                                                                                                                                          |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local CLI logging, sandbox, or credential-store access failure        | Diagnose the host boundary and use the documented direct identity probe; do not infer expired authentication or repeat login from a helper error.                                                          |
| Run History or reviewer capture has the wrong local shape             | Use the canonical Google capture adapter on retained exact values; preserve headers, row order, typed values, and provenance. Do not hand-normalize or reread all history unnecessarily.                   |
| Fireflies summary generation is skipped or unavailable                | Summary status is not live-state or transcript-empty evidence. Resolve required metadata through the documented detailed response and preserve the full-body requirement for every candidate.              |
| Slack search renders an empty body for an attachment-only result      | Use the existing exact-message/thread recovery and retain its identity/time binding. A blank rendering is not a successful empty search.                                                                   |
| Replay is CPU-bound or quiet                                          | Inspect sanitized execution progress and phase timing. Execution start/end times measure runtime; source `searchedAt` does not. Keep the run lock and sequence conflicting checkpoint writes after replay. |
| Approval questions reviewer-owned blank cells in a full-width payload | Present the exact plan-bound preservation proof by Opportunity ID and sanitized counts. Do not change the payload, drop reviewer columns, bypass approval, or expose reviewer text in chat.                |
| Text appears clipped despite exact value readback                     | Distinguish presentation from data loss. Use reviewed, prepared formatting changes with their own readback assertions; do not apply ad hoc sheet-wide autofit or rewrite historical audit rows.            |

If a required capability genuinely lacks access or sufficient response fidelity, retain the failed
attempt and explain the smallest needed access or business decision. Do not manufacture evidence.
An empty result is valid only when the required query completed with proven coverage.

## Judgment Versus Engine Defects

Classify the cause before selecting the remedy. An incorrect report needs correction, but that
alone does not establish that another deterministic business-language rule is appropriate.

| Cause                                                                                                                                   | Owner and response                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Context-dependent meaning: administrative note versus progress, partial completion, reported resubmission, staffing pause, date purpose | Agent interpretation under the evidence rules. Inspect the bounded source/context, record supported meaning and uncertainty through the engine's documented interpretation input, then rebuild and validate. |
| A valid interpretation loses its meaning, date role, identity or provenance during assembly                                             | Engine contract/consumer defect. Reproduce the transformation error independently of the original phrase; correct that boundary with focused tests under code-edit authorization.                            |
| Pagination, hashing, cutoff, row parity, cell limits, reviewer preservation or staged readback is wrong                                 | Deterministic integration or engine defect. Fix the specific invariant with regression coverage; do not substitute an instruction to be careful.                                                             |
| Generated request arguments were dropped, a dependent command ran too early, or the wrong checkpoint was selected                       | Operator/orchestration error. Follow the existing contract, retain valid work and repair the affected step; do not turn the mistake into business logic.                                                     |
| Required evidence is genuinely missing, ambiguous or conflicting                                                                        | Business/source exception. Preserve Review/Blocked and the existing partial-publication policy; investigate only applicable missing context. Do not code away the uncertainty.                               |
| A transient connector failure recovered under the documented policy                                                                     | Recovered operational incident. Record it separately from unresolved defects; do not automatically add another retry mechanism or gate.                                                                      |

For an interpretation issue, use existing scoped read capabilities when more context would resolve
it. A novel phrase is not permission to collect every source again. Preserve the cutoff and
record what is established, what is reported, and what remains unverified. Ordinary evidence
interpretation does not require a new business approval; changes to policy, source scope, authority
or unresolved business choices do.

Prefer the reviewed engine's source-bound interpretation/adjudication path. For note recovery,
follow its transcript-interpretation contract; administrative findings must not refresh status,
mixed notes must retain real updates, and reported completion must not become structured
confirmation. Never replace original source artifacts, hand-edit generated rows, clear QA flags,
or use an unconstrained override. If the selected runtime cannot represent a supported judgment,
report that interface limitation precisely. Under code-edit authorization, add the smallest typed,
auditable boundary rather than a new regex for each wording variant. Do not claim a newer input
contract is supported merely because these instructions are installed.

Before proposing an engine correction, identify the stable invariant it enforces, why instructions
or the existing interpretation input cannot solve the issue, and a counterexample the fix must
still reject. Test both changed wording with the same meaning and similar wording with a different
meaning. Passing phrase-specific tests alone does not justify deterministic ownership.

This is not a new publication gate or an instruction to redesign the workflow during a run. Continue
unaffected work, preserve completed collection and exact-bound interpretations when still valid,
and apply the existing QA/source/exception rules. Correct real contract failures; do not pursue
perfect Salesforce data or an exhaustive natural-language parser before producing the review queue.

## Record And Close Snags

Maintain a PHI-safe run failure log in approved local operational storage, separate from immutable
source artifacts and Git. For each relevant incident record the observation, impact, root cause
(engine defect, interpretation judgment, orchestration, provider format/access, presentation, or business evidence), recovery,
validation, and remaining follow-up. Record reusable helpers in their owning worktree with tests;
do not accumulate undocumented temporary implementations.

At completion, reconcile the log with the recovery receipts and final outcome. Distinguish an
operationally recovered incident from a durable engineering fix. Report unimplemented follow-ups
honestly. A successful publication does not prove that every follow-up is fixed, and an open
presentation or telemetry follow-up does not by itself invalidate a correct report.

Report engine defects, operator mistakes, recovered infrastructure incidents and legitimate row
exceptions separately. Do not equate the number of log entries with the number of required code
changes. For code corrections, record the ownership rationale and rejected alternatives; for an
interpretation, retain its evidence-bound decision in private run storage rather than encoding the
case's wording as policy. Routine wording variation should not require daily tracked code edits.

If a required check was discovered only after publication, record that timing honestly. Preserve
the published run and perform any authorized supplemental audit separately at its frozen cutoff.
Report whether new evidence requires a correction; never relabel the audit as a prepublication
success. Prevent recurrence in the owning planner/validator and operator sequence.
