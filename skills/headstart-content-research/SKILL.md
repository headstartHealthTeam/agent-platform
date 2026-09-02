---
name: headstart-content-research
description: Turn one approved Headstart content opportunity into a bounded, evidence-backed research packet and SEO-informed brief. Use when an agent needs to validate the opportunity, expand its keyword and question cluster, inspect relevant search competitors, identify information gain, reconcile approved internal context, and hand a frozen packet to a writer without drafting or publishing the Resource.
compatibility: Requires access to the exact approved opportunity source plus authenticated keyword and organic-search research, web-page retrieval, and approved Headstart source materials. Semrush is the preferred keyword and SERP evidence provider when available.
metadata:
  author: headstart-health
  version: '0.2.1'
---

# Headstart Content Research

Produce a traceable research packet for one approved Headstart content opportunity. The packet is
the evidence and brief boundary for later drafting. It must help a writer create something useful,
specific, and accurate without giving the writer an open-ended mandate to browse, reinterpret the
content strategy, or chase keyword volume.

Read these references before starting:

- [approved opportunity intake](references/approved-opportunity-intake.md);
- [keyword, SERP, and competitive research](references/keyword-serp-research.md); and
- [research packet contract](references/research-packet-contract.md).

## Capability And Authority Boundary

This skill requires:

- retrieval of the exact approved opportunity and its source revision;
- authenticated keyword and organic-search evidence, preferably Semrush;
- retrieval of the current public pages selected for competitive analysis;
- narrowly scoped access to approved Headstart strategy, public content, and operational facts; and
- optional first-party search evidence when it materially clarifies current Headstart visibility.

The active host may provide these through native connectors, MCP servers, browser control, APIs,
or CLIs. Confirm availability, authentication, permission scope, and whether each capability is
read-only before using it. Tool availability is not approval to search broadly or mutate a source.

This skill is read-only and proposal-only. It does not approve an opportunity, draft the final
Resource, change the approved strategy, write to the CMS, notify reviewers, or publish content.

## Inputs

Require:

1. one approved opportunity with a stable identifier and exact source location;
2. the source revision, retrieval time, or other freshness evidence;
3. primary audience, pillar, journey stage, reader need, and intended conversion role;
4. approved seed topic or keyword cluster when one exists; and
5. the market, language, and geographic scope.

Accept approved source links, internal context, existing Headstart URLs, and candidate sources as
supporting inputs. Treat missing required fields as gaps, not permission to infer a new strategy.

## Research Workflow

1. **Resolve the opportunity.** Retrieve only the referenced opportunity and the minimum supporting
   rows or sections needed to understand it. Record the source identity, revision, approval state,
   and retrieved fields. Stop if approval or identity cannot be established.
2. **Check existing Headstart coverage.** Find the closest current Resources and relevant audience,
   location, or conversion pages. Identify duplication, cannibalization, refresh opportunities,
   contextual outbound destinations, and defensible inbound source pages before recommending a new
   page. Distinguish live canonical routes from planned or redirected routes.
3. **Validate search demand and intent.** Use the approved seed cluster as the starting hypothesis.
   Gather current volume, difficulty, intent-relevant SERP evidence, and Headstart visibility. Expand
   into related terms, broad-match variants, and questions only when they express the same reader
   job or a necessary subtopic.
4. **Inspect the live result set.** Identify the top relevant organic results, then retrieve and
   inspect the pages themselves. Separate true editorial competitors from directories, ads,
   forums, videos, tools, and unrelated intent. Record recurring coverage, useful formats, gaps,
   weak claims, and conversion patterns.
5. **Find information gain.** State what Headstart can add that a generic synthesis cannot: an
   approved operational fact, first-party explanation, audience-specific decision aid, clearer
   framework, current local context, original example, or named expert input. If no defensible
   information gain exists, recommend revising or rejecting the opportunity instead of drafting
   commodity content.
6. **Build the evidence ledger.** Preserve source title, URL or stable identifier, publisher,
   retrieval date, relevant section, supported claim, sensitivity, and freshness. Distinguish
   primary or authoritative sources, Headstart-approved facts, and competitor observations.
7. **Prepare the brief.** Define the page job, reader outcome, primary query and supporting cluster,
   required subtopics, semantic structure, claim constraints, outbound and inbound internal-link
   architecture, CTA, conversion role, imagery needs, and unresolved questions. For family
   Resources, also identify the reader's likely entry question, the practical or emotional context
   supported by evidence, the order in which decisions occur, terms that need introduction, and
   concrete questions or examples for each stage. For every proposed link, preserve route, page
   job, placement, anchor direction, reader rationale, destination state, and validation result.
   Competitor length may be recorded as context but must not become a word-count target.
8. **Freeze and hand off.** Produce the complete packet defined in
   [the contract](references/research-packet-contract.md), assign a packet identifier and version,
   and stop. Later changes create a new packet version rather than silently replacing evidence.

## Evidence Rules

- Use search data to understand demand and result-set expectations, not to manufacture authority.
- Do not treat search volume as expected traffic, leads, or business value.
- Do not use a competitor as the factual source for a health, insurance, legal, geographic,
  availability, timing, outcome, or quantitative claim when a primary or approved source exists.
- Do not copy competitor phrasing, structure, examples, or distinctive expression.
- Do not make every related query a required heading. Cluster by reader job and semantic need.
- Do not use an arbitrary internal-link quota, generic anchors, keyword-stuffed anchors, ordinary
  internal `nofollow` recommendations, or unverified planned routes represented as live.
- Do not force exact-match phrases, target a preferred word count, or recommend scaled low-value
  content merely because keyword data exists.
- Do not include PHI, private records, credentials, raw private documents, or unrestricted file
  URLs in a packet.
- Mark conflicts, unsupported claims, stale sources, and judgment calls explicitly.

## Failure And Degraded Modes

- If the approved opportunity cannot be resolved, stop and return the exact missing identifier,
  source, revision, or approval evidence.
- If Semrush is unavailable or lacks units, use another authorized keyword/SERP provider only when
  it supplies equivalent evidence. Otherwise produce a partial packet that clearly marks keyword
  metrics and competitive validation as incomplete.
- If a ranking page cannot be retrieved, record the failed read and do not infer its contents from
  a title or snippet.
- If sources conflict or a sensitive claim lacks authoritative support, exclude it from the brief
  or route it as a human question.
- If the result set indicates a different intent than the approved opportunity, return the evidence
  as a strategy-reconciliation request. Do not rewrite the approved opportunity silently.

## Completion Standard

The packet is complete only when another authorized agent can draft from it without reconstructing
the research, and a reviewer can trace every factual direction back to evidence. It must preserve
the approved opportunity rather than replacing strategy with a fresh keyword brainstorm.
