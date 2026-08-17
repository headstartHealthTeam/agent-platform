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

List relevant current URLs or planned Resources, their page jobs, overlap, internal-link role, and
whether the opportunity should create, refresh, consolidate, or stop.

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
- audience and emotional or practical need;
- reader outcome;
- recommended structure and required subtopics;
- claims to include, qualify, exclude, or escalate;
- natural keyword and terminology guidance;
- internal links and why each helps;
- primary CTA and conversion context;
- proposed slug and content type;
- imagery or visual-asset brief;
- accessibility considerations; and
- success measures supplied by the approved opportunity.

The outline is a reasoned brief, not a rigid competitor-derived template.

### 8. Open Questions And Limitations

List unresolved evidence, strategy conflicts, reviewer questions, unavailable capabilities, stale
sources, and downstream decisions. State whether each blocks drafting or can remain an explicit
review item.

## Writer Handoff

The writer receives the frozen packet, not the researcher's full browsing history. Preserve packet,
opportunity, source, and claim IDs so later verification can distinguish source failure, drafting
failure, strategy change, and human override.
