# Deterministic evidence contract

Use this boundary for the reproducible portion of an organic-performance report. It intentionally
does not prescribe executive conclusions, causal interpretation, or recommendations.

## Required layers

1. **Source snapshots** preserve complete read-only outputs and source metadata.
2. **Report configuration** owns periods, public hostname, route registry, branded-query definition,
   audience and pillar mappings, and approved outcomes.
3. **Deterministic analysis** normalizes, calculates, joins, reconciles, and validates evidence.
4. **Agent interpretation** consumes the analysis plus dated contextual evidence and produces
   observed, inferred, and recommended claims.
5. **Publication** renders approved evidence and agent-authored narrative into a stakeholder artifact.

## Bundle contract

`headstart-organic-analyze` accepts one JSON object with schema version
`organic-performance-bundle/v1` and these top-level fields:

- `report`: title, `current` and available comparison periods, and an explicit comparison policy.
- `config`: exact `publicHostname`, ordered `routeRegistry`, and explicit `unmatchedSegment`.
- `sources.gsc`: complete metadata, exact public-host `includingRegex` filter, period totals,
  page rows, and query rows.
- `sources.ga4`: complete metadata, Organic Search channel contract, period totals, and landing-page
  rows.
- `sources.semrush`, when selected: complete metadata, period domain snapshots, and keyword-ranking rows.
- `sources.tam`, when selected: complete metadata and the approved keyword, pillar, volume, and serviceability rows.

### Agent-selected choices with mechanical validation

- `report.comparisonPolicy`: `{method, rationale}`; method is `calendar-months`, `equal-length`, or
  `custom`. Calendar-month mode requires complete months, not identical day counts. Custom windows
  require a rationale and remain explicitly labeled; the engine never scales totals to fit a month.
  Legacy bundles without a policy retain the equal-length rule.
- `report.unavailableComparisons`: optional `previous` and/or `year_ago` reason strings. A missing
  comparison must be declared here; a period cannot be both supplied and unavailable. Totals for
  every supplied period remain required. Unavailable comparisons are null, never observed zero.
- `report.omittedSources`: optional `semrush` and/or `tam` reason strings. Omit both its collection
  plan and bundle source when not selected. Missing undeclared sources still fail. GSC and GA4
  remain required. TAM demand can be calculated without Semrush; ranking coverage then stays null.
- `report.qualityPolicy`: `{mode, rationale}`, with `require-unflagged` as the default and explicit
  `allow-with-caveats` available for an appropriate directional question. GA4 `qualityIssues` retain
  the affected period, view, and provider flags. Permission, target, shape, and pagination failures
  cannot be waived by this choice.
- `config.outcomeRegistry[].measurement`: optional `{hostname, metric, rationale}`, where metric
  is `eventCount` or `keyEvents`. With a non-null event name, the collector separately queries that
  exact event and hostname under Organic Search and records `sources.ga4.outcomeRows` keyed by
  audience and period. The engine verifies the scope and never falls back to a public-host proxy.
  Existing unscoped definitions retain public-host key-event behavior. This does not implement
  cross-property joins or infer a cross-domain journey/attribution model.

Every source metadata object includes a stable `sourceId`, ISO extraction time, and `complete: true`.
Source-specific metadata records the property, hostname or domain, database, device, timezone,
filters, data state, planning-source revision, and other distinctions needed to interpret the data.

The TypeScript engine validates the bounded fields required for the August regression. Provider
packages normalize supported source payloads before this bundle boundary. A future managed workflow
must pin the engine and provider-adapter revisions in its execution profile.

## Output contract

The analysis artifact contains:

- a SHA-256 fingerprint of the exact input bundle;
- copied source-manifest metadata;
- `evidenceCoverage`: selected policy, period day counts, omission reasons, quality caveats, and
  `complete` or `complete_with_limitations` status for the declared evidence plan;
- period KPIs and correctly typed comparisons;
- GSC and GA4 landing-page segments plus reconciliation deltas;
- best exact-public-host Semrush rankings;
- content-pillar opportunity, modeled coverage, and exact-query evidence;
- semantic performance-layer metric references; and
- the interpretation boundary for the agent, including deterministic requested historical-context
  dates derived from report end (not the extraction clock).

The output intentionally contains no runtime-generated timestamp. Identical inputs produce
byte-identical JSON. Source extraction timestamps remain part of the input fingerprint.

## Agent evidence packet

The agent may add dated contextual evidence such as commits, pull requests, releases, crawl results,
or external seasonality research. Preserve stable identifiers and dates. Collection can be
deterministic, but relevance, synthesis, causal caution, and recommendations remain agent judgment.

Follow [historical context](historical-context.md) for the required initiative register, source
coverage, and delayed-effects assessment. `interpretationContract.historicalContext` is a collection
plan, not a source manifest: the core collector still queries the configured scorecard periods.
Persist the additional historical trends and deployment evidence separately with their requests,
source identifiers, extraction dates, and coverage. Do not label this context complete merely
because core collection produced `completed.json`.

Use [agent-led interpretation](interpretation.md) to choose targeted follow-up reads and relevant
web research. Additional evidence remains attributable and reproducible; an exploratory cohort is
not a silent amendment to an approved audience, pillar, or business-outcome definition.

The agent must not:

- edit calculated evidence to fit a narrative;
- silently change an audience, pillar, outcome, or route registry;
- treat temporal proximity as proof of impact;
- present a Semrush estimate as first-party performance; or
- claim that a sanitized regression fixture is the historical source bundle.
