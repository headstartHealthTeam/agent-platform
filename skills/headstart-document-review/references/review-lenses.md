# Document Review Lenses

Select only relevant lenses. A lens with no material finding should not produce filler.

## Correctness And Currency

- Are factual, technical, or operational claims supported?
- Are dates, statuses, owners, links, and system behavior current?
- Does the document distinguish current state from future design?

## Completeness And Scope

- Are required inputs, outputs, actors, constraints, non-goals, and completion evidence present?
- Does the document omit a dependency that could invalidate the plan?
- Are unsupported edge cases incorrectly presented as covered?

## Contradictions And Duplication

- Do sections, tables, linked sources, or comments disagree?
- Is the same question asked in multiple places with different wording?
- Are two systems presented as canonical for the same decision?

## Decision Readiness

- Is the decision being requested explicit?
- Is current understanding stated so reviewers can confirm or correct it?
- Is the decision owner or best respondent clear?
- Is there one obvious answer location and a stated downstream impact?

## Evidence And Traceability

- Can a reviewer reach the supporting source efficiently?
- Are inference, assumption, and confirmed fact distinguishable?
- Are citations specific enough to verify without exposing private file bytes or unnecessary data?

## Usability And Structure

- Can the intended audience scan the document in the order they need?
- Are headings, tables, and labels appropriate for the density of the content?
- Does formatting clarify meaning rather than decorate it?

## Safety And Authority

- Does the document imply authorization, submission, approval, or production behavior that has not
  occurred?
- Does it expose secrets, unnecessary PHI, private links, or sensitive raw content?
- Are external writes, signatures, clinical decisions, and compliance judgments assigned to an
  authorized human or controlled system?

## Lifecycle And Ownership

- Is the canonical owner and maintenance expectation clear when the artifact is durable?
- Does volatile status belong in the document, or should it be linked from Linear, GitHub, or the
  relevant system instead?
- Will the artifact become a competing source of truth?

## Finding Format

For each material finding provide:

1. priority and short title;
2. exact location;
3. evidence;
4. why it matters;
5. recommended correction or decision; and
6. whether it is objective, inferred, or a judgment call.
