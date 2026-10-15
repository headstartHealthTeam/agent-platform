# Operator Handoff and Readiness

Use this checklist before assigning a backup operator or declaring the workflow operational while the primary owner is unavailable.

## Readiness States

| State             | Meaning                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| Code Ready        | The operator can provision the reviewed runtime and run its complete synthetic/distribution checks.                   |
| Live Run Ready    | The operator has every required permission and private runtime input, and has completed a supervised dry run.         |
| Publication Ready | The operator can capture reviewer state, validate a run, publish to the approved Sheet, and prove the live result.    |
| Unattended Ready  | A hosted runner, service identity, secure secret store, monitoring, retry policy, and named support owner are active. |

A reviewed runtime that passes the complete synthetic/distribution checks is **Code Ready**. It becomes **Live Run Ready** or **Publication Ready** per operator only after the requirements below are satisfied. It is not currently **Unattended Ready**.

## Required Access

The backup operator needs approved access to:

- The reviewed `headstartHealthTeam/agent-platform` revision and its packaged Intake runtime.
- Codex with the reviewed shared `$headstart-intake-sla-review` skill installed
  from `headstartHealthTeam/agent-platform`.
- Headstart MCP and Salesforce Production read access for the SLA cohort and all related Intake objects.
- Fireflies transcripts available through the approved Headstart team/admin access model.
- Headstart provider portal and portal chat data.
- Slack channels and threads used by the workflow, including client-intake denial context.
- Salesforce-linked calls, texts, Tasks, Chatter, billing, and claims evidence.
- The approved Intake SLA Review Google Sheet with edit permission.
- The secure location used to exchange runtime configuration and run artifacts.

Access must cover the actual source records, not only the app landing page. Validate each connector with a known non-sensitive fixture before the first live run.

## Private Runtime Inputs

These files are required for live operation and are intentionally excluded from Git:

