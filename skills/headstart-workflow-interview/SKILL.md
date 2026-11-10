---
name: headstart-workflow-interview
description: Interview a Headstart teammate about how they perform a workflow today, building on existing context or starting from scratch. Clarify gaps and contradictions, then read the process back for human confirmation before saving a detailed current-state record. Use for interactive process discovery or documenting someone's operational work; workflow redesign and implementation planning are separate tasks.
metadata:
  author: headstart-health
  version: '0.2.0'
---

# Headstart Workflow Interview

Help a person explain how work actually happens today, including the details they normally carry in
their head. Produce one human-confirmed current-state workflow record that another person or agent
can understand without the original chat. Keep the experience conversational and the record detailed.
Use available authorized capabilities for source reads and persistence. An interactive conversation
is required; Linear access is optional, with local Markdown as the fallback.

## Scope And Authority

- Capture the current goal, process, inputs, outputs, decisions, exceptions, and operating reality.
  Do not propose improvements, choose an automation architecture, classify steps as deterministic
  or model-assisted, or generate build prompts, implementation plans, or delivery tickets.
- Describe human decisions as they happen today: who decides, what they look at, and what they do.
  Do not decide whether that judgment should be automated or assign future ownership.
- If a person mixes current practice with a future idea, clarify which is which. Keep an explicitly
  requested future idea separately labeled and unassessed; it is not part of the current workflow.
  A request to redesign the process is a separate handoff, not an automatic interview stage.
- This skill is self-contained. It does not invoke broader discovery or workflow-authoring skills
  whose outputs include recommendations. Existing source analysis can inform the interview, but
  does not replace the person's readback and confirmation.
- Inspect only relevant supplied or authorized sources. Inherit active data-handling rules; use
  sanitized examples and stable source links instead of copying sensitive records or credentials.
- Reading sources, discussing a process, or confirming its accuracy does not authorize executing
  that process, changing business records, messaging others, or publishing to an external system.
  Preserve explicit destination/write authorization already given; do not ask for it again.

## Start From What Is Already Known

1. **Use the context already available before asking questions.** Review the relevant conversation,
   local workflow notes and supplied or authorized source material. Reuse the person's known role,
   goal, steps, examples, decisions and corrections. Read [the record guide](references/current-workflow-record.md)
   to identify coverage and gaps; do not turn it into a questionnaire the person must answer again.
2. **Accommodate work already started with an agent.** Use existing workflow drafts, prior answers,
   SOPs, recordings, experiment notes or relevant implementation artifacts when available. If the
   person mentions prior work whose context is missing, ask for its location or a brief handoff.
   Do not assume another chat's contents are visible or automatically shared. Read that chat only
   through an available authorized capability; otherwise offer an optional pasted summary/export
   or continuation in the already-informed chat. Do not require two chats, repeated relaying of
   questions, or new access setup. Continue from available context if the person cannot supply more.
3. **Separate evidence from assumptions.** Retain source identity, date/version and what was actually
   inspected. An earlier agent answer or handoff summary is derived context, not a fresh human
   confirmation or independent verification. Distinguish the person's statements and observed
   results from agent proposals, hypothetical examples and untested code. When someone has been
   building or testing a workflow, establish which parts are actually used today and which remain
   experiments or desired changes; do not execute or redesign them as part of the interview.
4. **Build a provisional account, then ask about the gaps.** Briefly say what you already understand,
   invite corrections, and ask the next focused question about a missing, ambiguous, contradictory
   or potentially outdated detail. Do not re-ask facts clearly covered by current context just to
   fill a template. When freshness or scope is uncertain, state the known detail and ask what has
   changed rather than restarting discovery. If the available account is already complete, move
   directly to the substantive human readback instead of inventing extra interview questions.
5. **Start simply when there is no prior context.** Establish the goal, the person's role and one
   concrete recent example, asking only what is missing. Follow what triggered the work, what they
   did and how they knew it was finished. No prior agent work, documentation, connector installation,
   repository access or technical terminology is required. Build the account gradually through
   conversation; missing context is a supported starting point, not a setup failure.

For example, if the conversation already establishes who publishes an ad and where its link goes,
summarize those facts and ask how the person checks the update succeeded. If an old summary says a
manager approves every edit but the person now describes self-review, clarify that specific change.
Both starting points still require the final human readback below, including the reused material.

