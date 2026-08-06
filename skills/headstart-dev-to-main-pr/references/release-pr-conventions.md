# Release PR Conventions

Use this reference when deciding how to structure a dev-to-main release PR.

## Recommended Shape

- Use `main` as the PR base and `dev` as the PR head.
- Generate the release inventory from the net tree diff: `git diff --name-status origin/main..origin/dev`.
- Map the current `main` versus `dev` file diff back to the merged PRs, branch names, and commits that introduced those hunks.
- Use patch-unique commits, `git log --cherry-pick --right-only origin/main...origin/dev`, as a diagnostic cross-check rather than the sole source of truth.
- Use raw `origin/main..origin/dev` ancestry only as diagnostic context; it may include already-released commits when `dev` has not absorbed the latest `main` release merge commits.
- Exclude commits marked patch-equivalent by `git cherry -v origin/main origin/dev` from Release Notes, Included Linear Issues, and Included PRs. Also exclude commits that `git cherry` marks as unique when a prior merged release PR already shipped them and their files are not in the net tree diff.
- List included Linear issue IDs with titles or short descriptions in the PR body so Linear can link the main-targeting PR and reviewers can understand each issue.
- Classify every included issue from the coordinated production dependency graph, not from repository membership alone.
- For a cross-repository issue, earlier promotions use `Refs <ISSUE-ID> - <remaining production dependency>` and exactly one final promotion uses `Fixes <ISSUE-ID> - <title>` after the other required repositories are on `main`.
- A release PR may contain both `Fixes` and `Refs` lines. Never leave an issue unclassified when opening or updating the PR.
- Keep the issue set exact: every issue must be supported by included implementation PR evidence, and every supported issue must be declared once.
- Keep the title short. Include at most a few high-signal issue IDs in the title; put the complete issue list in the body.
- Group large releases by PR labels or obvious change type: Features, Fixes, Ops, Internal.
- Keep release PRs free of code edits unless the user explicitly asks for release-only metadata changes.

## Source Rationale

- GitHub Compare treats the base as the starting point and compare/head as the endpoint, but raw ancestry can be noisy when `main` received equivalent patches through prior release PRs.
- Patch-equivalent filtering keeps the release PR focused on what would actually change if `dev` is merged to `main`.
- GitHub generated release notes are based on merged pull requests and contributors, and can be customized with labels. Mirror that model in release PR bodies by listing included PRs and grouping by labels when useful.
- Linear GitHub automation supports branch-specific target branch rules. The release PR must target `main` and must visibly reference Linear issues for automation and traceability.
- Closing references encode lifecycle state. They must reflect the release set's actual completion order rather than being generated unconditionally.
