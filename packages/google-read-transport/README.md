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

The public interface accepts an injected token provider so managed identities can replace local
ADC without changing an engine. See the [documentation hub](../../docs/README.md).
