---
name: headstart-stacked-delivery
description: Continue approved Headstart delivery work safely while an earlier pull request awaits review by choosing independent parallel work or a dependent stacked branch, worktree, and pull request, then unstacking after the parent merges. Use when the next Linear issue may depend on an open PR, when an agent would otherwise wait for review before starting related work, or when maintaining and handing off an existing Headstart PR stack. Do not use for cross-repository coordination or dev-to-main production promotion.
compatibility: Requires Git worktree support, authenticated GitHub pull request access, Linear issue access, and the active repository's branch and validation instructions. Writes to GitHub or Linear require the user's authorization.
metadata:
  author: headstart-health
  version: '0.1.0'
---

# Headstart Stacked Delivery

Keep approved Headstart work moving while preserving one issue, branch, worktree, and review surface
per change. A review-ready pull request is a checkpoint, not an automatic instruction to wait.

This skill owns dependency classification, stack construction, maintenance, handoff, and unstacking.
The active repository instructions continue to own its worktree helper, branch naming, integration
branch, validation commands, and merge policy. Linear owns assignment, issue relationships, status,
and acceptance criteria. GitHub owns the current branch, pull request, checks, reviews, and merge
state.

## Authority And Inputs

Before implementation, confirm:

- the parent pull request, repository, base branch, published head branch, and exact head commit;
- the candidate child Linear issue, its assignment, requirements, and real dependency on the parent;
- whether the user has authorized implementation and any GitHub or Linear writes; and
- the applicable repository and workspace instructions.

Do not start an unassigned or merely adjacent Linear issue because it appears next in a project.
When the user's request authorizes continuing through an approved sequence, proceed through that
scope without stopping after each review-ready PR. Otherwise, identify the next viable issue and ask
for authorization before implementation.

## Choose Parallel Or Stacked Work

Use an **independent branch from the repository's integration baseline** when the next issue does not
need code from the open PR. Parallel work does not become stacked merely because both PRs are open.

Use a **stacked child branch from the published parent head** only when the child needs code that is
not yet available on the integration branch. The dependency must be technical and current, not just
the order in which Linear happens to list the issues.

Wait or ask for a decision when:

- parent review is likely to change the contract the child would build on;
- the parent branch is unpublished, ambiguous, or contains unrelated local work;
- issue scope, ownership, acceptance criteria, or migration order is unresolved;
- the child would require an unauthorized production read, write, deployment, or status change; or
- the chain has become difficult to review or maintain and should be shortened first.

PRs in different repositories cannot form a Git branch stack. Create coordinated branches from each
repository's own baseline and record their deployment dependency instead. A `dev`-to-`main`
production promotion is also not stacked feature work; use the repository's release process and the
`headstart-dev-to-main-pr` skill when explicitly requested.

## Create The Child

1. Refresh remote metadata and verify that the parent head commit still matches the reviewed input.
2. Follow the active repository's required worktree creation mechanism. Create a separate child
   worktree and branch from the exact published parent head; never continue child work in the parent
   worktree or a stable integration worktree.
3. Verify the new worktree's repository identity, common Git directory, branch, base commit, and
   cleanliness before editing. Never use a temporary clone to imitate a stack.
4. Implement only the child issue and run the repository's required validation against the combined
   parent-plus-child state.
5. Publish the child branch without rebasing or force-pushing a shared branch. Follow a stricter
   repository policy when present.
6. Open the child PR against the **parent branch**, not the integration branch, so review initially
   shows only the child delta.
7. Once the child implementation and required local validation are complete, mark the PR ready for
   review so automated and human review can run. An unmerged parent does not by itself justify
   keeping finished child work in draft.

The child PR description must make the stack reconstructable without local chat history:

```markdown
## Stack

- Depends on #<parent-pr> at `<parent-head-sha>`
- Review this PR against `<parent-branch>`
- Do not merge into the parent branch; retarget to `<integration-branch>` after the parent merges
- Linear: <child-issue-link>
```

