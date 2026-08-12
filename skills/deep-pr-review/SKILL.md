---
name: deep-pr-review
description: >
  Deep pull request review workflow for defensible, evidence-backed reviews. Use this skill
  when asked to review a GitHub PR, review the current diff, run a serious PR review, prepare
  PR review findings, or produce a structured review artifact with specialist passes,
  validation, performance/data-shape analysis, and final findings.
compatibility: Works with coding agents that can read repositories, inspect Git history, and access pull request metadata through an authenticated integration or CLI.
metadata:
  author: headstart-health
  version: '0.1.2'
---

# Deep PR Review

Use this skill to run a disciplined PR review for real engineering work. The goal is not to produce
the most comments. The goal is to find material issues, validate them, and explain them in a way a
reviewer can defend.

Default to a full review when the user invokes this skill without a mode. Only run a quick or
lightweight review when the user explicitly asks for one.

## Operating Principles

- Treat every agent finding as a hypothesis until it is checked against code, diff, tests, or docs.
- Prefer a small number of high-confidence findings over broad speculative feedback.
- Review the diff first, then pull in surrounding code only when needed to prove or disprove risk.
- Never modify source code during the review unless the user explicitly switches from review to fix.
- Never post to GitHub unless the user explicitly asks to post and approves the final body.
- Write an artifact by default for non-trivial reviews, then summarize validated findings in terminal.

## Organization-Specific Context

When reviewing Headstart Health repositories or `HEA-*` or `SAL-*` work, enter through the
`headstart-pr-review` workflow. That workflow must load and apply this complete skill as its primary
review method, then add Headstart-specific intent discovery, live-data validation, local runtime
checks, and side-effect safety. Routing through the composed workflow must not replace or reduce the
standards below.

## Scope Modes

Choose the review target from the user's request:

- `PR`: use the host's authenticated GitHub integration to read PR metadata, comments, review
  threads, and the patch. Use `gh pr view` and `gh pr diff` only when the native integration lacks
  the required capability.
- `current branch`: compare the current branch to its merge base with the default branch.
- `uncommitted`: review `git diff` and staged changes when the user asks to review local work.

If the target is ambiguous, infer the safest scope from the current branch and state the assumption
before running expensive commands.

For a PR number from inside a freshly cloned repo, autodetect the working state:

1. Check current branch, remotes, dirty state, and default branch.
2. Use the available GitHub integration to identify the PR base and head branch.
3. If already on the PR head branch, review the local checkout against the PR base.
4. If not on the PR head branch and the working tree is clean, fetch it to a local review branch.
   Use `gh pr checkout <number>` only when that is the available checkout mechanism.
5. If the working tree is dirty, do not switch branches. Review through the GitHub integration or
   ask before changing local state.
6. State the detected scope briefly: current branch, PR base/head, and whether the review is from local checkout or GitHub diff.

## First Pass: Map the Change

Build a short scope map before judging the code:

1. Identify base branch, head branch, title, author intent, changed files, additions/deletions, and CI status.
2. Classify changed surfaces: frontend, backend, database, API contract, auth, security/privacy, config, tests, CI, docs.
3. Detect repo shape: package manager, workspaces, TypeScript config, test runner, build system, ORM, migration setup.
4. Read the final version of changed files and only enough surrounding code to understand data flow.
5. Trace the data path end to end: source tables/APIs, backend shaping, network payload, frontend state, rendering, and user action.
6. Record the likely review risks before launching specialist passes.

For TypeScript workspaces, check `package.json`, workspace config, `tsconfig*`, build scripts, lint/test scripts,
and any Nx/Turbo/pnpm project graph or package boundary rules that exist. Do not assume monorepo tooling exists.

## Specialist Passes

Use isolated specialist workers or subagents when the active coding agent supports them and the PR
is broad, multi-surface, or important enough to justify parallel review. Keep prompts narrow and
evidence-based. Do not leak expected findings into the prompts. When isolated workers are unavailable,
run the same passes sequentially in the primary context.

Recommended passes:

- `scope-mapper`: summarize intent, changed surfaces, dependency graph impact, and files needing scrutiny.
- `blank-slate-adversary`: ignore the named checklist for one pass and ask what looks risky, surprising, overcomplicated,
  under-specified, or inconsistent with the PR's stated intent.
