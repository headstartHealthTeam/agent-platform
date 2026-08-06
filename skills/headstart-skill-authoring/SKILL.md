---
name: headstart-skill-authoring
description: Create or revise reusable Headstart agent skills and workflow skills using the open Agent Skills standard, explicit capability contracts, cross-agent portability, progressive disclosure, and evidence-based evaluations. Use when proposing, implementing, reviewing, or publishing a shared Headstart skill.
compatibility: Works with coding agents that can edit Markdown and run the repository's documented validation commands.
metadata:
  author: headstart-health
  version: '0.2.0'
---

# Headstart Skill Authoring

Create shared skills as durable team capabilities, not transcripts of how one person used one agent.
Read the repository `AGENTS.md` and the standards it identifies before editing a skill.

## Decide The Boundary

1. Define concrete prompts that should and should not activate the skill.
2. Separate the layers:
   - tools expose operations;
   - reusable skills explain one bounded capability;
   - workflow skills compose capabilities and handoffs;
   - deterministic services own invariants, durable state, and consequential writes when required.
3. Keep repository-specific rules in that repository's `AGENTS.md` unless they are genuinely shared
   across Headstart repositories.
4. Add a shared skill only when reuse, safety, or repeated execution justifies central ownership.
5. Do not create a skill solely to restate a connector's basic tool descriptions. Put integration
   operations and authorization in the tool layer; use a skill for the Headstart workflow around it.

## Author The Portable Core

- Use the open Agent Skills directory format with one canonical `SKILL.md`.
- Keep required frontmatter limited to `name` and `description`; use standard `compatibility` and
  string-valued `metadata` when useful.
- Use lowercase hyphenated names that match their directory.
- Describe required capabilities rather than hard-coding one host's tool identifiers.
- Use relative paths for bundled scripts, references, examples, and assets.
- Keep the main file concise and move detailed material into one-level-deep references.
- State inputs, outputs, side effects, authority, failure behavior, and handoff identifiers.
- For knowledge work, assign each connected source a purpose and authority boundary. Follow
  `standards/knowledge-workflow-sources.md` while authoring in this repository.
- For consequential workflows, require explicit user intent in the skill body and use optional
  host adapters for stronger invocation controls where supported.
- Never include local machine paths, credentials, tokens, PHI, production records, or copied
  private artifacts.

## Compose Skills Explicitly

Workflow skills may declare comma-separated dependencies in
`metadata.headstart-requires`. Their body must name each dependency, define which behavior it owns,
and state what happens when it is unavailable. Do not rely on an undocumented activation chain.

Avoid circular dependencies. A reusable skill must remain useful without importing a business
workflow that happens to consume it.

Default composed workflows to one agent executing sequentially. Add subagents or parallel workers
only for independent work, context isolation, or an evaluation-backed improvement.

## Adapt External Work Carefully

- Treat external skills as design evidence, not as a drop-in team standard.
- Preserve the useful problem-solving pattern while rewriting triggers, authority, source roles,
  outputs, and failure behavior for Headstart.
- Remove vendor-specific orchestration when it is not required by the portable outcome.
- If substantial text, code, or assets are copied, preserve the applicable license and provenance in
  the repository's approved third-party notice mechanism.
- Validate the adapted skill independently; upstream popularity does not establish fit or safety.

## Scripts And Tools

- Prefer agent reasoning for context-dependent judgment.
- Add deterministic scripts only for repeated parsing, validation, transformation, or fragile
  operations where reproducibility matters.
- Keep scripts cross-platform or clearly declare their runtime requirements.
- Treat connectors, MCP servers, CLIs, and browser controls as replaceable capability providers.
- Fail clearly when a required capability is absent. Never hallucinate a completed read or write.

## Evaluate Before Publishing

1. Add realistic positive, negative, and boundary prompts under the skill's `evals/` directory.
2. Validate the skill format, dependency names, relative references, and portability rules.
3. Run deterministic script tests on every supported operating system.
4. Exercise the skill with each supported agent host when its behavior or activation changed.
5. Compare observed output against the expected behavior; do not grade only whether the prose sounds
   reasonable.
6. Record unsupported host behavior as a compatibility limitation or fix it before release.
7. Include source-selection and no-unrequested-write cases for skills that use connected systems.

## Review Checklist

- The skill has one clear owner and bounded purpose.
- Trigger wording has positive and near-miss coverage.
- The portable core has no host-specific paths or required vendor-only syntax.
- Consequential reads and writes preserve applicable approval and privacy boundaries.
- Composition dependencies exist and have no cycle.
- Scripts and references are necessary, reachable, and tested.
- The version change and release notes communicate behavior changes.
- Installation and update instructions do not make copied files a second source of truth.
