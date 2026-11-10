# Current Workflow Record

Use this guide during the interview and when assembling the readback. Keep the record proportional
to the process: combine short sections, expand meaningful branches, and mark a missing fact unknown
instead of inventing a value. Describe today's practice in plain language. Do not add a future-state
design, automation recommendations, build prompt, or implementation backlog.

Seed the draft from relevant existing conversation and artifacts when available. Use the sections
below to spot gaps, not to make the person repeat covered facts. With no prior context, fill them
progressively from a concrete example. Reused material remains part of the final human readback.

## Record And Confirmation

- Workflow name and boundary; date or period the account describes.
- Person/role interviewed and the part of the process they know directly.
- Status: **Draft — awaiting human confirmation** or **Confirmed current-state account**.
- Confirmation: who confirmed, when, which revision/readback was accepted, and any acknowledged gaps.
  Use the actual conversation evidence; never manufacture confirmation or a timestamp.
- Canonical output location once saved; source materials remain authoritative for their own facts.

## Purpose, Start And Finish

- Goal, beneficiaries, and current definition of a successful outcome.
- Business event, eligibility, readiness prerequisites, and actual starting signal.
- End boundary, verification of completion, and downstream recipient/use of the result.
- Current frequency/volume, elapsed time versus active effort, and deadlines when known. Attribute
  estimates and leave unmeasured values unmeasured.

## Actors, Systems And Inputs

Describe each person's responsibility, each system's role, and which system owns each record or
fact. Identify the platform, object/record type and screen/report/view used, including filters that
determine which records the person sees. For each material input capture:

| Input | Source and owner | Field/label or artifact | Linking identifier | Format and requiredness | Availability and validation |
| ----- | ---------------- | ----------------------- | ------------------ | ----------------------- | --------------------------- |

Explain what happens today when the input is missing, delayed, stale, inconsistent or inaccessible.
Retain exact relevant values/combinations, formats/units and distinctions such as blank versus an
explicit negative value. Distinguish a human's visible label from a verified technical field name;
do not invent API names or require the person to supply them. Include spreadsheets, messages,
attachments and personal knowledge where they affect the work. Link supporting sources without
embedding sensitive examples.

## States And Readiness

| Platform and object | State field/indicator and exact value | Meaning and additional conditions | Actor/trigger and prior state | Resulting state and verification |
| ------------------- | ------------------------------------- | --------------------------------- | ----------------------------- | -------------------------------- |

Describe the states and transitions actually used, including readiness, waiting/blocked conditions
and completion. Capture the person's checks and exceptions to them. Distinguish configured allowed
values or required fields from the operational rule used today; identically named states across
systems may have different meanings. Record unknown transitions rather than filling them in.

## Cross-Platform Handoffs

| Source → destination records | Match/key and relationship | Fields/values copied or transformed | Current actor/mechanism and trigger | Timing and destination verification |
| ---------------------------- | -------------------------- | ----------------------------------- | ----------------------------------- | ----------------------------------- |

Trace the identifiers or lookup rules that connect records, including shared/multiple matches;
field/value mappings, transformations or manual copying; the authoritative system for each fact;
and actual ordering/dependencies. Capture how the person detects and handles missing/ambiguous
matches, conflicting values, synchronization delays, duplicate updates and partial completion today.
Cross-reference the relevant steps and exception paths. Leave unknown mappings or mechanisms
explicitly unverified. Cover only relationships needed to understand this workflow.

## Step-By-Step Current Process

| Step | Actor and system | Inputs | Action and current decision/check | Output and destination | Next step or branch |
| ---- | ---------------- | ------ | --------------------------------- | ---------------------- | ------------------- |

Use a separate row for each meaningful system change or handoff; add prose for complex steps.
Capture the actual ordering and dependencies, identifiers carried forward, manual copying,
waiting/rechecks, notifications, and evidence used to verify each important result.

Describe current decision rules in business language: who decides, evidence they use, conditions,
resulting action, and what happens when they cannot decide. Record discretionary judgment as such;
do not turn an example or an assumed threshold into an approved rule.

## Variants, Exceptions And Recovery

| Situation | How it is detected | What happens today | Owner/handoff and timing | Result or resumption point |
| --------- | ------------------ | ------------------ | ------------------------ | -------------------------- |

Cover relevant alternate paths, missing/conflicting information, duplicate or repeated work,
mid-process changes, partial success, unavailable tools, manual intervention and cancellation.
If there is no established handling, say so. Do not supply a new retry, escalation or approval policy.

## Outputs And Worked Examples

List exact records, files, messages or state changes produced; their destinations and recipients;
and how a person checks that the job is complete. Distinguish an attempted action from a verified
result and individual step completion from end-to-end completion.

Include a sanitized ordinary example and meaningful exception examples when available: starting
facts, actual steps/decisions, and observed or reported result. These describe current behavior,
not acceptance criteria for a future build. Do not invent examples and present them as observed.

## Evidence, Contradictions And Open Questions

- For material rules and claims, retain whether they were **reported by the interviewee**, **observed
  in an inspected source/system**, or **inferred and unverified**. Attribute reported policy separately
  from the policy source itself.
- List source title/link or identifier, date/version when known, relevant section/timestamp, and
  retrieval limitation. Use normal Markdown links; local file links should be relative where useful.
- Identify reused conversation, earlier workflow work or handoff summaries and their scope. Preserve
  original source attribution where available; distinguish prior human statements, agent-generated
  interpretations and current confirmation. Do not imply an inaccessible chat or original source
  was read. Keep proposed or experimental behavior separate from what is used today.
- For optional read-only checks, record the question checked, platform/account or environment
  (without secrets), source reference, check time, relevant filters/scope, finding and limitations.
  Distinguish schema metadata from observed record state and reported operating rules. A current
  snapshot alone does not establish transition history, general behavior or synchronization timing.
  Summarize missing/partial access and unperformed checks without treating them as evidence of
  absence. The interview and confirmation can proceed with those gaps; no platform setup is required.
- Record material source disagreements and their disposition. If practice differs from an SOP,
  describe both and who clarified the difference; do not silently rewrite the SOP or certify policy.
- Keep remaining questions specific: unknown detail, why it matters to understanding the current
  process, answer owner if known, and the relevant step/source. Preserve acknowledged uncertainty
  even when the person confirms the rest of the record.
- Capture current pain points and workarounds with attribution, without ranking improvements.

## Readback Coverage

The human should have seen the material contents above before confirmation. A shorter readback is
useful only when it retains the consequential fields/values, states, cross-platform mappings,
rules, branches, completion conditions, verification findings and unknowns; provide the detailed
draft when needed. Carry corrections through the full record and reconfirm affected content.
Keep proposed future ideas separate and unassessed only if the person
explicitly wants them retained. Do not infer approval to redesign, implement or publish from approval
of this account.