- `correctness-regression`: find logic bugs, stale state, race conditions, broken edge cases, and incorrect assumptions.
- `domain-semantics`: check whether labels, timestamps, scores, totals, lifecycle states, and recommendations mean what the UI/API says they mean.
  Compare derived metrics against existing schema fields, business terms, and user workflow.
- `api-data-contract`: check request/response contracts, schema expectations, validation, migrations, and Postgres/ORM behavior.
- `state-data-integrity`: check idempotency, uniqueness, duplicate submissions, lifecycle transitions, derived metrics, concurrency,
  schema constraints, migrations, indexes, and whether the database enforces assumptions the application relies on.
- `performance-data-shape`: check data volume, query shape, N+1 risks, pagination, payload size, duplicated in-memory work,
  and whether filtering, sorting, counting, grouping, or aggregation should move closer to SQL or an indexed service layer.
- `typescript-frontend`: check React state, rendering, async data flow, TypeScript types, accessibility-adjacent behavior, and UI failure states.
- `tests-ci`: check whether tests and CI cover the behavior claimed by the PR and whether build scripts actually validate it.
- `security-privacy`: use when auth, permissions, logging, patient/clinical data, secrets, uploads, external APIs, or admin surfaces are touched.
- `local-conventions`: check whether the PR follows established repo patterns for organization, naming, typing, syntax, error handling,
  component structure, data access, tests, and dependency boundaries.
- `maintainability`: check whether the implementation adds avoidable coupling, duplication, or workflow complexity.
- `workflow-product`: check whether the feature fits the operator workflow, exposes the right next actions, handles empty/error/loading states,
  and avoids automating or surfacing decisions that should remain human-reviewed.

For a small PR, run fewer passes directly in the main context.

For the default full review, cover at least: scope mapping, blank-slate adversary,
correctness/regression, domain semantics/invariants, API/data contract, state/data integrity,
performance/data shape, tests/CI, security/privacy when applicable, local conventions/fit,
maintainability, and deterministic verification.

## Review Lenses

Use these lenses as a checklist while validating candidate findings. Only report items with material impact.

### Bias Control

- Start with the PR's stated intent and changed behavior before applying the checklist.
- After checklist-based review, run one blank-slate pass: "If none of these review lenses existed, what would still worry me?"
- Look for surprising code, dead-simple bugs, copy/paste artifacts, missing negative paths, and behavior that contradicts the PR description.
- Include at least one "what I intentionally did not flag" note in the artifact when a tempting concern is speculative or merely stylistic.
- Treat the checklist as coverage guidance, not as a set of conclusions to confirm.

### State and Data Integrity

- Check whether write paths are idempotent where users can retry, double-click, navigate backward, refresh, or resubmit.
- Check for missing uniqueness constraints, duplicate rows, stale derived fields, and race conditions around create/update flows.
- Check whether derived metrics count the right unit: records vs. distinct users/items/questions/events.
- Verify that lifecycle states are explicit and enforceable, especially when UI labels drive operational decisions.
- Check whether a record is eligible for a derived status before assigning it. Incomplete, draft, pending, failed, or canceled records
  often need a separate state before scoring, ranking, or recommendation thresholds apply.
- Prefer database constraints or transactional service logic for invariants that matter across clients.
- When an ORM is present, check whether schema changes need explicit migrations rather than relying on auto-sync or implicit entity updates.

### Domain Semantics and Derived Metrics

- Compare field names and UI labels to their actual source. Do not let `submittedAt`, `completed`, `score`, `average`, `status`,
  `nextStep`, or similar names pass without confirming the underlying event or calculation matches the word.
- Check whether the code ignores existing domain fields that appear relevant, such as weights, points, priorities, statuses, completion timestamps,
  deletion/archive flags, tenant/account IDs, or ownership fields.
- When schema, entity, or DTO fields model scoring or weighting, verify derived scores, rankings, averages, recommendations, and thresholds
  use those semantics or clearly document why they intentionally do not.
- Check whether summary metrics are mathematically and operationally meaningful: weighted vs. unweighted scores, completed vs. in-progress records,
  global vs. filtered totals, distinct entities vs. raw rows, and rounded vs. exact values.
- Look for recommendations or automation labels that overstate certainty. If a human decision is required, the UI should preserve that uncertainty.

