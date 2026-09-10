# Organic Reporting Runtime

This is the supervised, read-only runtime for the
[organic reporting skill](../skills/organic-performance-reporting/SKILL.md). It combines real source
collection with deterministic TypeScript analysis. It is not a managed deployment, scheduler,
Google Sheet publisher, or replacement for agent interpretation.

## Provision a standalone artifact

Use Node.js 22+ and the repository's exact Corepack pnpm version. Select a reviewed, immutable
repository revision for team use; a development artifact must be labeled as unreviewed. From that
checkout:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm qa
corepack pnpm reporting:package --target /absolute/new/runtime
```

The destination must be a new, dedicated directory outside the checkout. The packaging command
uses `pnpm deploy --prod` to copy the
built engine and its production dependencies, including shared Google/Semrush adapter packages.
It does not install the external Semrush MCP, copy credentials, or distribute skills. Record the
source revision, artifact version, lockfile digest, and any uncommitted development state in
`runtime-receipt.json`, along with a deterministic artifact digest. The packaging command repairs
pnpm 9's redundant engine self-link and rejects any other dependency link pointing outside the
artifact. Do not call a dirty-checkout artifact a reviewed release. A deployment without its final
receipt is incomplete.

The packaging script runs the repository-pinned Corepack JavaScript entrypoint directly with Node,
then verifies the required pnpm version. This avoids Windows batch-file argument forwarding and
keeps destination paths as arguments, not shell syntax. Corepack is a provisioning-only development
dependency; it is not added to the standalone reporting artifact.

The artifact can run without the source checkout or a TypeScript loader:

```bash
node /absolute/new/runtime/dist/cli.js --input /absolute/bundle.json --output /absolute/analysis.json
node /absolute/new/runtime/dist/collect-cli.js --plan /absolute/plan.json --profile /absolute/profile.json --output /absolute/new-run
node /absolute/new/runtime/node_modules/@headstart-health/google-search-console/dist/cli.js sites
```

On a supervised workstation, expose those entrypoints as `headstart-organic-analyze`,
`headstart-organic-collect`, and `headstart-gsc-report` using the host's normal command installation
mechanism. Refuse to overwrite existing commands without inspecting their ownership. On Windows,
the explicit `node` commands above avoid Unix symlink assumptions. Install the canonical skill
separately through the repository's skills updater after review; never copy runtime packages into a
global skill directory.

## Private configuration

The [example collection plan](../packages/organic-performance-engine/examples/collection-plan.example.json)
is schema-validated in tests and contains synthetic targets. Replace its targets and reporting
definitions with the approved site's contract. Never use fixture counts as collection inputs.

The plan includes:

- current and available comparison windows, with a selected comparison policy and reasons for unavailable history;
- exact public hostname, ordered route/audience registries, and canonical outcome definitions;
- explicit provider bindings and adapter versions;
- Search Console property and brand regex;
- GA4 property and expected timezone;
- when selected, Semrush domain, database, desktop scope, exact monthly snapshot dates, and row limit; and
- when selected, exact quoted/bounded TAM range, column names, Core filter, approval date, and approval scope.

The private host profile has this shape:

```json
{
  "semrush": {
    "entrypoint": "/absolute/reviewed-provider/dist/index.js",
    "sha256": "<64 lowercase hexadecimal characters>",
    "credential": {
      "type": "environment",
      "variable": "SEMRUSH_API_KEY"
    }
  }
}
```

The credential is a reference, never a key in JSON. An optional Codex-local binding uses
`{"type":"codex-mcp","server":"semrush-mcp"}` to resolve the existing credential internally. It does
not execute the configured MCP command or install anything. Other agent hosts use the environment
binding. Keep the Semrush package and dependency installation separately pinned and reviewed; the
entrypoint fingerprint check is not a full dependency integrity attestation.

Google uses existing Application Default Credentials through `gcloud`. Resolve tokens internally;
never run a token-print command as user-visible diagnostics. Headstart authentication recovery must
follow the private, organization-owned OAuth client procedure, not the generic blocked Cloud SDK
OAuth client. Required read scopes are Analytics and Search Console, plus Sheets when TAM is
selected. Relevant APIs must be enabled in the approved quota project. Source collection cannot enable APIs, reauthenticate, or
change Google configuration. Treat setup failures as explicit setup work, not missing data.

## Run and inspect

```bash
headstart-organic-collect --plan plan.json --profile profile.json --output new-run
headstart-organic-analyze --input new-run/report-bundle.json --output replay-analysis.json
```

For a new Headstart report, explicitly add `--sources` with the skill's
`references/headstart-sources.json` and `--cohorts` with its `references/headstart-cohorts.json`.
Both selected configurations are persisted and fingerprinted. The source resolver supplies the
approved TAM reference without changing a conflicting explicit scope. The cohort resolver replaces
only route/audience classification; it preserves periods, source scope, and outcome definitions.
Historical replay retains its original cohort version. Enrich flat Resource article classifications
from verified metadata in a versioned run configuration; the starter registry is not a complete
article/category catalog. See the skill's reporting framework for coverage and migration rules.

Route/audience `lifecycle` and outcome `measurementLifecycle` are separate optional effective-date
contracts. Standard new-section comparisons use complete post-launch months, while raw observations
remain available for agent-led, explicitly labeled partial-month or migrated-content diagnostics.
Lifecycle status is evidence, not generated narrative, a maturity deadline, or causal attribution.

The output parent must already exist; `new-run` itself must not. Directories and JSON files use
private permissions where the host supports them. Files are create-only. The run preserves:

- the collection plan and exact-target provider preflights;
- GSC totals, filtered nonbrand totals, pages, queries, daily, query-page, and nonbrand query views;
- GA4 totals, landing pages, events, daily, and all-channel context for each period;
- Semrush complete successful MCP request/response artifacts, normalized monthly domain totals,
  and current keyword rankings;
- the complete selected TAM range and its content fingerprint;
- the normalized bundle, deterministic analysis, and `workbook-evidence.json` carrying the complete
  retained views and their individual extraction timestamps; and
- `completed.json` only after all collection and analysis succeeds.

If any stage fails, retain the partial directory for diagnosis and start a new directory after the
failure is addressed. Do not manually add a completion marker or treat partial files as a report.
Source APIs can restate data; replaying saved evidence is deterministic, re-fetching later is not.

## Interpretation boundaries

- Search Console pagination completeness does not mean an exhaustive query census. Google omits
  protected queries and returns top rows. Preserve query-analysis caveats.
- GA4 pagination must reconcile to `rowCount`; changed or truncated results fail. Sampling,
  threshold flags, or other-row loss fail by default; an explicitly justified `allow-with-caveats`
  report retains the flags and emits `complete_with_limitations`. Separate landing-page aggregates
  may still differ from unsegmented totals. Preserve those
  residuals in the analysis rather than forcing agreement.
- A Sheets `content-sha256` fingerprint identifies the observed range, not a Drive revision or
  stakeholder approval. Two matching reads detect intervening changes; approval scope is separate.
- Historical Semrush domain totals are available only at exact provider snapshot dates. The current
  community binding supplies desktop keyword-level data only at extraction time. Never imply it
  provides historical pillar movement. Reaching the keyword limit fails closed.
- Unranked approved TAM rows remain in the denominator. Search volume is a third-party demand
  estimate, not unique people, guaranteed traffic, or GA sessions.
- Narrative, seasonality assessment, repository-change relevance, causal caution, visual rendering,
  and stakeholder publication remain agent/human work through the existing skill.

The same collector supports first-party-only reports without provisioning or launching Semrush.
Omit unused `semrush`/`tam` plan sections and give reasons in `report.omittedSources`; the private
profile may be `{}` when Semrush is omitted. See the
[evidence contract](../skills/organic-performance-reporting/references/deterministic-evidence-contract.md)
for comparison policies, unavailable history, source quality, and outcome-specific measurement scope.
The agent selects additional reads and useful external research under
[the interpretation guidance](../skills/organic-performance-reporting/references/interpretation.md).

## Verification lanes

`corepack pnpm qa` is mandatory and credential-free. It covers source contracts, target preflight,
read-only boundaries, pagination failures, normalization, exact-key TAM joins, zero/null semantics,
and the sanitized August golden regression. The synthetic collector feeds provider responses into
the real orchestration and asserts the resulting August metrics.

The separate supervised live lane uses the approved private plan/profile and a new artifact
directory. Compare the saved analysis with independently verified first-party period totals and
the approved planning workbook. Replay the saved bundle twice and compare output bytes. Finally,
repeat collection and replay using the standalone deployed artifact with a working directory
outside the checkout. Live evidence belongs in approved ignored storage, never Git fixtures.

See the [documentation hub](README.md) and
[reusable capability pattern](reusable-data-capabilities.md) for ownership and reuse boundaries.
