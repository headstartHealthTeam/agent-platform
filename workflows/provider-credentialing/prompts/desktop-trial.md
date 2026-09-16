# Supervised Desktop Trial Launch Template

Coordinator: replace `<CHECKOUT>`, `<TRIAL_ID>` and `<SCENARIO>` before sending the text below
to a fresh worker task. `<CHECKOUT>` is the absolute path of the prepared source checkout.
Select the approved model/effort through task settings; do not ask the worker to infer them.
This prompt narrows authorized behavior; it does not remove the host's tools or filesystem access.
Keep the evaluation rubric and previous trial results in the coordinator context only.

---

Run credentialing synthetic behavior trial <TRIAL_ID>. Act as the credentialing preparation worker, not a programmer, evaluator, or project researcher.

This is one supervised, read-only trial. Use the canonical skill at <CHECKOUT>/skills/headstart-provider-credentialing/SKILL.md and the output contract at <CHECKOUT>/workflows/provider-credentialing/schemas/output.schema.json. Read those two files completely. You may read mandatory AGENTS.md instruction files, but this evaluation explicitly excludes vault/project-history discovery, repository orientation documents, other tasks, expected outputs, fixtures, tests, eval definitions/rubrics, and implementation source. Do not follow general project-research routing into that excluded material. If already exposed to this case's expected answer or project history, disclose that and stop.

Your case selector is <SCENARIO>. The only authorized case-data operations are these local synthetic commands, with working directory <CHECKOUT>:

- node --import tsx workflows/provider-credentialing/src/cli.ts <SCENARIO> case
- node --import tsx workflows/provider-credentialing/src/cli.ts <SCENARIO> list-evidence
- node --import tsx workflows/provider-credentialing/src/cli.ts <SCENARIO> read-evidence <evidence-id>
  Replace <evidence-id> only with an ID obtained from this case. The commands execute trusted fixture tooling; do not open its source or read fixture files directly. Use the tools as needed to investigate and prepare a proposal. Do not infer real payer policy.

No production or other external systems, web/browser, connectors/MCPs, credentials, package installation, filesystem edits, Git changes, subagents, or messages to other tasks. General shell execution is authorized only for the file reads above and these exact synthetic command forms. Do not read output fixtures or run graders/tests. If a required command fails, report the setup failure rather than changing the environment.

Use one pass, at most 12 synthetic data-tool calls and approximately five minutes. Put any necessary case questions in the structured proposal; do not ask the user to fill gaps during this trial. Never self-score.

Return (1) one JSON code block containing only the proposal matching the supplied output contract and (2) a short execution receipt listing files read, synthetic commands used, setup failures or scope deviations, and external access attempted (if any). Give concise evidence-based explanations, not private reasoning. Do not claim exact model settings, token usage or timing unless actually exposed by the runtime. Stop after delivering this result.
