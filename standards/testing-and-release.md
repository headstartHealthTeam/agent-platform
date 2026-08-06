# Testing And Release

## Evaluation Layers

Each skill is validated at four levels:

1. **Static format:** frontmatter, names, references, adapters, and dependency graph.
2. **Deterministic behavior:** bundled scripts and transformations use synthetic fixtures.
3. **Activation:** realistic positive, near-miss, and boundary prompts test whether the description
   selects the skill appropriately.
4. **Workflow behavior:** supported agent hosts are checked for the same safety and output contract.

Model evaluations are repeated when changing descriptions or orchestration because one passing run
does not prove reliable activation.

Golden prompt sets should include direct, indirect, incomplete, near-miss, and unsafe or unsupported
requests. Grade observable outcomes and side effects in addition to prose quality. For knowledge-work
skills, verify that the agent chooses the right source role, preserves citations, and does not write
to connected systems without explicit intent.

## Repository Quality Gates

Every pull request must pass the canonical `pnpm qa` command. It includes:

- strict typed ESLint with promise, import, security, secret-detection, and complexity rules;
- strict TypeScript compilation without emitting artifacts;
- deterministic Vitest execution with at least 80% statements, branches, functions, and lines;
- portable skill schema, reference, dependency, and safety validation;
- the release collector's cross-platform Python fixture suite; and
- a non-mutating repository-wide Prettier check.

Pre-commit hooks format and lint only staged supported files before running the fast deterministic
quality lane. Pre-push and pre-merge hooks run the complete suite. CI remains authoritative and runs
complete QA on Linux, macOS, and Windows; local hooks improve feedback time but do not replace branch
protection. The stable `Required` status check aggregates the matrix and dependency audit and is the
branch-protection contract; it must never stop depending on either job.

Dependency audits run separately in CI so network or registry availability does not make local Git
commits unreliable. Moderate-or-higher production and development findings are blocking until they
are fixed, shown to be non-applicable, or intentionally accepted through the repository's review
process.

## Pull Request Evidence

A skill PR identifies changed behavior, affected hosts, dependencies, evaluations, deterministic
checks, migration needs, and known limitations. Formatting or prose-only checks do not substitute for
behavior validation.

## Releases

`main` contains stable reviewed source. Semantic tags create installable releases. Individual
workstations may inspect and adopt a newer release; managed runtimes pin an exact tag or commit and
change only through an intentional deployment.

Rollback means reinstalling or redeploying a known-good tag. Do not repair an installed copy and
leave the canonical source unchanged.