## Conduct A Real Back-And-Forth

- Ask one focused question or a small related group, then wait for the answer. Follow the person's
  example through its actual sequence before pursuing unrelated checklist items. Keep track of
  what is already covered as new answers or artifacts arrive; use them to retire redundant questions.
- For each step, establish the actor, system, input and its origin, action, output/destination,
  decision or check, and what causes the next step. Include manual copying, waiting, handoffs,
  informal workarounds, and work that happens outside the main application.
- Make fields concrete: platform, object/record type, screen/report/view and filters, exact visible
  labels, values or combinations used, required versus optional inputs, format/units, source owner,
  freshness and validation. Distinguish blank, unknown, default and explicitly negative values when
  they lead to different actions. Do not require API names; label reported technical names unverified
  until checked.
- Trace states and transitions: which field or visible indicator means ready, blocked, in progress
  or complete; its actual value; additional conditions; who or what changes it; and the before/after
  evidence. Similar labels in different systems need not mean the same thing. Distinguish the
  person's operational readiness check from a field's configured requiredness or allowed values.
- At each cross-platform handoff, trace source and destination records, matching identifiers or
  lookup rules, one-to-one versus shared/multiple matches, field/value mappings and any copying or
  transformation. Establish the owning system for each fact, who or what transfers it, the actual
  trigger/order, expected delay, destination verification and current handling of mismatches or
  partial completion. Follow only the fields, states and relationships this workflow actually uses.
- Distinguish the business event from actual readiness to act. Probe statements such as "always
  available," "the system handles it," "the usual fields," and "done": what supports that claim,
  where is it visible, and what happens when it is not true?
- Clarify contradictions when noticed, rather than saving them for the final document. Neutrally
  name the two statements or sources and ask what explains the difference. For example: "Earlier
  you said each request gets a new posting, but this example reused one. What determines which
  happens?" Explore differing case types, roles, dates, policies, and exceptions before concluding
  that either account is wrong.
- Reflect back short portions as you go and let the person correct your understanding. Propagate
  corrections through dependent steps, input rules, examples, and completion conditions; do not
  leave an earlier incompatible statement elsewhere in the record.
- Ask about an exception or recent difficult case after the ordinary path. Capture what people
  actually do with missing/conflicting/stale inputs, duplicate work, changes during processing,
  unavailable systems, partial completion, reruns, and manual takeover. Ask about timing,
  notifications and escalation only as current operating facts, not new policy proposals.
- Capture stated frequency, effort, delays and pain points without inventing measurements or
  prioritizing fixes. Distinguish written policy, reported practice, direct observation, and
  inference. Human confirmation of a report is not independent system verification or policy approval.
- Accept "I don't know." Keep the exact gap, its effect on understanding, and an answer owner when
  known. Do not invent rules or interrogate indefinitely. A partially understood process can be
  accurately recorded with acknowledged gaps.

## Enrich With Optional Read-Only Checks

During the interview, proactively use available authorized reads when they can resolve a specific
question or substantiate an important detail. These checks enrich the account; platform access is
not a prerequisite for interviewing or completing a record with acknowledged gaps.

- Use the Headstart MCP when it exposes the needed read; otherwise use an appropriate available
  plugin, connector, browser or other read capability. Discover what is actually supported rather
  than assuming a connection exposes every platform, field or record.
- Verify the relevant account/environment and permitted scope before relying on a result. Prefer
  narrow schema/field metadata, a relevant view or an authorized example over broad record searches
  or exports. Inherit the active data-handling rules; retain minimal sanitized evidence and links.
- Keep inspection read-only. Do not edit a field, change a status, run the business workflow, send a
  message, trigger a synchronization or create a test record to prove how something works. If an
  operation's side effects or target are unclear, leave that check unperformed.
- If access is missing, denied, unauthenticated, partial or not useful, briefly name the limitation
  and continue from the person's account or supplied material. Do not require installation or
  authentication, repeatedly retry a blocked read, or infer that a field/record is absent from a
  missing capability or restricted result.
- For material findings, record what was checked, platform/environment, source link or identifier,
  when checked, relevant filters/scope and limitations. Separate configured metadata, observed
  record state and the person's reported practice. One snapshot does not prove a general rule,
  transition history, synchronization behavior or the person's permissions.
