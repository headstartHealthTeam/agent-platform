# Triage Handoff Shapes

Use these shapes after following the main skill. Examples are synthetic; replace placeholders with
verified identifiers. Keep raw protected evidence in its owning system.

## Linear Evidence Update

For a new issue, use a concise surface/problem title and the structure below. For an existing
issue, add only the missing findings, source links, or justified metadata changes.

```markdown
## Summary

[Reported failure or request and concrete user impact.]

## Source and evidence

- Slack: [exact report permalink; thread root if different]
- Observed: [what the report/attachment actually shows]
- Expected: [intended outcome and supporting source]
- Verified: [read-only findings, source revisions, environment and observation time]
- Hypotheses: [explicitly unverified, or none]
- Missing evidence: [precise gap, or none]

## Scope and ownership

- Surface/workflow: [Provider portal, Family portal, staff, or integration; route/action]
- Systems/repositories: [actual scoped dependencies and implementation owners]
- Project: [verified matching initiative and reason, or why none fits]
- Related work: [owning/duplicate/historical issue or PR links and scope distinction]

## Current status and next action

[Verified outcome or unresolved blocker. Distinguish delivery state from report disposition.]
[Concrete next action, known owner or unassigned, and evidence needed to verify completion.]

## Suggested verification

[Focused reproduction or acceptance path; no implied permission to execute it.]
```

Do not bury unresolved current reports under a historical Done label. Preserve the issue's state
unless an authorized transition is justified, and make the contradiction visible in its evidence
update and final handoff. Do not promise an ETA or assign someone without a supported basis.

## Slack Reply

Aim for two to four short sentences, with normal Slack link formatting supported by the tool.
Keep only the details needed by the reporter. Avoid copying the full Linear investigation.

**Confirmed bug, root cause still unknown:**

> Tracked in [ISSUE-ID]. I checked the report and the current notification route; the alert opens
> the list, but we haven't established why the details are missing. This is unresolved. Next step
> is to match the alert to its source event and check what the affected user can see.

**Unconfirmed report, reuse an investigation:**

> Added the findings to [ISSUE-ID]. I checked the screenshot and current records, but they don't
> identify which corrections are missing. We're waiting for the affected records, fields, expected
> values, and roughly when the changes were made.

**Existing correction reported by staff:**

> Findings are in [ISSUE-ID]. Staff report that the stale hold flag was cleared; the provider's
> refreshed view still needs confirmation. Next step is to verify that the client appears and the
> workflow can continue.

No response is needed when the thread already contains an equivalent final handoff and nothing
material changed. If evidence identifies a missing attachment, source event, permission, or
reproduction path, name that exact gap instead of writing only "needs investigation."

## User Receipt

For a batch, use a compact table with one row per distinct concern:

| Source report     | Owning issue and action                       | Finding/status                     | Team/project/labels                         | Next action                        | Slack handoff                                                      |
| ----------------- | --------------------------------------------- | ---------------------------------- | ------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------ |
| [Exact permalink] | [ID and URL]; created/reused/updated/proposed | [Verified result or exact blocker] | [Saved values or proposed in no-write mode] | [Owner/action or missing evidence] | [Existing/added reactions; existing/new reply permalink; failures] |

Also report:

- Channel identity, time range/timezone, candidate count and pagination completeness.
- Source-to-issue mappings for all split concerns, with canonical duplicate ownership.
- State, priority, assignee and missing surface/repository labels; include these per issue or
  compactly below the table. For a single report, plain paragraphs or a short list are sufficient.
- Changes actually made versus proposals, skipped writes, unknown outcomes, and next continuation
  point if the scan limit was reached.

Do not present static evaluation definitions as executed model tests, live verification, or proof
of cross-host behavior. When authoring or releasing this skill, record those evidence levels
separately from repository QA.
