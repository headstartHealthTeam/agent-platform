# Approved native report contract

Use [Headstart sources](headstart-sources.md) to resolve the approved reference, clean native
template, strategy document, TAM workbook, and historical comparison. These are distinct roles.
The clean template remains a derivative of the approved July workbook, not a new report design.
It is currently private to its creating owner; another operator must have authorized access.
Never silently switch templates or broaden sharing to bypass that boundary.

The engine ships `templates/headstart-report.v1.json`. Its semantic bindings distinguish calculated
facts from agent-authored narrative. The manifest fixes sheet names/order, labels, native style
fingerprints, bounded regions, and ownership. Monthly conclusions are not template constants.

## Supervised population

1. Obtain the current complete analysis and immutable extracts. Verify the selected source and
   cohort versions. Historical replays retain their original classification unless the user
   deliberately requests a separately labeled reclassification.
2. Copy the clean native template to a new report through the connected Google capability. Confirm
   the new ID differs from the template and every historical report. Preserve sharing settings.
   Never populate the approved July/August files or the clean template itself.
3. Read all 14 sheets, including grid properties, merges, charts, dimensions, cell values, notes,
   and user-entered formatting. Persist the native spreadsheet snapshot. The current clean template
   records each sheet's row/column bounds in the versioned manifest; read those complete bounds,
   using the exact quoted sheet name. Do not use a
   partial visible-cell read as evidence that the complete template is clean.
4. Generate the fact projection with `--project-only` from the collector's `workbook-evidence.json`,
   then author the narrative packet below. Do not retype numbers from historical presentation cells. The agent selects
   material diagnostic rows and authors interpretation. Arithmetic, joins, ordering for the selected
   view, and source-to-cell verification remain reproducible transformations, not estimated values.
5. Generate a local plan with the engine's `headstart-organic-workbook-plan` command. This performs
   no Google writes. Review every binding, provenance entry, and bounded update before applying it
   to the exact new report ID through the authorized Google capability.
6. Read back every written range. Reconcile numbers to the analysis/source projections, row counts
   to complete raw tables, and all absent/zero/baseline semantics. Scan for formula errors and stale
   month-specific content. Inspect every populated tab at normal zoom in a real browser, including
   charts, notes, wrapping, alignment, and representative formulas if added by an approved revision.
   A successful API response or matching file hash is not visual acceptance.

```sh
headstart-organic-workbook-plan --project-only \
  --template templates/headstart-report.v1.json --sources headstart-sources.json \
  --evidence snapshots/new-run/workbook-evidence.json --output projection.json

headstart-organic-workbook-plan --target new-copy-snapshot.json \
  --template templates/headstart-report.v1.json --sources headstart-sources.json \
  --evidence snapshots/new-run/workbook-evidence.json \
  --narrative workbook-narrative.json --output new-population-plan.json
```

The source-checkout equivalent is `node --conditions=development --import tsx
packages/organic-performance-engine/src/workbook-cli.ts` with the same flags. In a packaged runtime,
run `node dist/workbook-cli.js` or the installed bin; the template asset ships with that runtime.

## Composition inputs

The collector's `workbook-evidence.json` contains the validated bundle plus complete retained views
with per-view extraction timestamps. The mapper recomputes the analysis and projects every factual
binding; it rejects duplicate views, source-scope mismatches, incomplete views, and conflicting
bundle/detail evidence. Overlapping GSC page/query metrics and GA4 landing metrics reconcile by
normalized key, not merely by a grand total. The projection output includes `analysis`, `facts`,
and `narrativeBindings`.
`--selection selection.json` optionally supplies ordered source keys for bounded diagnostic tables;
use the identical selection in projection and population. Selection changes visibility, never source
arithmetic or the complete raw evidence.

The generated `facts` packet has schema `organic-workbook-facts/v1`, the canonical SHA-256 of the exact
analysis, a `blocks` object keyed by fact binding ID, and `evidence` entries containing `binding`,
`source`, and `sourceSha256`. Values are typed two-dimensional rows of strings, finite numbers,
booleans, or null. Source paths/identifiers in this local packet must resolve to retained evidence;
machine-local paths must not appear in the shared workbook. Every fact block needs provenance.

`workbook-narrative.json` has schema `organic-report-narrative/v1`, the same `analysisSha256`, a
`blocks` object keyed only by narrative binding ID, and claim `evidence` containing `id`,
`classification` (`observed`, `inferred`, or `recommended`), `text`, and `sources`. The agent owns
these paragraphs, caveats, initiative interpretations, and recommendations. See
[launch-context judgment](interpretation.md#launch-context-is-evidence-for-judgment-not-generated-editorial-copy).

Rows use the native grid's sparse anchor columns, not one adjacent cell per conceptual column.
For example, the pillar interpretation anchors are A/C/E/I; intervening merged cells receive empty
strings. Read native merges before authoring. The planner rejects nonempty merged interiors rather
than accepting text Google Sheets would hide or overwrite. Native chart series are restored from
the reviewed chart specifications after values are populated; clearing a template can otherwise
cause Sheets to remove empty numeric series. Chart source ranges include their header rows so
legends retain metric names. Raw tables reset mixed number formats to counts or neutral decimal
fractions while retaining the clean template's typography, widths, colors, and wrapping.

The clean derivative keeps the 14-tab presentation and section structure. Bounded repairs support
the full cohort inventory, consistent body formatting, and complete 14-column raw evidence; the raw
tabs use readable source-specific widths and merged title/scope rows. Pillar impression changes are
signed absolute counts, not relative percentages. When Semrush is omitted, the report does not
label TAM keywords as unranked: missing ranking evidence is not evidence of no ranking.

The population planner is not an independent fact checker: a provenance hash does not prove that
a projection selected the right source field or that a narrative claim is true. Verify those
semantic mappings against the retained evidence before publication. The plan records hashes so
that the reviewed composition can be replayed without silently changing either data or judgment.

## Guardrails and bounded variation

- A missing binding, protected target ID, mismatched analysis, changed template, stale cell, or
  overflowing block fails clearly. Empty narrative/action rows are allowed; never invent an action
  to fill the layout. Null data remains absent, not observed zero.
- Numbers remain numeric. Rate deltas expressed in text must use `pp`, not a percent sign. Existing
  native number formats, fonts, colors, dimensions, and chart placement remain authoritative.
- Raw bindings permit bounded row growth with copied body formatting; presentation regions do not
  silently expand into adjacent sections. If a required cohort/table exceeds a presentation region,
  deliberately revise/version the template or agree on a clearly labeled bounded view that preserves
  complete drilldown evidence. Do not truncate required categories or hide unmatched rows.
- New-section lifecycle determines the standard comparable panel. Preserve useful partial-month
  observations with an agent-authored caveat. Existing audiences, prior technical releases, and
  verified migrated-content diagnostics retain their own history and interpretation.
- Recheck source access and template structure before each run. File IDs are non-secret pointers,
  not credentials, permission grants, or proof of an immutable approved revision.

The reporting workflow owner maintains this contract. Review it when the approved presentation,
source roles, metric definitions, taxonomy, or publishing capabilities change. Do not edit installed
copies when this repository is the canonical implementation under review.
