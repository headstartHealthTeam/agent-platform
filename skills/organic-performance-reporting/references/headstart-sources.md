# Headstart reporting source registry

Use the [approved native template procedure](approved-template.md) for report creation and parity
validation. The source registry establishes identity and provenance, not presentation acceptance.

For new Headstart reports, also explicitly pass `--cohorts` with
[headstart-cohorts.json](headstart-cohorts.json). The collector records that version and fingerprint
alongside the source configuration. This deliberately replaces classification only, not event
definitions, reporting periods, hostname, or historical evidence. Keep historical replays on their
original configuration; label any reclassified comparison as a separate diagnostic.

The checked-in cohort file covers route families, not a complete per-article audience/topic
catalog. Enrich flat Resource and legacy article paths from verified metadata in the run's
versioned configuration before claiming complete audience/category coverage. Preserve unassigned
rows and report coverage. Outcome instrumentation has its own optional `measurementLifecycle`
effective date; do not apply the site launch date to established audience acquisition history.

Read [headstart-sources.json](headstart-sources.json) before preparing a Headstart monthly report.
These non-secret identifiers locate sources; they grant no access. Google permissions remain
authoritative. Credentials, source exports, personal profiles, and run artifacts stay outside Git.

| Role                                       | Authority                                                                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Approved July report                       | Ali-approved presentation precedent, including his audience-scorecard refinements; historical file is never a write target |
| Clean native template                      | Versioned layout to copy for a new report; validate its structural fingerprint before population                           |
| SEO Content Pillar Guidance                | Ali's narrative audience/intent guidance; not a keyword fact table or an approval of every content claim                   |
| Patient Content Pillars & Journey Research | Canonical planning workbook; exact Search TAM range and header mappings define the deterministic join                      |
| Historical August report                   | Pre-launch comparison and presentation gut check, not golden truth for known stale-cell defects                            |

The July workbook was last modified August 4, after Ali's August 3 feedback. The linked August 4
message confirms Mark's proposed refinements, not an immutable revision. Mark's September 9
message explicitly identifies the resulting template as Ali's approved go-forward standard.
Pillar direction was approved July 24; individual keyword rows were not individually approved.

Each run must retrieve current metadata, verify titles/IDs and access, read the strategy's relevant
guidance, and fingerprint the complete selected TAM range. A changed planning source is evidence
to review, not permission to silently rewrite registries or business definitions. A missing source,
changed template structure, ambiguous title, or incompatible TAM header fails clearly. Resolve it
with the owning source; do not guess a substitute.

Use the collector's optional explicit selection:

    headstart-organic-collect --plan collection-plan.json --profile local-profile.json \
      --sources headstart-sources.json --output new-run

The resolver fills only an unselected TAM source, validates an existing matching choice, and
preserves a deliberate TAM omission. It rejects conflicts. Collection records the source
configuration version/fingerprint and a snapshot alongside its evidence. It does not select Google
analytics properties, grant permissions, install providers, or publish a report.

Review source references when owners revise strategy, TAM headers/ranges, the reporting standard,
or file access. Preserve historical IDs. Template changes require an explicit version update and
numeric/visual regression verification; month changes do not.
