# Persistent Routing For Stacked Delivery

## Purpose

Installing a skill makes the procedure available, but it does not guarantee that a future agent
will proactively select it after opening an unrelated implementation PR. Add one concise routing
rule to the narrowest durable instruction layer that reaches every intended Headstart working
location. Keep the full procedure in the installed skill.

Keep this setup self-contained within the Agent Platform installation and the user-approved Headstart
instruction hierarchy. Do not initialize unrelated repositories, workspace systems, or knowledge
stores.

## Choose The Instruction Scope

1. Inspect the host's actual instruction hierarchy and the user's normal agent launch locations.
2. Prefer a shared Headstart workspace instruction file when every relevant repository, clone, and
   worktree is demonstrably within its discovery scope.
3. Use an existing user-level **Headstart-scoped** instruction section when repositories or launch
   locations do not share a reliable parent. Keep the rule explicitly limited to verified Headstart
   repository work.
4. For another supported agent host, use a thin import or routing adapter to the same canonical
   instruction when available. Never maintain independent copies of the full workflow.
5. Treat every separate clone and sibling worktree as a discovery location to verify. A bridge in
   one checkout does not prove that another checkout can see it.

Do not overwrite repository-owned instructions, widen a personal rule into team policy, or edit a
standing instruction file without the user's approval.

## Minimal Routing Rule

Add this block, adapting only the name of the integration branch when repository policy requires a
different term:

```markdown
## Headstart Parallel Delivery

For Headstart work, a review-ready PR is not automatically a stopping point. Before waiting, inspect
the next assigned or approved Linear issue. Before classifying it or selecting a branch or worktree,
confirm the user has authorized implementation and any GitHub or Linear writes; otherwise ask and
stop. Once authorized, use a separate branch and worktree from the integration baseline when the
issue is independent. If it needs code from the open PR, load the installed
`headstart-stacked-delivery` skill and follow its separate stacked worktree, branch, PR, handoff, and
unstacking workflow. Never merge a child into its parent branch. Keep application issues `In Review`
after merge to `dev`; `Ready For Release` is a deliberate team decision and `Done` requires the final
promotion to `main`.
```

Do not paste the rest of the skill into the standing instruction file. The routing block is the
always-loaded trigger; the installed skill is the canonical detailed procedure.

## Verify The Setup

After the user approves the routing update:

1. Confirm the skill is installed for every agent host the user intends to use.
2. Start fresh sessions from representative Headstart repository and worktree locations, not only
   from the directory containing the routing rule.
3. Ask what should happen after a review-ready PR when the next assigned issue depends on its open
   branch. The agent should identify `headstart-stacked-delivery`, a separate worktree and branch,
   the child-to-parent PR base, and the later retarget to the integration branch.
4. Test a near miss: an unrelated issue should use an independent integration-based branch, and a
   production promotion should route to the release process instead of this skill.
5. Report the instruction layer used, locations tested, installed host skill directories, failures,
   and remaining setup. Do not claim complete coverage from one successful session.

Use `headstart-skills-update` to install or refresh the complete Agent Platform skill set. Offer its
opt-in daily refresh separately so new and revised team skills remain current; do not enable a
recurring update without explicit approval.
