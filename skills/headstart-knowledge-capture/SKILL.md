---
name: headstart-knowledge-capture
description: Turn a verified Headstart learning, resolved confusion, recurring operational pattern, or completed investigation into a proposed durable knowledge update with evidence, destination choice, overlap checks, and maintenance ownership. Use when the user wants to preserve what was learned for teammates or future agents after the underlying conclusion has been validated.
compatibility: Requires access to the verified source evidence and the candidate canonical knowledge locations. Writes require explicit user approval.
metadata:
  author: headstart-health
  version: '0.1.0'
---

# Headstart Knowledge Capture

Preserve one verified learning in the smallest durable place that will help the next person or agent.
Do not turn every conversation, status update, or local workaround into permanent documentation.

## Capture Gate

Proceed only when the learning is supported by current evidence or clearly attributed as an approved
operational decision. If the conclusion is provisional, produce a verification task or open question
instead of durable guidance.

Default to a proposal. Do not edit shared documents, repository instructions, skills, issues, or
knowledge bases until the user approves the target and change.

## Capture Process

1. **State the learning.** Describe the problem or knowledge gap, the verified conclusion, when it
   applies, and what evidence established it.
2. **Separate durable from transient.** Remove personal details, one-time execution logs, temporary
   status, local paths, credentials, private raw content, and incidental conversation history.
3. **Choose the owner.** Read [references/destination-rules.md](references/destination-rules.md) and
   identify the one canonical destination that owns the learning.
4. **Search for overlap.** Inspect the likely destination and directly related artifacts. Prefer an
   update to an existing canonical item over a competing new page.
5. **Ground current claims.** Verify code behavior, system configuration, process ownership, dates,
   and merge or release state against their authoritative sources. Attribute anything that cannot be
   independently verified.
6. **Draft the update.** Include the context, guidance or solution, why it works, when to apply it,
   important limitations, evidence, owner, and review trigger. Keep the artifact proportional to the
   retrieval value of the learning.
7. **Propose link-only follow-ups.** Other systems may link to the canonical update, but should not
   receive copied prose that creates another source of truth.
8. **Apply only after approval.** Once the user approves the destination and scope, make the smallest
   coherent change, validate links and formatting, and report exactly what changed.

## Connector Roles

- Use Google Docs or Notion when the approved durable procedure or decision record belongs there.
- Use Linear for an implementation action, owner, or tracked follow-up rather than as a general
  knowledge archive.
- Use Gmail as dated evidence or communication context, not as the durable destination.
- Use repository documentation or `AGENTS.md` for behavior tied to that codebase. Use a shared skill
  only for a reusable procedure whose trigger, inputs, outputs, and safety contract are stable.

## Completion Standard

Return:

- the verified learning and supporting evidence;
- the recommended canonical destination and why it owns the information;
- overlap or contradiction findings;
- a proposed patch or replacement text;
- any link-only follow-ups; and
- the human approval needed before applying writes.

Never claim a learning has been preserved when only a proposal was produced. Never include PHI,
secrets, production rows, private file bytes, or unnecessary personal information in the durable
artifact.
