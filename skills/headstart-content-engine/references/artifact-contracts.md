# Content Engine Artifact Contracts

These runtime-neutral contracts define the minimum handoff shape for supervised V1. They are not a
backend database schema and do not create application state.

## Shared Identity

Every artifact records:

- stable artifact ID and version;
- run mode and creation time;
- opportunity ID and source revision;
- research packet ID and version;
- predecessor artifact when applicable;
- creator role or execution context;
- status and unresolved-item count; and
- exact skill and reference versions when the host can provide them.

## Research Packet

Use the complete contract owned by `headstart-content-research`. The content engine may consume but
must not redefine or silently mutate it.

## Draft Bundle

A draft bundle contains:

### Resource fields

- editorial title, one explicit visible H1, and proposed stable slug;
- semantic heading outline with each H2/H3 label and reader purpose;
- excerpt or description;
- body in the supported rich-text or structured-content format;
- primary and secondary audiences;
- content type, primary Resource category, and optional topics;
- primary CTA label, destination, and rationale;
- up to three related Resource proposals with relationship reasons;
- proposed contributor role and any unresolved attribution need;
- optional transcript requirement;
- reading-time input or explicit unresolved state; and
- featured, new, or highlight recommendations only when the approved opportunity supplies them.

### Search and social fields

- clearly labeled `titleTag`, distinct from the visible H1 when useful;
- clearly labeled `metaDescription` and any separate social description;
- canonical route proposal;
- diagnostic character counts without treating them as Google pass/fail limits;
- outbound internal-link proposals with target route, destination page job, anchor text, source
  section or sentence, reader rationale, target state, and validation result;
- inbound internal-link opportunities with source route, source page job, insertion context, anchor
  text, reader rationale, source state, and validation result; and
- structured-data considerations supplied for later implementation, not a fabricated pass result.

### Image and accessibility fields

- image requirement, purpose, scene brief, and intended placement;
- asset state: `brief_only`, `candidate_generated`, `candidate_selected`, `approved_existing_asset`,
  or `blocked`;
- exact candidate identifier or review-artifact reference when an asset exists;
- generation or source provenance, authorization, creation or retrieval time, dimensions, and a
  short prompt or selection rationale without exposing private chain-of-thought;
- approved-source or licensing requirement without an unsupported rights claim;
- descriptive filename proposal plus crop, focal-point, and responsive-aspect guidance;
- alt text written after inspecting the exact image, or an explicit empty-alt decision with reason;
- decorative-image classification where applicable; and
- visual-inspection status, objective defects, repair count, and open asset or provenance questions.

### Evidence and review fields

- claim-to-source map using packet claim IDs;
- sensitive claims and required reviewer roles;
- known limitations and unresolved questions;
- content decisions made beyond the source and why; and
- a bounded reviewer summary organized around the decisions a person needs to make.

### Optional private review artifact

When explicitly authorized, the review artifact contains the exact verified bundle and makes these
items easy to find rather than burying them in notes:

- title tag, meta description, canonical route, visible H1, and marked H2/H3 outline;
- outbound and inbound internal-link maps;
- reader-facing hyperlinks preserved as native clickable links with clearly distinguishable,
  non-color-only visual affordances such as underlining;
- embedded candidate image, asset state, filename, placement, provenance, and exact alt text; and
- reviewer decisions, unresolved items, verification status, and artifact identity.

Record the destination identifier, access state, export time, and post-write verification. Export
does not authorize a CMS upload, approval, schedule, publication, or notification.

## Verification Report

Record:

- exact draft ID and revision;
- each quality gate as `pass`, `fail`, `not_checked`, or `human_review`;
- field or section location;
- supporting claim or rule ID;
- severity and actionable correction;
- whether a repair pass occurred;
- remaining blocking and non-blocking findings; and
- capabilities that were unavailable, including route validation, asset generation or inspection,
  reviewer-artifact export, rendered preview, or implementation-level link validation.

## Revision Bundle

A revision bundle contains the full new draft bundle plus:

- predecessor draft ID and revision;
- feedback source and feedback item IDs;
- change ledger with affected fields or sections;
- human edits preserved;
- packet-version change when research was reopened;
- declined, blocked, and unresolved feedback with reasons; and
- verification report for the new revision.

## Human Handoff

End every run with:

- artifact and revision under review;
- what the Resource helps the reader do;
- material evidence and information-gain summary;
- sensitive or unresolved items;
- verification status and checks not performed;
- exact next human action; and
- explicit statement that no CMS write, approval, schedule, publication, or notification occurred.
