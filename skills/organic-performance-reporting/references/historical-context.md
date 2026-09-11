# Historical context and delayed SEO effects

## Operating policy

Policy `organic-historical-context/v1`, approved 2026-09-10. The reporting workflow owner maintains
this policy. The 12-month change-history default is an approved operating choice, not a universal
industry standard or a Google requirement. It does not promise a benefit or prescribe a fixed SEO
time-to-effect.

Keep four distinct windows:

| Window                       | Contract                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Reporting period             | The scorecard month and its separately queried comparisons.                                                                           |
| Change-history investigation | 12 calendar months ending at report end, including the report month, plus older material initiatives still relevant.                  |
| Metric context               | Target 16 calendar months through report end where available; use longer retained comparable history when useful.                     |
| Initiative observation       | A dated pre-change baseline and the available post-deployment trajectory, selected for the initiative and observed evidence maturity. |

For August 2026, the default change window is September 1, 2025–August 31, 2026, and the metric
window is May 1, 2025–August 31, 2026. June/July releases remain candidates for August and later
analysis. A September release cannot explain August. For a partial-month report, retain its exact
end date and disclose that the final calendar month is partial. Never anchor these windows to the
extraction date or extend performance observations beyond report end.

The engine emits these requested windows in `interpretationContract.historicalContext`; it does
not collect repository history or the additional historical time series. The agent must retrieve
or reuse persisted evidence and record actual coverage. The three scorecard snapshots are not a
continuous historical series. Missing access, retention, or instrumentation must narrow the claim,
not produce invented history or a silent claim that this investigation was complete.

## Maintain the initiative register

Initially inspect material releases across repositories that can affect the measured site. For
Headstart this includes website changes and relevant backend metadata/backfills, admin publishing,
and frontend attribution or conversion handoffs. Avoid unrelated application changes. Include
relevant CMS, configuration, and measurement changes that may not appear in Git.

Use production deployment evidence, not commit or PR merge dates alone. A commit predating the
default window can still belong to a release inside it. Record an unknown deployment date as
unknown and do not credit it with impact. First backfill the bounded register, then update it
incrementally and reassess its existing initiatives rather than rebuilding all history each month.
Carry older migrations, architecture changes, technical fixes, and content initiatives forward when
still relevant; record why they remain active or are retired. Age alone is not a retirement rule.
Retain original evidence and prior assessments rather than silently rewriting them.

## Evidence packet and agent judgment

Use [agent-led interpretation](interpretation.md) for targeted follow-up reads and, when useful,
web research about uncertain mechanisms, timing, measurement, or industry context. General
benchmarks calibrate hypotheses; they do not prove site-specific uplift or replace deployment and
performance evidence.

For each material initiative retain:

- stable initiative ID, objective, affected page/query cohort, and expected mechanism;
- implementation authors, PR/commit identifiers, and verified production dates with source links;
- requested and actual history coverage, gaps, and reasons for any older carry-forward;
- pre-change baseline, available post-change periods, and stable source/filter definitions;
- observed technical, visibility, traffic, and outcome signals, including delayed or sustained
  effects, regressions, and insufficient evidence;
- evidence maturity, plausible contribution, confidence with rationale, and alternative explanations;
- next measurement or decision, retaining prior dated assessments.

Technical correctness may be checked immediately; crawling/indexing and search outcomes can lag.
Use initial weeks for early signals and subsequent months for sustained performance where warranted.
Do not equate a complete calendar month with mature evidence, or absence of a short-term increase
with proof of no effect. Choose and justify observation windows per initiative rather than applying
a universal 30/90-day expiry. Keep the separate first-complete-month baseline rules for new sections.

Compare affected pages and queries against their pre-existing trend, prior-year demand, and suitable
unchanged cohorts when available. Consider overlapping releases, algorithm updates, SERP changes,
seasonality, broader demand/brand campaigns, and tracking or consent changes. Semrush is estimated
market context; current keyword rankings cannot replace missing historical ranking snapshots.

Classify claims as observed, inferred, or recommended. A verified release followed by improvement
can support a plausible contribution, not automatic causation or a numeric allocation of uplift.
Keep later retrospective follow-up separate from the original report's as-of conclusions. In
the workbook, distinguish work shipped this month from earlier initiatives being evaluated, and
show coverage limitations in Methodology and Initiative Impact.

## Research basis and freshness

Primary source sections checked 2026-09-10, limited to timing and analysis methodology; no source
was treated as prescribing our 12-month release lookback:

- [Google SEO Starter Guide: time to see an impact](https://developers.google.com/search/docs/fundamentals/seo-starter-guide): effects vary from hours to several months; allow weeks for assessment.
- [Google title-link guidance](https://developers.google.com/search/docs/appearance/title-link): recrawling and reprocessing title sources may take days to weeks, not a guarantee of traffic improvement.
- [Google traffic-drop analysis](https://developers.google.com/search/docs/monitor-debug/debugging-search-traffic-drops): 16-month trend context, comparable periods, page/query diagnosis, and seasonal demand checks.
- [SearchPilot SEO testing methodology](https://www.searchpilot.com/resources/blog/what-is-seo-split-testing): controlled tests often detect effects in 2–4 weeks depending on traffic and effect size; not a general reporting cutoff.

Recheck these sections before revising the policy, when a source materially changes, or when
observed reporting limitations call the default into question. If sources are unavailable or
conflict, disclose that limitation and seek a reviewed policy revision; do not silently rewrite
the approved default or present it as an external standard.
