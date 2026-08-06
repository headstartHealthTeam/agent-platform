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
