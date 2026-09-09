# Examples And Sources

The Headstart Agent Platform maintainers own this skill's engineering baseline. External sources
inform the design; they do not override Headstart review, security, or delivery policy. These are
selected principles, not a copied external workflow or comprehensive summary.

## Agent Platform Examples

The following links pin the reviewed example revision
`6fe414107120ca2b2d633d0dc74f52b13c98a6ff`. They illustrate the baseline inspected on 2026-09-05.
Use an authorized repository view to inspect newer revisions when needed and state material
differences. The bundled examples remain usable when repository access is unavailable.

| Example                                                                                                                                                                        | What to learn, not blindly copy                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| [Typed ESLint configuration](https://github.com/headstartHealthTeam/agent-platform/blob/6fe414107120ca2b2d633d0dc74f52b13c98a6ff/eslint.config.mjs)                            | Strict rules, promise handling, imports, cognitive complexity 15; adapt source globs and framework boundaries |
| [TypeScript base](https://github.com/headstartHealthTeam/agent-platform/blob/6fe414107120ca2b2d633d0dc74f52b13c98a6ff/tsconfig.base.json)                                      | Strictness and runtime-boundary safety; NodeNext is not universal                                             |
| [Package tests and coverage](https://github.com/headstartHealthTeam/agent-platform/blob/6fe414107120ca2b2d633d0dc74f52b13c98a6ff/packages/workflow-contracts/vitest.config.ts) | Package coverage floors; do not exclude a barrel if it contains real logic                                    |
| [Quality workflow](https://github.com/headstartHealthTeam/agent-platform/blob/6fe414107120ca2b2d633d0dc74f52b13c98a6ff/.github/workflows/qa.yml)                               | OS/runtime matrix and required aggregation; Python is specific to that repository                             |
| [Turbo graph](https://github.com/headstartHealthTeam/agent-platform/blob/6fe414107120ca2b2d633d0dc74f52b13c98a6ff/turbo.json)                                                  | Actual package dependencies and cache boundaries, only when a monorepo is warranted                           |
| [Documentation hub](https://github.com/headstartHealthTeam/agent-platform/blob/6fe414107120ca2b2d633d0dc74f52b13c98a6ff/docs/README.md)                                        | Connected entry points, owned explanations, and selective reading                                             |

Do not copy this repository's application architecture, complete instruction file, package names,
runtime permissions, or managed-agent machinery into a small unrelated project.

## Primary Guidance

Reviewed 2026-09-05. Recheck when host instruction loading, skill activation, tool major versions, or
supported runtimes change, or when a behavioral evaluation fails. If a source cannot be verified,
label the affected compatibility claim unverified; do not change policy from a guessed update.

- [OpenAI: Harness engineering, February 2026](https://openai.com/index/harness-engineering/): use a
  short instruction map, navigable repository knowledge, and mechanically checked boundaries.
  Headstart does not adopt this experiment's relaxed merge gates or reduced human review.
- [OpenAI: Build skills](https://learn.chatgpt.com/docs/build-skills): keep discovery metadata focused
  and supporting detail on demand. Availability is not proof that a skill activates reliably.
- [Anthropic: Claude Code best practices](https://code.claude.com/docs/en/best-practices): give the
  agent observable ways to verify its work and remove unnecessary instruction context.
- [Anthropic: Instruction loading](https://code.claude.com/docs/en/memory): distinguish imports from
  links and keep compatibility bridges small. Host-specific features are not portable requirements.
- [Anthropic: Agent evaluations, January 2026](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents):
  measure actual outcomes and inspect execution evidence, not only the agent's success claim.
- [Cursor: Rules](https://cursor.com/docs/rules): verify root/nested instruction support and avoid
  a second independent copy of canonical policy.
- [typescript-eslint: Typed linting](https://typescript-eslint.io/getting-started/typed-linting/):
  supply project type information, including for scripts and tests, and account for its runtime cost.
- [Vitest: Coverage](https://vitest.dev/guide/coverage.html): include source not imported by tests;
  coverage counts execution, not whether the assertions prove the intended behavior.
- [GitHub: Protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches):
  required checks and approvals are host configuration, not a property conferred by local hooks.

The tool choices and numeric floors are Headstart conventions. They are not universal requirements
attributed to these sources. Refresh the canonical skill and its evaluations through review; never
let source changes or workstation auto-updates silently rewrite consumer repositories.
