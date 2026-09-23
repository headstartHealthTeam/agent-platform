# Salesforce Read

Reusable explicit-target Organization verification and complete Salesforce CLI read queries.
This package contains no Intake field names, cohort queries, lifecycle policy, private aliases or
credentials. It supports either an explicitly selected sandbox or Production target; each workflow
owns which environment and org it requires.

`connectSalesforceCli` verifies the Organization before returning a bound reader. The normal CLI
credential backend is inherited; this package neither logs in nor selects another identity. Reads
use `sf data query` with separate argv values, a bounded timeout/output size and logging disabled.
Only explicitly complete result sets are accepted, including confirmed empty results. A partial,
failed or malformed response never becomes an empty result. No automatic retry or write command is
exposed. Caller-supplied Zod schemas validate the queried business records.

The Organization capability receipt establishes only the target and Organization read, not blanket
object/field visibility. Each actual query must succeed and prove complete output. An injected
command binding can support another approved host without changing the normalized contract.
Consumers must not interpret a configured alias as proof of target identity.

This extracts the original Intake target verification and complete-query contract; Intake keeps
its Production-only requirement, cohort selection, fingerprints and business semantics. See the
[ownership map](../../docs/intake-sla-migration.md), [documentation hub](../../docs/README.md),
and [reusable provider architecture](../../docs/reusable-data-capabilities.md).
