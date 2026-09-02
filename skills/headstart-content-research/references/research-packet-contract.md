# Research Packet Contract

## Packet Identity

Every packet has:

- `packetId`;
- `packetVersion`;
- `createdAt`;
- `opportunityId`;
- exact `opportunitySource` and `sourceRevision`;
- research-provider names and retrieval dates; and
- packet status: `complete`, `partial`, `needs_strategy_reconciliation`, or `blocked`.

Never silently mutate a packet used for drafting. New evidence or a changed opportunity creates a
new version and identifies what changed.

## Required Sections

### 1. Opportunity Snapshot

Preserve the approved audience, pillar, journey stage, reader need, conversion role, seed cluster,
market scope, constraints, and approval evidence. Separate verbatim source fields from researcher
interpretation.

### 2. Existing Headstart Coverage

List relevant current URLs or planned Resources, their page jobs, overlap, internal-link role,
canonical or redirect state, and whether the opportunity should create, refresh, consolidate, or
stop. Identify both destinations the new Resource should link to and current or planned pages that
could link into it.

### 3. Search Opportunity

Include:

- primary query and rationale;
- supporting queries and required subtopics;
- excluded or separate-intent queries with reasons;
- source database, date, and available volume or difficulty metrics;
- current Headstart visibility, distinguishing modeled from observed data; and
- material limitations or missing metrics.

### 4. Result-Set And Competitor Findings

Identify the result set inspected, relevant page types, recurring coverage, content formats,
credible evidence patterns, weak or missing coverage, conversion patterns, and optional descriptive
length observations. Do not reproduce competitor expression or turn frequency into a mandatory
outline.

### 5. Information-Gain Thesis

State the specific contribution Headstart can make, the evidence that supports it, and what would
make the proposed Resource materially more useful than a generic synthesis.

### 6. Evidence And Claim Ledger

For each material claim or direction, record:

| Field              | Meaning                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `claimId`          | Stable packet-local identifier                                                                 |
| `claimOrDirection` | Fact, constraint, or editorial direction supported                                             |
| `sourceId`         | Stable source URL or identifier                                                                |
| `sourceTitle`      | Human-readable title                                                                           |
| `publisherOrOwner` | Source authority                                                                               |
| `retrievedAt`      | Retrieval date and time when available                                                         |
| `locator`          | Section, heading, page, table, or concise anchor                                               |
| `sourceRole`       | Primary, authoritative, approved Headstart, first-party performance, or competitor observation |
| `sensitivity`      | Clinical, insurance, legal, geographic, availability, outcome, quantitative, or ordinary       |
| `status`           | Supported, partial, conflicting, stale, missing, or human review required                      |
| `notes`            | Qualifiers and prohibited interpretations                                                      |

### 7. Writer Brief

Provide:

- working title and page job;
- audience, likely entry question, and emotional or practical need supported by the opportunity or
  evidence rather than inferred as fact;
- reader outcome;
- decision sequence or journey stage showing when the reader can use each major section;
- recommended semantic H1/H2/H3 structure and required subtopics;
- clinical or industry terms that must be introduced before shorthand is used;
- practical examples, questions, or preparation details mapped to the stage where they are useful;
- claims to include, qualify, exclude, or escalate;
- natural keyword and terminology guidance;
- outbound internal links with exact target route, destination page job, proposed placement and
  anchor direction, reader rationale, target state, and validation result;
- inbound internal-link opportunities with source route, source page job, insertion context,
  proposed anchor direction, reader rationale, source state, and validation result;
- primary CTA and conversion context;
- proposed slug and content type;
- imagery or visual-asset brief with purpose, placement, subject, exclusions, aspect and focal-point
  needs, authorized asset class, and whether candidate generation or selection is still required;
- accessibility considerations; and
- success measures supplied by the approved opportunity.

The outline is a reasoned brief, not a rigid competitor-derived template.

### 8. Open Questions And Limitations

List unresolved evidence, strategy conflicts, reviewer questions, unavailable capabilities, stale
sources, and downstream decisions. State whether each blocks drafting or can remain an explicit
review item. Give each item a stable `itemId`, concise `summary`, `blocking` boolean, and
`requiredReviewerRole`. The reviewer role must be `clinical`, `insurance_operations`,
`legal_compliance`, `brand`, `website_product`, or `null`; it is an enforceable application code,
not a free-text job title or assignee name. Use `null` when attestation by one of those qualified
roles cannot resolve the item.

## Writer Handoff

The writer receives the frozen packet, not the researcher's full browsing history. Preserve packet,
opportunity, source, and claim IDs so later verification can distinguish source failure, drafting
failure, strategy change, and human override.
