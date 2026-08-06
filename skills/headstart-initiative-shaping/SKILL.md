---
name: headstart-initiative-shaping
description: Shape an ambiguous Headstart initiative into an evidence-backed problem statement, bounded outcome, decision register, risks, and targeted stakeholder questions. Use when starting or reframing cross-functional work, preparing architecture or product discovery, reconciling mixed source material, or turning an early idea into a reviewable decision packet.
compatibility: Requires access to the user-provided materials and, when requested, authenticated read capabilities for the relevant Headstart systems.
metadata:
  author: headstart-health
  version: '0.1.0'
---

# Headstart Initiative Shaping

Turn incomplete, distributed context into a decision-ready initiative definition. Preserve the
difference between known facts, supported inferences, assumptions, and decisions that still require
an owner.

## Authority And Defaults

- Begin read-only. Tool availability does not authorize broad searches or external writes.
- Use user-provided sources first. Expand into connected systems only when the requested scope makes
  that useful and the active permissions allow it.
- Prefer an authorized native connector for semantic reads from Gmail, Google Docs, Notion, Linear,
  or another system. Treat the connector as a capability provider, not part of the workflow contract.
- Search Gmail narrowly by named people, subject, initiative, or date range. Do not inventory an
  inbox merely because email access exists.
- Do not edit a shared document, create an issue, send a message, or change project state unless the
  user explicitly requests that write.

## Shape The Initiative

1. **Frame the request.** State the desired outcome, affected people, current pain, why it matters,
   and the decision or deliverable the current work should enable.
2. **Register the sources.** Record each material source with a stable source ID, system, title or
   identifier, date or version when available, and the part of the initiative it supports.
3. **Extract current understanding.** Separate:
   - confirmed facts supported by a cited source;
   - supported inferences, labeled as inferences;
   - working assumptions that remain unverified;
   - contradictions between sources; and
   - unresolved decisions with a named decision owner when known.
4. **Bound the work.** Define inputs, outputs, actors, systems, success measures, constraints,
   dependencies, non-goals, and the human-review boundary.
5. **Pressure-test the shape.** Check alternatives, failure modes, reversibility, operational burden,
   privacy or compliance exposure, adoption risk, and what would make the proposed approach wrong.
6. **Ask only useful questions.** Do not ask for facts already supported by the available evidence.
   State the current understanding first, then ask one focused confirmation or decision at a time.
7. **Produce the decision packet.** Follow [references/decision-packet.md](references/decision-packet.md).

## Source Roles

- Treat Google Docs and Notion as collaborative planning sources whose authority must be established
  when overlapping copies exist.
- Treat Linear as execution state, ownership, and delivery history unless an issue is explicitly the
  requirements source.
- Treat Gmail as communication evidence, not automatically as the latest approved decision.
- Treat recordings, transcripts, and generated meeting summaries as dated evidence that may need
  confirmation against current systems or documents.
- Treat application code and business systems as authoritative only for the behavior or records they
  actually own.

## Completion Standard

Return a packet that lets a stakeholder see what is known, what is inferred, what remains undecided,
where to answer, and what downstream work each answer unlocks. Use stable IDs such as `F-01`,
`A-01`, `D-01`, `Q-01`, and `R-01` so answers and later revisions remain traceable.

When evidence is insufficient, return the bounded packet and the smallest set of missing decisions.
Do not create false completeness by inventing requirements or silently selecting among conflicts.
