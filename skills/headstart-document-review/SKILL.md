---
name: headstart-document-review
description: Review a Headstart Google Doc, Notion page, Markdown file, plan, requirements document, procedure, or stakeholder handoff for correctness, completeness, contradictions, clarity, decision readiness, source grounding, and safety. Use when the user asks for a substantive document review, gap analysis, consistency check, or pre-share quality pass.
compatibility: Requires readable document content or an authorized document-read capability. Editing and comments require separate explicit user intent and an available write capability.
metadata:
  author: headstart-health
  version: '0.1.0'
---

# Headstart Document Review

Review the document as an operational artifact, not merely as prose. Optimize for findings that
change a decision, prevent confusion, or make the requested next action easier.

## Review Authority

- Default to report-only. Do not edit, comment, resolve comments, or change sharing settings unless
  the user explicitly requests that action.
- Use an authorized native connector for Google Docs or Notion when available. For local Markdown,
  inspect the file directly.
- Do not send document content to another model, external reviewer, or unrelated service without the
  user's explicit approval and confirmation that the destination is permitted for the content.
- Read only the sources needed to validate material claims. Do not broaden into a mailbox, drive, or
  workspace inventory without a defined scope.

## Review Process

1. **Establish the contract.** Identify the document's purpose, audience, requested action, owner,
   expected source of truth, and whether the user wants findings, proposed language, or approved edits.
2. **Inspect structure before detail.** Determine whether the document distinguishes context,
   current understanding, decisions, open questions, answer locations, and next steps.
3. **Select relevant lenses.** Read [references/review-lenses.md](references/review-lenses.md) and use
   only the lenses that can materially affect this document. Do not manufacture findings to fill
   every category.
4. **Ground the findings.** Cite a heading, paragraph, table row, comment, or source location. Verify
   time-sensitive or system-behavior claims against the current authoritative source when practical.
5. **Classify each finding.** Use `blocking`, `high`, `medium`, or `low`. Explain the evidence,
   impact, and narrowest useful recommendation.
6. **Separate correction from judgment.** Label objective contradictions or unsupported claims
   separately from product, policy, tone, or prioritization choices that need a human decision.
7. **Check the response path.** For stakeholder documents, make it unmistakable where and how the
   reader should answer. Avoid duplicating the same request across a summary table and question list
   unless one clearly links to the other.
8. **Return findings first.** Lead with material issues in priority order. State clearly when no
   material issue was found and identify any unverified source or residual risk.

## Applying Approved Changes

When the user explicitly asks for edits:

- preserve the document's useful structure, relationships, comments, and links;
- apply only the approved findings plus necessary consistency fixes;
- do not silently broaden scope into a rewrite;
- re-read the affected sections after editing; and
- report exactly what changed and any finding intentionally left unresolved.

For a shared document, prefer a native edit operation over copying content into a second file. When
Google Docs and Notion contain overlapping versions, establish which one is canonical before
editing either.

## Completion Standard

Return a concise review with source-grounded findings, open judgment calls, coverage limitations,
and an overall readiness assessment. A polished document is not necessarily a correct one; do not
approve unsupported operational or technical claims based on writing quality alone.