| Runtime Input                                                                   | Purpose                                                                                                                                                  |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SLA_CLIENT_IDENTITY_ALIASES_PATH`                                              | Confirmed client name and transcription aliases.                                                                                                         |
| `SLA_PROVIDER_IDENTITY_ALIASES_PATH`                                            | Provider identities, aliases, emails, phones, portal IDs, and meeting anchors.                                                                           |
| `SLA_PRODUCTION_FINGERPRINT_PATH`                                               | Approved Production Apex, Flow, and SLA metadata baseline used to block publication on drift.                                                            |
| `<run-dir>/reviewer_state.json`                                                 | Current reviewer-owned Sheet values captured immediately before generation.                                                                              |
| `<run-dir>/google_sheet_metadata_current.json`                                  | Fresh target Sheet tabs, IDs, and grid dimensions captured immediately before publication preparation.                                                   |
| `<run-dir>/google_publication_state.json`                                       | Fresh exact used extents plus current values for Source & Run Notes, Generation Ledger, and Run History.                                                 |
| `<run-dir>/live_sheet_marker_initial.json` and `live_sheet_marker_current.json` | Baseline and refreshed `Last Refresh`/`Run ID` concurrency markers.                                                                                      |
| `<run-dir>/reviewer_state_current.json`                                         | Refreshed reviewer-owned values used for the final exact comparison.                                                                                     |
| `<run-dir>/salesforce_cohort_refresh.json`                                      | Fresh read-only cohort comparison. Material changes require an exact post-cutoff record/timestamp disposition for the next run.                          |
| `<run-dir>/competing_run_state.json`                                            | Fresh check proving no newer or concurrent publication owns the Sheet.                                                                                   |
| `<run-dir>/generation_ledger_state.json`                                        | Prior generated-note provenance used to prevent the engine from learning from its own output.                                                            |
| `<run-dir>/generation_ledger_baseline.json`                                     | Engine-created immutable prior-ledger input for this run; rebuilds write current output to `generation_ledger_state.json` without changing the baseline. |
| Source snapshots in `<run-dir>`                                                 | Current Salesforce, Fireflies, portal, communications, Slack, and linked operational evidence.                                                           |

Transfer these through an approved secure location. Never attach them to GitHub issues, pull requests, Actions, Slack channels, or unapproved shared folders.

## Environment and Runtime

The operator must configure:

- `SLA_SPREADSHEET_ID`: approved Intake SLA Review Google Sheet ID.
- `SF_TARGET_ORG`: required host-local Salesforce CLI alias or username for the approved Production org. There is no shared default.
- `SF_EXPECTED_ORG_ID`: required approved Production org ID used to reject an incorrect target before business-data reads.
- `NODE_PATH`: Codex bundled Node package directory returned by the workspace dependency loader, or a local `@oai/artifact-tool` installation.
- `SLA_ARTIFACT_TOOL_PATH`: optional explicit workbook-library entry module when `NODE_PATH` is not used.
- `SLA_AI_INTERPRETATION=on` for interpretation. The API path additionally
  requires explicit `SLA_INTERPRETER_PROVIDER=openai-responses` and
  `SLA_INTERPRETER_MODEL=gpt-5.6-sol`; the current-run Codex finalizer records
  distinct non-API provenance instead.
- `OPENAI_API_KEY`: injected only into the interpretation child process by the approved credential provider, accompanied by `SLA_APPROVED_CREDENTIAL_SOURCE`. Do not use an inherited key or persist it.
- Authorized connector sessions for Headstart MCP, Fireflies, Slack, portal, and Google Sheets.

Secrets must be stored in the approved local or hosted secret store. Do not place secrets in `.env` files that could be shared or committed.

## First-Time Operator Setup

1. Follow [Local Setup](local-setup.md) to provision the reviewed Agent Platform runtime outside the source checkout.
2. Install the reviewed shared skill from `headstartHealthTeam/agent-platform`
   and confirm `$headstart-intake-sla-review` appears in a new task opened from
   the configured Intake runtime context. Do not use the deprecated bundled `$intake-sla-review`
   adapter as a separate operating contract.
3. Provision the private runtime files through the approved secure path.
4. Configure `SF_TARGET_ORG` for this host and `SF_EXPECTED_ORG_ID` from the approved private operating configuration. Alias names are local conveniences and do not identify an environment.
5. Before starting an interactive login, use `sf` directly to run the bounded read-only query `SELECT Id, IsSandbox FROM Organization LIMIT 1`. If it returns the expected Production identity, do not log in again even when an older browser command or tab is still waiting. If it reports invalid or expired authentication, run one interactive login and repeat this query after the operator completes it. Treat `403` and `API_CURRENTLY_DISABLED` as access failures rather than reasons to repeat login.
6. Do not set `SF_USE_GENERIC_UNIX_KEYCHAIN` for a local interactive login. Reserve it for an explicitly configured SSH, headless, or CI authentication flow, and use the same credential backend for authentication and execution.
7. Validate access to every mandatory source using known fixtures.
8. Run the synthetic checks:

   ```bash
   headstart-intake-sla review:validate
   ```

9. Perform one supervised shadow run into a new private run directory.
10. Validate the shadow run:

    ```bash
    headstart-intake-sla review:validate --run-dir /private/path/to/run
    ```

11. Compare row counts, gates, source coverage, summaries, actions, and reviewer-field preservation with the current live Sheet.
12. Prepare but do not apply the first publication payload:

    ```bash
    headstart-intake-sla review:prepare-publish --run-dir /private/path/to/run
    ```

13. Have the primary operator or designated approver review the first publication.
14. Apply only the next prepared stage/call and capture that stage's exact live assertions before advancing. Use `headstart-intake-sla review:next-publish-stage --run-dir /private/path/to/run` to select a deterministic resume point. After Run History, capture all final assertions again and run `headstart-intake-sla review:verify-publish --run-dir /private/path/to/run --actual /private/final-readback.json`.

An operator is not Publication Ready until this supervised run succeeds end to end.

## Per-Run Checklist

### Before Collection

- Confirm the target is the approved Intake SLA Review Sheet.
- Capture current reviewer-managed fields by Opportunity ID.
- Confirm the current breached-row cohort and expected count.
- Confirm Production automation fingerprint access.
- Start a new private run directory; do not reuse or overwrite a prior run.

### During Collection

- Search every mandatory source and record an explicit source outcome.
- Retrieve full Fireflies transcripts for candidate meetings.
- For optional cross-run body reuse, follow [Fireflies Cache](fireflies-cache.md).
  Begin in shadow mode; production reuse requires an approved validation-age
  policy. Current discovery and current interpretation-packet construction remain
  mandatory, and old loose artifacts are not automatically a trusted baseline.
- Run the synthetic AI preflight before transmitting transcript content, then use the repository-owned bounded-delta command. Only exact canonical bindings may be reused.
- Use provider rosters and aliases for fuzzy identity matching.
- Retry timeouts before generating recommendations.
- Preserve partial failures as `Blocked` or `Review`; never silently skip them.

### Before Publication

- Run `headstart-intake-sla review:validate --run-dir <run-dir>`.
- Confirm expected rows equal processed rows and each Opportunity appears once.
- Confirm quality audit and workbook rendering passed.
- Confirm no formula errors, raw transcript leakage, unsupported claims, or summaries over 255 characters.
- Refresh reviewer state and confirm every continuing reviewer-managed value matches the pre-run capture exactly. New `Needs CSM Review` values are prepared blank and may read back as unchecked by Google; unchecked is not an automated review judgment.
- Confirm Production drift check is publishable.
- Confirm the intended Google Sheet metadata, exact used extents, live marker, cohort, and competing-run state were captured immediately before payload preparation and are under two hours old.
- If the Salesforce cohort changed, prove every material record's observed modification is strictly after the frozen run cutoff and retain it for the next run. Do not invalidate the frozen snapshot merely because later business work occurred.

### After Publication

- Read every stage back through the Google Sheets connector, including its values, validation, filter, color, and grid assertions; save the actual live values or properties and pass that artifact to `review:capture-publish-readback`. Never author or copy an `actualHash` manually.
- Confirm the run ID and refresh timestamp.
- Confirm active and on-hold row counts.
- Confirm a sample of generated summaries and links.
- Confirm `Needs CSM Review`, reviewer notes, copied status, reviewer, and reviewed timestamp were preserved.
- Confirm Run History shows `Published` only after the successful write.
- Capture one final live artifact covering every dedicated `finalAssertions`
  entry, run `review:verify-publish --actual <final-readback>`, and retain the
  resulting `publication-readback.json`; do not call the run published unless
  it reports `Published`.
- Record any blocked sources or failed rows for follow-up.

Do not describe a run as published until this live readback succeeds.

## Current Scheduling Limitation

The 5 PM, 8 AM, and 10 AM catch-up schedule is not created by this repository and is not portable merely by cloning it. The current schedule remains tied to its configured local runner.

The exact portable task settings and saved prompt are versioned in
[`scheduled-task-template.md`](scheduled-task-template.md). Each backup operator
must create that task in their own Codex, target their provisioned runtime context, and keep
it paused until their supervised shadow run and first publication readback pass.
Only one operator's task may be active at cutover.

For true coverage while the primary owner is offline, deploy the same collector and validation contracts to a hosted runner with:

- A named business owner and technical owner.
- A least-privilege service identity for each source and the Google Sheet.
- An approved PHI-capable runtime and encrypted storage.
- Central secret management and credential rotation.
- Idempotent run IDs and duplicate-publication protection.
- The 5 PM normal run plus 8 AM and 10 AM catch-up checks.
- Run timeout, retry, and partial-publication rules.
- Failure and blocked-source notifications to a monitored team destination.
- Pause, cancellation, and manual rerun controls.
- Retention and deletion rules for source snapshots and generated artifacts.

Until that deployment exists, assign a backup operator who is Publication Ready and can run the workflow manually from an approved machine.

## Offboarding and Access Changes

When an operator changes roles or leaves the workflow:

- Remove GitHub, connector, Sheet, and secret-store access.
- Revoke or rotate any operator-specific credentials.
- Confirm scheduled jobs do not reference the former operator's account or machine.
- Assign a new backup operator and require a supervised validation run.

## Package navigation

[Local setup](local-setup.md) · [Package overview](../README.md)
