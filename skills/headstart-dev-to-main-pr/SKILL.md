---
name: headstart-dev-to-main-pr
description: Create Headstart dev-to-main release pull requests that summarize all commits and PRs already merged into dev but not yet in main. Use only when the user explicitly asks for a release PR, production promotion, or a reviewable inventory of what would ship from dev to main.
compatibility: Requires Git, Python 3.10 or newer for the bundled collector, and authenticated GitHub access for metadata enrichment or pull request writes.
metadata:
  author: headstart-health
  version: '0.1.0'
---

You are a release PR specialist. Package the current `dev` branch into a reviewable PR targeting `main`, with traceability to the PRs, commits, and Linear issues that explain the actual files changing in the release PR.

This is an explicit-only, consequential workflow. Do not prepare, create, update, merge, or close a
production promotion PR unless the user has explicitly requested that action. Preparing a read-only
inventory does not authorize a GitHub write.

## Principles

- Treat `dev` as integration/testing and `main` as production/live.
- Open the release PR directly from `dev` into `main`; do not create a release branch.
- Target `main` as the PR base and `dev` as the PR head.
- Do not move Linear issues manually. Linear automation should move linked issues to `In Review` when the main-targeting PR opens, and `Done` when it merges. Do not use `Ready For Release` for the PR-open rule while that status is in Linear's completed group, because completed-to-completed transitions can stall before `Done`.
- Include the exact Linear issue set from the implementation PRs represented by the release delta. Do not add or omit issues merely to fit a proposed release packet.
- Classify every included issue explicitly. Use `Fixes HEA-123 - Issue title` only when this production promotion completes that issue. Use `Refs HEA-123 - reason the issue remains open` when another repository or production step is still required.
- For work spanning repositories, use explained `Refs` in earlier production promotions and exactly one `Fixes` in the final promotion after all other required repositories are on `main`.
- Never let the collector guess completion semantics. Unclassified issues must remain visibly non-closing until the release owner confirms the coordinated merge order.
- Do not create repo folders, clones, or linked worktrees unless the user explicitly approves.
- Do not create an agent-namespaced release branch unless the user explicitly asks; the normal
  promotion is directly from `dev` to `main`.
- Use the active agent's authenticated GitHub integration for pull request reads and writes when it
  provides the required capability. The bundled collector may use `gh` for deterministic metadata
  enrichment; use direct `gh` commands as a fallback when the native integration cannot perform an
  operation.

## Release Evidence

Before creating or updating the PR, inspect the release delta:

```bash
git fetch origin main dev
git status --short --branch
git diff --name-status origin/main..origin/dev
git diff --stat origin/main..origin/dev
git log --first-parent --reverse --format="%h %s" origin/main..origin/dev
git log --first-parent --cherry-pick --right-only --format="%h %s" origin/main...origin/dev
git cherry -v origin/main origin/dev
git log --reverse --format="%H%x09%s%x09%b%x1e" origin/main..origin/dev
```

Also inspect the actual GitHub PR comparison through the available authenticated GitHub capability,
because this is what reviewers will see. The following CLI commands are the deterministic fallback:

```bash
gh pr list --state open --base main --head dev --json number,title,url,headRefName,baseRefName,isDraft
gh pr diff <release-pr-number> --name-only
gh pr view <release-pr-number> --json number,title,url,baseRefName,headRefName,files,commits
```

If no release PR exists yet, create a minimal draft body from the `git diff origin/main..origin/dev` changed file list, then immediately inspect `gh pr diff` / `gh pr view` and edit the title/body to match the actual net scope. Do not rely on branch ancestry alone.

Use `scripts/collect_release_notes.py` for a first-pass inventory only:

```bash
python3 <skill-dir>/scripts/collect_release_notes.py --base origin/main --head origin/dev --output release-pr-draft.md
```

On Windows, use `py -3 <skill-dir>\scripts\collect_release_notes.py ...`.

When Linear issue titles are known, pass them explicitly so the `Included Linear Issues`
section is not just a list of opaque IDs:

```bash
python3 <skill-dir>/scripts/collect_release_notes.py --base origin/main --head origin/dev --linear-title "HEA-123=Issue title" --output release-pr-draft.md
```

For several issues, either repeat `--linear-title` or write a JSON object and pass
`--linear-title-file linear-titles.json`.

Classify each discovered issue before using the draft to create or update a PR:

```bash
python3 <skill-dir>/scripts/collect_release_notes.py \
  --base origin/main \
  --head origin/dev \
  --linear-reference "HEA-123=refs:website production promotion remains" \
  --linear-reference "HEA-124=fixes" \
  --output release-pr-draft.md
```

Use `fixes` only when that PR is the issue's final production dependency. `refs` requires a concise reason. The script rejects classifications for issue IDs that are not supported by the current release evidence.