Use a non-closing Linear reference while the PR targets the parent branch when the repository's
integration automation would otherwise apply completion semantics. After retargeting, apply the
repository's normal owning-implementation reference. Do not invent a Linear dependency relation;
record one only when it reflects the actual implementation order.

With authorization, add the child link to the parent PR and record the parent PR as a dependency on
the child Linear issue. Without write authorization, return the exact proposed updates. Never hide
the relationship only in a local note, worktree name, or agent transcript.

## Maintain The Stack

- Treat a new parent commit as a stack change. Inspect it before incorporating it into the child.
- Bring an updated parent branch into the child using the repository's allowed non-destructive Git
  strategy, then rerun all affected validation.
- Re-check the child diff against the current parent head after every update. The review surface
  must contain only child-owned changes.
- Address parent feedback in the parent PR and child feedback in the child PR. Do not fix the parent
  through the child branch.
- Keep each issue's Linear status independent. A parent entering review does not move the child, and
  a child being implemented does not reopen or complete the parent.
- Do not merge the child PR while its base is the parent branch. That would add child scope to the
  parent and defeat the independent review and rollout boundary.
- Do not enable auto-merge while the child targets the parent branch.

Keep stacks shallow when practical. If several open children depend on one another, report the
ordered chain, exact heads, review state, and expected unstack sequence before adding another level.

## Unstack After The Parent Merges

1. Verify in GitHub that the parent merged into the intended integration branch. Do not infer this
   from a closed PR, a local branch, or a Linear status.
2. Refresh the integration branch and bring it into the child using the repository's permitted
   strategy. Resolve conflicts according to child intent; do not silently discard either side.
3. Inspect the child PR's live base. GitHub may automatically change it to the parent's base when a
   merged parent branch is deleted; otherwise retarget it from the parent branch to the integration
   branch. Never infer the result from local Git state.
4. Verify that the retargeted diff contains only the child issue. Update the stack section to record
   that the parent has merged and the PR is now independently mergeable.
5. Replace the temporary non-closing Linear reference with the repository's normal implementation
   reference when appropriate.
6. Rerun complete required CI and automated review on the exact retargeted head. A previous approval
   or green run against the parent branch does not establish readiness against the integration
   branch.
7. Obtain any required human approval, address or explicitly disposition every review finding, and
   merge only through the repository's normal gate.

Changing a PR base can remove commits from its timeline and make review comments outdated. Refresh
the complete review state after the base change; do not treat an earlier resolved-thread count as
current evidence.

For Headstart application repositories, merging an implementation PR into `dev` normally leaves its
Linear issue `In Review`. Move it to `Ready For Release` only when the team explicitly selects it for
promotion, and treat it as `Done` only after the required production promotion reaches `main`.

## Persistent Handoff

At every pause, report:

- ordered parent and child PR links;
- each PR's base branch, head branch, and exact head commit;
- the current Linear issue and status for each layer;
- which validation and reviews apply to the current head;
- the next action and its owner; and
- whether the child is still stacked or has been retargeted and is independently mergeable.

The remote PRs and Linear items are the durable stack record. Local worktrees are execution
artifacts, not a workflow database. Never automatically remove a parent or child worktree; use the
active workspace's inspection and authorization process after the work is recoverable and no longer
needed.

For workstation setup that makes future agents invoke this procedure proactively, follow
[`references/persistent-routing.md`](references/persistent-routing.md). Installing the skill and
establishing its routing rule are separate actions.

## Completion Standard

Do not claim a child is ready merely because its local tests pass. State whether:

- independent versus stacked delivery was classified from evidence;
- the child has its own issue, worktree, branch, and PR;
- the child PR exposes only the child delta and records the parent dependency remotely;
- the parent and child heads used for validation are exact and current;
- the PR remains intentionally unmergeable into its parent or has been safely retargeted;
- exact-head CI and review requirements have completed after the latest stack change; and
- Linear status follows the current Headstart delivery lifecycle.
