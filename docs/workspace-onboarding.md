# Local workspace onboarding

[Documentation hub](README.md) · [Setup skill](../skills/headstart-workspace-setup/SKILL.md)

This first release creates a predictable Headstart directory and repository topology through a
supervised skill and deterministic CLI. It includes a knowledge starter, safe reruns, repository
provisioning, worktree creation/assertion and local diagnostics. Host bridges, template upgrades,
standalone launchers and optional indexed search remain follow-up work.

## Start from a reviewed source checkout

Use an existing clean Agent Platform checkout with Git, Node.js 22+ and the pinned pnpm 9.15.0.
Install its dependencies with `pnpm install --frozen-lockfile`. Follow any existing workspace's
instructions when selecting that checkout. This command does not relocate its own source or install
application dependencies in the repositories it creates. Keep the source checkout available for
workspace commands. Skill installation alone does not install the CLI.

Preview the chosen root, then apply the requested scope:

```bash
pnpm workspace -- setup --root ~/headstart --repositories all --clone
pnpm workspace -- setup --root ~/headstart --repositories all --apply --clone
pnpm workspace -- doctor --root ~/headstart --repositories all
```

Preview only inspects local paths. It creates no files and does not contact GitHub. `--apply` creates
missing guidance and the Markdown knowledge starter. With `--apply`, `--clone` initializes the selected
bare anchors, fetches their catalog origins and creates detached baseline worktrees. Use a comma
list such as `--repositories backend,frontend`, or `none` for no repository inspection/provisioning.
All six hub guides remain available as the company repository map.

| Hub            | GitHub repository under `headstartHealthTeam` | Baseline |
| -------------- | --------------------------------------------- | -------- |
| agent-platform | agent-platform                                | main     |
| backend        | headstart-health-backend                      | dev      |
| frontend       | headstart-health-frontend                     | dev      |
| admin-panel    | headstart-health-admin-panel                  | dev      |
| website        | headstart-health-website                      | dev      |
| salesforce     | salesforce-dev                                | dev      |

New workspaces contain root `README.md`, `AGENTS.md`, and a thin `CLAUDE.md`; a `Headstart/`
knowledge directory with its own entry points, index, projects, wiki and source references; and the
six hub guides with `.idea-shared` artifact directories. Provisioned hubs also contain `.bare/`
and their baseline checkout. `.headstart/receipt.json` records the template version, exact source
revision and hashes of files first created by this installation. Root, hub and knowledge templates
are newly authored shared guidance; the scaffold does not import personal content or populate
company knowledge.

## Work in isolated checkouts

Read root and hub guidance, then inspect the baseline's tracked instructions for branch conventions.
Run from the source checkout:

```bash
pnpm workspace -- new-worktree --root ~/headstart --repo backend --name example --branch feature/example
pnpm workspace -- assert-worktree --root ~/headstart --repo backend --path ~/headstart/backend/example
```

`new-worktree` fetches the hub's origin, resolves its default remote baseline to a commit and creates
a new branch in a direct hub child. Use `--base feature/previous-slice` for stacked work; an explicit
base is honored for every repository. Choose the actual repository-approved branch name; website
work rejects the `codex/` namespace. The helper does not install application dependencies.

Assertion checks the direct-child path, reserved baseline names, expected origin, actual Git common
directory, checkout root and registration with that anchor. A correctly named directory attached
to another clone fails. `main` and `dev` are reserved orientation paths. These commands do not impose
OS-level write locks, police all other Git invocations, refresh baselines, remove worktrees or replace
an existing workspace's local helper policy.

## Reruns, failures and existing setups

- Matching files are left unchanged. Files recorded as owned in the receipt are preserved when
  edited, including a growing knowledge index. New templates are not applied over those edits.
- Differing unowned files or directory collisions stop setup before writes. Inspect the preview
  and compare guidance before a separately scoped adoption. Identical preexisting files are not
  claimed as owned by the receipt. Malformed receipts fail closed.
- Existing baseline worktrees are verified without fetching or advancing them. Existing unowned
  anchors without a valid baseline are not adopted. Legacy standalone clones are never moved.
- A failed fetch leaves an explicitly marked initialization that can be retried. Retry with the
  same root and `--repositories <hub> --apply --clone`. Corrupt or partially initialized anchors
  require manual diagnosis; the tool does not delete or rebuild them automatically.
- Repository failures do not stop other selected repositories. A requested Git failure returns exit
  code 1. Doctor returns 1 for missing files, conflicts or selected repository gaps. Neither success
  code claims complete workstation readiness.
- Mutating CLI operations take an exclusive `.headstart/operation.lock`. Concurrent operations fail.
  A crashed process can leave a stale lock; verify no operation is running before manual recovery.
- Symlinks in target paths, traversal, filesystem/home roots and a Git checkout used as the workspace
  root are rejected. Choose a dedicated physical directory. No credentials or global configuration
  are written, and Git failures omit raw credential-helper output.

The implementation uses cross-platform Node/Git APIs. Local synthetic acceptance was developed on
macOS; repository CI and a real second-operator trial are required before claiming Windows workshop
readiness. Tests isolate Git environment inherited from hooks and use local synthetic remotes only.

## Context and skill installation are separate checks

A README is navigation. Agent instructions have host-specific discovery rules. Codex can stop at a
Git root, so being somewhere under the workspace does not prove the root's guidance is loaded.
Claude Code has different ancestor/import behavior. See the official
[Codex instructions guide](https://learn.chatgpt.com/docs/agent-configuration/agents-md) and
[Claude Code memory guide](https://code.claude.com/docs/en/memory) (reviewed September 29, 2026).
Documentation and synthetic file tests do not establish actual agent behavior.

For this release, explicitly tell worktree sessions to read the workspace root and hub `AGENTS.md`
as well as tracked repository instructions. Verify this in the actual client version before claiming
automatic attachment. Future adapters must preserve existing repository instructions rather than
silently replace them with an override. Doctor does not launch models or change host settings.

Install global skills through [the existing updater](../skills/headstart-skills-update/SKILL.md).
Its clean-main source requirement is not satisfied by the detached orientation checkout created
here. Keep using a supported source checkout for that updater. This release does not connect workspace
provisioning to the updater or its opt-in schedule; updater/baseline compatibility belongs in the
upgrade integration work.

Knowledge is directly usable as Markdown. Choosing a company knowledge source, optional Obsidian
configuration and scoped QMD indexing are separate decisions. Do not copy another operator's vault,
create a global index over all repositories or infer shared synchronization from the directory name.

## Remaining acceptance gates

1. Non-destructive host bridges and launch helpers, verified from root and nested worktree sessions
   in fresh Codex and Claude Code clients without personal global routing.
2. A second teammate's onboarding with partial Git access, interruption/recovery and a real task;
   verify each intended OS/client combination.
3. Receipt-aware reviewed template upgrades and explicit integration with manual skill updates,
   reconciling baseline mutation and temporary-checkout assumptions before enabling them together.
4. A reviewed knowledge distribution choice and optional scoped search with full-source retrieval.

Report these states separately from scaffold completion. This foundation is not the complete
workshop acceptance gate for automatic context management.
