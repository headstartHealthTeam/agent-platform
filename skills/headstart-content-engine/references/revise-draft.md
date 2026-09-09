# Revise Draft From Human Feedback

## Inputs

Require:

- exact `draftId` and immutable `draftRevision`;
- the `packetId` and `packetVersion` used to create it;
- structured feedback with author, time, location, and requested outcome when available;
- any direct human edits already made to the draft; and
- confirmation that the revision has not been superseded.

Do not revise an inferred latest draft. If revision identity or feedback target is ambiguous, stop.

## Feedback Classification

Classify every item before editing:

- **factual or evidence:** changes a claim, qualifier, citation, date, or source;
- **strategy or scope:** changes audience, page job, pillar, intent, conversion role, or format;
- **voice or clarity:** changes expression without changing supported meaning;
- **structure:** changes order, headings, depth, examples, or reader flow;
- **search:** changes query emphasis, metadata, internal links, or subtopic coverage;
- **visual or asset:** changes image direction, alt text, layout guidance, or asset requirements;
- **application field:** changes taxonomy, contributor, CTA, relation, schedule, or another CMS
  value; or
- **conflicting or unclear:** cannot be applied safely as written.

## Reusable Learning Gate

Classify the scope of every feedback item separately from its editorial type:

- **draft-only:** a direct replacement without rationale, an isolated preference, a topic-specific
  fact or example, or a correction that does not establish a broader behavior;
- **reusable candidate:** feedback that explicitly names what failed, explains why it failed, and
  states the principle or outcome future work should follow; or a repeated failure pattern supported
  by more than one reviewed draft; or
- **needs interpretation:** feedback whose intended scope, authority, or generality is unclear.

Apply draft-only feedback to the new revision without turning it into a global instruction. Test a
reusable candidate against the existing skill boundary and other approved guidance. Route it to the
narrowest canonical owner: evidence and brief inputs to research, audience-facing expression to
tone and voice, sequencing and handoff behavior to this workflow, and visual behavior to the design
skill. Do not generalize a reviewer-provided factual claim into writing guidance.

Change a shared skill only when the active task authorizes that repository write. Every accepted
reusable change must include or strengthen a behavior evaluation, preserve cross-agent portability,
and identify the feedback evidence that motivated it. Installed skill copies are refreshed from the
canonical repository change; they are never edited as a second source of truth.

## Procedure

1. Preserve direct human edits as authoritative unless the feedback explicitly requests changing
   them or they create a documented evidence or safety conflict.
2. Build a feedback ledger that records editorial classification, learning scope, affected draft
   fields, owning skill or workflow when reusable, and disposition. Preserve a direct edit separately
   from any comment that explains it.
3. Resolve voice and clarity changes with `write-headstart-tone-and-voice` while preserving facts.
4. Resolve visual guidance with `design-headstart-public-website` without inventing asset approval.
   If the exact candidate changes, reinspect the new asset and rewrite or reaffirm alt text from the
   new image and its context. Do not carry forward alt text from a superseded candidate.
5. For factual changes, verify the existing packet support. If support is absent or stale, invoke
   `headstart-content-research` for a bounded update and create a new packet version before editing.
6. For strategy changes, stop and request an updated approved opportunity unless the authorized
   reviewer has supplied that decision through the owning workflow.
7. Apply only affected changes. Do not rewrite untouched sections to make them sound more uniform.
   Revalidate every changed title tag, meta description, heading, canonical route, internal-link
   field, image field, and reviewer-artifact representation.
8. Record each feedback item as applied, partially applied, declined, blocked, or needs decision,
   with the exact changed fields, learning disposition, and reason.
9. When authorized, apply accepted reusable candidates to their canonical skills and evaluations,
   validate and publish those changes through the owning repository, and refresh installed copies
   through the repository's supported distribution workflow. Do not claim the learning is active
   until each required step succeeds.
10. Run verification against the new exact revision. Permit one repair pass, then return unresolved
    failures to the reviewer.
11. Return a new immutable revision bundle and a concise change summary. If an authorized private
    reviewer artifact exists, create or update an exact verified revision and record its identity and
    access state. Do not approve, schedule, publish, notify, upload to the CMS, or overwrite the prior
    revision.

## Conflict Rules

When feedback conflicts:

- preserve the later application-owned decision when chronology and authority are explicit;
- preserve evidence and safety constraints over stylistic preference;
- do not choose between two authorized stakeholder directions without a named resolution; and
- return one focused decision request that states the affected content and downstream impact.
