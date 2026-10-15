# Transcript Interpretation Contract

The transcript layer explains what a conversation means for the current SLA
gate. It does not summarize the entire meeting.

## Input

Each interpretation request contains:

- Opportunity ID and client aliases.
- Practice, provider, current/prior CSM, payer, authorization, RBT, and candidate
  anchors.
- Current stage, stage-entry date, process position, and unresolved gate.
- Source, source record ID, source-owned event date, and collection date.
- Only the transcript segment surrounding the matched client reference.
- The provider's bounded Opportunity roster; the model cannot select a client
  outside that roster.

The model never receives the existing SLA action item. Existing SLA, intake,
authorization, and on-hold notes may be supplied as evidence when their date and
record identity are known.

## Required Output

The interpreter returns zero or more structured findings:

- `synthesizedFact`: one plain-language operational fact.
- `gateImpact`: why the fact advances, blocks, or conflicts with the current
  gate.
- `eventDate`: the source-owned date, not the collection date.
- `matchQuality`: `Direct`, `Likely`, or `Weak`.
- `substantive`: whether the fact changes operational understanding.
- `relationship`: `Supports`, `Conflicts`, or `Neutral`.
- `actionOwner`, `actionType`, and `recommendedAction` when a next step follows.
- `milestoneDate` and `followUpDate` only when supported by the source or the
  documented next-business-day rule.
- `milestoneKind`: `planned`, `observed`, or null. An observed status date or
  follow-up reminder cannot create missed-appointment outreach.
- `category`, `issueKey`, and `factType`: interpreter-owned semantics, supplied
  together or all null. Use existing types when supported, otherwise a generic
  `ai-interpreted-conversation` fact; do not invent lifecycle rules. Explicit null
  semantics remain uncertain, not permission for downstream keyword inference.
  They retain source identity/support as unclassified, neutral audit evidence,
  without current-gate promotion or raw-text reinterpretation in freshness.
- An internal support span used for audit validation.

## Interpretation Rules

- Describe the operational meaning; do not reproduce transcript wording.
- Distinguish authorization approval from IA occurrence.
- Distinguish a planned appointment, provider-reported completion, and
  structured completion.
- Treat an overturned denial as awaiting written approval, not an active denial.
- Treat elapsed explicit plans as completion-verification follow-ups, not arbitrary
  status, observation, or reminder dates.
- Do not infer a missing signature, document, candidate, or appointment from a
  vague reference.
- Do not use another client's statement from a multi-client meeting.
- Do not turn a meeting summary, search result, filename, or automated message
  into evidence.
- Do not refresh evidence based on the date it was collected.

## Admission

A finding can influence the primary recommendation only when:

1. It is `Direct` or `Likely`.
2. It is substantive and supports or conflicts with the current gate.
3. Its identity anchors survive the matching rules.
4. Its event date is on or after current-stage entry.
5. Its source record was retrieved completely.

Earlier relevant evidence remains prior context. Weak and ambiguous findings
remain in audit output only.

## Binding And Reuse

Every API interpretation is bound to the canonical current packet plus the
exact provider, model, instructions, JSON Schema, engine version, and
`store: false` contract. A support span alone is not sufficient to reuse a
result because a gate, roster, payer, authorization, or staffing context may
have changed.

Cross-run reuse is allowed only after current-run Fireflies retrieval and packet
construction, and only when the prior interpretation validates against its
prior packet and that full binding equals the current binding. All other packets
are evaluated freshly. A checkpoint is resumable under the same exact rule.

The current approved contract is `openai-responses` with `gpt-5.6-sol`. The
execution environment supplies the approved credential; the domain engine does
not retrieve a specific secret or choose a fallback model. Provider failures are
reported without relaying provider payload text.

The current-run Codex fallback uses the same packet, instructions, schema, and
engine validation contract, but records distinct `codex-current-run`
provenance. It does not claim a Responses API provider/model execution or
`store: false`, and it is never eligible for cross-run current-evaluation reuse.

## Rendering

The short SLA summary is under 255 characters, begins with the newest
substantive update date, and states the process position and unresolved gate.
The longer summary explains the opening condition, meaningful progression,
resolved prerequisites, newest substantive fact, remaining milestone, owner,
and timing in a substantive narrative with no arbitrary sentence ceiling.

Raw transcript, email, message, call, and task wording never appears in either
summary.

## Agent Judgment And Deterministic Enforcement

The interpreter owns context-dependent meaning; the engine owns validation,
source/date/identity bindings, deterministic assembly and publication safety.
Current typed findings retain their semantics through API and current-run Codex
paths, freshness normalization and report assembly. Equivalent source timestamps
deduplicate to one fact, with the original interpretation retained over its
projection. Legacy untyped findings retain their existing compatibility behavior;
do not expand that compatibility parser for routine new wording. Schema/prompt
changes invalidate exact interpretation bindings; never relabel a prior result.

Use the shared `headstart-intake-sla-review` skill's **Operational Recovery**
reference to classify a snag before changing code. The procedure is owned there;
this document owns the engine input contract. Genuine missing evidence, ambiguous
completion or conflicting records stay Review/Blocked under existing rules.
An agent decision is not permission to change a structured gate or suppress QA.

### Current-Run Note Adjudication

When an SLA, intake or on-hold note needs contextual interpretation, the normal
build emits private `note_adjudication_packets.json` for the generation-ledger-
filtered source segments. This is optional targeted recovery, not a requirement
to reinterpret every note. No source recollection or transcript rerun is needed
solely to adjudicate a note. Use only a mutable, unpublished run.

Write `note_adjudications.json` in that run's private directory:

```json
{
  "schemaVersion": 1,
  "runId": "the exact current run ID",
  "sourceCutoff": "the exact packet source cutoff",
  "executionProvenance": { "kind": "codex-current-run" },
  "decisions": [
    {
      "opportunityId": "the packet Opportunity ID",
      "sourceRecordId": "the packet source record ID",
      "packetHash": "the emitted packet hash",
      "disposition": "administrative",
      "rationale": "Explain the interpretation using the complete segment and gate context.",
      "supportSpan": "An exact supporting span from the packet text",
      "findings": []
    }
  ]
}
```

For substantive evidence use `disposition: substantive` and the finding schema
exported by `@headstart-health/intake-sla-engine`, with all three semantic fields populated.
Every finding must have its own exact support span. The source-owned event date
comes from the packet, not the agent. Preserve qualifications, partial completion,
outstanding sessions and conflicts; use a supported uncertainty finding when
appropriate, not an administrative classification to conceal missing evidence.
Administrative disposition requires no findings and does not refresh status.
Mixed agenda/progress text must retain its substantive facts. Semantic review
still checks whether the chosen interpretation follows from the source; a hash
or matching quotation cannot establish that by itself.

Rebuild from the same frozen source artifacts with the normal command. The
engine replaces only the selected note segments, leaves other evidence and
structured gates intact, and records private decision receipts and provenance
on the normalized events. Decisions are bound to run, cutoff, engine, source
text/date/identity and gate context. Invalid, duplicate or unmatched decisions
fail; unreviewed segments still follow existing normalization/QA. Run all normal
validation. Publication preparation rejects adjudication edits made after build.
Do not edit workbook cells, generated rows, QA flags, source snapshots or an
immutable published run to apply a judgment.

## Package navigation

[Local setup](local-setup.md) · [Package overview](../README.md)
