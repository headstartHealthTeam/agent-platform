# Workflow Analysis Schema

## Source Coverage

List every source inspected and every referenced source that was unavailable. Include dates or
versions and the evidence quality of generated summaries versus original artifacts.

## Workflow Summary

- Business purpose
- Upstream business event
- Readiness signal or processing trigger
- Completion condition
- Primary actors and beneficiaries

## Step Map

| Step | Actor | System | Inputs | Action | Output | Human decision | Evidence |
| ---- | ----- | ------ | ------ | ------ | ------ | -------------- | -------- |

Use one row per operational transition. Do not hide several system changes inside one broad step.

## System And Artifact Inventory

For each item include:

- purpose in the workflow;
- record or document type;
- source-of-truth status;
- linking identifier;
- read or write behavior; and
- uncertainty or access limitation.

## Decision Inventory

| ID  | Decision | Who decides | Evidence used | Can be automated? | Escalation condition |
| --- | -------- | ----------- | ------------- | ----------------- | -------------------- |

Use `HD-##` for human decisions. Treat clinical, compliance, identity matching, signature, and
submission decisions as human-controlled unless a current policy explicitly says otherwise.

## Friction And Failure Modes

Capture time cost, duplicate entry, system latency, data-loss hazards, reconciliation errors,
ambiguous routing, notification risk, and recovery behavior. Avoid assigning frequency or severity
without evidence.

## Automation Boundary

Classify each candidate as:

- deterministic calculation or transformation;
- source retrieval or record linking;
- model-assisted extraction, classification, or drafting;
- reviewer decision support;
- external write requiring explicit authority; or
- unsupported until policy or system behavior is clarified.

## Open Questions

For each question include the current observed direction, the exact gap, likely answer owner, and the
workflow or architecture decision affected by the answer.

## Currency Check

List material differences between the dated walkthrough and current evidence. Do not rewrite history;
describe what changed and which source supports the current state.