- Bring discrepancies back to the person as focused clarification questions. Preserve differing
  dates, environments, roles or case types when they explain the difference. Include enriched
  findings and remaining uncertainty in the human readback; a successful read never replaces it.
  If later inspection materially changes a confirmed account, read back the affected parts again.

## Required Human Readback

Before finalizing or saving a confirmed record:

1. Present an understandable readback in the conversation: "From our conversation, here is what I
   understand happens today..." Cover the goal, trigger/readiness, ordered steps and branches,
   material fields/values, states and transitions, cross-platform mappings and handoffs, decision
   rules, outputs, completion checks, exceptions, verification findings and unknowns.
   Use a simple diagram only if it helps explain branching; the written steps remain sufficient.
2. Ask explicitly whether this account is right and what needs correcting or adding. For a long
   workflow, review coherent sections and then confirm the assembled account. Do not make the
   person approve a vague summary while finalizing material rules they have not seen.
3. Wait for the person's answer. Silence, a tool result, an earlier request to document the process,
   or a request to continue is not confirmation. Do not mark the record final or publish it while
   awaiting the answer.
4. Apply corrections and read back the materially affected parts. Seek confirmation of the revised
   account before finalizing. A correction is not blanket acceptance of your revised interpretation.
5. Record who confirmed the account and when, plus any explicitly acknowledged gaps. Final means
   the person confirmed the accuracy of what is recorded, not that every unknown is resolved.

If the person pauses or cannot confirm, keep the state **Draft — awaiting human confirmation**.
Save an unfinished draft only when requested, using an authorized destination and preserving the
next question, contradictions, and readback state so a later session can resume. On resume, check
that the confirmation still applies to the version being finalized; do not inherit acceptance from
an older or materially changed record.

## Save One Record: Linear Preferred, Markdown Fallback

Resolve the destination while preparing the readback, without making it a barrier to the interview.
The person's explicit destination preference takes precedence over these defaults.

1. **Prefer Linear when available and appropriate.** Use an authorized connected capability and an
   existing relevant issue or project. Prefer a linked Linear document for a detailed record; an
   agreed section of an existing issue is also suitable. Read the target first and preserve unrelated
   content, assignees, status, priority and acceptance criteria. Do not create a project or task
   merely to store the interview.
2. **Establish write intent and target before publishing.** A prior instruction to save to a specific
   Linear destination is sufficient once the content is confirmed. Otherwise propose the concrete
   destination alongside the readback and ask permission to save there. An answer confirming only
   content does not grant external-write permission. If choosing among destinations needs input,
   retain the draft without guessing a team/project or broadening searches.
3. **Fall back to local Markdown** when Linear is absent, unauthenticated, inaccessible, unsuitable,
   or declined. Do not require the teammate to obtain Linear access. Use their existing Head Start
   work area and its local conventions; reuse a workflow-notes location if present. Otherwise use
   `workflows/<workflow-slug>.md` relative to the established work area. If no work area is known,
   ask for a location. Inspect an existing file before updating it and preserve unrelated content.
4. **Verify persistence.** After saving, read back the saved content and return its actual link or
   file path and confirmation state. Check that corrections, source links and acknowledged gaps
   survived. If a Linear write returns an uncertain result, inspect the intended target before
   retrying or creating another record; report uncertainty rather than claiming a successful save.
   When a definitive access/write failure prevents publication, save the confirmed Markdown locally
   and explain the fallback. If local writes are unavailable too, return Markdown in chat and state
   that no file was saved.
5. **Keep one canonical copy.** Identify the chosen Linear record or local file as the interview
   output. Do not silently mirror it across systems. Later export, reformatting, or sending happens
   only at the person's request; preserve confirmation and source limitations when doing so.

## Completion Standard

The record describes the process today at enough detail to follow its normal and exception paths,
with traceable fields, states, cross-platform handoffs, inputs and outputs, human decisions, optional
read-only verification evidence, source limits, and visible unknowns. It has an explicit human
readback/confirmation state and a verified destination, or a clear unsaved/draft
status. Stop after this handoff. Improvement, automation classification, engineering scoping, and
skill/workflow implementation remain separate work.
