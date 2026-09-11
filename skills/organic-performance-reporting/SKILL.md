---
name: organic-performance-reporting
description: Build decision-ready SEO and organic acquisition reports using Google Search Console, Google Analytics 4, and optional Semrush context. Use when Codex must report organic visibility, traffic, landing-page engagement, key events or conversions, branded versus non-branded demand, content performance, SEO opportunities, or period-over-period organic growth; reconcile GA4 and Search Console responsibly; or automate recurring organic reporting.
compatibility: Requires Node.js 22+, the headstart-organic-analyze TypeScript CLI, and authenticated read-only Search Console and GA4 capabilities; the full headstart-organic-collect profile also requires Google Cloud ADC, Google Sheets, and a separately provisioned Semrush provider.
metadata:
  author: headstart-health
  version: '0.7.2'
  deterministic_engine: '@headstart-health/organic-performance-engine@0.1.0'
---

# Organic Performance Reporting

Produce a concise narrative for decision-makers and enough detail for operators to act. Treat Google Search Console as the source for Google Search visibility and GA4 as the source for on-site behavior and business outcomes. Use Semrush for competitive estimates and market context, never as a replacement for first-party performance data.

## Verify the local runtime first

This installed skill requires separately provisioned local code. The skills updater does not install
or refresh the reporting engine. Before collection or calculation, follow the
[interim workstation setup guide](https://github.com/headstartHealthTeam/agent-platform/blob/main/docs/organic-reporting-runtime.md#interim-workstation-readiness).
Read that guide from the same reviewed source revision as this skill (use the installation receipt
or tag to resolve it in a local checkout or authenticated repository view; the link is a discovery
entrypoint). Verify the declared engine version, source revision, actual command targets, and
synthetic smoke result. Explicit Node entrypoints are supported when command shims are absent.
If setup is missing, complete the documented local provisioning within the authorized task before
running the report, or state the specific missing prerequisite. Recheck after skill updates. Engine
metadata is a declaration, not an automatic installer or compatibility check. Provider access is a
separate prerequisite; never recreate the engine's calculations to bypass missing setup.

## Preserve the read-only boundary

- Use only the Search Console scope webmasters.readonly.
- Use only read/report operations through a verified Google Analytics provider binding.
- Never submit or delete sitemaps, add or remove sites, change GA property configuration, or alter key-event definitions.
- Never print OAuth tokens, client secrets, ADC contents, or credential files.
- Keep aggregate reporting free of unnecessary personal or user-level data.

## Separate evidence from judgment

The workflow is not expected to be deterministic end to end. Make the evidence substrate
reproducible while leaving contextual interpretation to the agent and business decisions to the
human owner.

- **Deterministic evidence:** execution of declared source queries, immutable snapshots, normalization,
  period math, route and audience rollups, keyword matching, reconciliation, semantic table keys,
  and validation.
- **Agent judgment:** choosing comparable windows and targeted reads within the reporting contract,
  selecting material changes, investigating competing explanations, using relevant web research,
  evaluating seasonality, prioritizing opportunities, and drafting conclusions.
- **Human-governed decisions:** canonical outcomes, approved audience and pillar registries,
  attribution or causal claims, planning-source revisions, and publication approval.

An agent may propose a new mapping or business definition, but it must not silently change the
versioned reporting contract. Deterministically collect repository and pull-request facts when they
are relevant; let the agent decide which changes merit discussion and cite the underlying evidence.
Classify material narrative claims as **observed**, **inferred**, or **recommended**. Temporal
proximity alone does not establish causality.

## Run the workflow

### 1. Define the reporting contract

Confirm or state:

- audience and decision the report supports
- reporting cadence and timezone
- current period, previous-period comparison, and year-over-year comparison when history exists
- comparison method and rationale; explicit reasons for unavailable comparisons or omitted optional
  sources, and any deliberately accepted source-quality caveats
- business outcomes that count as primary and secondary key events
- site sections, content pillars, locales, devices, or markets that matter
- the explicitly approved keyword/TAM planning source, its approval date, and whether individual
  keyword rows or only the pillar direction were approved
- branded-query definition and approved brand variants
- primary public hostname plus any product or marketplace subdomains that must be reported separately
- a versioned URL-segment registry and the launch date for any future section that does not yet have a valid baseline
- an initiative registry with objective, measured surface, production launch date, evidence state, primary success signal, and earliest credible comparison window
- historical context: 12 calendar months of material production changes through report end, older
  relevant initiatives carried forward, and 16 months of metric context where available; follow
  [references/historical-context.md](references/historical-context.md) for scope and evidence rules

Do not choose a conversion event from its name alone. Inspect available GA custom definitions and event or key-event results, then document the selected event and why it represents the business outcome.

### 2. Verify access and discover properties

Use an authenticated `google-search-console.sites.read` capability. When the Agent Platform
TypeScript CLI is installed, run:

    headstart-gsc-report sites

Use an authenticated `google-analytics.property.read` capability to discover accessible properties.
Do not hard-code property IDs in the skill or a reusable report template. Select the property
matching the requested site and state the mapping.

The portable requirement is authenticated read-only access to both first-party sources. Use the
selected private execution profile's OAuth recovery procedure; never add workstation paths,
credential aliases, or credential contents to this skill.

If access is missing, distinguish:

- API or OAuth failure
- property not shared with the authenticated user
- no matching GA web stream or Search Console property
- connector unavailable in the current Codex task

### 3. Choose complete, comparable periods

Prefer finalized Search Console data. End routine reports at least three days before the run date
unless the user explicitly accepts provisional data. For monthly reporting, compare complete
calendar months and disclose their day counts; do not truncate a month to force equal lengths.
For short windows, consider equal-length, weekday-aligned comparisons. Use a documented custom
window when it better answers the question. Add YoY only when comparable history exists; otherwise
record why it is unavailable and leave it null. Do not invent history to satisfy a report shape.

Run current and comparison periods as separate source queries. Do not derive a prior period by scaling current results.

Keep these scorecard periods separate from the longer historical-context windows. Retrieve and
persist the available historical trends using the same verified sources and filters; record actual
coverage and gaps rather than assuming that three comparison snapshots supply 16 months of history.

Record:

- extraction timestamp
- source timezones
- whether Search Console dataState was final or provisional
- whether GA data could still be restated
- filters and channel definitions

### 4. Extract Search Console evidence

Use `google-search-console.performance.read`. The Agent Platform CLI command is
`headstart-gsc-report search-analytics`. Start with these views:

1. Property totals with no dimensions.
2. Daily trend using date.
3. Landing-page performance using page.
4. Query performance using query.
5. Query-to-page mapping using query,page for opportunity and cannibalization analysis.
6. Device, country, or search appearance only when relevant to the decision.

Example:

    headstart-gsc-report search-analytics \
      --start-date 2026-06-01 \
      --end-date 2026-06-30 \
      --dimensions query,page \
      --all-pages \
      --max-rows 100000 \
      --output snapshots/gsc-query-page-current.json

For branded and non-branded reporting, use an explicit, reviewed regex filter and keep it stable in the report methodology. Apply the query filter in the Search Console request when calculating clicks, impressions, CTR, and average position. Do not calculate those totals by summing returned query rows because privacy-protected queries may be omitted.

For Headstart, the approved conservative brand regex is `head[ -]*(start|stat)`. It classifies Headstart, Head Start, Head-Start, and common Head Stat variants as branded. Public-site non-branded totals require both filters in the same request:

    --filters-json '[{"dimension":"page","operator":"includingRegex","expression":"^https://headstart\\.health/"},{"dimension":"query","operator":"excludingRegex","expression":"head[ -]*(start|stat)"}]'

Use returned non-branded query rows for rankings, query clusters, and opportunity analysis only. Label ranking-band counts as directional rather than a complete query census.

When a domain property includes distinct products, apply an explicit page or hostname filter and report them separately. For Headstart:

- `https://headstart.health/*` is the public marketing website and the primary leadership/content KPI scope.
- `https://app.headstart.health/*` is the provider marketplace visibility diagnostic. Track it over time when useful, but do not blend it into public-site content, architecture, or `/resources` KPIs.

### 5. Extract GA4 outcomes

Use a verified `google-analytics.ga4-report.read` provider binding. It may be backed by the official
Google Analytics MCP, the Data API, or another reviewed read-only adapter. Filter the session-scoped
channel dimension to Organic Search for acquisition reporting. Prefer
sessionDefaultChannelGroup unless the property has a documented custom channel-group contract.

Retrieve:

- sessions and activeUsers
- newUsers when acquisition growth matters
- engagedSessions and engagementRate
- keyEvents and sessionKeyEventRate
- landingPage or landingPagePlusQueryString
- selected primary and secondary key-event metrics
- deviceCategory or geography only when actionable

For a landing-page table, pair landingPage with sessions, engagedSessions, engagementRate, keyEvents, and sessionKeyEventRate. Query specific key events when possible; an all-key-events total can combine outcomes with very different business value.

Inspect sampling or threshold metadata when returned. Do not silently present sampled, thresholded, or modeled values as exact counts.

Keep public-site acquisition scope separate from canonical outcome scope. A verified outcome may
occur on another hostname in the same property; configure its hostname, exact event, metric, and
rationale explicitly. Do not widen public-site KPIs or substitute public-host event totals for an
app-host outcome. The collector supports per-outcome measurement definitions.

The default source-quality policy rejects flagged GA4 reports. For a useful directional diagnostic,
the agent may explicitly choose `allow-with-caveats` with a rationale and retain the flags in the
analysis and report. This never relaxes pagination, identity, permissions, or source-row validation.
If the requested decision requires exact figures, keep that requirement and report the blocker.

### 6. Add Semrush context only where useful

Use Semrush for:

- tracked or estimated keyword movement outside the rows visible in Search Console
- competitor visibility and content-gap context
- search-volume, intent, and difficulty estimates
- backlink and authority context
- SERP-feature or AI-visibility context

Label Semrush values as third-party estimates. Do not merge its estimated traffic with GA sessions or its ranking estimates with Search Console average position as if they were the same metric.

Bind only the `semrush.domain-organic.read` and, when needed,
`semrush.keyword-research.read` capabilities. Do not install an MCP server during a report run.
Select a reviewed execution profile ahead of time: the official hosted Semrush MCP, a pinned and
reviewed community MCP, or a direct API adapter. Allowlist only domain overview, domain rank
history, domain organic keyword, and keyword overview reads; exclude project mutation and
site-audit launch operations. The concrete community binding supports exact historical domain
totals, but current-only desktop keyword rankings. Label the keyword extraction date and never
substitute those rows for a historical keyword snapshot.

#### Tie the monthly report to an approved content TAM

When leadership has approved a content-pillar or keyword-opportunity workbook, use it as a fixed
planning dimension inside the same monthly report:

1. Read the exact approved range through `google-sheets.range.read`, record the spreadsheet ID,
   range, and source content fingerprint, and materialize only the fields needed for reporting into an
   immutable period snapshot: market scope, primary pillar, keyword, search volume, and
   serviceability. Spreadsheet `VLOOKUP` formulas are presentation aids, not the join contract.
2. Persist the complete read-only Semrush domain-keyword extract. Record database, device,
   actual snapshot date, domain, and source method; latest rankings must not be labeled as historical
   reporting-period evidence.
3. Normalize keywords deterministically with Unicode NFKC normalization, lowercasing, trimming,
   and whitespace collapse. Join every approved Core TAM row to the best observed position for the
   exact normalized keyword on the configured public hostname. Fail when a normalized keyword has
   more than one approved pillar mapping.
4. Filter the ranking URL by exact hostname. For Headstart, include `headstart.health` and exclude
   `app.headstart.health`; a root-domain export can contain both.
5. Keep unranked TAM rows in the denominator. Report explicit zero coverage when no approved
   keywords rank rather than substituting a broader keyword set.
6. Use Search Console exact-query matches as observed visibility evidence. Assign a duplicate
   normalized query to one canonical pillar and label totals directional because protected query
   rows are omitted.
7. Use GA4 only for on-site acquisition and canonical outcomes. Do not attribute a GA4 session to a
   keyword or pillar without a defensible landing-page or campaign mapping.

Keep these layers distinct:

- **Estimated opportunity:** approved Search TAM or search volume.
- **Modeled presence:** Semrush keyword rankings.
- **Observed visibility:** Search Console impressions and clicks.
- **Business performance:** GA4 organic acquisition and canonical outcomes.

Call a Headstart-only metric **volume-weighted coverage** or **TAM coverage**. Do not call it
competitive share of voice. True share of voice requires the same fixed keyword universe and
competitor set measured in the same period.

The first persisted keyword-level ranking extract is a baseline. Leave prior-period pillar movement
blank and begin month-over-month movement only after the next comparable immutable snapshot exists.
Do not reconstruct a historical pillar snapshot from aggregate Semrush domain totals.

### 7. Materialize the deterministic evidence bundle

Persist complete source outputs before analysis. Do not rely on task memory, transient tool output,
or presentation tabs as the only record of the evidence used. Normalize the source results into the
bundle contract in
[references/deterministic-evidence-contract.md](references/deterministic-evidence-contract.md).

For the provisioned read-only profile, use the collector:

    headstart-organic-collect \
      --plan collection-plan.json \
      --profile local-profile.json \
      --output snapshots/new-run

The plan records approved reporting definitions and targets. The private profile selects an
already-installed Semrush entrypoint, expected fingerprint, and credential reference. Authentication
setup is separate from execution. Use a new output directory; only `completed.json` establishes
successful collection and analysis. A failed run's partial files are evidence, not a completed
report. The completion marker distinguishes `complete` from `complete_with_limitations`, and covers
only the declared evidence plan, not the historical investigation, interpretation, or publication.
This command does not publish or modify any external report.

GSC and GA4 are required by this engine. Semrush and TAM are independently optional when explicitly
omitted with reasons. Keep unavailable modules and comparisons visible. A failure of a selected
source does not silently downgrade the run: preserve it, then deliberately revise the plan if a
limited report can still answer the question. Do not present reduced coverage as the full report
the user requested; disclose the limitation and any remaining deliverable.

For Search Console, `complete` means the declared extraction and pagination contract succeeded up
to its configured row limit. Google returns top rows and does not guarantee an exhaustive census of
every query, so keep ranking and query-cluster analysis directional.

To replay an existing complete bundle without any provider access, run:

    headstart-organic-analyze \
      --input snapshots/report-bundle.json \
      --output analysis/report-analysis.json

The analysis output is an auditable handoff to the agent. Identical bundle bytes must produce
identical analysis bytes. A later API call may return revised data; that is why each report retains
the exact source snapshots and extraction metadata.

Fail closed when a selected source is partial, a public-host filter is not exact, a normalized TAM
keyword is duplicated, a required record is incomplete, or the selected comparison policy is violated. Keep
unmatched pages, excluded-host rows, and source-to-segment reconciliation deltas visible.

### 8. Normalize and reconcile

Join Search Console pages to GA landing pages only after normalizing:

- scheme and host policy
- trailing slashes
- fragments
- query strings, retaining only parameters required by the analysis
- known redirects and canonical replacements
- URL encoding

Preserve the original source URL beside the normalized join key. Report unmatched rows and duplicate join keys rather than dropping them.

Expect Search Console clicks and GA organic sessions to differ. Explain material divergence using known causes such as consent and JavaScript tracking, canonical URL aggregation, timezone differences, privacy filtering, attribution, bot processing, and redirects. Do not force the values to reconcile.

### 9. Turn evidence into decisions

Begin interpretation from the persisted analysis artifact and the underlying immutable snapshots.
Repository commit history, pull-request metadata, release dates, and technical audits can provide
additional dated evidence. Their collection can be mechanical; deciding relevance and expressing a
supported insight remains agent work. Before interpreting initiative contributions, read
[references/historical-context.md](references/historical-context.md) and complete its evidence
packet using the analysis artifact's `interpretationContract.historicalContext` windows. These
windows are collection requirements, not evidence that the engine retrieved change or metric
history. Review earlier releases even when no relevant work shipped during the reporting month.

Use [references/interpretation.md](references/interpretation.md) for the agent-led investigation:
choose material hypotheses, request targeted evidence, research uncertain mechanisms or timing when
useful, and revise or reject explanations. The baseline collection is a starting point, not a
ceiling on investigation. There is no requirement to find a positive impact or recommend a change.

Analyze at least:

- business outcome: organic key events, key-event rate, and qualified intake or revenue metric when configured
- demand capture: clicks and organic sessions
- visibility: impressions, CTR, and position trend
- page effectiveness: landing-page engagement and key-event rate
- acquisition mix: branded versus non-branded demand
- opportunity: high-impression low-CTR pages or queries, positions with realistic upside, and pages with visibility but weak outcomes
- approved opportunity coverage when configured: TAM and serviceability by pillar, modeled ranking coverage,
  first-party exact-query visibility, and the highest-volume unranked confirmed opportunities
- risk: material declines, device or market divergence, indexing or technical findings, and tracking anomalies
- segment growth: public-site URL groups that map to the current architecture, with a separate future baseline for newly launched sections
- initiative progress: distinguish live measured initiatives, pre-launch baselines, measurement prerequisites, and separately scoped diagnostics; never attribute a pre-launch period to work that was not live

Prioritize impact and confidence. Average position is diagnostic context, not the primary success
KPI. Avoid causal language unless an experiment or other independent evidence supports causality.
For each material conclusion, retain the source identifiers and distinguish the observation from
the interpretation and recommendation.

### 10. Deliver two reporting layers

Lead with an executive layer:

- outcome against goal
- three to seven KPI changes
- wins, risks, and what changed
- up to three evidence-supported actions, with owner or next decision when known; fewer or none is valid

Follow with an operator layer:

- period and comparison tables
- top gains and losses by landing page
- query and CTR opportunities
- branded and non-branded movement
- conversion or key-event detail
- technical or measurement issues
- methodology, source timestamps, filters, and limitations

Use absolute change and percentage change together. Mark percentage change as not meaningful when the comparison value is zero or too small. Keep raw source extracts separate from presentation tables.

For Headstart leadership reporting, make the **KPI Scorecard** the default monthly check-in surface. Put sitewide context first, then separate Families, BCBAs, and RBTs into clearly labeled sections. Supporting tabs exist to explain or audit the scorecard; do not require leadership to traverse them during the normal readout.

Use a versioned, explicit audience-route registry. Assign a page to an audience only when its route or approved editorial classification is mapped; keep shared and unassigned pages outside audience scorecards until their owner and intent are explicit. For audience drivers, use page-level period deltas. Use query-to-page evidence only to establish audience relevance, then use whole-query period totals for the query's movement so one query is not double-counted across page fragments.

Use these canonical Headstart audience outcomes unless the measurement contract is deliberately revised:

- Families: completion of the partial family lead form at `app.headstart.health/register`, regardless of the public-site entry path.
- BCBAs: provider-interest form submission from the BCBA journey.
- RBTs: click on any listed RBT job opening, regardless of the public-site entry path.

If an exact audience outcome is not instrumented, display **Measurement pending**. Never substitute an all-key-events total or a mixed proxy and present it as the canonical conversion. Add native Google Sheets cell notes to metric labels so definitions are available on hover without adding visual clutter.

Describe GA4 URL-section rollups as **organic sessions by landing-page segment**. Each session belongs to the first page of the session, not every page viewed. Attribute initiative impact only after a verified production launch date and a complete post-launch comparison window; pre-launch periods remain baseline evidence, not proof that unreleased work caused movement.

### 11. Build the standard monthly workbook

Deliver recurring leadership reports as a native Google Sheet with these tabs in this order:

1. **Executive Summary** - reporting period and freshness, three to seven KPI cards, the most important wins and risks, the top actions or decisions, and a concise scope/limitations note.
2. **KPI Scorecard** - current month, prior month, year-over-year comparison, source, leadership interpretation, and comparison caveat for each KPI.
3. **Initiative Impact** - initiative objective, measured surface, current evidence state, baseline evidence, primary success signal, launch/comparison contract, next action, and a performance-layer map that distinguishes technical health, visibility, acquisition, engagement, business outcomes, and market context.
4. **Organic Growth by Segment** - public-site GSC and GA4 performance by a versioned URL-segment registry, source-filtered non-branded trends, returned-query ranking bands, future-section baseline policy, and separately labeled provider-marketplace visibility when relevant.
5. **Search Visibility** - Search Console totals, daily trend, source-filtered branded/non-branded coverage, top pages and queries, gains, losses, and CTR or ranking opportunities.
6. **Organic Acquisition** - GA4 organic sessions, users, engagement, key events, channel-mix context, event taxonomy, and landing-page outcomes.
7. **Content & Landing Pages** - normalized GSC/GA page join, top landing pages, content-section or page-type rollups, and gaps in conversion paths or content coverage.
8. **Content Pillar Performance** - approved Core TAM and serviceability by pillar, exact
   public-host Semrush ranking coverage, exact-query GSC evidence, highest-volume unranked confirmed
   opportunities, and the baseline/comparison boundary.
9. **Market & Keywords** - Semrush ranking footprint, market estimates, branded concentration, and keyword or competitor opportunities. Clearly label modeled values as estimates.
10. **Work & Actions** - meaningful work completed during the period, separately labeled earlier initiatives still under evaluation, and a prioritized action queue with evidence, owner, confidence, and success signal.
11. **Methodology** - property and hostname scope, dates, timezones, filters, brand regex, URL normalization, source responsibilities, extraction timestamp, freshness, and limitations.
12. **Raw - GSC**, **Raw - GA4**, and **Raw - Semrush** - separate source extracts or normalized source tables that support the presentation tabs.

For Headstart, use the approved native template and source roles in
[Headstart sources](references/headstart-sources.md). Preserve its presentation contract while
authoring fresh narrative; fixed layout does not mean fixed conclusions. Read the
[launch-context judgment guidance](references/interpretation.md#launch-context-is-evidence-for-judgment-not-generated-editorial-copy)
before adapting prior-report baseline or pre-launch call-outs.

Additional workbook rules:

- Keep the executive layer compact enough to scan in a few minutes; put diagnostics in the drilldown tabs.
- Treat the KPI Scorecard as the primary discussion surface. Include sitewide context plus separate Families, BCBA, and RBT sections, each with search demand, organic landing sessions, engagement quality, its exact canonical outcome, and concise page/query driver commentary.
- Add native cell notes to metric labels for definitions, source scope, and important interpretation boundaries.
- Apply one table-alignment contract across every presentation and raw tab: left-align labels, identifiers, URLs, and narrative text; right-align dates, counts, percentages, rates, currency, ranks, positions, and deltas. Align each header with the body values beneath it. KPI cards may center values intentionally, but ordinary table columns must not mix conventions.
- Generate or retain a machine-readable alignment specification when the workbook is built programmatically, apply the same specification to the native Google Sheet after import, and verify representative header/body pairs from every tab before handoff.
- Use formulas from source or raw tabs for recurring calculations where practical. Do not copy the same derived metric into multiple presentation tabs as unrelated hard-coded values.
- Populate calculated tables from the persisted analysis artifact using semantic identifiers, not
  zero-based spreadsheet row offsets. The agent authors narrative fields within the approved layout,
  but visibility, acquisition, engagement, business-outcome, and market-context evidence must remain
  attached to their named layers.
- Do not create a new month by partially overwriting a populated prior-month workbook. Reuse a clean
  layout or template, then populate it from the current analysis so stale values cannot survive in
  untouched cells.
- For programmatic reports, keep four explicit layers: immutable period source extracts, a versioned reporting and audience/pillar-registry config, deterministic analysis modules with tests, and a workbook renderer. Persist generated audience and pillar analyses as auditable intermediate artifacts. Tests must cover URL and keyword normalization, exact-host filtering, duplicate-keyword assignment, audience assignment, missing-event behavior, unranked TAM denominators, and zero-baseline handling so absent data is not rendered as observed zero performance.
- Show rate changes in percentage points and count changes as both absolute and relative change when useful. Never label a percentage-point delta with a percent sign.
- Include overall channel mix only as context. Keep the report's conclusions and actions focused on organic acquisition.
- Include completed work only when it can explain context or establish accountability; do not imply causality from temporal proximity.
- Record the verified production launch or measurement-change date before labeling an initiative live. For work not live during the report period, present current metrics as a baseline or opportunity signal and leave pre-launch initiative performance blank rather than zero.
- Keep provider-marketplace visibility in its own initiative row and diagnostic section. Never blend `app.headstart.health` visibility with public-site architecture, content, location, or conversion KPIs.
- Separate page types or content sections using an explicit, versioned URL mapping. Report unmatched pages instead of silently dropping them.
- Keep product and marketplace subdomains separate from the public-site scorecard unless leadership explicitly changes the reporting contract.
- For a newly launched section such as `/resources`, leave pre-launch periods blank. Start the baseline with the first complete post-launch calendar month, begin MoM after two complete months, and begin YoY after the thirteenth complete month.
- If key-event names changed between periods, show the raw event taxonomy and mark the affected comparison non-comparable.
- Start from a native copy of the approved clean template using the connected Google Sheets workflow; do not round-trip an approved native template through XLSX. Verify title, tabs, representative formulas/values, visible formatting, chart placement, and formula-error scans before handoff.
- Return the native Google Sheet link as the shareable deliverable. Do not make a local workbook path the stakeholder-facing source of truth.

## Validate every report

Before handoff:

- Verify the GA property and Search Console property cover the same site scope.
- Verify date windows and timezones.
- Verify historical-context coverage, deployment evidence, retained older initiatives, and
  initiative-specific observation windows. No post-report release may explain the reported results;
  no missing history may be represented as zero performance or evidence of no effect.
- Confirm Search Console final versus provisional state.
- Confirm the Organic Search channel filter.
- Confirm primary key-event definitions with the business owner or existing measurement plan.
- Check GA sampling, thresholding, and modeled-data notes.
- Reconcile report totals back to unsegmented source totals where valid.
- Confirm filters, regexes, and URL normalization are documented.
- Confirm the approved TAM source, serviceability rule, public-host filter, keyword normalization,
  snapshot date, and baseline/comparison state are documented.
- Validate every populated row in each raw source range and compare its count with the retained
  source manifest; do not limit validation to the visible or initially expected rows.
- Check semantic table keys, duplicate methodology entries, stale period labels, incomplete source
  rows, and source-to-segment reconciliation deltas in addition to formula errors.
- Distinguish observations, hypotheses, and recommendations.
- Never invent missing data or silently substitute Semrush estimates.

## Use bundled resources

- Use `headstart-gsc-report` for authenticated read-only Search Console property discovery, search
  analytics, and sitemap-status reads.
- Use `headstart-organic-analyze` to build the reproducible evidence layer from normalized source
  snapshots. Stop before calculated reporting if the declared engine is unavailable; do not
  recreate its calculations in spreadsheet formulas or task memory.
- Use `headstart-organic-collect` for the provisioned read-only profile and its explicitly selected sources. Retain
  complete source responses, query definitions, preflight results, and success status together.
- The engine's package tests cover request validation, normalization, reconciliation, typed TAM
  joins, source completeness, semantic-layer behavior, and the approved August regression fixture.
- Read references/reporting-framework.md when selecting report metrics, comparisons, opportunity rules, or caveat language.
- Read references/deterministic-evidence-contract.md before materializing or consuming a report bundle.

Provider bindings own authentication and must return sanitized preflight evidence for the exact
property, domain, database, device, spreadsheet, or range. Use CLI JSON output as a source artifact;
do not edit credentials or embed tokens in commands.