### Performance and Data Shape

- Check for unbounded reads, relation fan-out, accidental full-table scans, and loading entire object graphs to compute small summaries.
- Look for N+1 query patterns and the opposite problem: one large eager load that will degrade as data grows.
- Prefer database or service-layer aggregation for counts, averages, filtering, sorting, grouping, and pagination when result sets can grow.
- Check whether new query patterns need supporting indexes, but only after identifying the real access path, filter/order columns, and cardinality.
- Check whether the API returns more fields than the UI needs, especially personal, clinical, financial, or internal-only data.
- Check whether frontend filtering/search/sorting duplicates backend work or silently changes semantics compared with server-side totals.
- Ask whether summaries should be computed over all records or only visible/filtered records; mismatches can mislead operators.

### API Contract and Type Safety

- Check that new response shapes are typed narrowly on both sides, using literal unions/enums for statuses and explicit DTOs where appropriate.
- Check date, nullability, numeric rounding, and optional-field behavior across serialization boundaries.
- Verify that frontend assumptions match backend fallbacks, validation, and ordering.

### Operator Workflow and Access

- For dashboards, admin views, review queues, exports, and internal tools, check who can access the route and whether sensitive fields are exposed.
- Before recommending reuse of auth, authorization, admin routing, validation, logging, or data-access patterns, search the repo to confirm
  whether such patterns already exist. If they do not, frame the issue as a missing design boundary rather than failure to follow convention.
- Check loading, empty, error, retry, and partial-data states; internal tools still need recoverable failure behavior.
- Check whether automated recommendations are explainable enough for a human reviewer to trust or override.
- Prefer comments that connect code behavior to operator impact: missed case, misleading metric, extra manual work, privacy exposure, or unsafe automation.

### Local Conventions and Codebase Fit

- Before calling something inconsistent, inspect nearby files and recent patterns in the same package or layer.
- Check whether new code follows established folder placement, file naming, export style, DTO/type definitions, component decomposition,
  hook usage, service/repository boundaries, error handling, logging, and test style.
- Watch for obvious convention breaks even when behavior works: ad hoc helper names, duplicated utilities, inline types where shared types are standard,
  manually shaped responses where DTOs are normally used, or one-off UI patterns that bypass existing components.
- Distinguish consistency risk from personal preference. Report it when it creates maintainability cost, onboarding friction, duplicated behavior,
  contract drift, or makes future changes harder.
- Phrase these findings as codebase-fit issues, not style nitpicks: "This bypasses the repository's existing X pattern, so future Y changes will miss it."

## Deterministic Verification

For default full reviews, inspect available scripts and attempt deterministic verification when practical. Prefer checks that the
PR author, README, package scripts, CI config, or repo conventions already identify. Do not invent scripts.

- package install status: inspect lockfile and package manager before installing
- install: if dependencies are missing and install is necessary to validate the PR, install with the repo's package manager when allowed.
  Empty `node_modules` alone is not a reason to skip build/test/lint; it is the condition that usually means install is needed.
- compile/build/type check: `npm run build`, `npm run typecheck`, `pnpm type-check`, or repo-specific equivalent
- lint/format check: repo-specific lint or check script; avoid auto-fixing during review unless explicitly asked
- tests: targeted tests first, full tests when cheap enough
- runtime smoke: for UI/API changes, boot the app or hit new endpoints when setup is cheap and documented
- framework-specific affected checks when configured, such as Nx affected or Turbo task filters

If a check fails, distinguish PR regressions from local setup problems by checking install state,
comparing with the base branch when cheap, or inspecting whether missing dependencies/configuration explain the failure.
Do not report a local environment failure as a PR finding. If the repo lacks tests or CI, call that out as review context
rather than pretending coverage exists.

## Tests and Coverage

Inspect test coverage expectations before judging test gaps:

- Read package scripts, CI workflows, test configs, coverage thresholds, and nearby existing tests.
- Identify the repo's test style: unit, integration, e2e, component, API contract, snapshot, Playwright/Cypress, Jest/Vitest/RTL, etc.
- Check whether changed behavior has matching tests in the established pattern. If no pattern exists, say that directly and suggest the smallest
  reasonable test entry point.
- Run coverage only when the repo has a coverage script or threshold and it is practical. Do not make up a coverage percentage.
- When reporting missing tests, tie each proposed test to a specific bug or invariant the PR could break.

