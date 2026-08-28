# Persona Evolution Policy

The model evolves through explicit evidence review, not passive or silent self-modification.

## Evidence Lifecycle

1. Observation: A provider statement, action, repeated question, or documented operational behavior.
2. Hypothesis: A tentative explanation or design implication based on one or a small number of observations.
3. Pattern: Recurrence across several providers or contexts.
4. Structural candidate: A pattern supported across at least two source types that may justify a foundational persona or rubric change.
5. Approved model change: A reviewed change applied to the skill with version and calibration-date updates.

Use judgment rather than treating counts as proof. As a starting guardrail:

- One interaction may create a hypothesis.
- Several independent providers may establish a pattern.
- Cross-source support is normally required for a foundational change.
- A strategically important exception may justify a scenario overlay before it justifies a persona.

## Permitted Changes by Mode

### Evaluate

- Do not edit the skill.
- Surface new hypotheses separately if the artifact reveals an evidence gap.

### Learn

- Propose anonymized evidence records by default.
- Append records only when the user explicitly requests the repository write and every canonical
  write condition is satisfied.
- Add a provisional overlay or scenario only with clear labeling and user approval.

### Calibrate

- Audit evidence coverage and contradictions.
- Propose changes with supporting evidence IDs.
- Apply foundational persona changes only after explicit approval and when every canonical write
  condition is satisfied.
- Update version and calibration date after approved changes.

## Canonical Write Boundary

An installed copy under a user-level or host skill directory is a deployment artifact, not an
editable source. Learn and Calibrate mode must return a proposal by default, even when evidence or a
proposed change has already been approved.

Apply a change only after the user explicitly requests that exact repository write, the active
workspace is verified as the canonical `headstartHealthTeam/agent-platform` checkout, and the
current branch is a writable feature branch rather than `main` or another protected stable branch.
Repository instructions and worktree state must also permit safe validation.

When the canonical checkout is unavailable or any condition cannot be verified, stop before writing
and return the full change proposal as a handoff. Include the target skill version, files and
sections, current and proposed content, evidence IDs and provenance, confidence, contradictions,
privacy notes, overgeneralization risk, and validation requirements. Never apply the change to an
installed copy as a fallback.

## Change Proposal Format

For each proposed change provide:

- Target skill version
- Target file and section
- Change type: add, revise, merge, split, demote, or remove
- Current statement
- Proposed statement
- Supporting and contradicting evidence IDs
- Confidence
- Expected evaluation benefit
- Risk of overgeneralization
- Recommended decision
- Required validation

## Privacy and Data Minimization

- Store synthesized observations, not raw transcripts.
- Remove provider and client names, direct identifiers, unnecessary locations, and protected health information.
- Use internal source links only when they aid verification and do not expose client-specific records.
- Do not use identity, age, grammar, accent, or tone as a proxy for competence or technology fluency.
- Do not create a persona from an unusual personal circumstance; represent it as a scenario or capacity overlay.

## Contradictions

- Preserve competing patterns when both are credible.
- Ask whether the difference is explained by practice stage, Headstart dependence, tool familiarity, scale, autonomy preference, or scenario.
- Prefer an overlay or configurable design response when evidence does not support a clean segment.
- Lower confidence or remove a trait when contradictory evidence accumulates without a useful boundary.

## Drift Review Triggers

Run Calibrate mode when any of the following occurs:

- A material Headstart workflow, tool, pricing, or service-ownership change.
- Repeated new provider questions that do not fit the current model.
- A new provider cohort, role, state, payer, or practice structure enters scope.
- Several evaluations produce nearly identical persona reactions.
- A persona repeatedly generates unsupported assumptions.
- A scheduled quarterly review or a meaningful batch of new evidence.

## Versioning

- Keep the current version and last-calibrated date at the top of personas.md.
- Increment the minor version for evidence-backed refinements or new overlays.
- Increment the major version for a changed foundational segmentation.
- Do not maintain a separate changelog; the approved proposal and evidence registry are the audit trail.

## Validation After Change

1. Re-read the affected persona and references for contradictions.
2. Run the skill validator.
3. Forward-test at least one familiar artifact and one unfamiliar scenario.
4. Confirm that reactions remain distinct, grounded, and actionable.
5. Confirm that evaluation mode does not mutate the evidence base.
