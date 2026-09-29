import { WORKSPACE_REPOSITORIES } from './workspace-catalog.js';
import { launcherTemplate } from './workspace-launcher.js';

export const TEMPLATE_VERSION = 2;
const CLAUDE_IMPORT = '@AGENTS.md\n';

export const workspaceTemplates = (): Map<string, string> => {
  const files = new Map<string, string>([
    ['bin/headstart.mjs', launcherTemplate()],
    ['bin/headstart', '#!/usr/bin/env sh\nexec node "$(dirname "$0")/headstart.mjs" "$@"\n'],
    ['bin/headstart.cmd', '@echo off\nnode "%~dp0headstart.mjs" %*\n'],
    [
      'README.md',
      `# Headstart workspace

Start an agent at this root and read AGENTS.md. For implementation, select the affected
repository hub, read its guide and the checkout's tracked instructions, then use an isolated
worktree. Headstart/ holds durable Markdown knowledge; repository hubs hold code.

This starter contains guidance and searchable Markdown, not a populated company knowledge base.
Setup with selected hosts installs shared skills and workspace routing. Credentials, application
dependencies, services, Obsidian and indexed search follow separate setup steps.

Use bin/headstart (or node bin/headstart.mjs on any supported OS) from this workspace.
Its runtime and shared skills source live in agent-platform/main. For example:

- bin/headstart doctor
- bin/headstart search --query "architecture"
- bin/headstart read --page "index.md"
- bin/headstart upgrade --diff (preview; apply with its --expected-plan token)
- bin/headstart skills --hosts codex (preview; apply with its --expected-commit SHA)

The equivalent source commands remain available:

- pnpm workspace -- setup --root <this-directory> (preview; add --apply to create missing files)
- pnpm workspace -- setup --root <this-directory> --repositories all --apply --clone
- pnpm workspace -- doctor --root <this-directory>
- pnpm workspace -- new-worktree --root <this-directory> --repo backend --name example --branch <approved-branch>
- pnpm workspace -- assert-worktree --root <this-directory> --repo backend --path <checkout>

Clone operations require Git access. Failed repositories can be retried with --repositories <hub>.
Setup preserves existing owned edits. Reviewed upgrades can replace unmodified owned templates;
conflicting customizations need review. There is no automatic migration or cleanup. The receipt in
.headstart records template hashes and source revision.

Setup with --hosts codex or --hosts claude-code installs a small workspace-scoped routing block
in that host's active user instruction file. This handles repository-root discovery boundaries
without replacing tracked repository instructions. Start a fresh session after installation.
Doctor verifies installed routing and reports runtime readiness; it does not run a model.
`,
    ],
    [
      'AGENTS.md',
      `# Headstart workspace instructions

Read this workspace's README.md for orientation. Before repository work, read the affected hub's
AGENTS.md and the chosen checkout's tracked instructions. Load detail only for the current task.

## Sources of truth

- Headstart/ owns durable project understanding and decisions. Start with Headstart/AGENTS.md and index.md.
- Linear owns assignment, priority, status and acceptance criteria.
- GitHub owns branches, PRs, checks, reviews and merge state.
- Shared source documents own unresolved stakeholder input.
- Repository code and committed runbooks own implementation and operational behavior.
- Agent Platform owns reusable shared capabilities and their distribution.
- Each hub's .idea-shared/ holds temporary local evidence, not a competing project narrative.

Verify volatile facts with their live owner. Read full source pages after discovery; distinguish
verified facts, decisions, hypotheses and open questions. Capture sanitized durable learning in
its canonical knowledge page and link it from the index.

## Repository work

Use the workspace new-worktree command for implementation or review. Baseline main/dev worktrees
are for orientation. Before editing, run assert-worktree to verify both location and Git anchor.
Honor explicit stacked bases and repository branch naming rules. Preserve established QA and hooks.
Use matching task slugs for coordinated work. Cleanup, migration, baseline updates and external
writes require a deliberately scoped request; setup does not authorize them.

Repository-specific rules remain in their tracked guides. Do not infer production targets from
local aliases. Confirm the actual target before an operational action. Preserve existing access
controls. Never put secrets, patient information, raw production records or credentials in Git,
knowledge pages or shared artifacts. Keep team-facing outputs self-contained and link accessible
sources rather than local paths.

## Repository map

${WORKSPACE_REPOSITORIES.map((repo) => `- ${repo.hub}/: ${repo.purpose}.`).join('\n')}
`,
    ],
    ['CLAUDE.md', CLAUDE_IMPORT],
    [
      'Headstart/AGENTS.md',
      `# Headstart knowledge

Start with Start Here.md and index.md, then read the relevant project page in full. Use bin/headstart search --query <terms> from the workspace root if the index is insufficient.
Search covers Markdown in this knowledge directory only, skips symlinks and returns bounded excerpts.
Use bin/headstart read --page <relative-page.md> to read the original page in full. An installed search index is only a discovery aid;
read original Markdown and verify volatile state in its owning system.

Keep one canonical page per initiative under projects/. Use wiki/ for reusable understanding and
sources/ for sanitized source references. Link new durable pages from index.md. Record decisions,
evidence, source links, dates, uncertainty and next steps. Do not copy secrets, patient records,
raw transcripts, private personal material or temporary review output here. Do not invent knowledge
to fill this starter. Do not mirror ticket or PR status as a second live system of record.

The team must choose a reviewed knowledge source before importing content. This local starter does
not provide sharing or synchronization. Obsidian and scoped indexed search are optional.
`,
    ],
    ['Headstart/CLAUDE.md', CLAUDE_IMPORT],
    [
      'Headstart/Start Here.md',
      `# Start here

Read AGENTS.md, then index.md. This workspace begins with no imported business knowledge.
Add only reviewed, sanitized Headstart context with source links and clear ownership.
Code lives in repository worktrees, not in this knowledge directory.
`,
    ],
    [
      'Headstart/index.md',
      '# Knowledge index\n\n## Projects\n\n## Reusable knowledge\n\n## Source references\n',
    ],
    [
      'Headstart/projects/README.md',
      '# Projects\n\nKeep a canonical page for each initiative: outcome, decisions, evidence, open questions and next steps.\n',
    ],
    [
      'Headstart/wiki/README.md',
      '# Reusable knowledge\n\nWrite source-backed explanations useful across projects. Link them from the index.\n',
    ],
    [
      'Headstart/sources/README.md',
      '# Source references\n\nRecord source links and sanitized provenance. Keep sensitive originals in their approved systems.\n',
    ],
  ]);
  for (const repository of WORKSPACE_REPOSITORIES) {
    files.set(
      `${repository.hub}/AGENTS.md`,
      `# ${repository.hub} repository hub

Read ../AGENTS.md, then the selected checkout's tracked instructions.
This hub maps to headstartHealthTeam/${repository.repository}: ${repository.purpose}.

.bare/ is the Git anchor. ${repository.baseline}/ is the stable orientation checkout based on
origin/${repository.baseline}. Other direct children are feature or review worktrees.
Use the workspace new-worktree and assert-worktree commands described in ../README.md.
Explicit stacked bases must be preserved. Read repository branch naming requirements before
choosing a branch. Do not edit the stable checkout or automatically delete worktrees.

.idea-shared/ is local temporary evidence. Durable project understanding belongs in ../Headstart/.
Application setup and credentials follow the repository's committed runbooks.
`
    );
    files.set(`${repository.hub}/CLAUDE.md`, CLAUDE_IMPORT);
    files.set(
      `${repository.hub}/.idea-shared/README.md`,
      '# Local working artifacts\n\nKeep temporary sanitized investigation output here. Durable decisions belong in the knowledge directory.\nDo not store credentials, patient records or raw production data here.\n'
    );
  }
  return files;
};
