# Fireflies Collection Contract

Fireflies is searched for every SLA through every Opportunity-linked provider
role. A current structured answer never suppresses the meeting search.

## Retrieval

For each Rendering, IA Rendering, TA Rendering, current, prior, practice-roster,
and other linked provider:

1. Search every verified participant email.
2. When those participant searches do not produce a usable provider meeting
   inventory, search provider, practice, and meeting-title aliases.
3. When provider email and title searches are still insufficient, search
   current and prior CSM participant emails and title aliases once per run,
   then filter those meetings back through the linked provider identity.
4. Follow pagination until fewer than 50 meetings are returned.
5. Deduplicate meetings by transcript ID.
6. Retrieve the full transcript for every candidate meeting. Use
   `fireflies_fetch` first because it returned complete transcripts more
   reliably in the live audit. Retry transient 429/5xx responses twice, then
   fall back to `fireflies_get_transcript` and record the endpoint outcome.
7. Match the transcript against the provider's assigned Opportunity roster.
8. Interpret the bounded client segment against the current process gate.

`fireflies_run_inventory.json` is the primary executable retrieval plan. It
deduplicates provider, practice, and CSM searches across the cohort and records
which Opportunities depend on each request. `fireflies_search_requests.json`
retains the per-Opportunity match plan. Retrieve the run inventory once, then
apply each Opportunity's provider roster and transcript terms. The collector
writes a per-Opportunity `searchCoverage` record containing attempted phases,
pages, meeting IDs, transcript IDs, failures, and completion status.

The collector must also retain the current run's complete retrieved transcript
inventory in `fireflies_transcript_inventory.jsonl`. Each record includes the
transcript ID, meeting date, title, participants, provider identity keys, full
transcript, retrieval endpoint, and retrieval timestamp. This protected run
artifact is required for roster rematching, missed-match audits, and regression
replay. `fireflies_rows.json` remains the per-Opportunity admitted-match view;
it is not a substitute for the complete transcript inventory.

Requests are tiered. Execute every `Primary` participant-email request first.
`Identity Fallback` and `CSM Fallback` requests are conditional redundancy, not
mandatory duplicate retrieval. A fallback becomes mandatory when the prior
tier returns no meetings, only silent meetings, no meeting near the story
window, or an identity mismatch. Record why each fallback was executed or
skipped.

The optional [transcript cache](fireflies-cache.md) has a separate discovery
path: complete, current-run, unfiltered discovery across the entire collection
window covers the accessible meeting inventory without repeating its filtered
participant/title queries. This is valid only with verified principal/workspace
scope, contiguous exhausted pagination, current provider identity plans, and
current Opportunity-specific roster matching. A partial or filtered inventory
does not replace the search paths above. The default shadow mode still fetches
every discovered body; approved reuse may substitute only bodies that pass the
cache policy and provenance checks.

Meeting-inventory success does not count as transcript success. A 504 from one
full-transcript endpoint must trigger the alternate endpoint before the meeting
is classified `Timed Out`.

## Completion

For a first-class bounded candidate manifest and resumable protected body
checkpoints, follow [bounded collection](fireflies-bounded-collection.md).
Whole-inventory cache shadow validation is a separately selected experiment,
not the default interpretation of a bounded run with reuse disabled.

`Complete` requires:

- Every resolved provider role has an identity search plan.
- Every available participant-email path was attempted.
- Provider/practice title expansion was attempted.
- Current/prior CSM expansion was attempted.
- Pagination completed for every request.
- Every candidate meeting's full transcript was retrieved.
- Every transcript received an Opportunity-specific roster match assessment.

`Partial` means some usable transcript evidence may exist, but one or more
identity, search, pagination, transcript, or match paths remain incomplete.
`Blocked` means no trustworthy provider identity or connector access was
available.

Prior-run transcripts remain historical evidence with their original
collection timestamps. They cannot independently make a current run `Complete`.
The only cache exception is the validated path above: fresh complete discovery,
every due body fetch, eligible cached bodies with their original timestamps,
and a replay receipt bound to the exact current identity profiles and matched
rows. Otherwise the existing current-run retrieval requirements apply. Cached
rows, interpretations, QA, or prior completion labels never prove current
source completeness; interpretation reuse has its own exact-input contract.

## Matching

Exact Opportunity/client names are `Direct`. Fuzzy names may become `Likely`
only when:

- The meeting is anchored to a linked provider, practice, or CSM.
- The target is the unique best match within that provider's Opportunity
  roster.
- Nearby conversation contains stage-relevant or client-specific context.
- No competing client is named in the same segment.

Common speech tokens and system words cannot be promoted as fuzzy first-name
matches. A short list that explicitly assigns one shared operational status to
multiple named clients may support that same status for an exact or approved
roster-matched target, but adjacent client-specific details may not be
inherited.

Every fuzzy promotion records the rendered name, target name, score, margin,
runner-up, provider role, practice, and support segment. Weak matches remain
audit-only.

Use the versioned 100-point score: name similarity 0-40, provider-roster
relationship 0-25, stage vocabulary 0-15, client-specific context 0-10, and
story-window date alignment 0-10. Likely requires at least 75 points and a
six-point lead over the runner-up. Retain the top three Weak matches.

## Interpretation

The AI interpreter receives only the bounded transcript segment, identity
anchors, and deterministic process gate. It returns structured facts backed by
an exact support span. It cannot change the gate, promote identity confidence,
or add unsupported milestones.

## Package navigation

[Local setup](local-setup.md) · [Package overview](../README.md)
