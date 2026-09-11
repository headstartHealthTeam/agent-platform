# Testing And Release

## Evaluation Layers

Portable skills are evaluated across five applicable layers. Static format and activation always
apply; the remaining layers apply when the skill includes the corresponding behavior:

1. **Static format:** frontmatter, names, references, adapters, and dependency graph.
2. **Deterministic behavior:** bundled scripts and transformations use synthetic fixtures.
3. **Activation:** realistic positive, near-miss, and boundary prompts test whether the description
   selects the skill appropriately.
4. **Workflow behavior:** supported agent hosts are checked for the same safety and output contract.
5. **Operational portability:** a fresh session and second authorized operator can follow only the
   documented inputs and dependencies without relying on the creator's chat history, machine files,
   personal credentials, or implicit knowledge.

Model evaluations are repeated when changing descriptions or orchestration because one passing run
does not prove reliable activation.

Evaluate the complete tested system, not only the model name. Record the workflow, prompt, skill,
tool, source, schema, model, harness, grader, and budget versions needed to reproduce a claim. Each
task should use multiple trials when model behavior can vary. Preserve PHI-safe trajectories or
equivalent structured run evidence so failures can be attributed to context, tools, routing,
verification, or model behavior rather than only the final answer.

Use deterministic graders wherever the outcome permits them. Model graders must use bounded rubric
dimensions and be calibrated against representative human judgments; they must not silently replace
human review for consequential or clinically ambiguous decisions. Track outcome quality together
with false-pass and false-reject rates, latency, iterations, tool calls, token or cost usage,
escalation, and no-progress termination when applicable.

A quality-loop evaluation must compare against the simpler one-pass baseline and prove that
refinement improves the intended outcome within its budgets. A graph evaluation must additionally
exercise node contracts, routing, joins, partial failure, and context handoffs and compare against a
single-agent baseline. Do not accept added orchestration solely because its final pass rate is
higher when cost, latency, or unsafe false passes materially worsen.

Each managed workflow additionally requires manifest validation, referenced-file resolution, input
and output JSON Schema compilation, schema-valid synthetic contract fixtures, happy-path and
policy-boundary evaluation definitions, and tests for deterministic adapters when they are present.
Repository validation checks the fixture and evaluation contracts; repeated model evaluation
evidence remains release evidence rather than a credentialed CI dependency. Live services and
credentials remain outside ordinary unit tests and hooks.

Golden prompt sets should include direct, indirect, incomplete, near-miss, and unsafe or unsupported
requests. Grade observable outcomes and side effects in addition to prose quality. For knowledge-work
skills, verify that the agent chooses the right source role, preserves citations, and does not write
to connected systems without explicit intent.

For a workflow whose recommendation can later be compared with an external outcome, preserve the
original recommendation, evidence, and exact workflow, skill, rule, source, schema, and model
versions separately from the observed outcome. Classify mismatches before changing behavior: source
staleness, extraction failure, model judgment, human override, external policy, and upstream data
quality are different failure modes. Outcome review may propose a repository change and regression
case; it must not mutate canonical skills or references automatically.

Before publishing a shared operational workflow, run a clean-handoff exercise whenever practical:
install from canonical source, start a fresh supported agent session, use an authorized operator
other than the creator, and verify the behavioral contract with documented inputs. Record hidden
dependencies as defects. Equivalent behavior is required; identical prose is not.

## Repository Quality Gates

Every pull request must pass the canonical `pnpm qa` command. It includes:

- repository-wide secret detection across every non-ignored file, including documentation,
  manifests, fixtures, and configuration;
- strict typed ESLint with promise, import, security, secret-detection, and complexity rules;
- strict TypeScript compilation without emitting artifacts;
- deterministic Vitest execution with at least 80% statements, branches, functions, and lines;
- portable skill schema, reference, dependency, and safety validation;
- managed workflow manifest, ownership, policy, reference, and schema validation;
- local Markdown file and heading-anchor validation plus canonical documentation index and backlink
  checks;
- dependency-aware package builds through Turborepo;
- the release collector's cross-platform Python fixture suite; and
- a non-mutating repository-wide Prettier check.

Pre-commit hooks format and lint only staged supported files before running the fast deterministic
quality lane. Pre-push and pre-merge hooks run the complete suite. CI remains authoritative and runs
complete QA on Linux, macOS, and Windows; local hooks improve feedback time but do not replace branch
protection. The stable `Required` status check aggregates the matrix and dependency audit and is the
branch-protection contract; it must never stop depending on either job.

Cross-platform tests that launch child processes, Git, package managers, or filesystem-heavy
repository fixtures are integration tests even when they use only local synthetic data. Bound each
spawned command so a real hang terminates, and give the test an explicit timeout based on observed
behavior on the slowest supported CI host. Keep ordinary unit defaults strict. A timeout after the
synchronous work completed is not evidence of a product defect, but repeatedly rerunning it is not a
fix; correct the test boundary without dropping assertions, coverage, or an operating-system lane.

Dependency audits run separately in CI so network or registry availability does not make local Git
commits unreliable. Moderate-or-higher production and development findings are blocking until they
are fixed, shown to be non-applicable, or intentionally accepted through the repository's review
process.

## Pull Request Evidence

A skill or workflow PR identifies changed behavior, affected hosts or runtimes, dependencies,
evaluations, deterministic checks, operational handoff evidence when applicable, migration needs,
and known limitations. Managed workflow PRs also identify owners, triggers, permissions, data
classification, side effects, deployment coordination, and rollback behavior. Formatting or
prose-only checks do not substitute for behavior validation.

## Releases

`main` contains stable reviewed source. Semantic tags create installable skill releases. Individual
workstations may inspect and adopt a newer release; managed runtimes pin an exact tag or commit,
workflow version and execution artifact/configuration provenance, with an immutable image digest
where the deployment controls an image. Change these only through an intentional deployment. Follow
the architecture's [versioning contract](../docs/codex-managed-workflow-architecture.md#skills-and-version-pinning)
for hosted-provider limits and behavioral conformance.

Rollback means reinstalling or redeploying a known-good tag. Do not repair an installed copy and
leave the canonical source unchanged.

## Related Guidance

- [Documentation hub](../docs/README.md)
- [Workflow authoring guide](../docs/workflow-authoring-guide.md)
- [Managed workflow architecture](../docs/codex-managed-workflow-architecture.md)
- [Workflow composition](workflow-composition.md)
- [Security and data handling](security-and-data-handling.md)
