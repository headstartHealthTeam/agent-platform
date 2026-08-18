# Provider Experience Evaluation Rubric

Use this rubric to walk through the actual states and transitions of the artifact. Score only when comparison would help; narrative findings are acceptable for small artifacts.

## Evaluation Dimensions

Score each dimension from 0 to 3:

- 0 — Fails: blocks the persona, creates a materially false belief, or requires outside rescue.
- 1 — Weak: the persona may proceed but with confusion, repeated questions, or avoidable risk.
- 2 — Adequate: understandable and usable, with limited friction.
- 3 — Strong: anticipates the persona's context and supports confident action.

Dimensions:

1. Purpose comprehension: Does the persona know what this page or state is for?
2. State comprehension: Can they distinguish completed, current, blocked, upcoming, and optional work?
3. Next-action clarity: Is the next action explicit, feasible, and appropriately prioritized?
4. Ownership and timing: Is the responsible party, expected timing, and escalation threshold clear?
5. Status trust: Is the status specific, current, source-aware, and consistent with connected systems?
6. Financial and capacity implications: Can the persona understand effects on revenue, authorized hours, staffing, or workload when relevant?
7. Autonomy and reversibility: Are meaningful choices, opt-outs, edits, pauses, and recovery paths available?
8. Scale and delegation: Does the experience work across multiple clients, staff roles, assignees, and simultaneous deadlines?
9. Tool and channel continuity: Do portal, email, SMS, chat, Aloha, HiRasmus, payroll, and other touchpoints agree and deep-link appropriately?
10. Exception handling: Can the persona recover from mixed ownership, denials, no-shows, staffing changes, wrong data, and poor fit?
11. Notification fit: Does the urgency and channel fit how frequently this persona checks the portal?
12. Cognitive and time burden: Can the task be completed in the likely usage context without unnecessary memory or rework?

## Persona Walkthrough Questions

For each selected persona, answer:

1. What does this person think is happening?
2. What do they notice first, and what important information might they miss?
3. What do they believe has already been completed?
4. What do they believe they must do next?
5. Who do they think owns the next step?
6. What question are they most likely to ask Headstart?
7. What creates or reduces trust?
8. What action are they likely to take, delay, repeat, or abandon?
9. What is the resulting provider, client, revenue, compliance, or operational risk?
10. What smallest design change would materially improve the outcome?

## Interactive Artifact Coverage

For Figma Make or another interactive prototype:

- Exercise each primary call to action.
- Exercise mixed-action combinations and transitions between responsible parties.
- Test accept, decline, defer, reschedule, edit, cancel, undo, and back paths when present.
- Test empty, loading, disabled, error, stale, completed, and reopened states when available.
- Verify whether status changes persist after navigation.
- Inspect notification entry points and deep-link return behavior.
- Check multi-client and multi-staff behavior when represented.
- Record states that cannot be reached rather than inferring them.

## Severity

- Critical: likely blocks admission or service delivery, creates compliance or material financial exposure, or causes an irreversible wrong action.
- High: likely creates escalation, loss of trust, staffing or scheduling failure, or a significant intake delay.
- Medium: creates repeated questions, inefficient work, avoidable cognitive load, or recoverable confusion.
- Low: minor friction or presentation issue with limited behavioral consequence.

## Quality Checks

Before finalizing:

- Confirm that persona findings are meaningfully distinct.
- Separate universal issues from persona-specific issues.
- Identify conflicts rather than forcing a single optimum.
- Label observations, evidence-backed inferences, and open hypotheses.
- Avoid inventing personal circumstances not supplied by the scenario.
- Prioritize recommendations by consequence, not by the number of personas affected.
