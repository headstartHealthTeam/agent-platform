---
name: headstart-workflow-walkthrough-analysis
description: Analyze a Headstart process walkthrough, recording, transcript, meeting note, screenshot sequence, or demonstration into a cited current-state workflow with triggers, actors, systems, inputs, outputs, human decisions, failure modes, and open questions. Use when documenting how operational work is actually performed or preparing an automation discovery effort.
compatibility: Requires readable source material or an authorized capability that can retrieve it. Media transcription is optional when a transcript or reliable notes are available.
metadata:
  author: headstart-health
  version: '0.1.0'
---

# Headstart Workflow Walkthrough Analysis

Extract operational evidence from a walkthrough without mistaking one dated demonstration for the
current approved process.

## Evidence Boundary

- Record which artifacts were actually inspected. Never imply that a recording or attachment was
  reviewed when only a generated summary was available.
- Prefer the original recording, transcript, screenshots, and linked documents when authorized and
  practical. A generated meeting summary is secondary evidence.
- Cite timestamps, pages, sections, screen states, or source identifiers when available.
- Label statements as `observed`, `stated`, or `inferred`. Do not merge these categories silently.
- Minimize sensitive details in the analysis. Use role names and system identifiers unless a real
  person's identity is necessary to understand ownership.

## Analyze The Workflow

1. **Establish scope.** Identify the workflow name, recording or artifact date, demonstrated case,
   intended audience, and whether the walkthrough describes current state, a proposal, or both.
2. **Inventory systems and artifacts.** List each application, queue, document, form, notification,
   and record involved. Note where the demonstrated location was not shown or remains uncertain.
3. **Identify the trigger.** Distinguish the upstream business event from the downstream readiness
   signal that should begin the analyzed work.
4. **Reconstruct every step.** Use [references/workflow-analysis-schema.md](references/workflow-analysis-schema.md)
   to capture actor, system, inputs, action, output, human judgment, evidence, and exceptions.
5. **Trace data movement.** Identify where information originates, where it is copied, which system
   owns it, and where identifiers link records across systems.
6. **Surface operational risk.** Capture redundant entry, manual calculations, lost-state hazards,
   ambiguous matching, permission boundaries, signatures, communications, and irreversible actions.
7. **Separate automation opportunities.** Classify deterministic transformations, retrieval,
   model-assisted extraction or classification, human decisions, and prohibited or high-risk writes.
8. **Verify currency.** Compare material claims with current documents, systems, or repository code
   when those sources are available. Mark unverified changes instead of assuming the walkthrough is
   still current.
9. **Ask targeted follow-ups.** State the observed direction and ask only what the sources cannot
   establish. Distinguish a required operational fact from a product or architecture choice the
   delivery team can make.

## Connector Use

- Use an authorized native Google Drive capability for linked Docs, Slides, or recordings when it
  can retrieve the required evidence.
- Use Gmail only for a narrowly scoped communication gap, not as a substitute for the demonstrated
  workflow or its system of record.
- Use Linear to understand delivery history or open implementation work, not to overwrite observed
  operational facts.
- Use Notion when the relevant procedure or planning artifact lives there. If Google Docs and Notion
  conflict, identify the likely canonical source and request confirmation when authority is unclear.

## Completion Standard

Return a dated, source-grounded current-state map, unresolved questions, and automation boundary.
State what was not shown or could not be accessed. Do not jump directly from a pain point to a final
architecture, claim submission or another external action was completed, or convert a human judgment
into an automated rule without explicit supporting policy.
