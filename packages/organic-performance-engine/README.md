# Organic Performance Engine

Deterministic TypeScript analysis over normalized Google Search Console, GA4, Semrush, and approved
content-pillar/TAM snapshots. It produces auditable KPIs, period comparisons, route segments,
reconciliation deltas, canonical outcomes, exact-host rankings, and content-pillar opportunity
coverage.

The engine deliberately stops before narrative interpretation. Agents own causal analysis,
recommendations, repository-history interpretation, and stakeholder framing, and must classify
claims as observed, inferred, or recommended.

The interpretation contract includes a tested historical-context plan: a 12-calendar-month change
lookback and 16-calendar-month metric window, both ending at report end, with older relevant
initiatives retained. This is an approved reporting policy, not an industry-standard lag or proof
that history was collected. The agent retrieves and verifies that additional evidence under the
[historical-context guidance](../../skills/organic-performance-reporting/references/historical-context.md).

The content-pillar join replaces workbook `VLOOKUP` behavior with a typed exact-key contract:
keywords are Unicode-normalized, lowercased, and whitespace-collapsed; duplicate normalized TAM
keys fail; unranked approved keywords remain in the market denominator; and zero is distinct from
missing evidence.

Run a normalized bundle with:

```bash
headstart-organic-analyze --input bundle.json --output analysis.json
```

Collect live evidence and calculate it in one supervised read-only run:

```bash
headstart-organic-collect --plan collection-plan.json --profile local-profile.json --output new-run
```

For Headstart, the skill provides explicit `--sources` and `--cohorts` configuration files.
Collection remains read-only. The separate `headstart-organic-workbook-plan` command creates a
bounded native Sheets population plan from a clean-template snapshot, versioned source contract,
the collector's `workbook-evidence.json`, and agent-authored narrative. `--project-only` emits the
deterministic fact projection and narrative binding handoff first; optional `--selection` keys let
the agent choose material diagnostic rows without changing arithmetic or raw evidence. It never
applies external writes.
The package includes `templates/headstart-report.v1.json`; follow the skill's
`references/approved-template.md` for composition, authorization, and numeric/visual acceptance.

The collector verifies every selected provider, reads each reporting period independently,
preserves raw responses and query definitions, reads the complete approved TAM range, and then
produces `report-bundle.json`, `report-analysis.json`, and a success-only `completed.json` marker.
Every run requires a new output directory. Incomplete runs preserve their evidence but have no
success marker. Credentials are resolved by host bindings and never written to the artifacts.

GSC and GA4 are required. Semrush and TAM are independently optional with explicit omission reasons.
The report contract also supports calendar-month, equal-length, or justified custom comparisons;
unavailable comparison history; and separately scoped canonical outcome events. Missing values
remain null. A selected-source failure never silently becomes an omission. The completion marker
records `complete_with_limitations` for declared omissions, missing comparisons, or accepted GA4
quality caveats; it does not certify the agent's investigation or publication.
See the [evidence contract](../../skills/organic-performance-reporting/references/deterministic-evidence-contract.md)
for the configurable fields and compatibility defaults.
Publication and agent-authored narrative remain the supervised skill's responsibility; collection
does not create or change a Google report, send messages, or operate an unattended workflow.

See the [runtime guide](../../docs/organic-reporting-runtime.md) for standalone deployment,
profile setup, source limitations, and the synthetic/live verification lanes.

The skill's [fresh-context cases](../../skills/organic-performance-reporting/evals/behavior-validation.md)
test agent investigation and contract selection separately from deterministic unit tests.

See the [documentation hub](../../docs/README.md) and
[workflow authoring guide](../../docs/workflow-authoring-guide.md).
