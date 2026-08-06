---
name: headstart-discovery-to-decision
description: Turn mixed Headstart discovery materials into a stakeholder-ready decision packet by sequencing workflow walkthrough analysis, initiative shaping, and substantive document review. Use when a user has recordings, notes, emails, documents, issues, or system evidence and wants a coherent current-state analysis plus the smallest set of decisions needed before planning or implementation.
compatibility: Requires the three declared Headstart skills plus access to the user-approved source materials. Remote edits require separate explicit user intent.
metadata:
  author: headstart-health
  version: '0.1.0'
  headstart-requires: 'headstart-workflow-walkthrough-analysis, headstart-initiative-shaping, headstart-document-review'
---

# Headstart Discovery To Decision

Compose three bounded skills into one evidence-preserving workflow. Run sequentially in one agent by
default. Composition does not require subagents; use parallel workers only for genuinely independent
source sets when the active host supports them and parallelism materially improves the result.

## Dependencies And Handoffs

1. `headstart-workflow-walkthrough-analysis` owns reconstruction of demonstrated operational work.
   It returns a dated workflow map, source register, observed or stated claims, human decisions,
   failure modes, automation boundary, and unresolved operational questions.
2. `headstart-initiative-shaping` owns reconciliation of all available evidence into scope, current
   understanding, assumptions, decisions, risks, stakeholder questions, and the recommended next
   slice. It preserves source and claim identifiers from the walkthrough output.
3. `headstart-document-review` owns the final substantive quality pass. It returns prioritized
   findings about correctness, contradictions, decision readiness, answer locations, evidence, and
   safety. It does not edit the draft unless the user separately requests that write.

If any dependency is unavailable, identify it and stop before claiming the composed workflow is
complete. The agent may inventory the sources and explain the blocked handoff, but must not silently
replace a missing dependency with an undocumented process.

## Workflow

1. **Confirm the outcome and write boundary.** Determine whether the user wants an in-chat packet, a
   draft for an existing document, or approved edits. Default to an in-chat, read-only result.
2. **Create one source register.** Deduplicate links and artifacts. Establish the likely canonical
   planning document when Google Docs and Notion overlap. Scope any Gmail retrieval narrowly. Treat
   Linear as execution state unless explicitly designated otherwise.
3. **Analyze operational evidence when present.** Invoke
   `headstart-workflow-walkthrough-analysis` for recordings, transcripts, meeting notes, screenshots,
   or process demonstrations. Skip this step only when no source describes an operational workflow.
4. **Shape the initiative.** Invoke `headstart-initiative-shaping` with the source register,
   walkthrough output, current planning artifacts, relevant communication evidence, and current
   delivery state. Preserve source citations and stable IDs.
5. **Review the packet.** Invoke `headstart-document-review` in report-only mode against the shaped
   packet and its source claims. Resolve objective corrections in the draft; leave judgment calls as
   explicit decisions unless the user has already supplied the answer.
6. **Present the result.** Return:
   - current-state workflow and evidence coverage;
   - bounded initiative outcome and non-goals;
   - confirmed facts, inferences, assumptions, and contradictions;
   - decision and question register with exact answer locations;
   - risks and automation boundary;
   - final review findings and residual limitations; and
   - the smallest useful next slice.
7. **Handle writes separately.** After the user reviews the packet, apply only explicitly requested
   Google Docs, Notion, Linear, repository, email, or other external changes through the authorized
   capability for that system.

## Completion Standard

The final packet must remain traceable from a decision or question back to its supporting source. It
must distinguish operational facts from delivery-team design choices and make clear what stakeholders
must answer versus what the implementation team can decide.

Do not perform broad inbox or workspace searches, create planning items, send messages, or mutate a
shared document merely because the required connector is available.
