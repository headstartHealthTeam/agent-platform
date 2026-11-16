# Paid-versus-organic context for branded click changes

Use this diagnostic when it can materially improve the explanation of branded organic clicks or
CTR. A stable top organic position with a large within-device CTR change is one useful trigger;
there is no fixed threshold or requirement to find a paid explanation. Keep conclusions focused on
organic acquisition. This is not permission to change campaigns or expand into a general paid audit.

## Establish comparable evidence

Use an existing authorized read-only advertising reporting capability. Prefer a suitable connector
or API; an authenticated browser report is a fallback when permitted by the host and task. Do not
install a provider, require a new UI login, or provision access as an undeclared reporting dependency.
If access or history is unavailable, finish supported analysis and state which explanation remains
unverified. Never change bids, budgets, targeting, ads, negatives, conversions or account settings.

- Verify the advertising account and record exact dates, timezone, extraction date, device,
  geography, network, report type and filters beside the Search Console request.
- Compare **actual search terms**, not only bid keywords or campaign names. Match the same exact
  query or explicitly defined fixed cohort in both sources; document normalization and match rules.
- Start across all relevant campaigns and ad groups, including historical paused/removed entities
  where accessible. Inspect current-status defaults and campaign visibility filters. Reconcile
  campaign/device rows to the filtered report total without double-counting totals or segments.
  An inaccessible entity or privacy-omitted term is unknown, not zero.
- Only then inspect a dedicated brand campaign. Renaming, new brand negatives, or consolidating
  traffic from other campaigns can inflate apparent growth in that campaign. Current status or an
  "excluded" label does not establish when a historical change happened; use dated change evidence.
- Prefer Google Search separately from partners or other networks when comparing with GSC web
  search. Disclose any network mismatch or unverified split. Ads targeting and eligibility may cover
  a subset of GSC's country traffic, even when both say the same country. Record that limitation.
- Preserve GSC property/page aggregation and domain/public-host boundaries. Do not widen canonical
  public-site KPIs merely to match an advertising account. Campaign landing pages and organic pages
  can differ; compare search exposure without conflating their on-site populations.

Keep immutable source exports or a bounded browser evidence record with the selected filters,
visible totals and collection method. Browser-only evidence should say what was and was not read.
Retain executable calculations or formulas and reconcile them to the source; use synthetic values
in repository fixtures rather than committing private account reports.

## Test the explanation, including contrary evidence

Compare clicks, impressions and CTR in each source, preserving full-month counts and adding daily
exposure when month lengths differ. Calculate CTR from the matching source's clicks and impressions;
report rate differences in percentage points. Do not add paid and organic impression denominators,
treat combined clicks as unique people, or allocate GA4 sessions using these click shares.

Rising paid clicks/CTR alongside falling organic clicks/CTR is **consistent with** a change in click
capture; it does not identify the same users switching channels or prove how many organic clicks
ads displaced. If both channels lose impressions, reduced exposure may coexist with redistribution.
If paid activity is flat, falling, absent, or non-comparable, weaken or reject the paid explanation
rather than forcing it into the narrative. Low counts and conflicting evidence limit confidence.

Organic position one does not mean the first visible item on screen: ads do not occupy an organic
position. Also inspect material secondary page results, because the property's topmost rank can stay
constant while those pages lose placement or clicks. Page totals need not add to property totals;
do not label a secondary result a sitelink without evidence of its presentation.

Choose further reads only if likely to change the decision: dated ad/negative/targeting changes,
available mobile top or absolute-top ad impression rates, comparable regional or weekday slices,
and historical SERP evidence. State the scope of account/campaign-level metrics when exact-term
metrics are unavailable. Current SERPs cannot reconstruct a past layout. Consider query intent,
snippets, competing results, SERP features and measurement changes; no single explanation is required.
Use targeted authoritative web research for uncertain metric definitions or mechanisms, with dates
and applicability, rather than treating general industry patterns as proof about this account.

## Report the added context

Put one concise, qualified finding in the existing executive/scorecard narrative when material.
Keep the query/device table, campaign reconciliation, source links and limitations in Search
Visibility and Methodology, following the existing bounded-appendix procedure. Preserve the report's
headline totals, organic scope and approved template; the core workbook plan does not validate a
later appendix. Identify observations, inference, uncertainty and the next useful action separately.

A justified recommendation may be to monitor the same cohort or ask the paid owner for dated
evidence. A controlled brand-ad experiment requires a separate decision and authorization; do not
turn off ads, alter website copy, or claim cannibalization or incremental benefit from correlation.
No new action is also a valid result.

## Sources and maintenance

The reporting workflow owner maintains this Headstart interpretation procedure. Sources below were
checked on 2026-11-13; recheck relevant definitions when report fields, provider behavior, or a
disputed mechanism changes. Missing or contradictory history narrows the conclusion.

- [Google Ads search terms report: actual searches, match types and privacy omissions](https://support.google.com/google-ads/answer/2472708)
- [Google Search Console impression, click and position definitions](https://support.google.com/webmasters/answer/7042828)
- [Google Search Console performance report and topmost position](https://support.google.com/webmasters/answer/7576553)
