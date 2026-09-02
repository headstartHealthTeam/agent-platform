---
name: headstart-intake-sla-review
description: Run, monitor, or hand off the recurring Headstart Intake SLA Review Queue workflow, including live due-work checks, evidence collection, gated Google Sheet publication, and operator reporting. Use for the weekday full-refresh and catch-up schedule, a supervised backup-operator cutover, a blocked scheduled run, or a verified no-op. Do not use for general SLA policy design, Salesforce implementation, or unrelated spreadsheet reporting.
compatibility: Requires a reviewed checkout of the private Intake SLA Evidence Engine, authorized Headstart source access, private run storage, and an approved Intake SLA Review Queue. Salesforce remains read-only; Google Sheet publication requires explicit operating authority and every documented gate.
metadata:
  author: headstart-health
  version: '0.1.0'
---

# Headstart Intake SLA Review

Operate the recurring Intake SLA Review Queue as a supervised, code-assisted workflow. Use one agent
pass by default. The skill owns the operator sequence, safety boundaries, handoff, and reporting
contract. The private
[Intake SLA Evidence Engine](https://github.com/headstartHealthTeam/intake-sla-evidence-engine)
owns the deterministic code, detailed runbook, schedule template, and current operational status.

This skill is instructional capability, not authorization. Authentication does not authorize a
Production write, a Salesforce change, a new publication target, or a second active schedule.

## Required Inputs And Capabilities

Before a live run, require:

- the exact reviewed engine revision designated ready for the current operating period;
- the coverage window and named primary and backup operators;
- an approved private run directory outside every Git checkout;
- the private runtime configuration required by the engine, transferred through an approved secure
  channel rather than Git;
- positively identified, read-only Salesforce Production access;
- authorized reads for the stage-required portal, Fireflies, Slack, calls, texts, Tasks, Chatter,
  billing, claims, and other sources named by the current engine runbook;
- edit access to the one approved Intake SLA Review Queue spreadsheet; and
- a clear publication authority: either an explicitly approved manual publication or an active
  scheduled task whose approved scope names this workflow and spreadsheet.

Prefer the active host's authorized native connector for each business-system operation. A browser
or documented CLI fallback is acceptable only when the engine runbook permits it and the result
retains source identity and coverage evidence. If a required capability is unavailable, report it
as blocked; never guess or present cached evidence as a fresh read.

Before a queue refresh, read these files completely from the same reviewed engine checkout:

1. `docs/automation-runbook.md`
2. `docs/operator-handoff.md`
3. `docs/scheduled-task-template.md` when creating, changing, or transferring the schedule
4. `docs/mark-ooo-handoff.md` when it exists for the current coverage period

Also read [Operator Handoff](references/operator-handoff.md) before transferring ownership or
activating a backup operator's schedule. The engine documents are authoritative if a detail here
conflicts with a newer reviewed engine revision. Stop and report the mismatch instead of silently
combining two contracts.

## Select The Run Type

Start every invocation by reading the live Sheet marker, Run History, current time in the configured
business timezone, and the engine's schedule contract.

- **Normal refresh:** collect and rebuild the complete eligible cohort when the schedule contract
  says a full run is due.
- **Catch-up:** run only when the preceding required refresh did not publish and the catch-up rule is
  satisfied.
- **Verified no-op:** when no refresh is due, stop before source collection, payload preparation, or
  writes. A no-op is a successful outcome. Report every skipped stage as `0/not run`.
- **Blocked run:** stop at the first safety or completeness gate that prevents trustworthy
  continuation. Leave the live Sheet unchanged and report the exact gate.

Do not infer run type from a copied prompt or yesterday's result. Live markers override historical
outcomes.

## Workflow

1. **Prove the operating context.** Record the engine repository revision, operator, scheduled slot
   or manual trigger, timezone, private run ID, publication target, and authorized write scope.
   Positively identify Salesforce as Production and keep it read-only.
2. **Prevent overlap.** Confirm that only one operator-owned schedule is active for this workflow.
   Treat the scheduled slot plus private run ID as the unit of work. If another run may be active or
   reviewer state may have changed since capture, do not publish; stop or continue in preparation-only
   mode for human reconciliation.
3. **Evaluate the live due-work gate.** Read the current Sheet marker and Run History first. For a
   verified no-op, return the required zero/not-run report and end the run.
4. **Capture human-owned state.** Read reviewer-managed fields from the live Sheet by Salesforce
   Opportunity ID before rebuilding any row. Preserve them byte-for-byte. Never calculate, set,
   clear, or normalize `Needs CSM Review`.
5. **Collect the full cohort and required evidence.** Retrieve all eligible active breached Intake
   SLAs and the on-hold cohort according to the current runbook. Resolve structured Salesforce gates
   before conversational evidence. Execute complete portal Authorization Request, Fireflies, Slack,
   and other stage-required searches; record every planned source outcome.
6. **Build and validate deterministically.** Use the reviewed engine's documented commands to build
   the queue, validate source coverage and quality, and prepare publication. Keep snapshots,
   transcripts, identity registries, workbooks, reviewer-state files, and payloads in the private run
   directory. Never place them in Git, issues, pull requests, or shared logs.
7. **Apply every publication gate.** Require expected-versus-processed parity, one row per
   Opportunity, complete source accounting, passed synthetic and row-level QA, passed workbook and
   formula verification, preserved reviewer state, and a matching live Production automation
   fingerprint. Critical findings, material source gaps, uncertain target identity, or Production
   drift block publication.
8. **Recheck before the write.** Immediately before publication, confirm the same approved Sheet,
   the same expected run marker, unchanged reviewer state, and no competing run. Preparing a Google
   batch request is not publication.
9. **Publish only within the approved boundary.** Apply only the prepared payload to the approved
   Intake SLA Review Queue when the current invocation has explicit manual or standing scheduled
   publication authority and every gate passed. Otherwise stop after preparation and request the
   named approver's decision.
10. **Read back the live result.** Verify the run ID, refresh timestamp, expected and processed row
    counts, one-row-per-Opportunity invariant, reviewer fields, Generation Ledger, and Run History.
    Mark the run published only after successful live readback.

## Evidence And Failure Rules

- Determine the true process gate from current structured records before summarizing conversations.
- Promote only Direct or Likely substantive facts matched to the Opportunity.
- Use full Fireflies transcripts when available; meeting summaries alone do not support
  classification.
- Record `Found`, `Searched - Not Found`, `Blocked`, `Timed Out`, or `Unsupported` for every planned
  source. Retry timeouts only as allowed by the runbook.
- Block only rows that depend on a failed stage-required source, but never publish an incomplete
  cohort when the runbook requires whole-queue parity.
- Keep raw client, family, transcript, message, email, and task content out of the completion report.
- Leave the current live Sheet in place whenever a publication or readback check fails.

## Consequential Boundaries

- Salesforce is read-only. Never update Salesforce summaries, create Tasks, deploy metadata, or
  write Production data through this workflow.
- Google writes are limited to the approved Intake SLA Review Queue and only after the gates above.
- Do not retrieve Aloha directly when the current runbook excludes it.
- Do not change code, configuration, fingerprints, thresholds, schedules, or source scope merely to
  make a blocked run pass.
- Route any Salesforce code or metadata change to the normal release workflow. It is incomplete
  until the exact intended scope is validated and read back in Partial and represented by a matching
  Git branch, commit, and pull request. Production promotion requires separate explicit approval.

## Completion Report

Return a concise, PHI-safe report containing:

- run type, scheduled slot or manual trigger, live gate evidence, engine revision, and private run ID;
- expected, processed, active, on-hold, blocked, and excluded row counts;
- Portal Authorization Request complete, found, not-found, blocked, and timed-out counts;
- Fireflies primary, fallback, complete, found, not-found, blocked, and timed-out counts;
- Slack cohort-search and targeted denial-search coverage;
- AI interpretation success, deterministic fallback, and token-usage totals when applicable;
- reviewer-field preservation, QA, workbook, formula, and Production fingerprint results;
- publication status and exact live readback, or the exact blocked gate;
- skipped stages as `0/not run` for a verified no-op; and
- Salesforce Release Ledger: workstream, Production org alias and org ID, branch, commit, PR,
  validation, deployment, live readback, Production state, and blockers. For a normal read-only SLA
  run, Git, Partial validation, and Partial deployment are `N/A — no Salesforce code or metadata
change`; Salesforce live readback must still identify the org and confirm zero writes.

Do not call a prepared payload published, a Git check deployed, or a partial source sweep complete.
