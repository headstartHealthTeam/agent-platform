# Branded demand, visibility, and click-through

Complete this diagnostic before each monthly executive summary. Its purpose is to determine what
changed, not to explain away a decline or manufacture a positive SEO result. The agent selects the
useful cohorts, tests competing explanations, and writes the conclusion. Existing Search Console
read capabilities and retained calculations provide the evidence; no new service or managed engine
is required for these exploratory slices.

## 1. Establish the click movement and its limits

- Retain the canonical public-host totals and source-filtered brand and non-brand observations for
  each complete reporting period. Use the approved brand regex consistently and inspect ambiguous
  matches; a brand-like word can also refer to another organization or generic intent.
- Request each filtered total from Search Console. Do not substitute a sum of returned query rows
  or label `total - nonbrand` as branded traffic. Anonymized queries and internal reporting limits
  mean the two filtered groups need not account for all clicks. Show the unclassified residual when
  reconciling the same scope, without assigning its intent.
- Identify material whole-query gains/losses. Query-to-page rows explain destinations but can count
  several results from one search; they are not a measure of total market demand.
- Keep GA4 organic sessions and outcomes separate. Do not allocate sessions between brand and
  non-brand using Search Console click percentages or infer that all homepage visits are branded.

## 2. Test demand rather than equating it with clicks

Select and record a fixed set of relevant brand queries present in both periods. Explain coverage
and selection, distinguish navigational, careers, and care-related intent where useful, and retain
new/lost queries separately. Do not silently replace the canonical brand definition with this
diagnostic cohort. Reassess its representativeness without changing membership mid-comparison.

For both periods collect clicks, impressions, CTR, and average top-result position with the same
market, device coverage, search type, and aggregation. Prefer `byProperty` for the demand diagnostic:
page aggregation can count several URLs/sitelinks in one result and dilute CTR as result coverage
expands. Search Console cannot combine property aggregation with a page dimension or page filter.
Use an accessible URL-prefix property when it represents the intended scope. If only a domain
property is available, label the inclusion of subdomains and keep this diagnostic separate from
public-host KPIs. Never remove the public-host filter from the canonical report to make the query run.

Use impressions for a consistently prominent, near-top result as a **directional demand proxy**,
not an exact census of searches. Check ranking and impression coverage before interpreting a drop.
Changes in rank, indexing, geography, search appearance or query composition can change impressions
without a corresponding change in demand. When these cannot be distinguished, say so.

- Preserve complete-month totals. Add impressions per calendar day and their relative change for
  unequal months; do not scale or overwrite the original totals. Consider weekday-aligned checks
  when calendar mix could change the conclusion.
- Inspect the available earlier trajectory, normally several months within the historical-context
  window. A decline from a strong prior month is not automatically a sustained decline or seasonality.
  Use comparable prior-year history when available; never invent missing months.
- Break material movement down by device and market. A stable aggregate can hide lower mobile
  demand offset by desktop growth. If CTR changes, compare within-device CTR as well as device mix.
- Check the actual public landing page/top result when a broader domain diagnostic could conceal
  a change in which property or page appears. A page-level average across many URLs is not the rank
  of the top result.

Use tools or formulas to calculate `CTR = clicks / impressions`, impressions per calendar day,
absolute changes and relative changes; preserve missing versus zero. Retain the executable
calculation or formulas and independently reconcile them to the source snapshots. A zero prior
denominator makes relative growth undefined, not zero. A missing row is not zero demand.
If a click-change decomposition is useful, describe its mathematical convention and call its
components impression and CTR effects, not percentages causally explained by demand or an initiative.

## 3. Triangulate market demand where available

Use the configured Semrush keyword-research capability for the same queries and market, including
its monthly trend/history when available. A current 12-month average volume is not the reporting
month's volume. Verify period labels, series length, extraction date, provider methodology and any
keyword-level update date before aligning a trend. Do not multiply average volume by a normalized
trend index to invent exact monthly searches, treat absent/short history as zero, or sum normalized
indices across keywords as market volume.

The documented Keyword Overview chart ends in the previous month, but do not assume every provider
response exposes a complete, freshly updated, calendar-aligned series. Record what the actual
binding returns. A current-only ranking snapshot cannot reconstruct historical demand. If market
estimates conflict with near-top first-party observations, disclose the conflict and limits rather
than averaging them or choosing the source that supports the preferred story. Google Trends or
authorized keyword-planning evidence may help when available; low volume or unavailable access can
leave the market-demand conclusion unresolved. Do not introduce UI login or install a provider as a
silent prerequisite for the established MCP workflow.

## 4. Report a useful conclusion

In the existing executive/scorecard narrative and Performance Highlights, distinguish:

1. **Observed performance:** public-host clicks, non-brand visibility/clicks, sessions and outcomes.
2. **Demand evidence:** fixed-query impressions per day, ranking stability and market estimates.
3. **Click capture:** CTR and device/market differences after accounting for exposure and ranking.
4. **Interpretation:** what the evidence supports, what conflicts, confidence and the next useful check.

Put the comparison detail and scope in Search Visibility and Methodology, with retained raw evidence
and source links. Preserve the approved template and unrelated report content. Use the existing
narrative bindings for the summary; when the detail exceeds them, make a bounded, explicitly labeled
appendix to the report and record the exact write/readback separately from the base-template plan.
Do not silently change the canonical template, squeeze unreadable text into cells, or claim that
base-template replay validates a later appendix. Any future template change needs its own version.

A useful conclusion can be demand-led, CTR-led, ranking-led, mixed, stable, or unresolved. There is
no required winner, fixed materiality percentage, compulsory recommendation, or default credit to
SEO work. Ads, AI features, competitors and changed intent remain hypotheses unless verified. State
that a cause is unknown when that is the most accurate answer.

## Ownership and source maintenance

The reporting workflow owner maintains this procedure. The monthly diagnostic is Headstart's
operating policy; it is not a Google requirement. The mechanism references below were checked on
2026-11-13. Recheck the relevant source when provider fields/aggregation change, when dates are
ambiguous, or before relying on a disputed mechanism. Preserve the retrieved version and applicability
in the evidence packet; missing or contradictory evidence narrows the claim rather than becoming fact.

- [Google metric and aggregation definitions](https://support.google.com/webmasters/answer/7042828)
- [Search Analytics query and aggregation constraints](https://developers.google.com/webmaster-tools/v1/searchanalytics/query)
- [Search Console privacy filtering and limits](https://developers.google.com/search/blog/2022/10/performance-data-deep-dive)
- [Semrush Keyword Overview trend and calendar explanation](https://www.semrush.com/kb/257-keyword-overview)
- [Semrush API column definitions](https://developer.semrush.com/api/v3/seo/overview/)
