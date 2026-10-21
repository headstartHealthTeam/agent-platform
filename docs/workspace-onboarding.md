# Local workspace onboarding

[Documentation hub](README.md) · [Setup skill](../skills/headstart-workspace-setup/SKILL.md)

One supervised setup creates a Headstart workspace with six repository hubs, isolated worktree
helpers, a Markdown knowledge starter, and shared skills and instruction routing for Codex and
Claude Code. Deterministic commands handle filesystem, Git and update checks; the setup agent helps
select scope, review conflicts and explain the working model.

## Install once

Start from a clean reviewed Agent Platform checkout with Git, Node.js 22+ and the repository's pinned
pnpm. Follow existing workspace instructions when selecting that checkout. Install dependencies with
`corepack pnpm install --frozen-lockfile`, then preview the requested setup:

```bash
pnpm workspace -- setup --root ~/headstart --repositories all --hosts codex,claude-code --clone
pnpm workspace -- setup --root ~/headstart --repositories all --hosts codex,claude-code --clone --apply
```

Select only hosts the operator uses. A setup preview inspects local files, shows the exact routing
block and reports skill-name collisions without writing or contacting GitHub. Applying the selected
hosts installs all shared skills with the existing updater's receipts and appends that routing block
to their user instructions. Existing unrelated instructions remain intact. Unreceipted skill
collisions require review and an explicit `--adopt-skills` choice.

`--repositories backend,frontend` provisions a smaller set; `none` creates guidance without application
repositories. Selecting a host also includes Agent Platform, which supplies the runtime and skill
source. All six hub guides remain available as the company repository map. Omit `--hosts` for
files/repositories only on first setup; later runs default to previously configured hosts.

| Hub            | GitHub repository under `headstartHealthTeam` | Baseline |
| -------------- | --------------------------------------------- | -------- |
| agent-platform | agent-platform                                | main     |
| backend        | headstart-health-backend                      | dev      |
| frontend       | headstart-health-frontend                     | dev      |
| admin-panel    | headstart-health-admin-panel                  | dev      |
| website        | headstart-health-website                      | dev      |
| salesforce     | salesforce-dev                                | dev      |

Provisioning creates each selected hub's `.bare/` Git anchor and baseline branch checkout. Agent
Platform is pinned to the exact reviewed bootstrap commit; application repositories use their
remote baseline. Dependencies are installed only for Agent Platform's workspace helpers, using its
frozen lockfile and normal hooks. The installed source lives at `agent-platform/main`; the bootstrap
checkout is no longer needed to run workspace commands. Application dependencies, credentials and
service startup follow each repository's own runbooks.

New workspaces also contain root `README.md`, `AGENTS.md` and a thin `CLAUDE.md`; `Headstart/` knowledge
entry points, index, projects, wiki and source references; and hub guides and `.idea-shared/` temporary
artifact directories. This is shared guidance and an empty knowledge starter. Setup does not import
another operator's notes, credentials or company data.

## Use the installed workspace

Run these commands from the workspace root. POSIX users can use `bin/headstart`; Windows users can
use `bin\headstart.cmd`. The Node form works on every supported OS and from any working directory
when given an absolute launcher path:

```bash
node bin/headstart.mjs doctor
node bin/headstart.mjs new-worktree --repo backend --name example --branch feature/example
node bin/headstart.mjs assert-worktree --repo backend --path backend/example
node bin/headstart.mjs search --query "architecture decision"
node bin/headstart.mjs read --page "index.md"
```

Read root and hub guidance, then the baseline's tracked instructions for branch conventions before
creating a worktree. Use `--base <ref>` for stacked work. Creation fetches the hub's origin and
resolves the requested base to a commit. Website work rejects the `codex/` branch namespace.
Assertion checks the direct-child path, reserved baseline names, catalog origin, Git common directory,
checkout root and registration. A correctly named directory attached to another clone fails.

`main` and `dev` are orientation/source checkouts. Implementation belongs in feature/review worktrees.
The updater may explicitly fast-forward Agent Platform's clean `main`; it is not an authoring path.
These helpers do not impose OS-level locks, police every Git command or remove worktrees.

Knowledge search matches all query terms on a Markdown line, returning up to 50 bounded excerpts.
It covers top-level knowledge pages plus `projects/`, `wiki/`, `sources/` and `reports/`, skips hidden
entries and symlinks, and excludes code repositories and raw directories. Read the full source page
after discovery; pages over 1 MiB require direct inspection. Verify volatile status with Linear,
GitHub or the owning source. No search service is required. Obsidian, QMD and reviewed company
knowledge distribution are optional additions; a directory alone does not provide synchronization.

## Agent context

