# Organic Reporting Framework

Use this reference to design recurring SEO reports, select metrics, and explain data limitations. Keep the final report proportional to the audience and the decisions being made.

## Contents

1. Source responsibilities
2. Standard reporting views
3. Recommended metric sets
4. Comparison rules
5. Opportunity analysis
6. Data-quality and reconciliation notes
7. Authoritative references

## 1. Source responsibilities

### Google Search Console

Use for:

- Google Search impressions, clicks, CTR, and average position
- queries and Google-attributed canonical pages
- device, country, search type, and search appearance
- submitted sitemap status
- visibility gains, losses, and query-to-page relationships

Do not treat query rows as a complete census. Search Console omits anonymized queries and returns top rows under internal limits. Property totals can exceed the sum of returned query rows.

### Google Analytics 4

Use for:

- Organic Search sessions and active users
- engaged sessions and engagement rate
- landing-page behavior
- configured key events and key-event rates
- patient-intake, lead, revenue, or other business outcomes when instrumented
- first-user acquisition versus session acquisition when the question requires that distinction

Use session-scoped dimensions for current-visit acquisition reporting. Use first-user dimensions only when reporting how users were originally acquired. Use event-scoped attribution only for explicit attribution questions.

### Semrush

Use for:

- competitive visibility and share estimates
- target keyword volume, intent, difficulty, and SERP context
- rankings beyond the observable Search Console rows
- backlinks and competitor content gaps
- directional market and AI-visibility research

Semrush is modeled third-party evidence. Preserve database, locale, device, collection date, and report type.

### Technical sources

Use Screaming Frog, Lighthouse or CrUX, server logs, and indexing tools for technical explanations. Do not infer crawl, rendering, or Core Web Vitals causes from GA4 or Search Console performance movement alone.

## 2. Standard reporting views

### Canonical monthly workbook

Use a native Google Sheet with a compact leadership layer followed by auditable drilldowns. The
standard tab order is:

1. Executive Summary
2. KPI Scorecard
3. Initiative Impact
4. Organic Growth by Segment
5. Search Visibility
6. Organic Acquisition
7. Content & Landing Pages
8. Content Pillar Performance
9. Market & Keywords
10. Work & Actions
11. Methodology
12. Raw - GSC
13. Raw - GA4
14. Raw - Semrush

This structure preserves the useful breadth of a traditional agency report while making the
evidence reusable, formula-driven, and easier to audit. Add or omit a diagnostic only when the
reporting decision requires it; do not remove the methodology or raw-source layers.

### Headstart leadership scorecard contract

Use the KPI Scorecard as the primary monthly meeting surface. Present sitewide context first, then
separate Families, BCBAs, and RBTs. Each audience section should show search clicks and impressions,
organic landing sessions, engagement rate, the exact canonical conversion, and a short explanation
of the page and non-branded query that materially drove the period movement. Supporting tabs are
drilldowns and audit evidence, not required reading for the normal leadership check-in.

Maintain audience assignment in a versioned route and editorial-term registry. Shared or unmapped
pages remain outside audience scorecards until their intent is explicitly assigned. Use query-page
evidence to determine audience relevance, but calculate query movement from whole-query current and
comparison totals so a query is not fragmented or double-counted across pages.

Headstart's current canonical outcomes are:

- Families: partial family lead-form completion at `app.headstart.health/register`.
- BCBAs: provider-interest form submission reached from the BCBA journey.
- RBTs: click on any listed RBT job opening.

If the exact event is absent, show `Measurement pending`; never substitute mixed key events. Put
metric definitions and scope caveats in native cell notes so leadership can inspect them on hover.
Describe GA4 URL-section analysis as organic sessions by landing-page segment: the segment receives
the session because its page was the session's first page, not because every viewed page is counted.

Require a verified production launch date and a complete post-launch comparison period before
crediting an initiative for movement. Until then, describe results as baseline, correlation, or an
opportunity signal. For known legacy routes, include sitemap membership, indexability, canonical,
internal-link, crawl, Search Console, and redirect evidence before recommending disposition.