When the actual PR diff shows only one or a small number of release items, pass the contributing PR explicitly:

```bash
python3 <skill-dir>/scripts/collect_release_notes.py --base origin/main --head origin/dev --include-pr 123 --output release-pr-draft.md
```

The script:

- Reads raw commits in `base..head`.
- Stops without writing a draft when the net tree diff `base..head` is empty.
- Maps net changed files back to patch-unique commits and PR numbers.
- Lists files under each included PR when attribution is available.
- Lists changed files under `Unattributed Files` when no included PR can explain them.
- Filters release content to patch-unique commits from `git log --cherry-pick --right-only base...head`.
- Excludes patch-equivalent commits that are already represented on `main`, even when raw ancestry still lists them.
- Parses PR numbers from squash/merge commit subjects such as `(#123)`.
- Uses GitHub commit-to-PR lookup as a fallback when commit subjects do not include PR numbers.
- Uses `gh pr view` to enrich PR titles, URLs, bodies, merge commits, labels, and authors when available.
- Extracts Linear IDs matching `[A-Z]{2,}-\d+` only from patch-unique commit messages, PR titles, PR bodies, and branch names.
- Writes a Markdown release PR draft with Summary, Included PRs, Linear Issues, Commit Inventory, Risk, and Testing sections.
- Writes explicit `Fixes` and explained `Refs` lines from repeatable `--linear-reference` arguments.
- Leaves discovered but unclassified issues as non-magic checklist lines so a first-pass inventory cannot accidentally complete Linear work.
- Writes `No Linear issue` when the release evidence contains no Linear identifier.
- Adds an `Already Released / Ancestry Note` when raw ancestry includes patch-equivalent commits that were excluded.
- If `--include-pr` is supplied, limits Included PRs, Linear IDs, Release Notes, and Commit Inventory to those explicitly selected PRs.
- If `--debug-json <path>` is supplied, writes machine-readable changed files, included PRs, unattributed files, commit inventory, and patch-equivalent commits. Use this for dry-run validation before creating or editing a release PR.
- If `--no-gh-commit-pr-lookup` is supplied, skips GitHub commit-to-PR fallback for deterministic offline tests.

If the script cannot use `gh`, continue with git-derived evidence and state that PR metadata enrichment was partial.

To validate script changes without touching GitHub PRs, run the bundled self-test:

```bash
python3 <skill-dir>/scripts/test_collect_release_notes.py
```

## Workflow

### 1. Confirm Release Delta

- Fetch `origin/main` and `origin/dev`.
- Verify the net tree diff with `git diff --name-status origin/main..origin/dev`. This is the source of truth for what will actually change when `dev` is merged to `main`.
- If the net tree diff is empty, stop and report that there is nothing new to release, even when raw `origin/main..origin/dev` ancestry or the GitHub PR compare is non-empty.
- Review the generated draft and compare it against:
  - `git diff --name-status origin/main..origin/dev`
  - `git diff --stat origin/main..origin/dev`
  - `gh pr diff <release-pr-number> --name-only`
  - `gh pr view <release-pr-number> --json files,commits`
  - `git log --first-parent origin/main..origin/dev`
  - `git log --first-parent --cherry-pick --right-only origin/main...origin/dev`
  - `git cherry -v origin/main origin/dev`
  - `gh pr list --state merged --base dev --limit 100 --json number,title,url,mergedAt,headRefName,mergeCommit`
- Treat the net `origin/main` to `origin/dev` tree diff, plus the PRs/commits that explain those changed files, as the release truth.
- Start from the current `main` versus `dev` file diff, then map those changed files back to merged PRs, branch names, and commits. Do not start from a preselected HEA list and force the release body to match it.
- Use raw `origin/main..origin/dev`, `git log --cherry-pick --right-only origin/main...origin/dev`, `git cherry -v`, and GitHub's PR file list as diagnostic context. Any of these can include commits or files already shipped through a prior `dev -> main` release merge.
- Do not include PRs, Linear issues, or release notes only because they appear in ancestry. Include them only when they explain files that are currently changing in the `dev` to `main` PR.
- If a user supplies a candidate HEA list, verify each issue against the current `main` versus `dev` diff and the merged PR/branch evidence. Exclude issues whose patch is already live on `main` or whose commits are patch-equivalent (`git cherry -v` shows `-`).
- If a prior release PR for an HEA is already merged to `main`, do not include that HEA again unless the current net tree diff contains new follow-up files/hunks for that same issue.
- Identify any unmatched changed files or unmatched commits that still affect the PR diff and keep them in the PR body under `Unmatched commits`.
- If `git cherry -v origin/main origin/dev` marks a raw commit with `-`, exclude it from Release Notes, Included Linear Issues, and Included PRs. If `git cherry` marks a commit with `+` but the issue already has a merged release PR and its files are not in the net tree diff, also exclude it. Keep noisy commits only in `Already Released / Ancestry Note` if that helps explain a noisy GitHub compare.

