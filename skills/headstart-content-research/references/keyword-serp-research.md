# Keyword, SERP, And Competitive Research

## Purpose

Use search evidence to clarify the reader's need, the result-set expectations, the relevant topic
cluster, and Headstart's opportunity to add value. The approved opportunity remains the strategic
input. Search tools validate and enrich it; they do not autonomously select a new content strategy.

## Preferred Capability Sequence

Semrush is the preferred provider for keyword and organic-search metrics when it is available and
authenticated. Use the following capability groups in this order, stopping when additional calls
will not change the brief:

1. **Capacity check.** Confirm remaining API units before expensive discovery calls. Record the
   check without exposing account details.
2. **Seed and batch overview.** Retrieve the approved seed and candidate cluster together when
   possible. Capture database, volume, difficulty, CPC only when relevant to commercial intent,
   result count, and available intent or trend indicators.
3. **Cluster expansion.** Retrieve related terms, broad-match variants, and question queries. Keep
   only terms that map to the same reader job, a required subtopic, or an explicit objection.
4. **Organic result set.** Retrieve the top organic results for the primary query and any secondary
   query whose SERP appears materially different. Ten relevant results are normally sufficient;
   do not spend units collecting pages that will not be inspected.
5. **Current visibility.** Check Headstart's domain, relevant subfolder, or matching URL for existing
   rankings and competing internal URLs. Use first-party Search Console evidence when available to
   distinguish modeled visibility from observed impressions and clicks.
6. **Competitor context.** Use domain or URL organic-keyword evidence for a small number of true
   result-set competitors when it reveals adjacent subtopics or a gap. Backlink evidence is optional
   and should be used only when authority or linkable-asset strategy affects the page job.

These capability groups may be supplied through tools with different names. Do not encode one MCP
server's function identifiers into the packet or claim that a metric exists when the provider did
not return it.

### Semrush report-family mapping

When Semrush is the provider, the current report families normally map as follows:

| Research need              | Semrush report family                                              |
| -------------------------- | ------------------------------------------------------------------ |
| Unit budget                | API units balance                                                  |
| Seed metrics               | Keyword overview or single-database keyword overview               |
| Candidate metrics          | Batch keyword overview and keyword difficulty                      |
| Vocabulary and subtopics   | Related keywords, broad-match keywords, and phrase questions       |
| Result-set inventory       | Keyword organic results                                            |
| Headstart visibility       | Domain, subfolder, or URL organic keywords and ranks               |
| Competitor discovery       | Organic competitors and selected competitor domain or URL keywords |
| Optional authority context | Backlink overview, referring domains, anchors, and indexed pages   |

Use the active tool metadata as the source for exact parameters, unit costs, limits, and returned
fields because provider contracts can change. Prefer one batch call over repeated single-keyword
calls when it preserves the required evidence and consumes fewer units.

## Live Page Inspection

Keyword APIs do not replace reading the pages. Retrieve the relevant top-ranking pages and record:

- page type and primary audience;
- intent and primary reader outcome;
- recurring questions and necessary subtopics;
- evidence types and primary sources used;
- useful tools, frameworks, examples, or decision aids;
- content that appears generic, unsupported, outdated, or copied across competitors;
- conversion action and how aggressively it appears; and
- publication or update date when trustworthy.

Length is descriptive context only. Record it when it helps compare page types, but never compute a
target by averaging competitors or pad a draft to exceed them.

## Cluster Decisions

Classify every candidate query as:

- **primary:** clearest expression of the approved page job;
- **supporting:** same intent and useful natural vocabulary;
- **subtopic:** a question or concept the Resource should answer;
- **separate intent:** deserves a different opportunity or page; or
- **excluded:** irrelevant, misleading, unsupported, too broad, or outside Headstart's role.

Do not use volume as the only criterion. Consider intent fit, audience fit, serviceability,
authority, existing coverage, conversion role, and information gain.

## Information Gain Test

A proposed Resource should contain at least one defensible contribution beyond summarizing the
result set. Examples include:

- an approved Headstart process explanation;
- a clearer decision framework for the named audience;
- first-party operational or expert context approved for public use;
- a practical checklist, comparison, or next-step tool;
- current local or payer context from an authoritative source; or
- a useful synthesis that resolves contradictions in primary sources.

If the only differentiator is length, keyword repetition, or rephrasing competitors, return
`insufficient information gain` and request a stronger angle or source.
