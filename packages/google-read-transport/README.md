# Google Read Transport

Shared authenticated JSON and binary-response transport for Google read adapters. Tokens remain inside
the transport, redirects are rejected, request timeouts are bounded, and errors expose status
codes without credential-bearing response bodies. The supervised ADC binding never starts OAuth.
An operator's configured recovery procedure owns authentication.

`GoogleReadError` exposes sanitized `status`, `retryAfterMs`, `kind`, and `transient` metadata in
addition to its existing message. Numeric and date-based retry headers are preserved without
capping the delay. The consuming workflow owns pacing, attempt budgets, maximum waits and recovery;
this transport makes one request and never adds an automatic retry loop. No response body, token or
original exception is attached to the error. The operation allowlist remains read-only.

Injected JSON HTTP implementations can use the minimal `GoogleReadFetch`/`GoogleReadResponse`
contracts. Raw reads require the injected fetch to return a native `Response`; the transport returns
that same response without consuming its successful body. A JSON-only response is rejected for a
raw read rather than being cast to a binary response or causing a second, uninjected request.
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

`GoogleJsonReader.request` preserves existing Search Console, Analytics and Sheets behavior.
`GoogleResponseReader.readResponse` also serves complete Drive downloads/exports and Docs JSON.
Both share origin/method validation, token acquisition, redirect rejection and sanitized errors.
Drive resource keys have a validated dedicated header; arbitrary headers/URLs are not accepted.

`GcloudReadTokenProvider` is the explicit supervised ADC binding. `GoogleFileTokenProvider`
uses an explicitly provisioned absolute credential file and requested scopes through Google's
auth library, which handles token refresh. It never silently falls back to desktop credentials.
Other managed bindings can implement `GoogleTokenProvider` without changing consumer packages.
Environment secret provisioning is outside the transport; no AWS, backend or reporting-engine
dependency is introduced.

The [Drive runtime](../google-drive-data/README.md) composes these interfaces with the complete
document reader; the reporting engine continues to use its existing provider composition.
