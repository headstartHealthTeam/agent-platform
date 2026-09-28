# Full conversation archives and provider cleanup

The operator activity feed is a projection, not a transcript backup. Reuse
`AgentConversationPort` from `packages/workflow-contracts/src/conversation.ts` and the
OpenAI operator adapter for complete **saved API resources**. This boundary is portable: a
standalone local caller supplies its own private retention sink; the backend is not required to
run or export the workflow. No workflow-specific rules or storage credentials enter the adapter.

## Export

`exportConversation(binding, retain)` reads the session, every page of turns and root-agent items,
and every delegated agent's saved turns/items, including nested and closed agents. It preserves
returned JSON fields and tool payloads, not summaries or shortened operator text. The callback
acknowledges each ordered page before collection proceeds. A thrown callback, malformed page,
non-advancing cursor, inconsistent provenance, active turn or changing inventory fails the export;
there is no complete manifest for a partial export. Retry is read-only and starts from the beginning;
an immutable content-addressed sink can reuse already retained bytes.

The manifest binds the provider/SDK version, session/root/workflow/target identity, counts and an
ordered SHA-256 digest to the retained pages. Digest input is each `JSON.stringify(part)` followed
by a newline, in ordinal order. `bytes` counts UTF-8 resource JSON, excluding envelopes/compression.
Do not log the callback contents, put them in normal activity events, or expose them without the
owning application's permissions. Protect real authentication material at the existing credential
boundary; never replace business evidence with redacted summaries.

Completeness means everything returned by the saved-resource APIs, **not private chain of thought**,
unpublished sandbox output, unavailable provider fields, or missed intermediate stream events.
Those limitations are recorded in every manifest. Binary artifacts need independent verified
evidence retention; a URL/path in a conversation is not a retained file. Provider usage fields are
best effort. A quiescent export is not business closure.

## Cleanup

`deleteConversation(manifest, beforeDispatch)` rereads the entire saved conversation and compares
the digest/counts and activity checkpoint with the supplied archive. Immediately before the native
SDK delete it invokes the application's required callback to recheck policy/authority and durably
journal dispatch. It never cancels a running agent to make cleanup eligible. The caller must hold
its input/closure serialization across verification and deletion, including every writer or hold
that could reopen the session. The provider has no atomic archive-and-delete endpoint; external
dashboard writers cannot be made atomic by this adapter.

An absent session is reported separately from confirmed deletion. Only the owning service can
reconcile that absence against a **previous durable dispatch**; absence without such a record is
not successful cleanup. Provider conflicts, changed history and transport failures do not erase
the local archive and must remain visible/recoverable. The adapter does not retry provider writes.
Because provider usage metadata can change after a turn finishes, exact verification can require a
new immutable capture even after an uncertain deletion. Preserve the old archive/dispatch receipt,
keep input sealed, and recapture the still-existing session; do not weaken the digest comparison.

No retention TTL, business-closure rule or automatic deletion schedule is supplied by this package.
The owner must approve retention/recovery periods, holds, erasure responsibilities and final
business eligibility, verify all required files were retained, and deny cleanup while review,
corrections, continuation, uncertain commands or evidence delivery remain pending. Stop, an idle
agent and a completed turn are not closure. Deleting the provider session does not erase Headstart
application records, archives, objects or backups.

## Verification and rollout

`conversation-archive.test.ts` exercises long root/delegated histories, full tool payloads, SDK
routes, incomplete sinks, provenance/cursor failures, changing history, final authority checks and
missing-source reconciliation. Paired backend tests exercise compressed private retention,
PostgreSQL retry journals and authenticated HTTP retrieval through the actual built adapter.
These are synthetic contracts, not acceptance of a live deployed retention policy.

The standalone operator artifact now requires adapter version `0.12.0`; deploy the paired backend
loader and exact rebuilt artifact together. Existing launch, Google access, skills, questions,
messages, Stop and evidence ownership remain unchanged. Archive storage/request costs must be
measured independently of model/context and compute costs on separately authorized representative
runs; short visible chat is not evidence of a small archive.

Official contracts checked against the pinned OpenAI SDK `7.21.0`:
[saved items and events](https://developers.openai.com/api/docs/guides/agents-api/sessions/events),
[delegated agents](https://developers.openai.com/api/docs/guides/agents-api/multi-agent), and
[session lifecycle](https://developers.openai.com/api/docs/guides/agents-api/sessions/manage).
