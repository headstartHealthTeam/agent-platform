# Portable Skill Contract

## Canonical Format

Every shared capability lives under `skills/<name>/` with a canonical `SKILL.md`. The directory may
also contain `scripts/`, `references/`, `assets/`, `evals/`, and optional host adapter metadata.

The portable core uses standard Agent Skills frontmatter:

- `name` and `description` are required;
- `compatibility` documents runtime requirements;
- `metadata` contains string-valued ownership, version, or dependency information.

The directory name and `name` must match. Use relative paths and keep detailed references one level
below the main skill.

## Capability Language

Describe what an agent must be able to do, not the internal identifier of one installation:

- Prefer "authenticated GitHub pull request read capability."
- Avoid required MCP function names, plugin cache paths, or one vendor's shell substitutions.
- Name a CLI only when it is the actual deterministic runtime dependency or a documented fallback.
- State what to do when the capability is absent.

## Host Adapters

Host adapters may improve discovery, UI presentation, dependency declarations, or invocation
control. They must not alter the workflow's inputs, outputs, safety boundaries, or completion
standard. The canonical skill must remain understandable when adapters are ignored.

## Portability Failures

A skill is not portable when it requires an absolute workstation path, assumes a particular agent
product, silently depends on an undeclared local skill, uses an operating-system-specific command
without a supported alternative, or treats one connector's availability as authorization.
