# Repository Instruction Design

An excellent repository guide changes a fresh agent's decisions without burying its task in
context. The [main skill](../SKILL.md) owns setup scope. Use the
[authoring outline](../assets/repository-guide-outline.md) as a checklist, not text to paste
unchanged. Do not leave prompts or placeholder sections in the delivered guide.

## Inspect Before Writing

Read the applicable parent instructions, existing `AGENTS.md`, `CLAUDE.md`, relevant host rules,
README, manifests, executable checks, and actual code boundaries. Determine which file owns each
rule. A stronger scoped rule can be intentional; conflicting duplicates need reconciliation.
Never replace existing domain knowledge merely because it does not match the example outline.

Separate three layers:

- Always-needed, non-obvious operating rules belong in the short repository guide.
- Detailed architecture, procedures, and task-specific references belong in linked documentation.
- Enforceable type, formatting, dependency, and test invariants belong in configuration and checks.

The guide explains how to find and use the checks; it is not a second handwritten copy of every lint
rule, compiler flag, package version, or runtime schema. Instructions cannot replace permissions,
branch protection, idempotency, or data validation.

## Write The Useful Minimum

Aim for about 100-150 lines or fewer, not a minimum quota or inflexible cutoff. Include only sections
the project needs. A small CLI should have a small guide. Prefer these contents:

1. Purpose and non-goals, especially where this repo's authority ends and another system begins.
2. A short routing map to the relevant modules, architecture, contracts, and operational runbooks.
   Explain non-obvious ownership, not every directory agents can list themselves.
3. Verified installation, startup, focused testing, and full QA commands. Distinguish offline tests
   from live integration checks and identify prerequisites by name, never credential value.
4. Project-specific invariants and approved patterns, with links to real examples where useful.
5. Definition of completion: meaningful regressions, appropriate integration/UI verification,
   maintained docs, and truthful reporting of anything not exercised.
6. Change boundaries: preserve existing work; follow the actual worktree/branch conventions; never
   bypass hooks, disguise failures, weaken checks, or publish/deploy without the required authority.
7. Where new decisions and recurring lessons belong and when the guide itself needs updating.

Write concise instructions with concrete reasons or consequences when they prevent a likely error.
Avoid generic tutorials, speculative pitfalls, mandatory multi-agent orchestration, universal design
patterns, slogans, daily logs, stale ticket status, and claims that checks guarantee bug-free code.

Where a runtime reads or writes external systems, link its exact operational contract: target
configuration, scoped access, stable input/output identifiers, repeat-run semantics, dry-run
behavior, meaningful failures, redacted observability, and recovery. A teammate must not need the
creator's machine, chat history, or an undocumented alias to operate it. Do not hard-code private
account identifiers or access tokens into guidance.

## One Canonical Guide Across Hosts

Use `AGENTS.md` as the canonical repository file. Codex and Cursor can consume it directly. For
Claude Code, a minimal root `CLAUDE.md` can import it with `@AGENTS.md` on its own line, outside a
code fence. If a bridge already contains useful host-specific rules, preserve them and remove only
confirmed duplication through the approved edit.

Ordinary Markdown links point to optional detail. Claude `@` imports load their content; importing
an entire docs tree is not progressive disclosure. Keep the compatibility import limited to the
small canonical guide. Check each intended host's current loading behavior instead of assuming all
hosts have identical nested-rule precedence. Add a scoped host bridge only when needed, with no
independent copy of the shared policy.

Nested guides are useful for genuinely different package rules, not every folder. Verify that they
refine rather than contradict parent instructions. Do not commit a particular workstation's skill
installation paths, workspace helpers, personal writing preferences, or vault topology. Refer to
the active workspace's conventions and the team's accessible canonical sources.

Installed skills are discoverable capabilities, not a guarantee of automatic activation. Put a
short routing instruction where contributors actually start when a specific shared skill is
important. Name its trigger and fallback; do not load all team skills on every task. A repo must
still describe essential verification even when its user's optional skills are not installed.

## Validate The Guide As A Working Interface

- Resolve local links and anchors, and confirm every named command exists and works in the stated
  context. A command copied from another repository is not evidence.
- Check a representative nested directory and each declared host entry point for contradictions.
- Give a fresh agent the repo and a small synthetic task, without the author's transcript. Observe
  whether it finds the right module, preserves boundaries, runs appropriate checks, and reports
  unverified steps accurately. Check its filesystem diff and actual command results.
- Exercise negative cases: a missing optional skill, unavailable live credentials, a failing hook,
  and an existing conflicting instruction. It must not invent access, weaken gates, or overwrite
  unrelated instructions.
- Record which hosts were actually exercised; static bridge validation is not a Claude/Cursor
  behavior trial. Repeat representative model trials when changing activation or workflow wording.

Keep this audit bounded. Review or incident feedback should lead to the smallest correct change:
fix code/configuration when enforceable, otherwise update the owning guide or reference. Do not
automatically append every observation to an always-loaded instruction file.
