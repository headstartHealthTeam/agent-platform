---
name: headstart-workspace-setup
description: Set up, inspect or upgrade a local Headstart workspace with repository hubs, isolated worktree helpers, agent instruction routing and searchable Markdown knowledge. Use for workstation onboarding, a company setup workshop, or reviewing an existing workspace against the shared layout. Do not activate for ordinary feature implementation, application startup, or a request only to refresh installed skills.
compatibility: Requires local filesystem access, Git, Node.js 22 or newer, the repository-pinned pnpm and a reviewed Agent Platform source checkout. Repository provisioning needs the operator's existing Git access. Automatic routing supports Codex and Claude Code; other hosts can consume the portable guides directly.
metadata:
  author: headstart-health
  version: '0.2.0'
  headstart-requires: headstart-skills-update
---

# Headstart Workspace Setup

Help a teammate create and understand the shared workspace. Deterministic commands own filesystem,
Git, installation and upgrade checks; the agent handles scope, explanation and conflict review.

## Establish Scope

Read existing workspace and repository instructions. Identify the chosen root, required repositories
and agent hosts. Default a new root to `~/headstart`; preserve existing operator conventions. The
catalog includes Agent Platform, backend, frontend, admin panel, website and Salesforce. All six hub
guides are generated; clone only the repositories needed for the user's role. Selecting an agent host
also provisions Agent Platform as the internal source/runtime.

For an audit or plan, remain read-only. An authorized setup request permits the described local
scaffold, selected clones and selected hosts' skill/routing installation. Explain that selected hosts
receive a small workspace-scoped block in their user instructions, preserving unrelated text. Do not
add a redundant approval pause when this scope is already authorized. Existing unowned conflicts need
a concrete comparison and bounded adoption decision. Never copy personal content, move standalone
clones, delete receipts or replace existing workspace helper policy to bypass a guard.

Use a clean reviewed Agent Platform checkout with dependencies installed through its frozen lockfile.
Read the source version's `docs/workspace-onboarding.md`, also available in the
[shared guide](https://github.com/headstartHealthTeam/agent-platform/blob/main/docs/workspace-onboarding.md).
An installed skill alone does not contain the CLI. Setup provisions the persistent source inside the
new workspace; the original bootstrap checkout is not needed afterward.

## Preview And Apply

From the reviewed source checkout, substitute the chosen root, repositories and hosts:

```bash
pnpm workspace -- setup --root <root> --repositories all --hosts codex,claude-code --clone
pnpm workspace -- setup --root <root> --repositories all --hosts codex,claude-code --clone --apply
```

Preview is write-free and does not contact remotes. Inspect file conflicts, the proposed host block
and unreceipted skill-name collisions. Use `--adopt-skills` only after the replacement is authorized.
For files only, omit hosts and `--clone`. For role-specific provisioning use, for example,
`--repositories website`. No role needs access to every application repository.

Apply installs workspace helper dependencies and all shared skills for the selected hosts through
the same receipts and byte verification as `headstart-skills-update`. Application dependencies,
credentials and services remain governed by each application's runbooks. Diagnose named failures
and retry the affected hub; do not infer successful authentication from directory existence.

## Explain The Working Model

- Root instructions route work; hub guides identify repositories; tracked checkout instructions
  govern implementation. Baseline branches are for orientation and reviewed source updates.
  Feature/review work uses isolated worktrees and repository-approved branch names.
- From the workspace, run `node bin/headstart.mjs new-worktree --repo <hub> --name <slug> --branch
<branch>` and supply `--base <ref>` for stacked work. Before editing, run
  `node bin/headstart.mjs assert-worktree --repo <hub> --path <checkout>`.
- Knowledge starts at `Headstart/Start Here.md` and `Headstart/index.md`. Search with
  `node bin/headstart.mjs search --query <terms>`, then retrieve the original using
  `node bin/headstart.mjs read --page <relative.md>`. Verify volatile state with its live owner.
  The starter is empty and local; it does not imply shared knowledge synchronization.
- `.idea-shared` holds temporary sanitized evidence. Durable understanding belongs in knowledge;
  live status belongs in Linear/GitHub and operational procedure in repository docs. Never copy
  credentials, patient records or private personal notes into shared artifacts.

## Review Updates

The internal `agent-platform/main` source is compatible with the existing managed skill updater.
From the workspace, preview `node bin/headstart.mjs skills`, review its commit, then apply with
`--apply --expected-commit <sha>`. This refreshes selected host skills and helper dependencies.
Follow the composed `headstart-skills-update` contract; never author in its clean source checkout.

Then preview `node bin/headstart.mjs upgrade --diff`. Apply only the reviewed content with
`--apply --expected-plan <hash>`. Unmodified owned templates update; local edits are preserved or
reported as conflicts. When a template and a customization both changed, reconcile the content or
preview an explicitly authorized `--keep-local <comma-separated-owned-paths>` choice and use its new
token. Never use that flag to adopt an unowned file. Managed host-block conflicts need manual review.
Setup/upgrade do not move clones, clean worktrees or modify application baselines.

## Verify And Hand Off

Run `node bin/headstart.mjs doctor` for the selected repositories and hosts. Report files, clone
results, runtime, skill bytes, routing and unresolved conflicts separately from credentials,
application readiness and actual agent behavior. The generated launcher uses `agent-platform/main`
and works without the bootstrap checkout. Use `bin/headstart` on POSIX or `bin\headstart.cmd` on Windows
as optional shortcuts.

Start fresh sessions at the root and a nested worktree in the operator's actual clients. Verify that
root/hub guidance and tracked repository instructions are all reached, and test a synthetic knowledge
lookup and approved worktree task. Codex's Git-root boundary is handled by the scoped user rule;
Claude Code also receives thin imports. Doctor does not prove model compliance. Report custom host
configuration or client gaps honestly rather than claiming universal context attachment.

After installing skills, ask whether the user wants the separate daily skill refresh described in
`headstart-skills-update`. Enable it only on explicit opt-in. Workspace template upgrades remain
manual and previewed. Finish with the operator's next concrete task; do not add managed services,
shared storage, QMD scheduling or a company knowledge mirror to complete basic onboarding.
