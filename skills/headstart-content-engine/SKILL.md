---
name: headstart-content-engine
description: Create or revise a review-ready Headstart public Resource from an approved content opportunity by composing research, Headstart tone and voice, public-website aesthetics, evidence checks, and a bounded quality loop. Use for supervised Content Engine V1 runs that must return a traceable draft bundle without writing to the CMS, approving, scheduling, or publishing content.
compatibility: Requires the three declared Headstart skills plus access to the approved opportunity and authorized read capabilities. Candidate-image creation and private review-artifact export also require explicit authority and suitable capabilities. A CMS write, preview, notification, approval, schedule, or publication requires a separately authorized application action.
metadata:
  author: headstart-health
  version: '0.1.1'
  headstart-requires: 'headstart-content-research, write-headstart-tone-and-voice, design-headstart-public-website'
---

# Headstart Content Engine

Turn one approved opportunity into a complete, evidence-backed Headstart Resource proposal or
revise an existing proposal from structured human feedback. This is the portable, person-supervised
Content Engine V1 workflow. It does not create a managed cloud runtime or replace application-owned
review and publication state.

Read the supporting references before execution:

- [workflow architecture](references/architecture.md);
- [artifact contracts](references/artifact-contracts.md);
- [initial-draft workflow](references/create-initial-draft.md);
- [revision workflow](references/revise-draft.md);
- [search, links, headings, and image guidance](references/search-links-and-assets.md); and
- [quality rubric](references/quality-rubric.md).

## Dependencies And Ownership

1. `headstart-content-research` owns opportunity resolution, search and competitor evidence,
   information-gain analysis, the source ledger, and the frozen research packet. It does not draft.
2. `write-headstart-tone-and-voice` owns audience-facing language, audience adaptation, role
   clarity, and fact-preserving Headstart voice. It does not select facts or research strategy.
3. `design-headstart-public-website` owns the public Resource's visual direction, image brief,
   component-aware presentation guidance, candidate-image inspection, and rendered visual review.
   It does not authorize asset generation, licensing, CMS upload, or factual claims.

The workflow owns sequencing, handoffs, context boundaries, revision behavior, and completion. If a
dependency is unavailable, name it and stop before claiming the workflow completed. Do not replace
a missing dependency with an undocumented approximation.

## Choose The Run Mode

Use exactly one mode:

- **initial draft:** begin from one approved opportunity, build or accept its frozen research
  packet, then create and verify one draft bundle;
- **revision:** begin from an exact draft revision, its frozen packet, and structured human feedback,
  then return a new revision bundle and change ledger; or
- **verification only:** evaluate an exact draft bundle against its packet and the quality rubric
  without rewriting it.

Do not combine multiple opportunities into one run. Do not treat free-form brainstorming, a keyword
idea, or an unapproved outline as an approved opportunity.

## Shared Workflow

1. **Establish the boundary.** Record run mode, exact input identifiers and versions, target
   audience, authorized read capabilities, image-selection or generation authority, review-artifact
   export authority, application-write boundary, and expected output.
2. **Resolve inputs.** Retrieve only the named opportunity, packet, draft revision, feedback, and
   supporting sources. Preserve stable IDs and source revisions.
3. **Execute the mode-specific procedure.** Follow
   [initial drafting](references/create-initial-draft.md),
   [revision](references/revise-draft.md), or the verification section of
   [the quality rubric](references/quality-rubric.md).
4. **Use bounded verification.** Evaluate the complete proposal against deterministic completeness
   checks and the evidence, usefulness, voice, search, visual, safety, and operational rubric.
   Permit at most one repair pass for a new draft and one repair pass for a revision. A second
   substantive failure becomes a human-review item rather than another silent rewrite.
5. **Return a traceable bundle.** Include artifact IDs, versions, source and claim references,
   verifier results, unresolved items, and a concise human handoff. State explicitly that no CMS
   write, approval, schedule, publication, or notification occurred.

## Context And Tool Discipline

Run sequentially under one coordinator by default. Use an isolated writer context after the
research packet is frozen and an isolated verifier context when the active host supports reliable
context separation. Isolation means the writer receives the packet and applicable skills rather
than the researcher's browsing transcript, and the verifier receives the packet plus exact draft
rather than the writer's private reasoning.

Do not create one agent per step. Parallel work is appropriate only for independent source sets and
only when synthesis still has one owner. If context isolation is unavailable, use explicit artifact
handoffs and restate the verifier's independence requirement.

The writer must not browse freely to patch gaps. A missing material fact returns to research and
creates a new packet version. The verifier must not introduce new claims while correcting prose.

## Side-Effect Boundary

This skill produces proposals only. With explicit user intent, it may create a candidate image and
export the exact proposal to a private review artifact. Those are review outputs, not application
state or publication. Record the authorization, capability, destination, and resulting artifact
identity.

This skill does not:

- create or update a Resource record;
- upload an image to the CMS, assert licensing, or approve an image for publication;
- generate a public or secure preview;
- send Slack or email notifications;
- request, record, or imply approval;
- schedule or publish content; or
- update the approved opportunity source.

Those actions belong to permission-aware backend and admin capabilities and require explicit user
intent. Connector availability is not authorization. A future managed workflow must reference this
canonical skill and add only its typed trigger, identity, durable state, retry, and operating policy.

## Safety And Evidence Rules

- Never invent, estimate, or smooth over missing evidence.
- Preserve qualifiers and distinguish Headstart, independent practices, clinicians, families,
  RBTs, employers, payers, and other actors.
- Escalate clinical, insurance, legal, geographic, availability, timing, outcome, and quantitative
  claims when the packet does not provide authoritative support.
- Do not include PHI, credentials, private records, raw private documents, or unrestricted file
  URLs in artifacts or evaluation fixtures.
- Do not copy competitor expression, reproduce long source passages, or draft scaled low-value
  content for the purpose of ranking.
- Do not overwrite or weaken a later human revision. Human edits and explicit decisions are
  authoritative for the revision they produce.
- Do not claim a rendered-page, accessibility, link, or responsive check passed unless the required
  implementation or preview capability was actually available and used.
- Do not write alt text for an unseen candidate image. Inspect the exact asset first, then describe
  its meaning or function in the Resource context.

## Completion Standard

A run is complete only when its bundle satisfies the relevant artifact contract, every material
claim is traceable or explicitly unresolved, the quality report records pass and failure evidence,
and the human handoff identifies the exact revision under review. Polished prose alone is not a
complete Content Engine run.