For recurring automation, separate immutable period extracts, a versioned report and audience
configuration, deterministic analysis, and workbook rendering. Persist the analysis output and test
URL normalization, audience assignment, missing conversion instrumentation, and zero-baseline
behavior. Missing data is not observed zero performance.

Use a single alignment convention throughout the workbook. Textual labels, identifiers, URLs, and
narrative fields align left. Dates and quantitative fields such as counts, percentages, rates,
currency, ranks, positions, and changes align right. Table headers follow the alignment of the
column beneath them. Reserve centered alignment for deliberate card-style summary values, not
ordinary tables. Programmatic builders should emit a reusable alignment specification so the
imported native Google Sheet can be synchronized and checked consistently.

### Initiative impact

Read [historical context](historical-context.md) before evaluating initiative contributions. Its
change-history, metric-context, and observation windows are distinct from the scorecard month;
production eligibility does not require a release during that month.

Map each funded or planned organic initiative to:

- leadership objective
- measured hostname and URL surface
- evidence state: live, pre-launch baseline, measurement prerequisite, or separate diagnostic
- verified production launch or measurement-change date
- current baseline evidence
- primary success signal
- earliest credible MoM and YoY comparison windows
- next decision or action

Use a separate launch/comparison contract so a report cannot silently attribute pre-launch results
to work that was not live. Technical checks may begin at release, while performance comparisons
usually require a complete post-launch calendar month. Newly launched sections use their first
complete month as baseline, second complete month for MoM, and thirteenth complete month for YoY.

Also define how technical health, search visibility, acquisition, engagement, business outcomes,
and third-party market context answer different leadership questions. Provider-marketplace
visibility must remain a separately labeled diagnostic rather than being blended into public-site
initiative outcomes.

### Executive scorecard

Keep three to seven primary KPIs tied to business outcomes:

| Question                                            | Preferred source | Metric                                                                          |
| --------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------- |
| Did organic acquisition create more business value? | GA4              | Selected organic key events, session key-event rate, qualified leads or revenue |
| Did organic demand capture grow?                    | GSC and GA4      | Clicks and Organic Search sessions                                              |
| Did Google visibility grow?                         | GSC              | Impressions and CTR; position as context                                        |
| Did content attract and satisfy relevant visitors?  | GA4              | Organic landing-page engaged sessions and key-event rate                        |
| Did non-branded discovery expand?                   | GSC              | Non-branded clicks and impressions using a documented regex                     |

Include current value, prior-period value, absolute change, percentage change, and year-over-year change when available.

### Search visibility

Run Search Console totals and daily trend separately. Add:

- top pages by clicks and impressions
- pages with the largest absolute gains and losses
- top queries and query clusters
- query-to-page pairs
- device or country splits only when material

Use property-level totals for the scorecard. Use page/query rows for diagnosis and prioritization.

For branded or non-branded totals, apply the query regex in the Search Console request. Do not sum returned query rows to calculate clicks, impressions, CTR, or average position. Privacy-protected queries may be omitted even when pagination is exhausted. Returned query rows remain useful for ranking bands and opportunity analysis when that limitation is disclosed.

When one Search Console domain property includes multiple products or subdomains, define one primary reporting hostname and report other products separately. For Headstart, the public website is the leadership/content KPI scope; provider-marketplace visibility on `app.headstart.health` is a separate diagnostic trend.

### Organic growth by segment

Maintain a versioned URL-segment registry and report GSC visibility plus GA4 organic acquisition by segment. Include an entire-public-site control row, explicit unmatched bucket, and status note when route composition changes.

For a future section that was not live during the reporting period, do not backfill zeros. Leave pre-launch periods blank and document the measurement contract:

- first complete post-launch calendar month establishes the baseline
- second complete month enables MoM comparison
- thirteenth complete month enables YoY comparison

For Headstart, select the versioned [cohort configuration](headstart-cohorts.json) explicitly with
`--cohorts` when collecting a new report. Its September 2026 architecture boundary distinguishes
`/resources`, organic `/locations`, campaign `/location`, and legacy `/aba-therapy` surfaces.
Historical replay retains its original configuration unless deliberately reclassified as a
separate diagnostic. Recheck actual release evidence and extend the versioned mapping when routes
or taxonomy change; do not keep `/resources` permanently labeled as a future section.

