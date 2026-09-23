# Fireflies data

Reusable typed normalization for Fireflies native connector responses. Extracted from the
[pinned Intake reference](../../docs/intake-sla-migration.md#behavioral-reference), not from the
superseded migration. No source calls or credentials are embedded in this package.

`firefliesReadFailure` recognizes explicit provider error envelopes, HTTP status and cooldown
signals while preserving sanitized codes. It does not treat transcript discussion of quotas as a
provider error, retry, sleep, switch endpoints or decide whether a workflow may continue.

`transcriptMetadata` normalizes vendor listing metadata. `normalizeFirefliesConnectorBody` binds an
observed full native body to that metadata, preserves the listing's millisecond timestamp when the
body renders whole seconds, and distinguishes explicit empty transcripts from spoken words.
It returns vendor-level provenance; the consumer adds its own capture hash and receipt version.
Failures never include transcript contents or raw error envelopes.

`normalizeCompleteFirefliesTranscript` validates a complete normalized provider record, preserving
its exact transcript text and explicit empty confirmation. It does not establish workflow freshness
or cache eligibility. Discovery errors expose typed diagnostic reasons so consumers can retain their
own command error categories without parsing provider messages.

`normalizeFirefliesDiscoveryIdentities` removes only documented null participant entries and
defaults absent attendee display names. It preserves other supplied metadata and never mutates the
raw capture. `completeFirefliesDiscoveryPages` validates an explicit offset chain, query-window
membership, metadata and duplicate identities. Callers select the window and page size; the provider
does not attach a run, assert access scope, filter by an assessment cutoff or authorize cache reuse.

Intake continues to own discovery-window completeness and frozen-cutoff selection, relevance,
patient matching, segmentation, cache eligibility, attempt budgets, durable cooldowns, run locks,
evidence admission and recovery receipts. Native reads are supplied by the authorized host; this
package does not assume a Node-to-desktop connector bridge.

Run `pnpm test:coverage`, `pnpm lint`, `pnpm check-types` and `pnpm build` here; repository acceptance
uses the complete `pnpm qa` lane. All tests are synthetic and require no provider access.

See the [documentation hub](../../docs/README.md) and
[package ownership map](../../docs/intake-sla-migration.md).
