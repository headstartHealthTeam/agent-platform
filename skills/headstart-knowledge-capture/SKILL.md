---
name: headstart-knowledge-capture
description: Turn a verified Headstart learning, resolved confusion, recurring operational pattern, completed investigation, or repeated agent correction into a proposed durable update with evidence, destination choice, overlap checks, and maintenance ownership. Use when the user wants future people or agents to repeat or avoid a behavior, asks to update agent instructions so something happens or does not happen again, or wants to preserve a validated learning without putting it in the wrong system.
compatibility: Requires access to the verified source evidence and the candidate canonical knowledge locations. Writes require explicit user approval.
metadata:
  author: headstart-health
  version: '0.2.0'
  headstart-requires: 'headstart-knowledge-refresh'
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
4. **Audit the applicable guidance.** For an agent-instruction or recurring-behavior change, invoke
   `headstart-knowledge-refresh` over the applicable instruction hierarchy and directly related
   enforcement or reference artifacts. It owns contradiction, duplication, precedence, drift, and
   context-budget analysis. If that dependency is unavailable, perform the same bounded read-only
   audit explicitly and disclose the limitation.
5. **Search for overlap.** Inspect the likely destination and directly related artifacts. Prefer an
   update to an existing canonical item over a competing new page.
6. **Ground current claims.** Verify code behavior, system configuration, process ownership, dates,
   and merge or release state against their authoritative sources. Attribute anything that cannot be
   independently verified.
7. **Draft the update.** Include the context, guidance or solution, why it works, when to apply it,
   important limitations, evidence, owner, and review trigger. Keep the artifact proportional to the
   retrieval value of the learning.
8. **Propose link-only follow-ups.** Other systems may link to the canonical update, but should not
   receive copied prose that creates another source of truth.
9. **Apply only after approval.** Once the user approves the destination and scope, make the smallest
   coherent change, validate links and formatting, and report exactly what changed. For instruction
   changes, rerun the bounded hierarchy audit after editing.

## Recurring Agent Behavior

Treat “make sure agents do this” or “do not let this happen again” as a desired outcome, not an
automatic request to append prose to the nearest instruction file.

- Inspect the actual agent hosts, instruction files, inheritance or import model, repository
  boundaries, and enforcement mechanisms in scope. Do not assume one filename, directory layout,
  knowledge tool, issue tracker, source host, or operating system.
- Identify the failure mode before choosing a remedy. Prefer code, schemas, configuration, tests,
  linting, hooks, or CI when the behavior can be enforced reliably.
- When prose is appropriate, choose the narrowest layer that reaches every intended task and no
  unrelated task. Keep always-loaded guidance concise and route detailed procedures to references
  or skills.
- Distinguish user-local preferences from shared team policy. Never commit personal paths, local
  credentials, workstation state, or assumptions about one person's information architecture.
- Maintain one canonical instruction. Use thin host compatibility bridges or links rather than
  independent copies that can drift.
- A stronger nested rule may intentionally narrow a parent rule. Reconcile genuine contradictions;
  do not flatten legitimate scope differences merely to make wording identical.

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
- applicable instruction or knowledge hierarchy, when relevant;
- overlap, precedence, contradiction, and enforcement findings;
- a proposed patch or replacement text;
- any link-only follow-ups; and
- the human approval needed before applying writes.

Never claim a learning has been preserved when only a proposal was produced. Never include PHI,
secrets, production rows, private file bytes, or unnecessary personal information in the durable
artifact.