Codex's Git-root discovery boundary means a root README alone cannot reliably route a session opened
inside a worktree. Setup adds a small rule to the selected host's user instructions, conditional on
working inside this exact workspace. The rule directs the agent to root, hub, tracked repository and
applicable nested instructions, then the knowledge entry point when needed. It leaves detailed rules
in their owners and preserves repository-specific guidance.

Codex uses its effective nonempty `AGENTS.override.md`, otherwise `AGENTS.md`, under its configured
home. Claude Code uses `CLAUDE.md` under its configured home; thin `CLAUDE.md` imports also accompany
workspace guides. Existing custom `CODEX_HOME` and `CLAUDE_CONFIG_DIR` are respected for routing.
Skill destinations retain the existing installer contract: Codex's user `.agents/skills` and Claude
Code's user `.claude/skills`. Hosts configured to use different skill roots need explicit verification.
Other hosts can read the portable guides directly, but do not receive a claimed automatic adapter.

Start a fresh session after setup. Check root and nested worktree launch locations in the actual
client: ask it to identify the applicable instruction files, create an approved feature worktree,
and retrieve a synthetic knowledge page with its source. Doctor verifies local files, anchors,
installed routing, runtime presence and skill bytes against the source. It does not test model
compliance, credentials or application readiness. See the official
[Codex instructions guide](https://learn.chatgpt.com/docs/agent-configuration/agents-md) and
[Claude Code memory guide](https://code.claude.com/docs/en/memory) for discovery semantics.

## Review upgrades

Use the installed source for manual skill and workspace updates:

```bash
node bin/headstart.mjs skills
node bin/headstart.mjs skills --apply --expected-commit <sha-from-preview>
node bin/headstart.mjs upgrade --diff
node bin/headstart.mjs upgrade --diff --apply --expected-plan <hash-from-preview>
```

The skills preview fetches protected `main`, validates its exact contents using a disposable file
snapshot, and reports changes without advancing the checkout or replacing installed skills. Apply
requires that same remote commit, fast-forwards the clean internal `main`, installs the selected
hosts through the existing managed updater and refreshes helper dependencies. Dirty, ahead,
divergent or unexpected-origin sources are refused. There is no temporary Git worktree outside the
workspace. `headstart-skills-update` remains the canonical contract for skills and opt-in scheduling.
Daily skill refresh is offered separately and never enabled by setup. Scheduled skill refresh does
not apply workspace template changes or replace the manual runtime/template verification step.

Template upgrades are local and write-free until `--apply`. The preview token binds the exact source,
current file hashes, proposed content and host instructions. Any intervening change requires another
preview. `.headstart/receipt.json` records created files and their template hashes; `.headstart/hosts.json`
records managed routing blocks. Unmodified owned templates update; edited templates stay intact when
the template has not changed. If both changed, review `--diff` and manually reconcile, or preview again
with `--keep-local AGENTS.md,Headstart/index.md` to explicitly retain those owned customizations.
Apply the token from that new preview with the same options. Unowned files are never adopted by this
flag. Identical preexisting files are left unowned.

A changed managed routing block requires manual reconciliation before upgrade. Text outside the
block is preserved. Template updates do not delete retired files or move existing repositories.

## Failures and existing setups

- Rerun setup to complete missing files or repositories; it preserves owned edits. Existing baselines
  are verified without moving their commits. An existing internal source at a different revision
  must be updated through its own helpers before another setup source can install host skills.
- Differing unowned files, malformed receipts, symlinks, traversal, home/filesystem roots and a Git
  checkout used as the workspace root fail closed. Review existing local guides instead of replacing
  them. Legacy standalone clones are never moved or adopted automatically.
- Repository failures are reported separately and return a nonzero exit. A failed fetch leaves a
  marked initialization that can be retried with the same root and `--repositories <hub> --clone
--apply`. Other repositories may have completed. Corrupt anchors require diagnosis, not deletion.
- Each completed template write records ownership before the next file. A later failure can be
  resumed. Operations are not an all-files transaction; completed writes and installs are reported
  truthfully. A failed receipt write requires review before retrying.
- Mutations take an exclusive `.headstart/operation.lock`. A crashed process may leave a stale lock;
  verify that no operation is active before manual recovery. Cleanup attempts preserve the original
  failure as well as cleanup errors.
- Git failures omit raw credential-helper output. Setup does not configure access or change host
  permissions. Never place secrets or patient information in guides, knowledge or review artifacts.

Synthetic tests cover setup, partial failures, ownership, host routing, launcher execution, upgrades,
knowledge access and isolated Git environments. The normal CI matrix supplies OS verification.
A teammate's actual client and Git access remain a workshop acceptance check; filesystem tests alone
are not evidence of a successful real onboarding.
