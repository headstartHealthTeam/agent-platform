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

## Record And Close Snags

Maintain a PHI-safe run failure log in approved local operational storage, separate from immutable
source artifacts and Git. For each relevant incident record the observation, impact, root cause
(engine defect, orchestration, provider format/access, presentation, or business evidence), recovery,
validation, and remaining follow-up. Record reusable helpers in their owning worktree with tests;
do not accumulate undocumented temporary implementations.

At completion, reconcile the log with the recovery receipts and final outcome. Distinguish an
operationally recovered incident from a durable engineering fix. Report unimplemented follow-ups
honestly. A successful publication does not prove that every follow-up is fixed, and an open
presentation or telemetry follow-up does not by itself invalidate a correct report.

If a required check was discovered only after publication, record that timing honestly. Preserve
the published run and perform any authorized supplemental audit separately at its frozen cutoff.
Report whether new evidence requires a correction; never relabel the audit as a prepublication
success. Prevent recurrence in the owning planner/validator and operator sequence.