## Validation Ledger

Maintain a validation ledger in the artifact. Every candidate finding must have:

- source: specialist pass, deterministic check, or manual inspection
- evidence: exact file/line/function/test/log that proves the issue
- user impact: what breaks, leaks, slows down, or becomes harder to maintain
- confidence: high, medium, or question
- verdict: keep, drop, or convert to question

Drop findings that are only style preferences, speculative concerns, or requests to rewrite working code without material benefit.
Convert uncertain product or requirement issues into questions.
Do not silently lose validated issues. Classify each kept issue as a blocking/request-changes finding or a secondary verified finding.
Secondary findings should be real defects or maintainability risks that are worth mentioning after the main blockers, not generic cleanup.

## Artifact

For non-trivial reviews, write a local artifact, but do not create tracked files by accident. Before
choosing the path, inspect the target repo's ignore rules:

1. Read `.gitignore` and `.git/info/exclude` if present.
2. Prefer an existing ignored scratch directory such as `.agent/`, `tmp/`, `temp/`, `.tmp/`, or `.cache/`.
3. Confirm the chosen path is ignored with `git check-ignore <path>` when possible.
4. If no repo-local ignored scratch path exists, either use an external temp directory or ask before writing into the repo.
5. Do not edit `.gitignore` during a review unless the user explicitly asks.

Default artifact pattern when `.agent/` is already ignored:

```text
.agent/pr-reviews/YYYY-MM-DD-pr-<number-or-scope>.md
```

If the repo ignores `tmp/` or `temp/` instead, use the equivalent:

```text
tmp/pr-reviews/YYYY-MM-DD-pr-<number-or-scope>.md
```

Use this structure:

```markdown
# PR Review: <title or scope>

## PR Intent

## Changed Surface Area

## Review Plan

## Specialist Passes

### Scope Mapper

### Blank-Slate Adversary

### Correctness / Regression

### Domain Semantics / Invariants

### API / Data / Contract

### State / Data Integrity

### Performance / Data Shape

### TypeScript / Frontend

### Tests / CI

### Security / Privacy

### Workflow / Product

### Local Conventions / Fit

### Maintainability

### Deterministic Verification

### Tests / Coverage

## Tool Availability / Skips

## Validation Ledger

| Candidate Finding | Source | Evidence Checked | Verdict |

## Final Findings

### Blocking / Request-Changes Findings

### Secondary Verified Findings

## Open Questions

## Tests I Would Expect

## Merge Recommendation
```

Keep the artifact useful for manual review. It should show the reasoning trail without drowning the final answer.

## Final Review Format

When reporting to the user or preparing a PR comment, lead with findings ordered by severity:

```markdown
## Findings

### Blocking / Request-Changes

- [High] <clear issue>
  - Evidence: `<file>:<line>` and concise explanation.
  - Impact: what can fail for users/operators/systems.
  - Suggested fix: shortest practical fix, not a full implementation plan unless needed.

### Secondary Verified

- [Medium/Low] <real but non-blocking issue>
  - Evidence: `<file>:<line>` and concise explanation.
  - Impact: why it is worth addressing after the main blockers.

## Questions

- <requirement or product ambiguity that blocks a firm judgment>

## Tests / Validation

- <commands run and results>
- <important checks not run and why>

## Merge Recommendation

<Approve | Request changes | Comment only>, with one sentence of rationale.
```

If there are no material findings, say that clearly and name the remaining test gaps or residual risk.

## Posting GitHub Reviews And Comments

When the user explicitly approves posting a GitHub PR review or comment, preserve multiline
Markdown by passing real newline bytes to GitHub. Do not put escaped `\n` sequences inside
`gh --body` or `gh pr review --body`; normal shell quoting can send those characters literally,
and GitHub will render `/n` or `\n` text instead of line breaks.

Preferred pattern:

```bash
printf '%s\n\n%s\n' \
  'lgtm - checked x and y...' \
  'Also ran tests/build; all passed.' \
  | gh pr review <number> --approve --body-file -
```

For longer bodies, write the exact approved Markdown to a temporary file and use
`--body-file <path>`. Use the same rule for `gh pr comment`, `gh issue comment`, and review
submissions whenever the body has paragraphs, bullets, or code blocks.
