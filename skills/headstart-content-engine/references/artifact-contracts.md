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

- editorial title and proposed stable slug;
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

- SEO title distinct from the visible title when useful;
- search and social description;
- canonical route proposal;
- internal-link targets and anchor rationale; and
- structured-data considerations supplied for later implementation, not a fabricated pass result.

### Image and accessibility fields

- image purpose and scene brief;
- approved-source or licensing requirement;
- crop and focal-point guidance;
- proposed alt text only when the image is known;
- decorative-image classification where applicable; and
- open asset or provenance questions.

### Evidence and review fields

- claim-to-source map using packet claim IDs;
- sensitive claims and required reviewer roles;
- known limitations and unresolved questions;
- content decisions made beyond the source and why; and
- a concise reviewer summary.

## Verification Report

Record:

- exact draft ID and revision;
- each quality gate as `pass`, `fail`, `not_checked`, or `human_review`;
- field or section location;
- supporting claim or rule ID;
- severity and actionable correction;
- whether a repair pass occurred;
- remaining blocking and non-blocking findings; and
- capabilities that were unavailable, including rendered preview or link validation.

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
