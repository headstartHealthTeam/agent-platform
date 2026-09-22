# Google Read Transport

Shared authenticated JSON and binary-response transport for Google read adapters. Tokens remain inside
the transport, redirects are rejected, request timeouts are bounded, and errors expose status
codes without credential-bearing response bodies. The supervised ADC binding never starts OAuth.
An operator's configured recovery procedure owns authentication.

The public interface accepts an injected token provider so managed identities can replace local
ADC without changing an engine. See the [documentation hub](../../docs/README.md).

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