Audience hubs are only part of audience attribution. Flat `/resources/<slug>` and legacy editorial
URLs need explicit audience assignments supported by approved content metadata. Add those exact
paths to the run's versioned registry and retain provenance; an unmapped page stays unassigned.
Collection/topic drilldowns likewise need an explicit, versioned mapping and their own effective
dates where relevant. Never treat the TAM keyword-to-pillar join as page-category metadata.

Lifecycle eligibility constrains the standard comparable panel, not the agent's judgment. Follow
[launch-context interpretation](interpretation.md#launch-context-is-evidence-for-judgment-not-generated-editorial-copy)
for partial-month observations, legacy/migrated cohorts, earlier work, and explanatory call-outs.

### Landing-page outcomes

Use GA4 Organic Search sessions by landingPage with:

- sessions
- activeUsers
- engagedSessions
- engagementRate
- keyEvents
- sessionKeyEventRate
- the specific primary key event when configured

Add Search Console clicks, impressions, and CTR only after URL normalization. Preserve unmatched rows.

### Content-pillar performance

Maintain an explicit URL-to-pillar mapping. Aggregate first-party results by pillar:

- GSC clicks and impressions
- GA organic sessions and engaged sessions
- selected key events and key-event rate
- number of active landing pages

Do not let an LLM silently reclassify historical URLs between periods. Version the mapping or disclose changes.

### Opportunity queue

Return a short prioritized queue rather than a raw export. Each item should include:

- query or page
- observed evidence
- current and comparison values
- likely issue or opportunity
- proposed action
- confidence
- expected measurement signal

## 3. Recommended metric sets

### GA4 core metrics

Use exact Data API names:

- sessions
- activeUsers
- newUsers
- engagedSessions
- engagementRate
- keyEvents
- sessionKeyEventRate
- screenPageViews
- averageSessionDuration when it helps answer the question

Use landingPage or landingPagePlusQueryString for session entry pages. Prefer landingPage for cross-source joins unless query parameters carry meaningful content identity.

For Organic Search, filter sessionDefaultChannelGroup to Organic Search. Confirm the property does not require a documented custom channel group.

### Search Console core metrics

Every Search Analytics row supplies:

- clicks
- impressions
- ctr
- position

Common dimensions:

- date
- query
- page
- device
- country
- searchAppearance

Use the web search type by default. Analyze image, video, news, Discover, or Google News separately when they are part of the strategy.

### Derived metrics

Calculate only when the denominator is valid:

- CTR = clicks / impressions
- GA session key-event rate = sessions with a key event / sessions, preferably using the native GA metric
- Click-to-session observation = GA Organic Search sessions / GSC clicks
- Landing-page opportunity value = business-defined blend of demand, current position or CTR, conversion quality, and feasibility

The click-to-session observation is a diagnostic ratio, not a reconciliation target. Never call it a tracking accuracy percentage without a validated measurement model.

## 4. Comparison rules

- Compare complete calendar months when reporting monthly; disclose unequal day counts instead of trimming a month.
- For short windows, consider equal-length periods aligned by weekday. Record a rationale for custom event-aligned windows.
- Add year-over-year change when comparable history exists to help assess seasonality; record unavailable history as null with a reason.
- Avoid including incomplete Search Console dates in finalized reports.
- Preserve the exact same property scope, filters, URL mapping, key events, and channel definitions.
- Annotate launches, migrations, tracking changes, algorithm updates, major campaigns, and outages.

For a value current and comparison:

- Absolute change = current minus comparison.
- Percentage change = absolute change divided by comparison.
- When comparison is zero, show the absolute change and mark percentage change not meaningful.

Do not label correlation as impact. Use changed after, associated with, or coincided with unless controlled evidence supports causality.

Follow [agent-led interpretation](interpretation.md) when selecting further evidence or researching
uncertain mechanisms, timing, and industry context. A benchmark guides interpretation; it does not
establish this site's causal impact. It is valid to recommend no action when evidence supports none.

## 5. Opportunity analysis

### CTR opportunities

Look for pages or queries with material impressions and weaker CTR than their own historical baseline or comparable intent group. Review SERP layout, intent, title, description, brand recognition, and ranking before recommending metadata changes.

Do not apply one universal CTR benchmark across positions and query types.

### Striking-distance opportunities

Use average position only as a screening signal. Favor query-page pairs with:

- meaningful impressions
- positions that indicate plausible first-page or top-result improvement
- close intent match
- adequate content quality and business relevance
- no dominant SERP feature that removes most click opportunity

Validate current results and page intent before prioritizing.

### Content decay

Flag pages with sustained declines across comparable periods. Check:

- query-level loss versus broad demand loss
- competing or cannibalizing pages
- changed search intent or SERP features
- content freshness
- redirect, canonical, indexing, or internal-link changes
- seasonal patterns

One short-period decline is an alert, not proof of decay.

### High traffic, weak outcomes

Use GA4 to identify organic landing pages with meaningful sessions but weak selected key-event rate. Check whether the page is informational by design before calling it underperforming. Recommend a journey or conversion improvement only when it fits user intent.

### High outcomes, low visibility

Prioritize pages with strong organic engagement or selected key-event rates but limited Search Console visibility when keyword demand and content fit are supported.

### Cannibalization candidates

Use query,page rows to find one query associated with multiple landing pages. Confirm that the pages overlap in intent and that performance is unstable or split before calling it cannibalization. Multiple relevant pages are not inherently a problem.

## 6. Data-quality and reconciliation notes

### Search Console

- Data is normally available after a two-to-three-day lag.
- Dates use America/Los_Angeles.
- Final data is more appropriate for recurring reports than fresh or hourly provisional data.
- Query rows omit anonymized queries for privacy.
- API row limits and internal top-row selection mean exports can be incomplete.
- Most page performance is assigned to the Google-selected canonical URL.
- Filtered query totals can change because anonymized rows are excluded.
- Average position is the average topmost result and should be interpreted as a trend.

### GA4

- GA4 depends on tags, JavaScript execution, consent, and property configuration.
- Search Console clicks and GA sessions measure different events.
- Key events can be modeled and attribution can be restated.
- Unique user and session measures can be approximate.
- Sampling or thresholding can apply to some API results.
- GA property timezone can differ from Search Console Pacific dates.

### URL joins

Create a normalized join key while preserving original URLs. Decide and document:

- preferred hostname
- HTTP to HTTPS policy
- lowercasing policy for host and case-sensitive path handling
- trailing-slash policy
- parameters to remove or retain
- redirect and canonical mapping date

Report:

- matched row count and metric coverage
- unmatched GSC URLs
- unmatched GA landing pages
- duplicate normalized keys

Do not discard unmatched rows to make totals look cleaner.

## 7. Authoritative references

- Google Search Console authorization and scopes: https://developers.google.com/webmaster-tools/v1/how-tos/authorizing
- Search Analytics API request and row limits: https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- Search Console data discrepancies and lag: https://support.google.com/webmasters/answer/96568
- Search Console dimensions, privacy filtering, and canonicals: https://support.google.com/webmasters/answer/17011259
- Search Console common performance-analysis tasks: https://support.google.com/webmasters/answer/17010961
- Connect Search Console and GA4: https://support.google.com/analytics/answer/10737381
- GA4 Data API dimensions and metrics: https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema
- GA4 predefined acquisition reports: https://developers.google.com/analytics/devguides/reporting/data/v1/predefined-reports
- GA4 reporting data expectations: https://developers.google.com/analytics/devguides/reporting/data/v1/reporting-data-expectations
- GA4 engagement-rate definition: https://support.google.com/analytics/answer/12195621
- GA4 key-event definition and reporting: https://support.google.com/analytics/answer/9267568
- Semrush overview of decision-oriented SEO reports: https://www.semrush.com/blog/what-is-an-seo-report/
