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
`GoogleEndpointTokenProvider` is an optional deployment adapter for renewable short-lived tokens.
It extends the same `GoogleTokenProvider` interface; it is not a required service for local reads.
Other managed bindings can implement `GoogleTokenProvider` without changing consumer packages.
Environment secret provisioning is outside the transport; no AWS, backend or reporting-engine
dependency is introduced.

## Renewable token endpoint binding

The trusted profile supplies an exact HTTPS `endpoint` and the nonsecret
`authorizationEnvironmentVariable` name. The provider reads that environment variable at renewal
and sends its value unchanged as the complete `Authorization` header. A deployment can therefore
use a runtime vault placeholder for the whole header without exposing the underlying service
credential. Do not prepend `Bearer` to that placeholder or put credential values in profiles.
Redirects, embedded URL credentials, query strings and fragments are rejected. The endpoint is not
selected from a document, model output or per-read request.

The endpoint receives a GET with no document IDs, requested identity or requested scopes. Its
deployment owns authorization and chooses the fixed Google identity. It must return exactly
`access_token`, `token_type: "Bearer"`, integer `expires_in` between 1 and 3600 seconds, and the
space-separated `scope`. The consumer supplies the expected scope set; any additional or missing
scope is rejected. Credentials are cached only before expiry with a small renewal margin; network
time counts toward the lifetime, concurrent renewals share one request, and failures permit a
later retry without falling back to ADC. The 15-second request timeout and 16-KiB response limit
bound an individual credential fetch, not the workflow duration. Errors never include response
bodies, endpoint URLs or credential values.

Tokens are intentionally available to the primary agent runtime for direct Google reads. Ending
an issuer grant can prevent renewal but does not revoke an already issued Google access token.
The issuer's actual token expiry remains the authority; this adapter does not claim immediate
revocation or implement a document proxy. Local ADC and explicit credential-file authentication
continue to work independently of any token endpoint or Headstart backend.

The [Drive runtime](../google-drive-data/README.md) composes these interfaces with the complete
document reader; the reporting engine continues to use its existing provider composition.
