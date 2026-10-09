# Codex Scheduled Task Template

This file versions the recurring task that the backup operator creates in their
own Codex. It does not create or transfer a schedule by itself.

## Task settings

| Setting     | Value                                                                         |
| ----------- | ----------------------------------------------------------------------------- |
| Name        | `Weekday Intake SLA Review Queue Refresh`                                     |
| Project     | The operator's configured local runtime context                               |
| Time zone   | `America/New_York`                                                            |
| Schedule    | Weekdays at 8:00 AM, 10:00 AM, and 5:00 PM Eastern                            |
| Model       | `gpt-5.6-sol`                                                                 |
| Reasoning   | `high`                                                                        |
| Environment | Local project or an isolated worktree with private runtime inputs outside Git |

The computer must be powered on, the Codex desktop app must be running, and the
reviewed runtime and private input bindings must remain available. The schedule is only a trigger; the Sheet's
live marker and Run History decide whether work is due.

## Saved prompt

```text
Use $headstart-intake-sla-review to refresh the existing Intake SLA Review
Queue Google Sheet from live Headstart Production sources. Treat
the packaged docs/automation-runbook.md from the reviewed runtime as the authoritative engine run
contract and read it completely before starting. Follow every run gate,
reviewer-state protection, source-coverage requirement, Fireflies retrieval
step, portal authorization request rule, Slack coverage rule, AI transcript
guardrail, exact interpretation binding, validation check, and staged
publication/readback rule.

Monday at 8 AM ET is a normal full refresh. Monday at 10 AM is a catch-up only
when the Monday 8 AM refresh did not publish. Tuesday through Friday at 8 AM and
10 AM are catch-up checks as defined in the runbook. Every weekday 5 PM run is a
normal refresh. If the live gate says no refresh is due, stop as a verified
no-op before source collection or writes and report every skipped stage as
0/not run.

Keep Salesforce read-only and never create Salesforce Tasks. Never retrieve
Aloha directly. Store all run artifacts in a new approved private directory
outside Git. If a required source, reviewer-state capture, Production
fingerprint, QA check, or live readback is incomplete, fail closed and leave the
existing Sheet unchanged.

Use only current-run Fireflies packets. Reuse only a prior API interpretation
whose canonical binding proves the packet and full interpreter contract are
exact; never reuse a prior Codex-precomputed result as a current evaluation.
Before API content, run the synthetic preflight. If that provider is
unavailable, use the current-run Codex precomputed finalizer with distinct
non-API provenance rather than another API model. Before publication, refresh
every concurrency artifact,
apply only the deterministic next stage, verify actual live values, and append
Run History last.

Report: run type and gate evidence; expected and processed row counts; Portal
Authorization Request complete/found/not-found/blocked counts; Fireflies
primary/fallback/complete/found/not-found/blocked counts; Slack cohort and
denial-search coverage; AI interpretation success/fallback/token usage;
reviewer-field preservation; QA; Production drift; publication status; live
readback; blocked rows and sources; and explicit Salesforce/Git/Partial/
Production boundaries.
```

## Creation prompt for Mark's Codex

Use the active host's scheduling capability only after explicit schedule authorization:

```text
Create a standalone recurring Codex scheduled task named "Weekday Intake SLA
Review Queue Refresh" for this local project. Use the exact saved prompt and
settings in docs/scheduled-task-template.md. Keep the task paused until the
operator-readiness checklist in docs/operator-handoff.md and the current private coverage handoff is complete and a
supervised manual shadow run has passed. Show me the created task and its next
three scheduled times in America/New_York.
```

Official OpenAI documentation: [Scheduled tasks](https://learn.chatgpt.com/docs/automations).

## Package navigation

[Local setup](local-setup.md) · [Package overview](../README.md)
