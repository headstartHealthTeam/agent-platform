# Google Read Transport

Shared authenticated JSON transport for the bounded Google read adapters. Tokens remain inside
the transport, redirects are rejected, request timeouts are bounded, and errors expose status
codes without credential-bearing response bodies. The supervised ADC binding never starts OAuth.
An operator's configured recovery procedure owns authentication.

`GoogleReadError` exposes sanitized `status`, `retryAfterMs`, `kind`, and `transient` metadata in
addition to its existing message. Numeric and date-based retry headers are preserved without
capping the delay. The consuming workflow owns pacing, attempt budgets, maximum waits and recovery;
this transport makes one request and never adds an automatic retry loop. No response body, token or
original exception is attached to the error. The operation allowlist remains read-only.

Injected HTTP implementations can use the minimal `GoogleReadFetch`/`GoogleReadResponse` contracts.
`beforeFetch` lets a consumer finish its own pacing before the request timeout starts; it adds no
transport retry or scheduling policy. `googleHttpFailureMetadata` is a pure headers/status decoder,
not a request capability. Native and plain error-like abort/timeout failures retain transient
classification without retaining their payloads.

The public interface accepts an injected token provider so managed identities can replace local
ADC without changing an engine. See the [documentation hub](../../docs/README.md).

For supervised callers requiring an explicit private client/account binding,
`createGoogleAdcTokenProvider` accepts the configuration directory, approved client file, expected
email and injected filesystem/process functions. It checks private regular files, authorized-user
client/account matching and verified Google identity before returning a token. Command environment
overrides are isolated to the child, concurrent refreshes coalesce, and successful tokens remain
in memory for the existing forty-minute window. It never starts OAuth, discovers another credential
or persists a token; failures expose only fixed `GoogleReaderError` codes and status. The caller
chooses its approved binding. The existing default ADC provider remains unchanged.
