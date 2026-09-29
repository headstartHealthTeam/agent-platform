---
name: headstart-workspace-setup
description: Scaffold or inspect a local Headstart workspace with repository hubs, isolated worktree commands and a durable knowledge starter. Use for workstation onboarding, a company setup workshop, or reviewing an existing workspace against the shared layout. Do not activate for ordinary feature implementation, application startup, or a request only to refresh installed skills.
compatibility: Requires local filesystem access, Git, Node.js 22 or newer, pnpm 9.15 and a reviewed Agent Platform source checkout. Repository provisioning also requires the operator's existing Git access. Host discovery and application readiness require separate verification.
metadata:
  author: headstart-health
  version: '0.1.0'
  headstart-requires: headstart-skills-update
---

# Headstart Workspace Setup

Help a teammate understand and create the shared workspace layout. Deterministic commands own
filesystem and Git operations; the agent handles explanation, role selection and conflict review.
The first release provides the scaffold foundation. Do not claim complete automatic context loading,
shared knowledge distribution or unattended workspace upgrades.

## Establish Scope

Read existing workspace and repository instructions first. Identify the chosen workspace root and
reviewed Agent Platform source checkout. Default a new root to `~/headstart`; preserve existing
operator conventions. Select the needed repositories: Agent Platform, backend, frontend, admin
panel, website and Salesforce. All six hub guides are generated; Git provisioning is separately
selected. No role needs access to every repository to use the knowledge starter.

For an audit or plan, remain read-only. An authorized setup request allows the described local
scaffold and requested clones; do not add another approval step once the target and scope are clear.
Existing unowned instruction conflicts need a concrete comparison and a bounded adoption decision,
not automatic replacement or deletion. Do not move standalone clones or edit personal/global
instructions just to make the tool accept an existing setup.

Use a clean reviewed source checkout with its dependencies installed. Read the current
[workspace guide](https://github.com/headstartHealthTeam/agent-platform/blob/main/docs/workspace-onboarding.md)
and the source version's equivalent before running commands. Installed skill copies do not contain
the source CLI. If a workspace already mandates its own worktree helpers, preserve that procedure;
this scaffold does not authorize replacing it.

## Preview And Apply

Run from the Agent Platform source checkout, using the actual chosen root:

```bash
pnpm workspace -- setup --root <workspace-root> --repositories all --clone
pnpm workspace -- setup --root <workspace-root> --repositories all --apply --clone
pnpm workspace -- doctor --root <workspace-root> --repositories all
```

Preview, including `--clone` without `--apply`, does not write or contact remotes. Omit `--clone` for guidance and the knowledge starter
only; select `--repositories backend,frontend` to provision a smaller role-specific set. Commands
report repository failures independently and return a nonzero exit for incomplete requested Git
setup. Diagnose the named failure and retry that hub. Never say authentication succeeded merely
because a local directory exists. Do not echo credential output during troubleshooting.

Reruns preserve owned local edits and do not update baseline commits. They stop before writing on
unowned file conflicts. Review damaged receipts, unowned anchors and stale operation locks manually;
do not remove or fabricate them to bypass a guard. The scaffold has no migration, deletion, template
update or baseline-refresh command.

## Explain The Working Model

- Root instructions route work; hub guides identify repositories; tracked checkout instructions
  govern implementation. Baselines are detached orientation checkouts. Work happens in isolated
  feature/review worktrees with explicit repository-approved branch names.
- Use `pnpm workspace -- new-worktree --root <root> --repo <hub> --name <slug> --branch <branch>`.
  Supply `--base <ref>` for stacked work. Before editing, run
  `pnpm workspace -- assert-worktree --root <root> --repo <hub> --path <checkout>`.
- Knowledge starts at `Headstart/Start Here.md` and `Headstart/index.md`. Read original pages after
  search; verify live state in its owner. This is an empty local Markdown starter, not imported
  company knowledge. Do not copy personal material or index unrelated directories.
- `.idea-shared` is for temporary sanitized evidence. Secrets and patient records stay in approved
  storage; live work status remains in Linear/GitHub and operational procedure in repository docs.

## Verify And Hand Off

Report scaffold files, selected repository results, unresolved conflicts and distinct remaining
states: skill installation, credentials, application dependencies, service startup, knowledge
population and actual host instruction discovery. Follow `headstart-skills-update` for global
skills using its supported clean main source; detached orientation checkouts do not satisfy that
updater's contract. Do not schedule updates as part of workspace setup.

Codex can stop instruction discovery at a Git root. A root README or AGENTS.md is not proof that
worktree sessions inherit it. Until host bridges are verified, explicitly direct each worktree
session to the root and hub guides alongside tracked repository instructions. Test this in the
operator's actual agent version before claiming automatic loading. A passing doctor checks local
layout; it does not test the model, protect baselines at the OS level or establish application access.

Finish with the next concrete action appropriate to the operator's role. Do not add managed services,
shared storage, QMD scheduling or a company-wide knowledge mirror to finish basic onboarding.
