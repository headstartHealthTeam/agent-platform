# Comparative detail and agent judgment

Use template `headstart-report/v2` and the explicit `--context report-context.json` input for new
reports. Historical v1 replays retain their original template and source registry. The context has
schema `organic-report-context/v1`; its hash travels with every projected fact. It is a reviewed
input, not permission to invent metrics or classifications.

## Editorial performance and opportunity are different

Retrieve the current published Resource catalog, preserving the source URL, retrieval timestamp,
revision or content hash, title, public path, audience, and publication-date evidence. Exclude work
published after the reporting month from that month's editorial inventory. A CMS update timestamp
is not an original publication date; retain an unknown date when a backfill or migration makes it
ambiguous. Check redirect/canonical history before merging old and new URLs.

Build a versioned primary-pillar mapping using the approved audience strategy and actual article
content. Do not infer a pillar from a loose keyword match, force BCBA content into family pillars,
or silently treat the CMS collection label as the strategy taxonomy. Preserve unassigned content.
Record a short rationale per article, source revisions and the mapping policy. When the taxonomy
postdates the period, label the view as a retrospective classification, not historical authorship.
The audience mapping in `--cohorts` and the editorial context must agree.

For Headstart BCBA strategy, verify the current source shared by Sara:
[BCBA go-to-market brief](https://drive.google.com/file/d/1uLHImh_zgmoXCX3aJ-kJ_MLJY4T3KuFa/view).
The October 30 sharing context is
[the source Slack message](https://grid-headstarthealth.enterprise.slack.com/archives/C0C285FPVEZ/p1793394358334079).
Verify its revision before adopting its pillar labels. These pointers grant no access and do not
replace reading the current source. RBT content remains separately classified or unmapped when no
approved RBT pillar taxonomy is available.

**Article Performance** and **Editorial Pillar Performance** use observed GSC and GA4 evidence.
**Content Pillar Performance** retains the prior keyword TAM/ranking coverage view. It describes
estimated opportunity, not article traffic. Editorial rollups show returned-row coverage; absence
from a provider's table is not measured zero. Do not rank a pillar's success from traffic alone:
consider its intended audience, publication age, visibility, engagement and available outcome evidence.

## Comparative search detail

**GSC Comparisons** preserves the union of current/prior returned page and query keys. Show counts,
absolute and relative changes, CTR in percentage points, position and the comparison boundary.
Retain missing rows as blank, not zero. Do not report relative growth from a zero denominator.
Raw extracts remain available separately. New routes and articles obey complete-calendar-month
eligibility; their partial-month observations remain useful with explicit labels.

## Performance Highlights

Keep this stable section after Executive Summary and before the KPI Scorecard. Select zero to eight
material pages from retained reporting-period evidence; there is no requirement to fill eight slots
or tell a positive story. Explain why the evidence matters, alternate explanations, confidence and
the next proof point. Wins, setbacks, unresolved measurement questions and no material change are
all legitimate conclusions. Do not repeat a fixed September narrative in later months.

Later GSC observations or current Semrush rankings may strengthen or challenge a hypothesis. Put
them in the separately dated follow-up table with source, retrieval date, observation window and
limitation. Never blend them into the monthly scorecard or calculate growth across unequal windows.
The existing twelve-month production-change investigation and sixteen-month metrics context still
apply. Research uncertain mechanisms or expected timing using available primary sources when useful;
research informs interpretation, not a formula that mechanically assigns causality to releases.

## AI visibility

First inspect the capabilities of the configured provider. Use the established MCP/API when it
supports the needed read. Do not introduce a browser sign-in, provider installation or subscription
as an assumed prerequisite. If no AI-visibility operation is exposed, record provider, checked date,
evidence and the exact unavailable capability. Do not claim that the account lacks a subscription
unless the account itself establishes that fact. Continue the rest of the report.

An available observation must identify its platform, metric definition, value, unit, covered sample,
source, extraction timestamp and measurement window. Current-only coverage is not a historical
trend. Keep AI mentions/citations, conventional rankings, AI referral traffic, visits and conversions
separate. Regular Semrush organic ranking data is not evidence of AI answer visibility.

## Engagement and outcome diagnostics

Verify exact audience events and their hostname, trigger and measurement-change dates in released
source. Separate secondary actions from the canonical family partial-registration completion, BCBA
interest submission and RBT listed-opening click. A mixed key-event count is only diagnostic context.
Use page engagement and exact outcome totals to identify hypotheses, then investigate material gaps.
Do not divide app-host outcome totals by public audience landing sessions and call that conversion.

A funnel needs a retained ordered event/path query over the same population and reporting window.
Separate aggregate counts cannot establish step abandonment or attribution. The context accepts
verified funnel steps only when the agent has that independent evidence; otherwise choose
`aggregate-only`, leave the funnel empty, explain what is unknown and recommend the next measurement
or investigation. Avoid predetermined recommendations when evidence supports a different priority.

## Partial source history

Verify returned daily coverage as well as requested dates. A successful HTTP response and complete
pagination do not establish that every historical day exists. Missing days warrant investigation;
they are not automatically zero activity. When that investigation establishes an incomplete GSC
comparison, record the reason in collection plan `gsc.unavailableComparisons.previous` or
`gsc.unavailableComparisons.year_ago`. The collector retains it in GSC metadata; the analyzer and
workbook suppress that source's comparison while retaining raw rows and independent GA4 history.
For an existing immutable collection, retain a separate reviewed evidence copy and a composition
receipt identifying the original hash and the added exclusion. Never rewrite original snapshots.
