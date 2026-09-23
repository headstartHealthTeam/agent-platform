# Slack data

Reusable typed Slack connector response handling. This package owns native transport decoding and
thread completion evidence, not a workflow's search terms, relevance or decisions.

`unwrapSlackSearchResponse` accepts a successful direct object or one unambiguous native JSON text
envelope. `normalizeSlackThreadResponse` retains the approved explicit no-replies, rendered reply
counts and structured completed-pagination contracts. Missing continuation metadata alone never
proves completeness. Errors are sanitized and incomplete responses return no admitted text.

`normalizeSlackRenderedSearch` decodes a detailed native search page after envelope unwrapping. It
preserves exact bodies, message/thread identities, explicit continuation and unknown reply counts.
An empty search body requires one complete identity-bound individual read; the result returns that
readback by reference so the consumer can apply its capture hashing and collection-time policy.
Extra continuation signals are retained for the consumer's complete pagination validation. This
single-page parser does not declare a workflow collection complete.

Extracted from the [pinned Intake source](../../docs/intake-sla-migration.md#behavioral-reference)
`slack-response.mjs` and the transport part of `slack-plugin-search.mjs`. Intake still owns full-cohort
search planning, patient assignment, frozen-cutoff bounded/unbounded reconciliation, capture hashes,
run receipts, denial-context interpretation and evidence sufficiency. A consumer must normalize each
vendor response before applying those policies; this package does not choose or change a cutoff.

No API credentials, Slack writes or direct desktop bindings. Authorized callers supply responses.
Synthetic tests exercise provider shapes without patient information or network access. Package
checks use the usual build, lint, check-types and test:coverage scripts; full acceptance is `pnpm qa`.

See the [documentation hub](../../docs/README.md) and
[reusable capability pattern](../../docs/reusable-data-capabilities.md).
