# Operator Handoff

Use this checklist to move the recurring Intake SLA Review Queue from one authorized local Codex
operator to another. The transfer is complete only after the new operator proves a clean, supervised
run from their own environment and the prior operator's schedule is paused.

## Durable Owners

| Concern                                                          | Durable owner                                                         |
| ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| Shared operator procedure and safety contract                    | `headstart-intake-sla-review` in `headstartHealthTeam/agent-platform` |
| Deterministic engine and detailed runbook                        | `headstartHealthTeam/intake-sla-evidence-engine`                      |
| Queue state, reviewer values, Generation Ledger, and Run History | Approved Intake SLA Review Queue Google Sheet                         |
| Structured Intake and automation evidence                        | Positively identified Salesforce Production org, read-only            |
| Schedule, local credentials, and private run storage             | Current authorized operator's local Codex environment                 |

Do not copy the detailed engine runbook into another prompt or repository. Install the reviewed
shared skill and read the current engine documents at run time.

## Information The Current Owner Provides

- coverage start and end date, timezone, primary operator, backup operator, and approver;
- exact reviewed agent-platform and engine revisions;
- approved Sheet name and identifier through an authorized private channel;
- scheduled task name and the canonical engine schedule-template location;
- current live Sheet marker, last successful publication, and unresolved blocked runs;
- current cutover blockers, open pull requests, and engine issues;
- required access inventory and the secure owner for private runtime configuration; and
- escalation path for source permissions, engine defects, Salesforce changes, and publication
  approval.

Never include credentials, tokens, client identifiers, source exports, transcripts, reviewer-state
files, production rows, or private payloads in Git or the handoff message.

## New Operator Readiness

1. Confirm repository access and install the complete reviewed skill set from a clean
   `headstartHealthTeam/agent-platform` `main` checkout using its documented updater.
2. Clone the exact reviewed Intake SLA Evidence Engine revision into a separate clean project. Do
   not rely on the former operator's working folder or task history.
3. Read the engine's `docs/operator-handoff.md`, `docs/automation-runbook.md`, and
   `docs/scheduled-task-template.md` completely.
4. Verify each required connector from the new operator's Codex using a known non-sensitive target.
   Authentication alone does not establish correct scope or write authority.
5. Provision private runtime configuration and a private run directory through the approved secure
   path. Keep them outside Git.
6. Run the engine's complete synthetic and distribution-safety checks from the clean clone.
7. Complete one supervised full-queue shadow run with a new private run ID. Prepare but do not apply
   the Google payload.
8. Review expected-versus-processed parity, source coverage, QA, workbook checks, Production
   fingerprint, reviewer-field preservation, and the PHI-safe completion report with the approver.
9. Complete one approved publication and live readback under supervision.
10. Create the new operator's task from the exact current schedule template and leave it paused
    until cutover.

If the engine revision is not proven equivalent to the current live runtime, access remains
incomplete, or the supervised run does not pass, the operator is preparation-ready only and must not
publish or activate a schedule.

## Cutover

1. Record the agreed handoff time and current live Sheet marker.
2. Pause the prior operator's scheduled task.
3. Verify that the prior task is paused before activating the new task.
4. Activate the new task and verify its timezone and next scheduled times against the engine's
   canonical template.
5. Monitor the first scheduled invocation through its live Sheet readback or exact blocked gate.

The workflow has no application-enforced lease. Two active schedules can race on reviewer state and
Sheet publication, so the one-active-task rule is mandatory. Prompt checks are not a lock.

## During Coverage

For every scheduled invocation, the operator reviews the run type and gate evidence first. A
verified no-op is success and must report skipped stages as `0/not run`. A blocked run leaves the
Sheet unchanged and is escalated with the exact failed source or gate. The operator must not bypass
QA, fingerprint, reviewer-state, source-completeness, or readback failures.

Code fixes, schedule changes, source-scope changes, Salesforce writes, and Salesforce code or
metadata releases remain separate work. The coverage assignment does not grant those permissions.

## Return Handoff

The outgoing backup operator provides:

- last successful publication and live readback;
- all failed, blocked, and no-op invocations during coverage;
- unresolved source, permission, QA, fingerprint, or concurrency gates;
- connector, private-input, schedule, or repository changes;
- open engine pull requests and issues; and
- confirmation that the backup schedule is paused.

The returning owner verifies the live Sheet and Run History before resuming their schedule. Never
allow both schedules to remain active during the return transition.
