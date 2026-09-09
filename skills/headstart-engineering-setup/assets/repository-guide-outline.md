# Repository Guide Authoring Outline

Use this outline to author a project-specific `AGENTS.md`; do not copy it verbatim. Remove these
authoring prompts and omit irrelevant sections in the finished guide. Prefer a short guide linked
to real repository documentation over extra empty files.

## Purpose And Boundaries

Explain the repository's responsibility and any non-obvious ownership boundary. Name what it does
not own. Link the actual architecture or operational contract when one exists.

## Start Here

Point to the few sources that change an agent's implementation decisions. Explain which task needs
which reference. Do not require reading every document or make a full directory inventory.

## Commands

List the verified install, local run or synthetic dry-run, focused test, and full QA commands.
State the required runtime and how the package-manager version is obtained from the manifest.
Separate live validation from ordinary deterministic checks. Do not invent commands for an app that
has not been implemented, or put credential values in examples.

## Implementation And Verification

Describe the important project-specific contracts and where code/configuration enforces them.
Explain meaningful regression, integration, and UI verification expectations as relevant. Keep
compiler and lint configuration authoritative rather than restating every flag.

## Change And Release Safety

Preserve other work and follow the active checkout/worktree conventions. Never bypass hooks, reduce
checks, hide failing tests, or change global Git identity. Explain the actual branch/review model,
including who authorizes publishing, deployment, and external writes. Do not inherit an example's
single-main flow when the repository uses release promotion branches.

## Documentation Maintenance

Name the canonical locations for durable architecture, operational procedure, and live task state.
Keep links and commands accurate when behavior changes. Add a recurring lesson to its narrow owner
or deterministic check instead of appending competing instructions. Report checks not run rather
than asserting readiness without evidence.
