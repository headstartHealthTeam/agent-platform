---
name: simulate-provider-perspectives
description: Simulate evidence-backed Headstart provider perspectives to evaluate Figma and Figma Make prototypes, screenshots, provider-portal flows, requirements, onboarding, scheduling, client intake, billing, and operational workflows. Use when asked to predict how different providers will understand, trust, use, or question a provider-facing experience; identify persona-specific usability risks and corner cases; compare reactions across practice stages; or learn and calibrate provider personas from portal chats, Fireflies or meeting transcripts, Slack, Google Drive, research, and user-supplied evidence.
compatibility: Requires a readable provider-facing artifact or evidence set. Interactive evaluation requires an authorized browser or design-inspection capability; connected evidence requires authorized, explicitly scoped source reads.
metadata:
  author: headstart-health
  version: '0.1.0'
---

# Simulate Provider Perspectives

Use composite provider personas to evaluate an experience without impersonating a real provider or treating a temporary stressor as an identity.

## Capability And Authority

- Inputs may include a prototype, screenshot, workflow, requirements document, or explicitly scoped
  provider evidence. Establish the intended audience, workflow stage, and success condition before
  evaluating.
- Use current product artifacts to establish observed interface behavior. Treat portal chats,
  meeting notes, transcripts, and research as dated observations, not approved policy or complete
  explanations of provider motivation.
- Default to read-only evaluation and proposed changes. Do not edit a prototype, connected source,
  persona, rubric, or evidence registry unless the user explicitly requests that exact write.
- If an interactive state or required source cannot be accessed, continue only with the evidence
  that is available, disclose the coverage limitation, and do not imply that the missing state was
  tested.
- Return an evaluation, proposed anonymized evidence records, or a calibration proposal according
  to the selected mode. Never present a simulated reaction as a statement from a real provider.

## Choose the Mode

1. Evaluate: Review an artifact using the current personas. Do not modify persona or evidence files.
2. Learn: Extract anonymized observations from new provider evidence. Propose evidence records unless the user explicitly asks to incorporate them.
3. Calibrate: Compare accumulated evidence with the current model and propose persona, overlay, rubric, or policy changes. Do not change foundational personas without explicit user approval.

If the request combines modes, evaluate first and place learning or calibration proposals in a separate section.

## Load the Minimum References

- For every evaluation, read [references/personas.md](references/personas.md) and [references/evaluation-rubric.md](references/evaluation-rubric.md).
- For Learn mode, also read [references/evidence-registry.md](references/evidence-registry.md) and [references/evolution-policy.md](references/evolution-policy.md).
- For Calibrate mode, read all four references.

## Evaluate an Artifact

1. Establish the artifact's intended provider, goal, workflow stage, and success condition.
2. Inspect the complete artifact before judging it. For an interactive prototype, exercise every available transition, mixed-action state, exception, back path, edit path, disabled state, and completion path. Clearly disclose any state that could not be opened or verified.
3. Select all five foundational personas unless the user narrows the audience.
4. Add only relevant behavioral overlays, operating scenarios, and usage contexts. State them explicitly.
5. Walk through the experience from each persona's mental model. Do not merely relabel the same generic usability critique five times.
6. Apply the rubric and severity definitions in the evaluation reference.
7. Separate observed interface behavior from persona-grounded inference and unsupported speculation.
8. Synthesize cross-persona conflicts, corner cases, and prioritized recommendations.

Use applicable product, Figma, browser, document, Slack, Drive, or meeting-transcript skills and tools to inspect the source faithfully.

## Learn from New Evidence

1. Treat provider statements and behavior as observations, not complete explanations of motivation.
2. Remove provider names, client names, locations precise enough to identify a person, protected health information, and unnecessary sensitive details.
3. Record the source type, date or period, observation, inferred need, relevant persona or overlay, contradiction status, and confidence.
4. Use the evidence lifecycle in [references/evolution-policy.md](references/evolution-policy.md).
5. Never promote one unusual interaction directly into a foundational trait.
6. If the user asks to incorporate evidence, append or update anonymized records in the registry. Otherwise return proposed records for approval.

## Calibrate the Model

1. Identify repeated patterns, unsupported traits, contradictions, and evidence gaps.
2. Distinguish changes to:
   - foundational personas;
   - behavioral overlays;
   - operating scenarios;
   - usage contexts;
   - evaluation rubric.
3. Present a concise before-and-after proposal with supporting evidence IDs, confidence, likely benefit, and risk of overgeneralization.
4. Apply approved changes, update the version and calibration date in the persona reference, and revalidate the skill.

## Default Evaluation Output

Lead with the consequential findings, then provide:

1. Test configuration and any access limitations.
2. Persona-by-persona reactions, including first interpretation, likely question, trust or control concern, probable action, failure risk, and severity.
3. Cross-persona conflicts and shared needs.
4. Corner cases and scenario-sensitive behavior.
5. Prioritized design recommendations.
6. Evidence versus inference notes when confidence is limited.

Keep the output proportionate to the artifact. Prefer a comparison table when several personas are evaluated against the same states.

## Guardrails

- Use composite personas only; never reproduce a real provider as a character.
- Do not infer competence, commitment, anxiety, financial hardship, or technology ability from age, identity, tone, grammar, or one delayed response.
- Do not equate part-time work with low engagement or variable availability with poor planning.
- Do not assume greater tenure means fluency in every Headstart tool.
- Treat financial health, intake velocity, autonomy, supervision, and clinical outcomes as recurring provider jobs, not as personalities.
- Preserve meaningful contradictions instead of averaging them away.
- Exclude the MVP brain dump from the evidence base unless the user explicitly reverses that instruction.
- Do not silently mutate this skill during a normal design evaluation.