### 2. Coordinate Linear Completion Semantics

- For each included Linear issue, identify every repository and production action required for completion.
- Decide the release order before assigning closing references.
- Use `Refs <ISSUE-ID> - <remaining production dependency>` in every earlier promotion for an issue that spans repositories.
- Use `Fixes <ISSUE-ID> - <issue title>` in exactly one final promotion after all other required repositories are on `main`.
- A single-repository issue may use `Fixes` in that repository's promotion when no later production dependency remains.
- Mixed classifications are expected: one promotion PR may close some issues while referencing others.
- Follow the target repository's current `AGENTS.md` and promotion validator when they are stricter than this skill.
- Do not create or update a PR while the generated body contains `classification required` markers.

### 3. Confirm No Existing Release PR

- Check for an existing open `dev` to `main` PR before creating a new one:

```bash
gh pr list --state open --base main --head dev --json number,title,url,headRefName,baseRefName,isDraft
```

- If an open `dev` to `main` PR already exists, update that PR title/body instead of creating another PR.
- Do not create a release branch, local branch, clone, repo folder, or linked worktree for this workflow.
- Do not commit unless the user explicitly asks for release-only metadata changes.
- When updating an existing release PR, rewrite the title/body from the current PR diff. Remove stale PRs, Linear IDs, and release notes that were already shipped to `main` or no longer explain the current diff.

### 4. Prepare PR Title and Body

Use a concise title:

```text
Release: promote dev to main - YYYY-MM-DD
```

If there are one to three high-signal Linear issue IDs, append them to the title. This is required, not optional:

```text
Release: promote dev to main - YYYY-MM-DD (HEA-123, HEA-124)
```

If there is exactly one high-signal issue, still append it:

```text
Release: promote dev to main - YYYY-MM-DD (HEA-123)
```

Do not make an unreadable title with many issue IDs. When there are more than three issues, omit issue IDs from the title and put the full issue list in the body.

The PR body must include:

```markdown
## Summary

Promotes tested changes from `dev` to `main`.

## Release Notes

- User-facing or operationally meaningful change
- Another included change

## Included Linear Issues

Refs HEA-123 - Website production promotion remains
Fixes HEA-124 - Issue title or short description

## Included PRs

- #123 Title - HEA-123 - URL

## Commit Inventory

- `abc1234` commit subject

## Risk / Review Focus

- Areas reviewers should inspect

## Testing

- Tested on `dev`
- CI pending on this PR
```

Do not default every issue to `Fixes`. The release evidence determines which issues are included; the coordinated production dependency graph determines whether each line is `Fixes` or `Refs`.

If Linear does not display a magic-word link as expected, verify the syntax and integration-backed resource rather than adding a conflicting second classification. A supplemental plain linked list may be used for readability:

```markdown
- HEA-123 - Issue title
```

### 5. Open or Update the PR

Use the active agent's native GitHub integration when it supports PR creation or editing. Otherwise,
use the CLI fallback:

```bash
gh pr create --base main --head dev --title "Release: promote dev to main - YYYY-MM-DD" --body-file release-pr-draft.md
```

If an open `dev` to `main` PR already exists:

```bash
gh pr edit <pr-number> --title "Release: promote dev to main - YYYY-MM-DD" --body-file release-pr-draft.md
```

After creation:

- Verify with `gh pr view --json number,title,url,baseRefName,headRefName,isDraft,body`.
- Confirm the base is `main` and the head is `dev`.
- Confirm every included Linear issue has exactly one `Fixes` or explained `Refs` line and no classification placeholders remain.
- Confirm a cross-repository issue has exactly one final production PR using `Fixes` across the coordinated release set.
- Leave Linear status changes to the configured automation.

## Recommendations

- Keep owning implementation PRs into `dev` integration-linked to Linear according to the repository policy. Production promotion PRs must repeat the exact included issue set because implementation links are not carried forward automatically.
- Treat `Fixes` as a completion decision, not a synonym for "included in this repository." Use explained `Refs` while production dependencies remain.
- Prefer squash commit titles that retain the Linear issue ID, because release PR evidence often comes from commit and PR titles.
- Keep release PRs boring: direct `dev` to `main`, no extra branches, no extra code edits, no unrelated cleanup.
- Use PR labels or headings to group release notes when the release is large: Features, Fixes, Ops, Internal.
- Preserve traceability. A release PR should link PRs, Linear IDs, and commits so reviewers can answer "what ships if we merge this?"
