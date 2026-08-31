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

## Procedure

1. Preserve direct human edits as authoritative unless the feedback explicitly requests changing
   them or they create a documented evidence or safety conflict.
2. Resolve voice and clarity changes with `write-headstart-tone-and-voice` while preserving facts.
3. Resolve visual guidance with `design-headstart-public-website` without inventing asset approval.
   If the exact candidate changes, reinspect the new asset and rewrite or reaffirm alt text from the
   new image and its context. Do not carry forward alt text from a superseded candidate.
4. For factual changes, verify the existing packet support. If support is absent or stale, invoke
   `headstart-content-research` for a bounded update and create a new packet version before editing.
5. For strategy changes, stop and request an updated approved opportunity unless the authorized
   reviewer has supplied that decision through the owning workflow.
6. Apply only affected changes. Do not rewrite untouched sections to make them sound more uniform.
   Revalidate every changed title tag, meta description, heading, canonical route, internal-link
   field, image field, and reviewer-artifact representation.
7. Record each feedback item as applied, partially applied, declined, blocked, or needs decision,
   with the exact changed fields and reason.
8. Run verification against the new exact revision. Permit one repair pass, then return unresolved
   failures to the reviewer.
9. Return a new immutable revision bundle and a concise change summary. If an authorized private
   reviewer artifact exists, create or update an exact verified revision and record its identity and
   access state. Do not approve, schedule, publish, notify, upload to the CMS, or overwrite the prior
   revision.

## Conflict Rules

When feedback conflicts:

- preserve the later application-owned decision when chronology and authority are explicit;
- preserve evidence and safety constraints over stylistic preference;
- do not choose between two authorized stakeholder directions without a named resolution; and
- return one focused decision request that states the affected content and downstream impact.
