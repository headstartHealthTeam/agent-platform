---
name: headstart-knowledge-refresh
description: Audit a bounded Headstart knowledge area for stale claims, contradictions, duplication, broken references, misplaced volatile state, and discoverability gaps, then propose evidence-backed keep, update, consolidate, replace, or retire actions. Use when maintaining shared guidance, procedures, project knowledge, repository instructions, or skill references over time.
compatibility: Requires read access to the scoped knowledge artifacts and the current sources needed to verify their claims. Writes require explicit user approval.
metadata:
  author: headstart-health
  version: '0.1.0'
---

# Headstart Knowledge Refresh

Evaluate a clearly bounded knowledge area against current evidence. Default to a maintenance report;
do not silently rewrite or delete shared knowledge.

## Scope And Authority

- Agree on the artifact set, topic, repository, project, or date boundary before a broad audit.
- Use the live system that owns a claim when checking volatile state. A document cannot prove its own
  currentness merely because it is internally consistent.
- Treat generated meeting notes and prior agent summaries as leads, not independent proof.
- Do not edit, move, archive, delete, resolve, or mark content stale without explicit user approval.

## Refresh Process

1. **Inventory the scope.** List the artifacts, owners, dates or versions, inbound references, and
   likely source-of-truth role of each item.
2. **Verify material claims.** Check current code, configuration, system state, approved procedures,
   issue state, or source documents as appropriate. Do not use absence of evidence as contradiction.
3. **Compare overlap.** Determine whether apparently similar artifacts answer the same retrieval
   question or serve distinct audiences and purposes.
4. **Classify each artifact.** Follow [references/maintenance-actions.md](references/maintenance-actions.md).
5. **Protect history.** Preserve dated decisions and prior-state explanations when they remain useful
   as history. Update current guidance without rewriting the evidence of what was previously true.
6. **Separate volatile state.** Recommend linking live Linear, GitHub, system, or project status
   rather than copying values that will drift.
7. **Assess discoverability.** Identify missing links, misleading titles, taxonomy gaps, and routing
   instructions that prevent agents or people from finding the canonical item.
8. **Return a proposed maintenance set.** Include evidence, confidence, exact action, affected links,
   and decisions requiring a human owner.
9. **Apply approved actions narrowly.** Re-read affected artifacts, repair references, and report every
   changed, consolidated, moved, or retired item.

## Connector Roles

- Use native document connectors for current Google Docs or Notion content when available.
- Use Linear and GitHub for current work and release state rather than trusting copied status text.
- Use Gmail only when a scoped communication is necessary to establish a decision or owner.
- Do not search an entire connected workspace to make a small refresh appear comprehensive.

## Completion Standard

Return the reviewed scope, evidence coverage, artifact-by-artifact classifications, proposed changes,
unverifiable claims, and approval gates. Report an artifact as `Keep` when it remains accurate and
useful; maintenance does not need to produce edits to be successful.

Never delete or replace content solely because its referenced implementation moved, the repository
cannot verify an operational claim, or a newer artifact exists. Verify that the underlying problem
and unique content are genuinely superseded.
