---
name: headstart-skills-update
description: Safely install, preview, manually refresh, or configure opt-in daily updates of portable skills from the canonical Headstart Agent Platform repository to user-level Codex, Claude Code, or Cursor skill directories. Use when setting up shared Headstart skills on a workstation, checking whether installed skills are stale, applying edits or newly published skills, or managing the user-level automatic refresh schedule.
compatibility: Requires Git, Node.js 22 or newer, pnpm 9.15, and read access to the Headstart Agent Platform repository at headstartHealthTeam/agent-skills. Scheduled refresh uses user cron on macOS/Linux or Task Scheduler on Windows.
metadata:
  author: headstart-health
  version: '0.1.0'
---

# Headstart Skills Update

Install and refresh workstation skill copies from the canonical repository. Do not treat installed
copies as editable sources.

## Resolve The Source Checkout

1. Use an existing clean `main` checkout whose `origin` resolves to
   `headstartHealthTeam/agent-skills`.
2. If more than one checkout is plausible, ask which checkout is canonical.
3. If no checkout exists, propose a neutral user-selected location and confirm it before cloning.
   Do not assume a machine-specific workspace path.
4. Install dependencies with the checked-in pnpm version when the checkout is new or dependencies
   are missing. Never disable repository hooks or weaken validation.

## Complete Initial Setup

Preview and then install the complete shared skill set for each host the user actually uses through
the managed updater so the initial setup records ownership:

```bash
pnpm skills:update -- --agent <host>
pnpm skills:update -- --agent <host> --apply --expected-commit <sha-from-preview>
```

If the preview reports existing unreceipted skill names, ask the user to confirm replacement before
applying. The lower-level `skills:install` command is for selected or project-scoped copies and does
not establish managed ownership for retirement cleanup.

After installation, explicitly ask whether the user wants automatic daily refreshes. Explain that
opting in authorizes future local fast-forwards from protected `main` and replacement of all skills
managed by this repository. Do not enable the schedule merely because installation was approved.

## Preview A Manual Refresh

Run the host-specific preview:

```bash
pnpm skills:update -- --agent codex
pnpm skills:update -- --agent claude-code
pnpm skills:update -- --agent cursor
```

Report the local and remote commits, incoming commits, affected skills, and refusal reasons. Fetching
updates local Git metadata but does not change the checkout or installed skills.

The deterministic updater refuses dirty checkouts, non-`main` branches, unexpected remotes, local
commits ahead of `origin/main`, and divergent history. Resolve repository state normally; do not
bypass these guards.

## Apply An Approved Manual Refresh

After the user approves the preview, run:

```bash
pnpm skills:update -- --agent <host> --apply --expected-commit <sha-from-preview>
```

The updater refuses to apply if remote `main` no longer matches the previewed commit. Preview again
instead of accepting additional unreviewed commits. On a match, it validates that exact commit in a
detached temporary checkout before fast-forwarding, reinstalls every current team skill with staged
directory swaps, verifies copied bytes, removes only retired skills listed in its prior receipt, and
records the installed commit. It never removes unrelated local skills.

## Configure Opt-In Daily Refresh

After explicit user approval, enable one or more hosts:

```bash
pnpm skills:auto-update -- --enable --agent codex
pnpm skills:auto-update -- --enable --agent claude-code
pnpm skills:auto-update -- --enable --agent cursor
```

One user-level job attempts configured hosts sequentially each day at 09:00 local time. A sleeping or
powered-off workstation may miss that attempt and will retry at the next scheduled time. The job
installs the locked repository dependencies, invokes the guarded updater, and writes a local log. It
does not use administrator privileges. Every run still refuses an unsafe checkout; opt-in authorizes
future eligible updates, not bypassing safety checks. Scheduling requires the ownership receipt from
an approved manual setup or refresh.

Inspect or disable the schedule with:

```bash
pnpm skills:auto-update -- --status
pnpm skills:auto-update -- --disable --agent <host>
```

When setup is complete, report which hosts are configured, the schedule, state and log locations,
and how to disable it. Contributors who use this repository for authoring should use a separate clean
`main` checkout for automatic refreshes so feature branches and working changes remain untouched.

## Runtime Boundary

This updater copies only the portable and workflow skills under `skills/` into individual users'
agent skill directories. Those locally installed skills are the common team consumption path. The
same canonical skill source may also be used by managed, scheduled, or cloud runners, but those
runners must pin an approved tag or commit through deployment configuration rather than following
`main` automatically.

Do not use this updater to install `workflows/`, runner code, infrastructure, credentials, or other
monorepo packages globally. A managed workflow package may be loaded locally from an explicit
repository checkout for development, evaluation, or a supported supervised launch; that is a
separate package execution path.

## Completion

Report the host, source and installed commit, installed skill count, retired skills removed if any,
schedule state, and remaining action. Do not claim success when fetch, validation, installation,
verification, receipt writing, or scheduler configuration failed.
